import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import time
from datetime import datetime, timedelta, timezone, date

from prefect import flow, task, get_run_logger
from prefect.cache_policies import NO_CACHE

from shared.database import get_conn, ensure_tables, get_or_create_asset, upsert_ohlcv, get_existing_days, get_trading_days, get_days_to_fetch
from shared.kis_client import get_access_token, fetch_minute_candles, fetch_all_candles_for_day, parse_candle
from kospi.tickers import KR_STOCKS

KST = timezone(timedelta(hours=9))
MARKET_OPEN = (9, 0)
MARKET_CLOSE = (15, 30)
API_SLEEP = 0.07  # 초당 ~14건
KIS_MAX_HISTORY_DAYS = 365  # KIS API 최대 보관 기간
BACKFILL_BUFFER_DAYS = 1    # gap 경계 양쪽 ±N일 중복 수집


def is_market_open() -> bool:
    now = datetime.now(KST)
    if now.weekday() >= 5:
        return False
    t = (now.hour, now.minute)
    return MARKET_OPEN <= t <= MARKET_CLOSE



def _get_asset_id_map(conn, assets: list[dict]) -> dict[str, int]:
    """자산 목록을 assets 테이블에 등록하고 symbol → asset_id 맵 반환"""
    return {
        a["symbol"]: get_or_create_asset(
            conn, a["symbol"], a["asset_type"], a["exchange"], a["currency"]
        )
        for a in assets
    }


@task(retries=2, retry_delay_seconds=5, cache_policy=NO_CACHE)
def fetch_and_upsert(asset_id: int, symbol: str, token: str, time_str: str) -> bool:
    logger = get_run_logger()
    try:
        candles = fetch_minute_candles(symbol, token, time_str)
        if not candles:
            logger.warning(f"[{symbol}] 응답 없음 (빈 output2)")
            return False
        row = parse_candle(asset_id, candles[0])
        with get_conn() as conn:
            upsert_ohlcv(conn, [row])
        logger.info(f"[{symbol}] 저장: {row[0].strftime('%H:%M')}  {row[5]:,}원")
        return True
    except Exception as e:
        logger.error(f"[{symbol}] 실패: {type(e).__name__}: {e}")
        raise


@task(retries=2, retry_delay_seconds=10, cache_policy=NO_CACHE)
def backfill_ticker_day(asset_id: int, symbol: str, token: str, date_str: str) -> int:
    """단일 종목 단일 날짜 전체 분봉 적재. 적재 건수 반환"""
    logger = get_run_logger()
    try:
        candles = fetch_all_candles_for_day(symbol, token, date_str, sleep_sec=API_SLEEP)
        if not candles:
            logger.info(f"[{symbol}] {date_str} 데이터 없음")
            return 0
        rows = [parse_candle(asset_id, c) for c in candles]
        with get_conn() as conn:
            upsert_ohlcv(conn, rows)
        logger.info(f"[{symbol}] {date_str}  {len(rows)}건 저장")
        return len(rows)
    except Exception as e:
        logger.error(f"[{symbol}] {date_str} 실패: {type(e).__name__}: {e}")
        raise


@flow(name="micro-batch-kospi", log_prints=True)
def micro_batch_flow():
    logger = get_run_logger()

    if not is_market_open():
        logger.info("장 운영 시간 외. 스킵.")
        return

    now = datetime.now(KST)
    time_str = now.strftime("%H%M%S")
    n = len(KR_STOCKS)
    logger.info(f"수집 시작  {now.strftime('%H:%M:%S')} KST  ({n}종목)")

    with get_conn() as conn:
        ensure_tables(conn)
        token = get_access_token(conn)
        asset_id_map = _get_asset_id_map(conn, KR_STOCKS)

    success, fail = 0, 0
    for asset in KR_STOCKS:
        symbol = asset["symbol"]
        asset_id = asset_id_map[symbol]
        result = fetch_and_upsert(asset_id, symbol, token, time_str)
        if result:
            success += 1
        else:
            fail += 1
        time.sleep(API_SLEEP)

    logger.info(f"완료  성공 {success}/{n}  실패 {fail}")


@flow(name="backfill-kospi", log_prints=True)
def backfill_flow(symbols: str | None = None):
    """
    DB 상태를 자동 판단하여 누락 구간 적재
    - symbols: 콤마 구분 종목 코드 (예: "005930" 또는 "005930,000660"), None이면 전체
    - DB 비어있음 → 최대 1년치 전체 적재
    - DB에 데이터 있음 → 마지막 날짜 이후부터 오늘까지 적재
    """
    logger = get_run_logger()

    symbol_list = [s.strip() for s in symbols.split(",")] if symbols else None
    target_assets = (
        [a for a in KR_STOCKS if a["symbol"] in symbol_list]
        if symbol_list else KR_STOCKS
    )
    logger.info(f"대상 종목: {len(target_assets)}개 {symbol_list if symbol_list else '(전체)'}")

    today = datetime.now(KST).date()
    start = today - timedelta(days=KIS_MAX_HISTORY_DAYS)
    end = today
    all_days = get_trading_days(start, end)

    with get_conn() as conn:
        ensure_tables(conn)
        token = get_access_token(conn)
        asset_id_map = _get_asset_id_map(conn, target_assets)
        existing = get_existing_days(conn, "KRX", start, end)

    days_to_fetch = get_days_to_fetch(existing, all_days)
    logger.info(
        f"수집 대상 {len(days_to_fetch)}일 / 전체 {len(all_days)}일  "
        f"(DB {len(existing)}일 보유, ±{BACKFILL_BUFFER_DAYS}일 버퍼)"
    )

    if not days_to_fetch:
        logger.info("백필할 날짜 없음")
        return

    n = len(target_assets)
    total_rows = 0
    for i, day in enumerate(days_to_fetch, 1):
        date_str = day.strftime("%Y%m%d")
        logger.info(f"── [{i}/{len(days_to_fetch)}] {date_str}")
        for asset in target_assets:
            symbol = asset["symbol"]
            asset_id = asset_id_map[symbol]
            count = backfill_ticker_day(asset_id, symbol, token, date_str)
            total_rows += count
            time.sleep(API_SLEEP)

    logger.info(f"백필 완료 ── {n}종목 × {len(days_to_fetch)}일  총 {total_rows:,}건")


if __name__ == "__main__":
    micro_batch_flow()
