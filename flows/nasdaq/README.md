# NASDAQ 수집 모듈

## 데이터 소스: yfinance (Yahoo Finance 비공식 래퍼)

### yfinance 특징
- **비공식 라이브러리**: Yahoo Finance 웹 스크래핑 기반, 공식 SLA 없음
- **무료**: API Key 불필요, 인증 없음
- **1분봉 제약**: 최근 **7일치**만 제공 (`interval="1m"`)
  - 더 긴 기간은 `interval="2m"` (60일) 또는 `interval="5m"` (60일) 사용 필요
- **레이트 리밋**: 명시적 제한 없으나 과도한 호출 시 IP 차단 가능 → `sleep(0.2)` 적용

### 제약사항
- **backfill 범위**: 최대 7일 (1m 기준)
- **서머타임**: `is_market_open()` 함수는 EST(-5) 기준 단순 체크, 서머타임 미고려
  - 정확한 체크가 필요하면 `pytz` 또는 `zoneinfo` 활용 권장
- **장 운영**: 평일 09:30~16:00 ET

### Deployments
- `micro-batch-nasdaq`: 평일 ET 기준 장중 매분 실행
  - cron: `* 14-20 * * 1-5` (UTC 기준, 서머타임 기간에는 `* 13-19 * * 1-5`)
- `backfill-nasdaq`: 수동 실행, `symbols` 파라미터로 특정 종목 지정 가능

### 환경변수
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```
(yfinance는 별도 API Key 불필요)

### 향후 개선
- 서머타임 자동 처리: `zoneinfo.ZoneInfo("America/New_York")` 사용
- 60일 이상 backfill: `interval="2m"` 또는 `interval="5m"` 청크 수집 추가
- 공식 대안: [Polygon.io](https://polygon.io) (월 $29~), [Alpha Vantage](https://www.alphavantage.co) (분봉 제한적)
