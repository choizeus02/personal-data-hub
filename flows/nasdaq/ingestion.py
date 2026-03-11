import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import time
from datetime import datetime, timedelta, timezone, date

from prefect import flow, task, get_run_logger
from prefect.cache_policies import NO_CACHE

from shared.database import get_conn, ensure_tables, get_or_create_asset, upsert_ohlcv, get_latest_candle_datetime
from shared.yfinance_client import (
    is_market_open,
    fetch_latest_candle,
    fetch_candles_for_range,
    parse_candle,
    YFINANCE_1M_MAX_DAYS,
)
from nasdaq.tickers import US_STOCKS

UTC = timezone.utc
BATCH_SLEEP = 0.2  # 종목 간 딜레이 (Yahoo 레이트 리밋 완화)


def get_trading_days(start: date, end: date) -> list[date]:
    """start ~ end 사이 평일 리스트 반환"""
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def get_backfill_range(conn) -> tuple[date, date]:
    """
    DB 상태 기반 backfill 범위 결정
    - DB 비어있음: yfinance 1m 제약(7일) 이내 최대치
    - DB에 데이터 있음: 마지막 날짜 다음날부터
    종료일: 어제
    """
    latest_dt = get_latest_candle_datetime(conn)
    today = datetime.now(UTC).date()
    end = today - timedelta(days=1)

    if latest_dt is None:
        start = today - timedelta(days=YFINANCE_1M_MAX_DAYS - 1)
    else:
        start = latest_dt.date() + timedelta(days=1)

    return start, end


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
def backfill_ticker_range(asset_id: int, symbol: str, start: date, end: date) -> int:
    """단일 종목 지정 기간 전체 분봉 적재"""
    logger = get_run_logger()
    try:
        start_dt = datetime(start.year, start.month, start.day, tzinfo=UTC)
        end_dt = datetime(end.year, end.month, end.day, tzinfo=UTC) + timedelta(days=1)
        candles = fetch_candles_for_range(symbol, start_dt, end_dt)
        logger.info(f"[{symbol}] {start}~{end} 조회: {len(candles)}건")
        if not candles:
            return 0
        rows = [parse_candle(asset_id, c) for c in candles]
        with get_conn() as conn:
            upsert_ohlcv(conn, rows)
        logger.info(f"[{symbol}] 저장 완료: {len(rows)}건")
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
def backfill_flow(symbols: list[str] | None = None):
    """
    yfinance 1m 분봉 backfill (최대 7일 제약)
    - symbols: 특정 종목만 지정 (None이면 전체)
    - DB 상태 기반으로 범위 자동 결정
    """
    logger = get_run_logger()

    target_assets = (
        [a for a in US_STOCKS if a["symbol"] in symbols]
        if symbols else US_STOCKS
    )
    logger.info(f"대상 종목: {len(target_assets)}개 {symbols if symbols else '(전체)'}")

    with get_conn() as conn:
        ensure_tables(conn)
        asset_id_map = _get_asset_id_map(conn, target_assets)
        start, end = get_backfill_range(conn)

    if start > end:
        logger.info("백필할 데이터 없음 (이미 최신)")
        return

    # yfinance 1m은 7일 제약 → 7일 단위로 분할
    logger.info(f"백필 범위: {start} ~ {end}")
    chunk_start = start
    total_rows = 0

    while chunk_start <= end:
        chunk_end = min(chunk_start + timedelta(days=YFINANCE_1M_MAX_DAYS - 1), end)
        logger.info(f"청크: {chunk_start} ~ {chunk_end}")

        for asset in target_assets:
            symbol = asset["symbol"]
            asset_id = asset_id_map[symbol]
            count = backfill_ticker_range(asset_id, symbol, chunk_start, chunk_end)
            total_rows += count
            time.sleep(BATCH_SLEEP)

        chunk_start = chunk_end + timedelta(days=1)

    logger.info(f"백필 완료 — 총 {total_rows}건 적재")


if __name__ == "__main__":
    micro_batch_flow()
