import time
from datetime import datetime, timedelta, timezone

from prefect import flow, task, get_run_logger

from database import get_conn, ensure_tables, upsert_candles
from kis_client import get_access_token, fetch_minute_candles, parse_candle
from tickers import TICKERS

KST = timezone(timedelta(hours=9))
MARKET_OPEN = (9, 0)
MARKET_CLOSE = (15, 30)
API_SLEEP = 0.07  # 초당 ~14건, Rate Limit 여유있게


def is_market_open() -> bool:
    now = datetime.now(KST)
    if now.weekday() >= 5:  # 토/일
        return False
    t = (now.hour, now.minute)
    return MARKET_OPEN <= t <= MARKET_CLOSE


@task(retries=2, retry_delay_seconds=5)
def fetch_and_upsert(ticker: str, token: str, time_str: str, conn) -> bool:
    logger = get_run_logger()
    try:
        candles = fetch_minute_candles(ticker, token, time_str)
        if not candles:
            return False
        rows = [parse_candle(ticker, c) for c in candles[:1]]  # 최신 1개
        upsert_candles(conn, rows)
        return True
    except Exception as e:
        logger.warning(f"[{ticker}] 실패: {e}")
        return False


@flow(name="micro-batch-ingestion", log_prints=True)
def micro_batch_flow():
    logger = get_run_logger()

    if not is_market_open():
        logger.info("장 운영 시간 외. 스킵.")
        return

    now = datetime.now(KST)
    time_str = now.strftime("%H%M%S")
    logger.info(f"수집 시작: {time_str}, 종목 수: {len(TICKERS)}")

    with get_conn() as conn:
        ensure_tables(conn)
        token = get_access_token(conn)

        success, fail = 0, 0
        for ticker in TICKERS:
            result = fetch_and_upsert(ticker, token, time_str, conn)
            if result:
                success += 1
            else:
                fail += 1
            time.sleep(API_SLEEP)

    logger.info(f"완료 — 성공: {success}, 실패: {fail}")


@flow(name="backfill-ingestion", log_prints=True)
def backfill_flow(start_date: str, end_date: str):
    """
    start_date, end_date: 'YYYYMMDD' 형식
    과거 1분봉 데이터 일괄 적재
    """
    logger = get_run_logger()
    logger.info(f"백필 시작: {start_date} ~ {end_date}")

    with get_conn() as conn:
        ensure_tables(conn)
        token = get_access_token(conn)

        for ticker in TICKERS:
            logger.info(f"[{ticker}] 백필 중...")
            # KIS API는 하루치씩 조회 가능
            # 날짜 루프는 추후 구현
            time.sleep(API_SLEEP)

    logger.info("백필 완료")


if __name__ == "__main__":
    micro_batch_flow()
