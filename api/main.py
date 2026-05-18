from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv
from datetime import date, timedelta
from typing import Optional
from pydantic import BaseModel, Field

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
    "ES=F": "E-mini S&P 500", "NQ=F": "E-mini NASDAQ-100",
}


class SymbolCreate(BaseModel):
    symbol: str = Field(..., min_length=1)
    exchange: str = Field(..., min_length=1)
    asset_type: str = Field(default="STOCK")
    currency: str = Field(default="USD")

class SectorCreate(BaseModel):
    name: str = Field(..., min_length=1)

class SectorStockItem(BaseModel):
    asset_id: int
    weight: float = Field(..., gt=0)

class SectorMemoUpdate(BaseModel):
    memo: Optional[str] = None


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
            cur.execute("SELECT id, symbol, exchange, is_favorite FROM assets ORDER BY exchange, symbol")
            rows = cur.fetchall()
        return [
            {
                "id": row["id"],
                "symbol": row["symbol"],
                "exchange": row["exchange"],
                "name": NAMES.get(row["symbol"], row["symbol"]),
                "isFavorite": row["is_favorite"] == 1,
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.patch("/api/symbols/{symbol}/favorite")
def toggle_favorite(symbol: str, exchange: str = Query(...)):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE assets SET is_favorite = 1 - is_favorite
                WHERE symbol = %s AND exchange = %s
                RETURNING is_favorite
                """,
                (symbol, exchange.upper()),
            )
            row = cur.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="symbol not found")
        return {"isFavorite": row["is_favorite"] == 1}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.post("/api/symbols", status_code=201)
def create_symbol(data: SymbolCreate):
    conn = None
    try:
        sym = data.symbol.upper().strip()
        exc = data.exchange.upper().strip()
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO assets (symbol, asset_type, exchange, currency)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (symbol, exchange) DO NOTHING
                RETURNING id, symbol, exchange, is_favorite
                """,
                (sym, data.asset_type, exc, data.currency),
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "SELECT id, symbol, exchange, is_favorite FROM assets WHERE symbol = %s AND exchange = %s",
                    (sym, exc),
                )
                row = cur.fetchone()
        conn.commit()
        return {
            "id": row["id"],
            "symbol": row["symbol"],
            "exchange": row["exchange"],
            "name": NAMES.get(row["symbol"], row["symbol"]),
            "isFavorite": row["is_favorite"] == 1,
        }
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
        tz = "Asia/Seoul" if exchange.upper() == "KRX" else "America/New_York"

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    to_char(
                        date_trunc('day', o.time AT TIME ZONE %s),
                        'YYYY-MM-DD'
                    ) AS time,
                    (array_agg(o.open  ORDER BY o.time))[1]        AS open,
                    MAX(o.high)                                      AS high,
                    MIN(o.low)                                       AS low,
                    (array_agg(o.close ORDER BY o.time DESC))[1]    AS close,
                    SUM(o.volume)                                    AS volume
                FROM ohlcv_min o
                JOIN assets a ON a.id = o.asset_id
                WHERE a.symbol = %s AND a.exchange = %s
                  AND (
                    -- 정규장 시간만 포함 (NASDAQ: 9:30-16:00 ET, KRX: 9:00-15:30 KST)
                    CASE %s
                      WHEN 'America/New_York' THEN
                        (EXTRACT(HOUR FROM o.time AT TIME ZONE %s) * 60
                         + EXTRACT(MINUTE FROM o.time AT TIME ZONE %s))
                        BETWEEN 570 AND 959
                      WHEN 'Asia/Seoul' THEN
                        (EXTRACT(HOUR FROM o.time AT TIME ZONE %s) * 60
                         + EXTRACT(MINUTE FROM o.time AT TIME ZONE %s))
                        BETWEEN 540 AND 929
                      ELSE TRUE
                    END
                  )
                GROUP BY date_trunc('day', o.time AT TIME ZONE %s)
                ORDER BY time
                """,
                (tz, symbol, exchange.upper(), tz, tz, tz, tz, tz, tz),
            )
            rows = cur.fetchall()

        return [
            {
                "time": row["time"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.get("/api/candles/weekly/{symbol}")
def get_weekly_candles(symbol: str, exchange: str = Query("NASDAQ")):
    conn = None
    try:
        conn = get_connection()
        tz = "Asia/Seoul" if exchange.upper() == "KRX" else "America/New_York"

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    to_char(
                        date_trunc('week', o.time AT TIME ZONE %s),
                        'YYYY-MM-DD'
                    ) AS time,
                    (array_agg(o.open  ORDER BY o.time))[1]        AS open,
                    MAX(o.high)                                      AS high,
                    MIN(o.low)                                       AS low,
                    (array_agg(o.close ORDER BY o.time DESC))[1]    AS close,
                    SUM(o.volume)                                    AS volume
                FROM ohlcv_min o
                JOIN assets a ON a.id = o.asset_id
                WHERE a.symbol = %s AND a.exchange = %s
                  AND (
                    CASE %s
                      WHEN 'America/New_York' THEN
                        (EXTRACT(HOUR FROM o.time AT TIME ZONE %s) * 60
                         + EXTRACT(MINUTE FROM o.time AT TIME ZONE %s))
                        BETWEEN 570 AND 959
                      WHEN 'Asia/Seoul' THEN
                        (EXTRACT(HOUR FROM o.time AT TIME ZONE %s) * 60
                         + EXTRACT(MINUTE FROM o.time AT TIME ZONE %s))
                        BETWEEN 540 AND 929
                      ELSE TRUE
                    END
                  )
                GROUP BY date_trunc('week', o.time AT TIME ZONE %s)
                ORDER BY time
                """,
                (tz, symbol, exchange.upper(), tz, tz, tz, tz, tz, tz),
            )
            rows = cur.fetchall()

        return [
            {
                "time": row["time"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


def _bucket_interval(days: int) -> tuple[str, str]:
    if days <= 3:
        return "1 minute", "1분봉"
    elif days <= 14:
        return "5 minutes", "5분봉"
    elif days <= 60:
        return "30 minutes", "30분봉"
    else:
        return "1 day", "일봉"


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
        bucket_interval, label = _bucket_interval(days)

        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    time_bucket(%s, o.time)                          AS bucket,
                    (array_agg(o.open  ORDER BY o.time))[1]         AS open,
                    MAX(o.high)                                       AS high,
                    MIN(o.low)                                        AS low,
                    (array_agg(o.close ORDER BY o.time DESC))[1]     AS close,
                    SUM(o.volume)                                     AS volume
                FROM ohlcv_min o
                JOIN assets a ON a.id = o.asset_id
                WHERE a.symbol = %s
                  AND a.exchange = %s
                  AND o.time >= %s
                  AND o.time < %s
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

        return {
            "label": label,
            "candles": [
                {
                    "time": row["bucket"].isoformat(),
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": int(row["volume"]),
                }
                for row in rows
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.get("/api/sectors")
def get_sectors():
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT s.id, s.name, s.memo,
                       ss.asset_id, ss.weight, a.symbol, a.exchange
                FROM sectors s
                LEFT JOIN sector_stocks ss ON ss.sector_id = s.id
                LEFT JOIN assets a ON a.id = ss.asset_id
                ORDER BY s.id, ss.asset_id
                """
            )
            rows = cur.fetchall()

        sectors: dict = {}
        for row in rows:
            sid = row["id"]
            if sid not in sectors:
                sectors[sid] = {"id": sid, "name": row["name"], "memo": row["memo"], "stocks": []}
            if row["asset_id"] is not None:
                sectors[sid]["stocks"].append({
                    "asset_id": row["asset_id"],
                    "weight": float(row["weight"]),
                    "symbol": row["symbol"],
                    "exchange": row["exchange"],
                })
        return list(sectors.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.get("/api/heatmap")
def get_heatmap():
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                WITH sector_assets AS (
                    SELECT DISTINCT ss.asset_id
                    FROM sector_stocks ss
                ),
                daily_closes AS (
                    SELECT
                        o.asset_id,
                        DATE(o.time AT TIME ZONE 'UTC') AS day,
                        (array_agg(o.close ORDER BY o.time DESC))[1] AS close
                    FROM ohlcv_min o
                    WHERE o.asset_id IN (SELECT asset_id FROM sector_assets)
                      AND o.time >= CURRENT_DATE - INTERVAL '5 days'
                    GROUP BY o.asset_id, DATE(o.time AT TIME ZONE 'UTC')
                ),
                ranked AS (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY day DESC) AS rn
                    FROM daily_closes
                )
                SELECT
                    s.id          AS sector_id,
                    s.name        AS sector_name,
                    a.id          AS asset_id,
                    a.symbol,
                    a.exchange,
                    ss.weight,
                    a.shares_outstanding,
                    t.close,
                    CASE
                        WHEN y.close IS NOT NULL AND y.close > 0
                        THEN ROUND(((t.close - y.close) / y.close * 100)::numeric, 2)
                        ELSE NULL
                    END AS change_pct
                FROM sectors s
                JOIN sector_stocks ss ON ss.sector_id = s.id
                JOIN assets a         ON a.id = ss.asset_id
                LEFT JOIN ranked t    ON t.asset_id = ss.asset_id AND t.rn = 1
                LEFT JOIN ranked y    ON y.asset_id = ss.asset_id AND y.rn = 2
                ORDER BY s.id, ss.weight DESC
            """)
            rows = cur.fetchall()

        sectors: dict = {}
        for row in rows:
            sid = row["sector_id"]
            if sid not in sectors:
                sectors[sid] = {"id": sid, "name": row["sector_name"], "stocks": []}
            market_cap = (
                float(row["close"]) * row["shares_outstanding"]
                if row["close"] is not None and row["shares_outstanding"] is not None
                else None
            )
            sectors[sid]["stocks"].append({
                "asset_id": row["asset_id"],
                "symbol":   row["symbol"],
                "exchange": row["exchange"],
                "weight":   float(row["weight"]),
                "close":    float(row["close"]) if row["close"] is not None else None,
                "change_pct": float(row["change_pct"]) if row["change_pct"] is not None else None,
                "market_cap": market_cap,
            })
        return list(sectors.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.post("/api/sectors", status_code=201)
def create_sector(body: SectorCreate):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO sectors (name) VALUES (%s) RETURNING id, name, memo",
                (body.name,),
            )
            row = cur.fetchone()
        conn.commit()
        return {"id": row["id"], "name": row["name"], "memo": row["memo"], "stocks": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.patch("/api/sectors/{sector_id}/memo")
def update_sector_memo(sector_id: int, body: SectorMemoUpdate):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE sectors SET memo = %s WHERE id = %s",
                (body.memo, sector_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="sector not found")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.delete("/api/sectors/{sector_id}", status_code=204)
def delete_sector(sector_id: int):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sectors WHERE id = %s", (sector_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="sector not found")
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.put("/api/sectors/{sector_id}/stocks")
def update_sector_stocks(sector_id: int, stocks: list[SectorStockItem]):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM sectors WHERE id = %s", (sector_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="sector not found")
            cur.execute("DELETE FROM sector_stocks WHERE sector_id = %s", (sector_id,))
            for s in stocks:
                cur.execute(
                    "INSERT INTO sector_stocks (sector_id, asset_id, weight) VALUES (%s, %s, %s)",
                    (sector_id, s.asset_id, s.weight),
                )
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.get("/api/sectors/{sector_id}/candles")
def get_sector_candles(
    sector_id: int,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    chart_type: str = Query('minute'),
):
    conn = None
    try:
        today = date.today()
        end_date   = date.fromisoformat(end)   if end   else today
        start_date = date.fromisoformat(start) if start else (today - timedelta(days=7))

        days = (end_date - start_date).days
        if chart_type == 'daily':
            bucket_interval, label = '1 day', '일봉'
        elif chart_type == 'weekly':
            bucket_interval, label = '1 week', '주봉'
        else:
            bucket_interval, label = _bucket_interval(days)

        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM sectors WHERE id = %s", (sector_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="sector not found")

            cur.execute(
                """
                WITH norm_weights AS (
                    SELECT
                        ss.asset_id,
                        ss.weight / SUM(ss.weight) OVER () AS w
                    FROM sector_stocks ss
                    WHERE ss.sector_id = %(sector_id)s
                ),
                base_prices AS (
                    SELECT DISTINCT ON (o.asset_id)
                        o.asset_id,
                        o.close AS base_close
                    FROM ohlcv_min o
                    JOIN norm_weights nw ON o.asset_id = nw.asset_id
                    WHERE o.time >= %(start)s AND o.time < %(end)s
                    ORDER BY o.asset_id, o.time ASC
                ),
                bucketed AS (
                    SELECT
                        time_bucket(%(interval)s::interval, o.time)         AS bucket,
                        o.asset_id,
                        (array_agg(o.open  ORDER BY o.time ASC))[1]         AS open,
                        MAX(o.high)                                          AS high,
                        MIN(o.low)                                           AS low,
                        (array_agg(o.close ORDER BY o.time DESC))[1]        AS close,
                        SUM(o.volume)                                        AS volume
                    FROM ohlcv_min o
                    JOIN norm_weights nw ON o.asset_id = nw.asset_id
                    WHERE o.time >= %(start)s AND o.time < %(end)s
                    GROUP BY bucket, o.asset_id
                )
                SELECT
                    bucket AS time,
                    SUM((b.open  / bp.base_close) * 100 * nw.w) / SUM(nw.w) AS open,
                    SUM((b.high  / bp.base_close) * 100 * nw.w) / SUM(nw.w) AS high,
                    SUM((b.low   / bp.base_close) * 100 * nw.w) / SUM(nw.w) AS low,
                    SUM((b.close / bp.base_close) * 100 * nw.w) / SUM(nw.w) AS close,
                    SUM(b.volume * nw.w)::BIGINT                              AS volume
                FROM bucketed b
                JOIN base_prices bp ON b.asset_id = bp.asset_id
                JOIN norm_weights nw ON b.asset_id = nw.asset_id
                GROUP BY bucket
                ORDER BY bucket
                """,
                {
                    "sector_id": sector_id,
                    "start": start_date.isoformat(),
                    "end": (end_date + timedelta(days=1)).isoformat(),
                    "interval": bucket_interval,
                },
            )
            rows = cur.fetchall()

        return {
            "label": label,
            "candles": [
                {
                    "time": row["time"].isoformat(),
                    "open":   float(row["open"]),
                    "high":   float(row["high"]),
                    "low":    float(row["low"]),
                    "close":  float(row["close"]),
                    "volume": int(row["volume"]),
                }
                for row in rows
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
