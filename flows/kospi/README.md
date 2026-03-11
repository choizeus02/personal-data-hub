# KOSPI 수집 모듈

## 데이터 소스: 한국투자증권(KIS) REST API

### 인증
- OAuth2 Client Credentials (`/oauth2/tokenP`)
- 토큰 유효기간: 24시간 (DB `kis_token` 테이블 캐시)
- 필요 환경변수: `KIS_APP_KEY`, `KIS_APP_SECRET`

### 사용 API

| 구분 | TR ID | 엔드포인트 |
|------|-------|-----------|
| 당일 분봉 (micro-batch) | `FHKST03010200` | `/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice` |
| 과거 분봉 (backfill) | `FHKST03010230` | `/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice` |

### 제약사항
- **Rate Limit**: 초당 최대 10~20건 → 종목 루프마다 `sleep(0.07)` 적용
- **과거 데이터**: 최대 1년치 (`KIS_MAX_HISTORY_DAYS = 365`)
- **페이징**: 1회당 최대 120건, `tr_cont: M` 응답 시 다음 페이지 호출
- **장 운영**: 평일 09:00~15:30 KST (공휴일 미고려)

### Deployments
- `micro-batch-kospi`: 평일 09:00~15:59 매분 실행 (cron: `* 9-15 * * 1-5`)
- `backfill-kospi`: 수동 실행, `symbols` 파라미터로 특정 종목 지정 가능

### 환경변수
```
KIS_BASE_URL=https://openapi.koreainvestment.com:9443  # 기본값
KIS_APP_KEY=...
KIS_APP_SECRET=...
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```
