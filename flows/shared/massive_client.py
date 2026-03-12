"""
Massive.com (구 Polygon.io) REST API 클라이언트
무료 플랜: 5 API calls/minute, 2년 히스토리
"""
import os
import time
import requests
from datetime import datetime, timezone, date

MASSIVE_BASE_URL = "https://api.massive.com"
MASSIVE_MAX_HISTORY_DAYS = 720  # 무료 플랜 2년
RATE_LIMIT_SLEEP = 13.0         # 5 calls/min 안전 마진 (60/5 + 1)


def iter_minute_bars(ticker: str, start: date, end: date):
    """
    1분봉 OHLCV 페이지 단위 generator
    - 페이지마다 (page_num, bars) yield → 호출측에서 즉시 upsert 가능
    - 호출마다 sleep → 5 calls/min 준수
    """
    api_key = os.environ["MASSIVE_API_KEY"]
    url = f"{MASSIVE_BASE_URL}/v2/aggs/ticker/{ticker}/range/1/minute/{start}/{end}"
    params = {
        "adjusted": "true",
        "sort": "asc",
        "limit": 50000,
        "apiKey": api_key,
    }

    page = 1
    while url:
        time.sleep(RATE_LIMIT_SLEEP)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") not in ("OK", "DELAYED"):
            raise RuntimeError(f"Massive API 오류: {data.get('status')} / {data}")

        bars = data.get("results") or []
        yield page, bars

        next_url = data.get("next_url")
        url = next_url
        params = {"apiKey": api_key}
        page += 1


def fetch_minute_bars(ticker: str, start: date, end: date) -> list[dict]:
    """전체 페이지 한 번에 반환 (하위 호환용)"""
    results = []
    for _, bars in iter_minute_bars(ticker, start, end):
        results.extend(bars)
    return results


def parse_bar(asset_id: int, raw: dict) -> tuple:
    """Massive bar → (time, asset_id, open, high, low, close, volume)"""
    ts = datetime.fromtimestamp(raw["t"] / 1000, tz=timezone.utc)
    return (
        ts,
        asset_id,
        float(raw["o"]),
        float(raw["h"]),
        float(raw["l"]),
        float(raw["c"]),
        int(raw["v"]),
    )
