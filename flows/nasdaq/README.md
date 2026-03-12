# NASDAQ 수집 모듈

## 데이터 소스

### micro-batch: yfinance (Yahoo Finance 비공식 래퍼)
- **무료**: API Key 불필요
- **1분봉 제약**: 최근 **7일치**만 제공 (`interval="1m"`)
- **레이트 리밋**: 명시적 제한 없으나 과도한 호출 시 IP 차단 가능 → `sleep(0.2)` 적용

### backfill: Massive.com (구 Polygon.io) — 선택적
- **무료 플랜**: 5 API calls/min, **2년치** 1분봉 히스토리
- `MASSIVE_API_KEY` 환경변수 설정 시 자동 활성화
- 미설정 시 yfinance fallback (최대 7일)
- **레이트 리밋**: 60초 / 5 calls = 13초/call → `sleep(13.0)` 적용
- **종목당 1회 호출**: 2년 전체 range를 페이지네이션으로 처리 (next_url 기반)

## 제약사항
- **서머타임**: `is_market_open()` 함수는 EST(-5) 기준 단순 체크, 서머타임 미고려
- **장 운영**: 평일 09:30~16:00 ET

## Deployments
- `micro-batch-nasdaq`: 평일 ET 기준 장중 매분 실행
  - cron: `* 14-20 * * 1-5` (UTC 기준, 서머타임 기간에는 `* 13-19 * * 1-5`)
- `backfill-nasdaq`: 수동 실행, `symbols` 파라미터로 특정 종목 지정 가능

## 환경변수
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
MASSIVE_API_KEY   # (선택) 설정 시 Massive.com으로 2년치 backfill
```

## Massive.com backfill 사용법
1. K8s Secret에 `MASSIVE_API_KEY` 추가:
   ```bash
   kubectl -n trading create secret generic personal-data-hub-secret \
     --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -
   ```
2. Prefect UI에서 `backfill-nasdaq` 수동 실행
   - 전체: `symbols` 비워두기
   - 특정 종목: `symbols = "AAPL"` 또는 `"AAPL,MSFT"`
3. 50종목 전체 2년치 예상 소요 시간: 약 11분 (50종목 × 13초)
