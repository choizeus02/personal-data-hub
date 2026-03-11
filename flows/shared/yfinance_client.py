"""
yfinance 기반 나스닥 분봉 수집 클라이언트

제약사항:
- 1m 분봉: 최근 7일치만 제공 (Yahoo Finance 정책)
- 요청 간 sleep 불필요 (단일 호출로 전 종목 동시 처리 가능)
- 반환 시간대: UTC (tz-aware)
- 장 운영 시간: 09:30~16:00 ET (UTC-5/UTC-4)
"""

from datetime import datetime, timezone, timedelta

import yfinance as yf
import pandas as pd

# yfinance 1m 분봉 최대 조회 가능 기간
YFINANCE_1M_MAX_DAYS = 7

ET = timezone(timedelta(hours=-5))  # EST (겨울 기준, 서머타임 미적용)
MARKET_OPEN_ET = (9, 30)
MARKET_CLOSE_ET = (16, 0)


def is_market_open() -> bool:
    """나스닥 장 운영 시간 여부 (서머타임 미고려, 단순 시간 체크)"""
    now_et = datetime.now(ET)
    if now_et.weekday() >= 5:
        return False
    t = (now_et.hour, now_et.minute)
    return MARKET_OPEN_ET <= t <= MARKET_CLOSE_ET


def _df_to_candles(df) -> list[dict]:
    """DataFrame → candle dict 리스트 변환 (MultiIndex 컬럼 자동 처리)"""
    # yfinance >= 0.2.31은 단일 종목도 MultiIndex 반환 → 첫 번째 레벨 제거
    if isinstance(df.columns, pd.MultiIndex):
        df = df.droplevel(1, axis=1)

    result = []
    for ts, row in df.iterrows():
        if hasattr(ts, "to_pydatetime"):
            ts = ts.to_pydatetime()
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        result.append({
            "time": ts,
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]),
        })
    return result


def fetch_latest_candle(ticker: str) -> dict | None:
    """
    단일 종목 최신 1분봉 1건 반환
    반환: {"time": datetime(UTC), "open": float, "high": float, "low": float, "close": float, "volume": int}
    """
    df = yf.Ticker(ticker).history(period="1d", interval="1m")
    if df.empty:
        return None
    candles = _df_to_candles(df)
    return candles[-1] if candles else None


def fetch_candles_for_range(ticker: str, start: datetime, end: datetime) -> list[dict]:
    """
    지정 기간 1m 분봉 일괄 조회 (최대 7일 제약)
    start/end: timezone-aware datetime
    반환: [{"time": datetime(UTC), "open", "high", "low", "close", "volume"}, ...]
    """
    df = yf.Ticker(ticker).history(
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        interval="1m",
    )
    if df.empty:
        return []
    return _df_to_candles(df)


def parse_candle(asset_id: int, raw: dict) -> tuple:
    """
    yfinance 응답 dict → (time, asset_id, open, high, low, close, volume)
    """
    return (
        raw["time"],
        asset_id,
        raw["open"],
        raw["high"],
        raw["low"],
        raw["close"],
        raw["volume"],
    )
