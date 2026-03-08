import time
from datetime import datetime, timedelta, timezone, date

from prefect import flow, task, get_run_logger
from prefect.cache_policies import NO_CACHE

from database import get_conn, ensure_tables, upsert_candles, get_latest_candle_datetime
from kis_client import get_access_token, fetch_minute_candles, fetch_all_candles_for_day, parse_candle
from tickers import TICKERS

KST = timezone(timedelta(hours=9))
MARKET_OPEN = (9, 0)
MARKET_CLOSE = (15, 30)
API_SLEEP = 0.07  # 초당 ~14건
KIS_MAX_HISTORY_DAYS = 365  # KIS API 최대 보관 기간


def is_market_open() -> bool:
    now = datetime.now(KST)
    if now.weekday() >= 5:
        return False
    t = (now.hour, now.minute)
    return MARKET_OPEN <= t <= MARKET_CLOSE


def get_trading_days(start: date, end: date) -> list[date]:
    """start ~ end 사이 평일(영업일 근사치) 리스트 반환"""
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # 월~금 (공휴일 제외 미구현)
            days.append(cur)
        cur += timedelta(days=1)
    return days


def get_backfill_range(conn) -> tuple[date, date]:
    """
    DB 상태를 보고 backfill 시작/종료일 자동 결정
    - DB 비어있음: 1년 전부터
    - DB에 데이터 있음: 마지막 데이터 다음날부터
    종료일: 어제 (오늘 데이터는 micro_batch 담당)
    """
    latest_dt = get_latest_candle_datetime(conn)
    today = datetime.now(KST).date()
    end = today - timedelta(days=1)

    if latest_dt is None:
        start = today - timedelta(days=KIS_MAX_HISTORY_DAYS)
    else:
        start = latest_dt.date() + timedelta(days=1)

    return start, end


@task(retries=2, retry_delay_seconds=5, cache_policy=NO_CACHE)
def fetch_and_upsert(ticker: str, token: str, time_str: str) -> bool:
    logger = get_run_logger()
    try:
        candles = fetch_minute_candles(ticker, token, time_str)
        if not candles:
            return False
        rows = [parse_candle(ticker, c) for c in candles[:1]]
        with get_conn() as conn:
            upsert_candles(conn, rows)
        return True
    except Exception as e:
        logger.error(f"[{ticker}] 실패 (상세): {type(e).__name__}: {e}")
        raise


@task(retries=2, retry_delay_seconds=10, cache_policy=NO_CACHE)
def backfill_ticker_day(ticker: str, token: str, date_str: str) -> int:
    """단일 종목 단일 날짜 전체 분봉 적재. 적재 건수 반환"""
    logger = get_run_logger()
    try:
        candles = fetch_all_candles_for_day(ticker, token, date_str, sleep_sec=API_SLEEP)
        logger.info(f"[{ticker}] {date_str} 조회: {len(candles)}건")
        if not candles:
            return 0
        rows = [parse_candle(ticker, c) for c in candles]
        with get_conn() as conn:
            upsert_candles(conn, rows)
        logger.info(f"[{ticker}] {date_str} 저장 완료: {len(rows)}건")
        return len(rows)
    except Exception as e:
        logger.error(f"[{ticker}] {date_str} 실패 (상세): {type(e).__name__}: {e}")
        raise


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
        result = fetch_and_upsert(ticker, token, time_str)
        if result:
            success += 1
        else:
            fail += 1
        time.sleep(API_SLEEP)

    logger.info(f"완료 — 성공: {success}, 실패: {fail}")


@flow(name="backfill-ingestion", log_prints=True)
def backfill_flow(tickers: list[str] | None = None):
    """
    DB 상태를 자동 판단하여 누락 구간 적재
    - tickers: 특정 종목만 지정 가능 (None이면 전체 종목)
    - DB 비어있음 → 최대 1년치 전체 적재
    - DB에 데이터 있음 → 마지막 날짜 이후부터 어제까지 적재
    """
    logger = get_run_logger()
    target_tickers = tickers if tickers else TICKERS
    logger.info(f"대상 종목: {len(target_tickers)}개 {target_tickers if tickers else '(전체)'}")

    with get_conn() as conn:
        ensure_tables(conn)
        token = get_access_token(conn)
        start, end = get_backfill_range(conn)

    if start > end:
        logger.info("백필할 데이터 없음 (이미 최신)")
        return

    trading_days = get_trading_days(start, end)
    logger.info(f"백필 범위: {start} ~ {end} ({len(trading_days)}일)")

    total_rows = 0
    for day in trading_days:
        date_str = day.strftime("%Y%m%d")
        logger.info(f"날짜: {date_str}")
        for ticker in target_tickers:
            count = backfill_ticker_day(ticker, token, date_str)
            total_rows += count
            time.sleep(API_SLEEP)

    logger.info(f"백필 완료 — 총 {total_rows}건 적재")


if __name__ == "__main__":
    micro_batch_flow()
