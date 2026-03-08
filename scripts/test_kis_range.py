"""
KIS API 1분봉 조회 가능 범위 테스트
- 오늘부터 하루씩 과거로 가면서 데이터 있는지 확인
- 실행: python scripts/test_kis_range.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "flows"))

import requests

KIS_BASE_URL = os.environ.get("KIS_BASE_URL", "https://openapi.koreainvestment.com:9443")
KST = timezone(timedelta(hours=9))
TEST_TICKER = "005930"  # 삼성전자


def get_token():
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
    return resp.json()["access_token"]


def fetch_candles(token: str, date_str: str) -> list:
    """date_str: YYYYMMDD"""
    resp = requests.get(
        f"{KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
        headers={
            "Authorization": f"Bearer {token}",
            "appkey": os.environ["KIS_APP_KEY"],
            "appsecret": os.environ["KIS_APP_SECRET"],
            "tr_id": "FHKST03010200",
        },
        params={
            "FID_ETC_CLS_CODE": "0",
            "FID_INPUT_ISCD": TEST_TICKER,
            "FID_INPUT_HOUR_1": "093000",
            "FID_PW_DATA_INCU_YN": "Y",  # 전체 조회
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("rt_cd") != "0":
        return []

    candles = data.get("output2", [])
    # 특정 날짜 데이터만 필터
    return [c for c in candles if c.get("stck_bsop_date") == date_str]


def is_weekday(dt: datetime) -> bool:
    return dt.weekday() < 5


if __name__ == "__main__":
    print("KIS API 토큰 발급 중...")
    token = get_token()
    print("토큰 발급 완료\n")

    today = datetime.now(KST).date()
    results = []

    print(f"{'날짜':<12} {'영업일':<6} {'데이터'}")
    print("-" * 35)

    for i in range(90):  # 최대 90일 전까지 테스트
        target = today - timedelta(days=i)
        target_dt = datetime.combine(target, datetime.min.time())
        date_str = target.strftime("%Y%m%d")
        weekday = is_weekday(target_dt)

        if not weekday:
            print(f"{date_str:<12} {'휴일':<6} -")
            continue

        try:
            candles = fetch_candles(token, date_str)
            has_data = len(candles) > 0
            print(f"{date_str:<12} {'영업일':<6} {'✅ ' + str(len(candles)) + '개' if has_data else '❌ 없음'}")
            results.append((date_str, has_data))

            if not has_data and len(results) > 3:
                print(f"\n→ 데이터 한계: {results[-2][0]} 까지 조회 가능")
                break

        except Exception as e:
            print(f"{date_str:<12} {'영업일':<6} ⚠️  오류: {e}")
            break
