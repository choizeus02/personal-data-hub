# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

개인 관심 종목(약 50개)의 1분봉 주가 데이터를 수집·저장하고 커스텀 대시보드로 모니터링하는 홈랩 기반 통합 시스템. **초단타 자동매매 봇이 아님.**

데이터 소스: 한국투자증권(KIS) REST API (KOSPI), yfinance + Massive.com (NASDAQ)

---

## 인프라 환경

| 역할 | 스펙 | 접근 주소 |
|------|------|-----------|
| K3s cluster (master1 + worker1/2) | Intel N100 미니PC | master: 192.168.45.158, worker1: .46, worker2: .88 |
| NAS | AMD R7-5825U, 14TB | 192.168.45.147 — PostgreSQL `trading_db`, Prefect Server :4200 |
| Mac Mini M4 32GB | Compute / 개발 | 대시보드 개발, LLM 추론 |

- **MetalLB** IP pool: `192.168.45.200–210`
- **대시보드**: `http://192.168.45.200` (nginx ingress → trading-frontend)
- **ArgoCD**: `http://192.168.45.201`

---

## 아키텍처

### 전체 구성

```
브라우저
  └── 192.168.45.200 (MetalLB)
        └── ingress-nginx → trading-frontend (React+nginx)
                              └── /api/* → trading-api (FastAPI)
                                            └── PostgreSQL (NAS)

prefect-worker (K3s Pod)
  └── KIS / yfinance / Massive.com API → ohlcv_min (TimescaleDB)
```

### CI/CD (GitOps)

```
git push
  → GitHub Actions: worker / api / frontend 이미지 빌드 (parallel)
  → GHCR 푸시 + k8s/*.yaml 태그 자동 업데이트
  → ArgoCD (k8s/ 폴더 감지) → K3s 자동 배포
```

- 이미지: `ghcr.io/choizeus02/personal-data-hub[-api|-frontend]`
- Prefect Deployment 변경 시 Mac에서 수동 `prefect deploy --all` 필요

### 데이터 파이프라인

1. **Micro-batch** — 평일 장중 1분마다 Prefect 트리거, 최신 1분봉 단건 upsert
2. **Backfill** — 수동 실행, DB gap 자동 탐지 후 누락 구간 적재
3. **EOD sync** — 매일 21:35 UTC, Massive로 당일 분봉 교정 (source='massive')

**KOSPI** (`flows/kospi/ingestion.py`)
- 최대 365일 (KIS API 제약), rate limit: `sleep(0.07)`

**NASDAQ** (`flows/nasdaq/ingestion.py`)
- `MASSIVE_API_KEY` 있으면 Massive.com (2년치, 5 calls/min → `sleep(13.0)`)
- 없으면 yfinance fallback (최대 7일, gap detection)

---

## DB 스키마 (`trading_db`)

```sql
assets    (id, symbol, asset_type, exchange, currency, is_favorite SMALLINT DEFAULT 0)
           -- is_favorite: 0=일반, 1=즐겨찾기
ohlcv_min (time TIMESTAMPTZ, asset_id → assets.id, open, high, low, close, volume BIGINT, source VARCHAR)
           -- TimescaleDB hypertable, PK: (time, asset_id)
kis_token (id, access_token, expires_at)  -- KIS 토큰 캐시
```

> 스키마 변경은 수동 DDL로 관리 (자동 마이그레이션 없음):
> ```sql
> ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_favorite SMALLINT NOT NULL DEFAULT 0;
> ```

---

## 프론트엔드 구조 (`frontend/src/`)

```
App.tsx              — 사이드바: 즐겨찾기/NASDAQ/KRX 그룹, 검색, 별 버튼 토글
pages/ChartPage.tsx  — 차트 타입/기간/오버레이 상태 관리, 데이터 fetch
components/
  StockChart.tsx     — LWC 차트 렌더링, ALL_INDICATORS 순회로 지표 적용
indicators/
  types.ts           — IndicatorDef, IndicatorContext 인터페이스
  utils.ts           — toTime, detectInterval, calcSMA, calcBB, calcIchimoku
  ma.ts              — MA5/20/60/120
  bb.ts              — 볼린저밴드
  grid.ts            — 그물차트 (MA 5/10/20/60/120)
  ichimoku.ts        — 일목균형표 (전환/기준/선행스팬A·B/후행스팬)
  volume-profile.ts  — 매물대 (canvas overlay)
  index.ts           — ALL_INDICATORS 등록 목록 ← 여기만 수정
```

### 새 지표 추가 방법

1. `frontend/src/indicators/my-indicator.ts` 생성 — `IndicatorDef` 구현
2. `indicators/index.ts`의 `ALL_INDICATORS` 배열에 추가
3. 끝 — 버튼과 차트 렌더링에 자동 반영됨 (StockChart, ChartPage 수정 불필요)

```typescript
// IndicatorDef 인터페이스
export interface IndicatorDef {
  key: string
  label: string
  apply: (ctx: IndicatorContext) => (() => void) | void  // cleanup 함수 옵션 반환
}
// IndicatorContext: { chart, priceSeries, candles, interval, container }
```

---

## K8s 리소스 (`k8s/`, `infra/`)

| 파일 | 내용 |
|------|------|
| `k8s/namespace.yaml` | trading namespace |
| `k8s/worker.yaml` | Prefect Worker Deployment |
| `k8s/api.yaml` | FastAPI Deployment + ClusterIP :8000 |
| `k8s/frontend.yaml` | React+nginx Deployment + ClusterIP :80 |
| `k8s/ingress.yaml` | nginx Ingress (ingressClassName: nginx) |
| `infra/metallb/` | IP pool 192.168.45.200-210 설정 |
| `infra/nginx-ingress/` | LoadBalancer Service 정의 |
| `infra/argocd/` | argocd-server LoadBalancer 전환 |

---

## Commands

### 프론트엔드 로컬 빌드 확인
```bash
cd frontend && npm run build
```

### Prefect Deployment 등록/갱신
```bash
prefect profile use nas   # PREFECT_API_URL = http://192.168.45.147:4200/api
prefect deploy --all
```

### Docker 이미지 크로스 빌드 (필요 시)
```bash
docker buildx build --platform linux/amd64 -t <registry>/<image>:<tag> --push .
```

---

## API 엔드포인트 (`api/main.py`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/symbols` | 전체 종목 목록 (symbol, exchange, name, isFavorite) |
| PATCH | `/api/symbols/{symbol}/favorite?exchange=` | 즐겨찾기 토글 (0↔1), isFavorite 반환 |
| GET | `/api/candles/daily/{symbol}?exchange=` | 일봉 (정규장 시간만 집계: NASDAQ 9:30–16:00 ET, KRX 9:00–15:30 KST) |
| GET | `/api/candles/minute/{symbol}?exchange=&start=&end=` | 분봉 |

- 일봉은 `ohlcv_min`을 정규장 시간으로 필터링 후 당일 집계 (프리/애프터마켓 제외)
- DB 스키마 변경은 수동 DDL — API에 자동 마이그레이션 없음

---

## 차트 UX 기능 (StockChart.tsx)

| 기능 | 동작 |
|------|------|
| KST/UTC 전환 | x축 tickMarkFormatter + 크로스헤어 timeFormatter 동시 업데이트 (차트 재생성 없음) |
| 호버 툴팁 | OHLCV + 일봉에서 전일 대비 등락률(±금액, ±%) 표시 |
| Shift+드래그 | 범위 선택 후 해당 구간 확대 |
| 더블클릭 | 전체보기 (fitContent) |
| 전체보기 버튼 | 컨트롤 바에서 클릭으로 fitContent |
| Alt+클릭 (1회) | 앵커 설정 (노란 수직선) |
| Alt+클릭 (2회) | 구간 등락률 오버레이 (가격차/등락률/봉수) |
| Alt+클릭 (3회) / ESC | 구간 초기화 |
| 장외 시간 dimming | 분봉에서 정규장 외 시간대 어둡게 처리 |

---

## 개발 시 주의사항

- KIS API Rate Limit: `sleep(0.07)` 필수 (초당 ~14건)
- Massive.com 무료 플랜: `sleep(13.0)` per call (5 calls/min), 50종목 backfill ≈ 11분
- Prefect `@task`에 psycopg2 conn 전달 시 `cache_policy=NO_CACHE` 필수
- DB 스키마 변경은 수동 DDL로 관리 (API에 자동 마이그레이션 없음)
- GitHub Actions가 k8s/*.yaml 태그 자동 커밋 → 로컬 push 전 `git pull --rebase` 필요
- `MASSIVE_API_KEY`는 K8s Secret (`personal-data-hub-secret`)에 추가해야 Worker Pod에서 사용 가능
