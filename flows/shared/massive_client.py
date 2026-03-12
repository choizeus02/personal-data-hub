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


def fetch_minute_bars(ticker: str, start: date, end: date) -> list[dict]:
    """
    1분봉 OHLCV 조회 (페이지네이션 자동 처리)
    - split adjusted 기본 적용
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

    results = []
    while url:
        time.sleep(RATE_LIMIT_SLEEP)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") not in ("OK", "DELAYED"):
            raise RuntimeError(f"Massive API 오류: {data.get('status')} / {data}")

        results.extend(data.get("results") or [])
        next_url = data.get("next_url")
        url = next_url
        params = {"apiKey": api_key}  # next_url은 cursor 포함, apiKey만 추가

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
