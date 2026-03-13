from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv
from datetime import date, timedelta
from typing import Optional

load_dotenv()

app = FastAPI(title="Personal Data Hub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NAMES = {
    "005930": "삼성전자", "000660": "SK하이닉스", "035420": "NAVER",
    "035720": "카카오", "051910": "LG화학", "006400": "삼성SDI",
    "028260": "삼성물산", "012330": "현대모비스", "005380": "현대차",
    "000270": "기아", "068270": "셀트리온", "207940": "삼성바이오",
    "096770": "SK이노베이션", "003550": "LG", "034730": "SK",
    "015760": "한국전력", "032830": "삼성생명", "018260": "삼성SDS",
    "011200": "HMM", "066570": "LG전자", "055550": "신한지주",
    "105560": "KB금융", "086790": "하나금융", "316140": "우리금융",
    "138040": "메리츠금융", "000810": "삼성화재", "010130": "고려아연",
    "009150": "삼성전기", "001570": "금양", "011070": "LG이노텍",
    "017670": "SK텔레콤", "030200": "KT", "032640": "LG유플러스",
    "003490": "대한항공", "020150": "롯데에너지", "042660": "한화오션",
    "047050": "포스코인터", "005490": "POSCO홀딩스", "000100": "유한양행",
    "326030": "SK바이오팜", "196170": "알테오젠", "091990": "셀트리온헬스",
    "263750": "펄어비스", "036570": "엔씨소프트", "251270": "넷마블",
    "112040": "위메이드", "293490": "카카오게임즈", "259960": "크래프톤",
    "352820": "하이브", "041510": "SM엔터",
    "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "NVIDIA",
    "AMZN": "Amazon", "META": "Meta", "GOOGL": "Alphabet",
    "TSLA": "Tesla", "AVGO": "Broadcom", "COST": "Costco",
    "NFLX": "Netflix", "AMD": "AMD", "ADBE": "Adobe",
    "CSCO": "Cisco", "QCOM": "Qualcomm", "PEP": "PepsiCo",
    "TMUS": "T-Mobile", "INTU": "Intuit", "TXN": "TI",
    "AMGN": "Amgen", "AMAT": "Applied Materials", "ISRG": "Intuitive Surgical",
    "MU": "Micron", "LRCX": "Lam Research", "KLAC": "KLA",
    "PANW": "Palo Alto", "GILD": "Gilead", "ADI": "Analog Devices",
    "SNPS": "Synopsys", "CDNS": "Cadence", "MELI": "MercadoLibre",
    "ADP": "ADP", "SBUX": "Starbucks", "ORLY": "O'Reilly",
    "PYPL": "PayPal", "MRVL": "Marvell", "CRWD": "CrowdStrike",
    "DDOG": "Datadog", "ZS": "Zscaler", "ABNB": "Airbnb",
    "TEAM": "Atlassian", "MRNA": "Moderna", "IDXX": "IDEXX",
    "FAST": "Fastenal", "VRSK": "Verisk", "REGN": "Regeneron",
    "VRTX": "Vertex", "CPRT": "Copart", "FTNT": "Fortinet",
    "ON": "ON Semi", "ODFL": "Old Dominion",
}


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "192.168.45.147"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "trading_db"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


@app.get("/api/symbols")
def get_symbols():
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT symbol, exchange FROM assets ORDER BY exchange, symbol")
            rows = cur.fetchall()
        result = []
        for row in rows:
            result.append({
                "symbol": row["symbol"],
                "exchange": row["exchange"],
                "name": NAMES.get(row["symbol"], row["symbol"]),
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.get("/api/candles/daily/{symbol}")
def get_daily_candles(symbol: str, exchange: str = Query("NASDAQ")):
    conn = None
    try:
        conn = get_connection()
        is_krx = exchange.upper() == "KRX"
        tz = "Asia/Seoul" if is_krx else "America/New_York"

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    to_char(
                        date_trunc('day', datetime AT TIME ZONE %s),
                        'YYYY-MM-DD'
                    ) AS time,
                    (array_agg(open ORDER BY datetime))[1]  AS open,
                    MAX(high)                               AS high,
                    MIN(low)                                AS low,
                    (array_agg(close ORDER BY datetime DESC))[1] AS close,
                    SUM(volume)                             AS volume
                FROM minute_candles
                WHERE symbol = %s AND exchange = %s
                GROUP BY date_trunc('day', datetime AT TIME ZONE %s)
                ORDER BY time
                """,
                (tz, symbol, exchange.upper(), tz),
            )
            rows = cur.fetchall()

        result = []
        for row in rows:
            result.append({
                "time": row["time"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


def _bucket_label(days: int) -> tuple[str, str]:
    """Return (time_bucket_interval, label) based on day range."""
    if days <= 3:
        return "1 minute", "1분봉"
    elif days <= 14:
        return "5 minutes", "5분봉"
    elif days <= 60:
        return "30 minutes", "30분봉"
    else:
        return "2 hours", "2시간봉"


@app.get("/api/candles/minute/{symbol}")
def get_minute_candles(
    symbol: str,
    exchange: str = Query("NASDAQ"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    conn = None
    try:
        today = date.today()
        end_date = date.fromisoformat(end) if end else today
        start_date = date.fromisoformat(start) if start else (today - timedelta(days=7))

        days = (end_date - start_date).days
        bucket_interval, label = _bucket_label(days)

        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    time_bucket(%s, datetime) AS bucket,
                    (array_agg(open ORDER BY datetime))[1]       AS open,
                    MAX(high)                                     AS high,
                    MIN(low)                                      AS low,
                    (array_agg(close ORDER BY datetime DESC))[1] AS close,
                    SUM(volume)                                   AS volume
                FROM minute_candles
                WHERE symbol = %s
                  AND exchange = %s
                  AND datetime >= %s
                  AND datetime < %s
                GROUP BY bucket
                ORDER BY bucket
                """,
                (
                    bucket_interval,
                    symbol,
                    exchange.upper(),
                    start_date.isoformat(),
                    (end_date + timedelta(days=1)).isoformat(),
                ),
            )
            rows = cur.fetchall()

        candles = []
        for row in rows:
            candles.append({
                "time": row["bucket"].isoformat(),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            })

        return {"label": label, "candles": candles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
