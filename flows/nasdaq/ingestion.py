import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import time
from datetime import datetime, timedelta, timezone, date

from prefect import flow, task, get_run_logger
from prefect.cache_policies import NO_CACHE

from shared.database import get_conn, ensure_tables, get_or_create_asset, upsert_ohlcv, get_existing_days
from shared.yfinance_client import (
    is_market_open,
    fetch_latest_candle,
    fetch_candles_for_range,
    parse_candle,
    YFINANCE_1M_MAX_DAYS,
)
from shared.massive_client import fetch_minute_bars, parse_bar, MASSIVE_MAX_HISTORY_DAYS
from nasdaq.tickers import US_STOCKS

UTC = timezone.utc
BATCH_SLEEP = 0.2  # 종목 간 딜레이 (Yahoo 레이트 리밋 완화)
BACKFILL_BUFFER_DAYS = 1  # gap 경계 양쪽 ±N일 중복 수집


def get_trading_days(start: date, end: date) -> list[date]:
    """start ~ end 사이 평일 리스트 반환"""
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def get_days_to_fetch(existing: set, all_days: list[date], buffer: int = BACKFILL_BUFFER_DAYS) -> list[date]:
    """누락 날짜 + 경계 buffer 반환"""
    all_set = set(all_days)
    missing = all_set - existing
    to_fetch = set(missing)
    for d in missing:
        for delta in range(1, buffer + 1):
            for neighbor in (d - timedelta(days=delta), d + timedelta(days=delta)):
                if neighbor in all_set:
                    to_fetch.add(neighbor)
    return sorted(to_fetch)


def _get_asset_id_map(conn, assets: list[dict]) -> dict[str, int]:
    return {
        a["symbol"]: get_or_create_asset(
            conn, a["symbol"], a["asset_type"], a["exchange"], a["currency"]
        )
        for a in assets
    }


@task(retries=2, retry_delay_seconds=5, cache_policy=NO_CACHE)
def fetch_and_upsert(asset_id: int, symbol: str) -> bool:
    logger = get_run_logger()
    try:
        candle = fetch_latest_candle(symbol)
        if not candle:
            logger.warning(f"[{symbol}] 데이터 없음")
            return False
        rows = [parse_candle(asset_id, candle)]
        with get_conn() as conn:
            upsert_ohlcv(conn, rows)
        return True
    except Exception as e:
        logger.error(f"[{symbol}] 실패: {type(e).__name__}: {e}")
        raise


@task(retries=2, retry_delay_seconds=10, cache_policy=NO_CACHE)
def backfill_ticker_day(asset_id: int, symbol: str, day: date) -> int:
    """단일 종목 단일 날짜 전체 분봉 적재 (yfinance)"""
    logger = get_run_logger()
    try:
        start_dt = datetime(day.year, day.month, day.day, tzinfo=UTC)
        end_dt = start_dt + timedelta(days=1)
        candles = fetch_candles_for_range(symbol, start_dt, end_dt)
        if not candles:
            return 0
        rows = [parse_candle(asset_id, c) for c in candles]
        with get_conn() as conn:
            upsert_ohlcv(conn, rows)
        logger.info(f"[{symbol}] {day} 저장: {len(rows)}건")
        return len(rows)
    except Exception as e:
        logger.error(f"[{symbol}] {day} 실패: {type(e).__name__}: {e}")
        raise


@task(retries=2, retry_delay_seconds=30, cache_policy=NO_CACHE)
def backfill_ticker_massive(asset_id: int, symbol: str, start: date, end: date) -> int:
    """단일 종목 전체 range 분봉 적재 (Massive.com, 2년치 가능)"""
    logger = get_run_logger()
    try:
        bars = fetch_minute_bars(symbol, start, end)
        if not bars:
            logger.warning(f"[{symbol}] {start}~{end} 데이터 없음")
            return 0
        rows = [parse_bar(asset_id, b) for b in bars]
        with get_conn() as conn:
            upsert_ohlcv(conn, rows)
        logger.info(f"[{symbol}] {start}~{end} 저장: {len(rows)}건")
        return len(rows)
    except Exception as e:
        logger.error(f"[{symbol}] {start}~{end} 실패: {type(e).__name__}: {e}")
        raise


@flow(name="micro-batch-nasdaq", log_prints=True)
def micro_batch_flow():
    logger = get_run_logger()

    if not is_market_open():
        logger.info("나스닥 장 운영 시간 외. 스킵.")
        return

    logger.info(f"수집 시작, 종목 수: {len(US_STOCKS)}")

    with get_conn() as conn:
        ensure_tables(conn)
        asset_id_map = _get_asset_id_map(conn, US_STOCKS)

    success, fail = 0, 0
    for asset in US_STOCKS:
        symbol = asset["symbol"]
        asset_id = asset_id_map[symbol]
        result = fetch_and_upsert(asset_id, symbol)
        if result:
            success += 1
        else:
            fail += 1
        time.sleep(BATCH_SLEEP)

    logger.info(f"완료 — 성공: {success}, 실패: {fail}")


@flow(name="backfill-nasdaq", log_prints=True)
def backfill_flow(symbols: str | None = None):
    """
    NASDAQ 1m 분봉 backfill
    - MASSIVE_API_KEY 환경변수 있으면 Massive.com으로 2년치 수집 (종목별 전체 range 1회 호출)
    - 없으면 yfinance fallback (최대 7일, gap detection)
    - symbols: 콤마 구분 티커 (예: "AAPL" 또는 "AAPL,MSFT"), None이면 전체
    """
    logger = get_run_logger()

    symbol_list = [s.strip() for s in symbols.split(",")] if symbols else None
    target_assets = (
        [a for a in US_STOCKS if a["symbol"] in symbol_list]
        if symbol_list else US_STOCKS
    )
    logger.info(f"대상 종목: {len(target_assets)}개 {symbol_list if symbol_list else '(전체)'}")

    use_massive = bool(os.environ.get("MASSIVE_API_KEY"))
    today = datetime.now(UTC).date()

    with get_conn() as conn:
        ensure_tables(conn)
        asset_id_map = _get_asset_id_map(conn, target_assets)

    if use_massive:
        start = today - timedelta(days=MASSIVE_MAX_HISTORY_DAYS - 1)
        end = today
        logger.info(f"Massive.com 모드: {start} ~ {end} (최대 {MASSIVE_MAX_HISTORY_DAYS}일)")

        total_rows = 0
        for asset in target_assets:
            symbol = asset["symbol"]
            asset_id = asset_id_map[symbol]
            count = backfill_ticker_massive(asset_id, symbol, start, end)
            total_rows += count
            # RATE_LIMIT_SLEEP은 fetch_minute_bars 내부에서 처리

        logger.info(f"백필 완료 — 총 {total_rows}건 적재")

    else:
        start = today - timedelta(days=YFINANCE_1M_MAX_DAYS - 1)
        end = today
        all_days = get_trading_days(start, end)

        with get_conn() as conn:
            existing = get_existing_days(conn, "NASDAQ", start, end)

        days_to_fetch = get_days_to_fetch(existing, all_days)
        logger.info(
            f"yfinance 모드: 전체 {len(all_days)}일 중 수집 대상: {len(days_to_fetch)}일 "
            f"(DB 보유: {len(existing)}일, 버퍼: ±{BACKFILL_BUFFER_DAYS}일)"
        )

        if not days_to_fetch:
            logger.info("백필할 날짜 없음")
            return

        total_rows = 0
        for day in days_to_fetch:
            logger.info(f"날짜: {day}")
            for asset in target_assets:
                symbol = asset["symbol"]
                asset_id = asset_id_map[symbol]
                count = backfill_ticker_day(asset_id, symbol, day)
                total_rows += count
                time.sleep(BATCH_SLEEP)

        logger.info(f"백필 완료 — 총 {total_rows}건 적재")


if __name__ == "__main__":
    micro_batch_flow()
