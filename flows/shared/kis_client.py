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
    from shared.database import get_cached_token, save_token

    token = get_cached_token(conn)
    if token:
        return token

    token, expires_at = fetch_token_from_kis()
    print(f"[KIS] 신규 토큰 발급  만료: {expires_at.strftime('%Y-%m-%d %H:%M')}")
    save_token(conn, token, expires_at)
    return token


def _headers(token: str, tr_id: str, tr_cont: str = "") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "appkey": os.environ["KIS_APP_KEY"],
        "appsecret": os.environ["KIS_APP_SECRET"],
        "tr_id": tr_id,
        "tr_cont": tr_cont.strip(),
        "custtype": "P",
        "Content-Type": "application/json",
    }


def fetch_minute_candles(ticker: str, token: str, time_str: str) -> list[dict]:
    """
    당일 분봉 조회 (FHKST03010200)
    time_str: 'HHMMSS' 형식
    """
    resp = requests.get(
        f"{KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
        headers=_headers(token, "FHKST03010200"),
        params={
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_ETC_CLS_CODE": "0",
            "FID_INPUT_ISCD": ticker,
            "FID_INPUT_HOUR_1": time_str,
            "FID_PW_DATA_INCU_YN": "N",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("rt_cd") != "0":
        raise RuntimeError(f"KIS API 오류: rt_cd={data.get('rt_cd')}, msg={data.get('msg1', '')}")
    return data.get("output2", [])


def fetch_daily_minute_candles(
    ticker: str, token: str, date_str: str, time_str: str = "153000", tr_cont: str = ""
) -> tuple[list[dict], str]:
    """
    일별 분봉 조회 (FHKST03010230) — 최대 1년 과거 데이터
    date_str: 'YYYYMMDD'
    time_str: 조회 기준 시간 'HHMMSS' (해당 시간 이전 최대 120건 반환)
    반환: (candles, tr_cont) — tr_cont='M'이면 다음 페이지 있음
    """
    resp = requests.get(
        f"{KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice",
        headers=_headers(token, "FHKST03010230", tr_cont),
        params={
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker,
            "FID_INPUT_DATE_1": date_str,
            "FID_INPUT_HOUR_1": time_str,
            "FID_PW_DATA_INCU_YN": "Y",
            "FID_FAKE_TICK_INCU_YN": "N",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("rt_cd") != "0":
        print(f"[KIS] API 오류: rt_cd={data.get('rt_cd')}, msg={data.get('msg1', '')}")
        return [], " "

    next_tr_cont = resp.headers.get("tr_cont", " ")
    return data.get("output2", []), next_tr_cont


def fetch_all_candles_for_day(ticker: str, token: str, date_str: str, sleep_sec: float = 0.07) -> list[dict]:
    """
    하루치 전체 분봉 수집 (페이징 처리)
    120건씩 최대 4회 호출로 하루치(390분) 완성
    """
    import time as _time

    all_candles = []
    tr_cont = " "

    while True:
        candles, tr_cont = fetch_daily_minute_candles(ticker, token, date_str, tr_cont=tr_cont)
        all_candles.extend(candles)

        if tr_cont != "M":
            break

        _time.sleep(sleep_sec)

    return all_candles


def parse_candle(asset_id: int, raw: dict) -> tuple:
    """
    KIS 응답 → (time, asset_id, open, high, low, close, volume, source)
    """
    date_str = raw["stck_bsop_date"]   # YYYYMMDD
    time_str = raw["stck_cntg_hour"]   # HHMMSS
    dt = datetime.strptime(f"{date_str}{time_str}", "%Y%m%d%H%M%S").replace(tzinfo=KST)
    return (
        dt,
        asset_id,
        int(raw["stck_oprc"]) if raw["stck_oprc"] else None,
        int(raw["stck_hgpr"]) if raw["stck_hgpr"] else None,
        int(raw["stck_lwpr"]) if raw["stck_lwpr"] else None,
        int(raw["stck_prpr"]) if raw["stck_prpr"] else None,
        int(raw["cntg_vol"]) if raw["cntg_vol"] else None,
        "kis",
    )
