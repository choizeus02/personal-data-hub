# 시총 기반 히트맵 타일 크기 조정 구현 설계

## 목표

섹터 히트맵에서 타일 크기를 `weight × market_cap`으로 결정한다.  
`market_cap = close × shares_outstanding` (근사값, 시각화 전용).  
종목별 `shares_outstanding`은 yfinance로 매일 자동 수집하고, 자동 조회 실패 시 설정 페이지에서 수동 입력한다.

## 아키텍처

```
assets 테이블 (shares_outstanding 컬럼 추가)
  ↑ 매일 1회 Prefect flow가 yfinance로 업데이트
  ↑ 자동 실패 시 설정 페이지에서 수동 PATCH

API
  ├─ GET  /api/heatmap          → market_cap 계산 후 반환
  ├─ GET  /api/assets/settings  → 설정 페이지용 전체 자산 목록
  └─ PATCH /api/assets/{id}/shares → 수동 주식수 입력

Frontend
  ├─ 사이드바 하단 ⚙ 버튼 → AssetSettingsPage
  ├─ AssetSettingsPage  → 테이블 + 거래소 탭 + 인라인 편집
  └─ HeatmapPage        → tile_size = weight × market_cap
```

## DB 변경

```sql
-- NAS PostgreSQL에서 수동 실행
ALTER TABLE assets ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;
```

## Prefect Flow

**위치:** `flows/nasdaq/ingestion.py` (또는 `flows/shared/shares_client.py` 신규)  
**이름:** `update-shares`  
**스케줄:** 매일 22:00 UTC (장 마감 후)  
**대상:** assets 테이블의 NASDAQ + KRX 종목 (CME 선물 제외)

동작:
1. DB에서 `asset_type != 'FUTURE'` 전체 자산 조회
2. 각 종목에 대해 `yf.Ticker(symbol).info.get('sharesOutstanding')` 호출
   - KRX 종목은 `symbol + '.KS'` 형식으로 yfinance 조회
3. 값이 있으면 `UPDATE assets SET shares_outstanding = %s WHERE id = %s`
4. 값이 None이면 기존값 유지 (스킵), 로그에 warning
5. 종목 간 `time.sleep(0.5)` (yfinance rate limit 완화)

## API 변경

### GET /api/heatmap (기존 수정)

기존 SQL에 `a.shares_outstanding` 추가. 응답 각 stock 항목에 `market_cap` 필드 추가:

```python
market_cap = float(row["close"]) * row["shares_outstanding"] \
    if row["close"] is not None and row["shares_outstanding"] is not None \
    else None
```

응답 형식:
```json
{
  "asset_id": 1,
  "symbol": "AAPL",
  "weight": 1.0,
  "close": 200.5,
  "change_pct": 1.2,
  "market_cap": 3041000000000
}
```

### GET /api/assets/settings (신규)

```
GET /api/assets/settings?exchange=NASDAQ  (없으면 전체)
```

응답:
```json
[
  {
    "id": 1,
    "symbol": "AAPL",
    "exchange": "NASDAQ",
    "name": "Apple",
    "asset_type": "STOCK",
    "shares_outstanding": 15204000000
  },
  {
    "id": 5,
    "symbol": "ES=F",
    "exchange": "CME",
    "name": "E-mini S&P 500",
    "asset_type": "FUTURE",
    "shares_outstanding": null
  }
]
```

선물(asset_type=FUTURE)은 목록에 포함하되 프론트에서 "해당없음" 표시.

### PATCH /api/assets/{id}/shares (신규)

```json
{ "shares_outstanding": 15204000000 }
```

성공 시 `{"ok": true}` 반환. 선물에 호출해도 동작은 하지만 UI에서 버튼 비활성화.

## 프론트엔드

### types.ts

```typescript
// HeatmapStock에 추가
market_cap: number | null

// 새 타입
interface AssetSetting {
  id: number
  symbol: string
  exchange: string
  name: string
  asset_type: string
  shares_outstanding: number | null
}
```

### api.ts

```typescript
export async function fetchAssetSettings(exchange?: string): Promise<AssetSetting[]>
export async function updateShares(id: number, shares: number): Promise<void>
```

### App.tsx

- `selected` 타입에 `{ type: 'settings' }` 추가
- 사이드바 `<aside>` 하단(flex 컬럼 끝)에 ⚙ 버튼 고정
- 메인 영역 분기에 `selected?.type === 'settings'` 케이스 추가 → `<AssetSettingsPage>`

### pages/AssetSettingsPage.tsx (신규)

- 탭: 전체 / NASDAQ / KRX / CME
- 테이블 컬럼: 종목 / 이름 / 주식수
  - 값 있으면 숫자 표시, null이면 "⚠ 입력 필요" 강조
  - 선물(asset_type=FUTURE): "해당없음" 표시, 편집 불가
- `shares_outstanding` null인 행: 빨간색 강조, 클릭 시 인라인 input 활성화
- 저장 버튼 → `PATCH /api/assets/{id}/shares` → 성공 시 로컬 상태 업데이트

### pages/HeatmapPage.tsx

기존 tile 크기 계산 교체:

```typescript
// 기존
const widthPct = Math.max(8, (stock.weight / totalWeight) * 100)
// flexGrow: stock.weight

// 변경
const eff = (s: HeatmapStock) =>
  s.market_cap !== null ? s.weight * s.market_cap : s.weight

const totalEff = sector.stocks.reduce((sum, s) => sum + eff(s), 0)
const widthPct = Math.max(8, (eff(stock) / totalEff) * 100)
// flexGrow: eff(stock)
```

market_cap이 null인 종목(shares_outstanding 미입력)은 `weight`만으로 fallback.

## prefect.yaml 추가

```yaml
- name: update-shares
  entrypoint: flows/nasdaq/ingestion.py:update_shares_flow
  work_pool:
    name: personal-data-hub-pool
  schedules:
    - cron: "0 22 * * 1-5"
      timezone: UTC
```

## 구현 순서

1. NAS에서 DDL 실행 (사용자 수동)
2. Prefect flow `update_shares_flow` 구현 + prefect.yaml 등록
3. API: `/api/heatmap` 수정, `/api/assets/settings` + `/api/assets/{id}/shares` 추가
4. 프론트: `types.ts`, `api.ts` 확장
5. 프론트: `AssetSettingsPage.tsx` 신규
6. 프론트: `App.tsx` ⚙ 버튼 + 라우팅
7. 프론트: `HeatmapPage.tsx` tile 크기 공식 변경
