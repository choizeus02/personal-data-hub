import os
from datetime import datetime, timedelta, timezone

import requests

KIS_BASE_URL = os.environ.get("KIS_BASE_URL", "https://openapi.koreainvestment.com:9443")
KST = timezone(timedelta(hours=9))


def fetch_token_from_kis() -> tuple[str, datetime]:
    resp = requests.post(
        f"{KIS_BASE_URL}/oauth2/tokenP",
        json={
            "appkey": os.environ["KIS_APP_KEY"],
            "appsecret": os.environ["KIS_APP_SECRET"],
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    access_token = data["access_token"]
    expires_at = datetime.now(KST) + timedelta(seconds=data["expires_in"])
    return access_token, expires_at


def get_access_token(conn) -> str:
    from database import get_cached_token, save_token

    token = get_cached_token(conn)
    if token:
        return token

    token, expires_at = fetch_token_from_kis()
    save_token(conn, token, expires_at)
    return token


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "appkey": os.environ["KIS_APP_KEY"],
        "appsecret": os.environ["KIS_APP_SECRET"],
        "tr_id": "FHKST03010200",
        "Content-Type": "application/json",
    }


def fetch_minute_candles(ticker: str, token: str, time_str: str) -> list[dict]:
    """
    time_str: 'HHMMSS' 형식 (e.g., '093000')
    최신 1분봉 반환 (output2 리스트)
    """
    resp = requests.get(
        f"{KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
        headers=_headers(token),
        params={
            "FID_ETC_CLS_CODE": "0",
            "FID_INPUT_ISCD": ticker,
            "FID_INPUT_HOUR_1": time_str,
            "FID_PW_DATA_INCU_YN": "N",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("output2", [])


def parse_candle(ticker: str, raw: dict) -> tuple:
    """
    KIS 응답 → (ticker, datetime, open, high, low, close, volume)
    """
    date_str = raw["stck_bsop_date"]   # YYYYMMDD
    time_str = raw["stck_cntg_hour"]   # HHMMSS
    dt = datetime.strptime(f"{date_str}{time_str}", "%Y%m%d%H%M%S").replace(tzinfo=KST)
    return (
        ticker,
        dt,
        int(raw["stck_oprc"]) if raw["stck_oprc"] else None,
        int(raw["stck_hgpr"]) if raw["stck_hgpr"] else None,
        int(raw["stck_lwpr"]) if raw["stck_lwpr"] else None,
        int(raw["stck_prpr"]) if raw["stck_prpr"] else None,
        int(raw["cntg_vol"]) if raw["cntg_vol"] else None,
    )
