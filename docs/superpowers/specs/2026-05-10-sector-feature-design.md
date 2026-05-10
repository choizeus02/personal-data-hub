# Sector Feature Design

## Overview

사용자가 직접 종목을 묶어 커스텀 섹터를 만들고, 해당 섹터의 합산 퍼포먼스를 하나의 지수(기준 100)로 차트로 보는 기능. "나만의 ETF" 개념.

**목표 사용 패턴:** 아침 시장 열기 전 or 이벤트 직후, 섹터 단위 흐름을 한눈에 파악.

---

## DB 스키마

```sql
CREATE TABLE sectors (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR NOT NULL
);

CREATE TABLE sector_stocks (
  sector_id  INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
  asset_id   INTEGER REFERENCES assets(id)  ON DELETE CASCADE,
  weight     NUMERIC NOT NULL DEFAULT 1.0,
  PRIMARY KEY (sector_id, asset_id)
);
```

수동 DDL로 적용 (자동 마이그레이션 없음):
```sql
CREATE TABLE sectors (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL);
CREATE TABLE sector_stocks (sector_id INT REFERENCES sectors(id) ON DELETE CASCADE, asset_id INT REFERENCES assets(id) ON DELETE CASCADE, weight NUMERIC NOT NULL DEFAULT 1.0, PRIMARY KEY (sector_id, asset_id));
```

---

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/sectors` | 섹터 목록 (구성 종목·비중 포함) |
| POST | `/api/sectors` | 섹터 생성 `{name}` |
| DELETE | `/api/sectors/:id` | 섹터 삭제 (sector_stocks cascade) |
| PUT | `/api/sectors/:id/stocks` | 종목·비중 전체 교체 `[{asset_id, weight}]` |
| GET | `/api/sectors/:id/candles?start=&end=` | 합산 OHLCV 시리즈 반환 |

### 합산 OHLCV 계산 방식

TimescaleDB SQL로 직접 계산:

1. `sector_stocks`에서 weight를 정규화 (합계 1.0)
2. 기간 첫 봉의 종목별 `close`를 기준가(base)로 잡음
3. 각 time_bucket마다 `(price / base) × 100 × norm_weight` 합산

```sql
WITH weights AS (
  SELECT asset_id, weight / SUM(weight) OVER () AS norm_weight
  FROM sector_stocks WHERE sector_id = :id
),
base_prices AS (
  SELECT asset_id, (array_agg(close ORDER BY time))[1] AS base_close
  FROM ohlcv_min
  WHERE asset_id IN (SELECT asset_id FROM weights)
    AND time >= :start
  GROUP BY asset_id
),
bucketed AS (
  SELECT
    time_bucket(:interval, o.time)                      AS bucket,
    o.asset_id,
    (array_agg(o.open  ORDER BY o.time))[1]             AS open,
    MAX(o.high)                                          AS high,
    MIN(o.low)                                           AS low,
    (array_agg(o.close ORDER BY o.time DESC))[1]        AS close,
    SUM(o.volume)                                        AS volume
  FROM ohlcv_min o
  WHERE o.asset_id IN (SELECT asset_id FROM weights)
    AND o.time >= :start AND o.time < :end
  GROUP BY bucket, o.asset_id
)
SELECT
  bucket AS time,
  SUM((b.open  / bp.base_close) * 100 * w.norm_weight)          AS open,
  SUM((b.high  / bp.base_close) * 100 * w.norm_weight)          AS high,
  SUM((b.low   / bp.base_close) * 100 * w.norm_weight)          AS low,
  SUM((b.close / bp.base_close) * 100 * w.norm_weight)          AS close,
  SUM(b.volume * w.norm_weight)::BIGINT                          AS volume
FROM bucketed b
JOIN base_prices bp ON b.asset_id = bp.asset_id
JOIN weights w ON b.asset_id = w.asset_id
GROUP BY bucket
ORDER BY bucket
```

반환 형식은 기존 `/api/candles/minute` 응답과 동일 → 프론트 StockChart 재사용 가능.

`_bucket_interval` 함수 (기존 days → interval 로직) 동일하게 적용.

---

## 프론트엔드

### 사이드바 변경 (`App.tsx`)

- 기존 그룹 순서: `★ 즐겨찾기 → FUTURES → NASDAQ → KRX`
- 변경 후: `★ 즐겨찾기 → 섹터 → FUTURES → NASDAQ → KRX`
- 섹터 그룹 상단에 `[+ 섹터 추가]` 버튼
- 각 섹터 항목: 섹터명 + 오늘 등락률 뱃지 + 편집(✏) 버튼

### 신규 컴포넌트

**`SectorPage.tsx`** (`pages/`)
- ChartPage와 동일한 기간 컨트롤 (1D / 1W / 1M / 3M / 1Y / ALL)
- StockChart에 섹터 합산 OHLCV 전달 → 기존 차트 컴포넌트 그대로 재사용
- 차트 위 타이틀: 섹터명 + 현재 등락률

**`SectorEditor.tsx`** (`components/`)
- 모달 형태
- 섹터명 입력 필드
- 종목 검색 + 추가 (기존 assets 목록에서 선택)
- 종목별 비중 숫자 입력 → 자동으로 합계 100% 정규화해서 표시
- 저장 / 삭제 버튼

### 데이터 흐름

```
App.tsx 마운트
  → GET /api/sectors (섹터 목록 + 구성 종목)
  → 각 섹터의 오늘 등락률: GET /api/sectors/:id/candles?start=오늘&end=오늘

섹터 클릭
  → selected = {type: 'sector', id, name}
  → SectorPage: GET /api/sectors/:id/candles?start=&end=
  → StockChart에 candles 전달
```

`selected` 타입을 `Symbol | Sector`로 확장.

---

## 기존 코드 영향 범위

| 파일 | 변경 |
|------|------|
| `api/main.py` | 섹터 API 5개 추가, NAMES dict 불필요 |
| `frontend/src/App.tsx` | sectors 상태 추가, SectorEditor 연동, selected 타입 확장 |
| `frontend/src/api.ts` | 섹터 관련 fetch 함수 추가 |
| `frontend/src/types.ts` | `Sector`, `SectorStock` 타입 추가 |
| `frontend/src/pages/SectorPage.tsx` | 신규 |
| `frontend/src/components/SectorEditor.tsx` | 신규 |

StockChart, ChartPage, indicators — 변경 없음.

---

## 미포함 (향후)

- 섹터 간 비교 차트 (여러 섹터 동시 표시)
- 섹터 순서 drag-and-drop 정렬
