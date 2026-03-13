import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import execute_values


@contextmanager
def get_conn():
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_tables(conn):
    with conn.cursor() as cur:
        # TimescaleDB extension
        cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

        # 자산 마스터
        cur.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                id          SERIAL PRIMARY KEY,
                symbol      VARCHAR(20)  NOT NULL,
                asset_type  VARCHAR(20)  NOT NULL,
                exchange    VARCHAR(20)  NOT NULL,
                currency    VARCHAR(10)  NOT NULL,
                UNIQUE (symbol, exchange)
            )
        """)

        # 분봉 시계열 (Hypertable)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ohlcv_min (
                time        TIMESTAMPTZ  NOT NULL,
                asset_id    INTEGER      NOT NULL REFERENCES assets(id),
                open        NUMERIC,
                high        NUMERIC,
                low         NUMERIC,
                close       NUMERIC,
                volume      BIGINT,
                source      VARCHAR(20),
                PRIMARY KEY (time, asset_id)
            )
        """)

        cur.execute("""
            SELECT create_hypertable('ohlcv_min', 'time', if_not_exists => TRUE)
        """)

        # KIS 토큰 캐시
        cur.execute("""
            CREATE TABLE IF NOT EXISTS kis_token (
                id           SERIAL PRIMARY KEY,
                access_token TEXT        NOT NULL,
                expires_at   TIMESTAMPTZ NOT NULL,
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )
        """)

    conn.commit()


def get_or_create_asset(conn, symbol: str, asset_type: str, exchange: str, currency: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO assets (symbol, asset_type, exchange, currency)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (symbol, exchange) DO NOTHING
            RETURNING id
            """,
            (symbol, asset_type, exchange, currency),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            "SELECT id FROM assets WHERE symbol = %s AND exchange = %s",
            (symbol, exchange),
        )
        return cur.fetchone()[0]


def get_cached_token(conn) -> str | None:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT access_token FROM kis_token
            WHERE expires_at > NOW() + INTERVAL '5 minutes'
            ORDER BY created_at DESC
            LIMIT 1
        """)
        row = cur.fetchone()
    return row[0] if row else None


def save_token(conn, access_token: str, expires_at):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kis_token (access_token, expires_at) VALUES (%s, %s)",
            (access_token, expires_at),
        )


def get_existing_days(conn, exchange: str, start, end) -> set:
    """
    DB에 데이터가 있는 날짜 집합 반환 (exchange 로컬 날짜 기준)
    start/end: date 또는 datetime
    """
    tz = "Asia/Seoul" if exchange == "KRX" else "America/New_York"
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT DATE(o.time AT TIME ZONE %s)
            FROM ohlcv_min o
            JOIN assets a ON a.id = o.asset_id
            WHERE a.exchange = %s
              AND o.time >= %s AND o.time < %s
        """, (tz, exchange, start, end))
        return {row[0] for row in cur.fetchall()}


def get_earliest_candle_datetime(conn, exchange: str | None = None):
    """가장 오래된 분봉 시간 반환 (역사 데이터 gap 확인용)"""
    with conn.cursor() as cur:
        if exchange:
            cur.execute("""
                SELECT MIN(o.time)
                FROM ohlcv_min o
                JOIN assets a ON a.id = o.asset_id
                WHERE a.exchange = %s
            """, (exchange,))
        else:
            cur.execute("SELECT MIN(time) FROM ohlcv_min")
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def get_latest_candle_datetime(conn, exchange: str | None = None):
    """
    가장 최근 분봉 시간 반환 (backfill range 계산용)
    exchange 지정 시 해당 거래소 자산만 조회 (KRX / NASDAQ 등)
    """
    with conn.cursor() as cur:
        if exchange:
            cur.execute("""
                SELECT MAX(o.time)
                FROM ohlcv_min o
                JOIN assets a ON a.id = o.asset_id
                WHERE a.exchange = %s
            """, (exchange,))
        else:
            cur.execute("SELECT MAX(time) FROM ohlcv_min")
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def upsert_ohlcv(conn, rows: list[tuple]):
    """
    rows: [(time, asset_id, open, high, low, close, volume, source), ...]
    """
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO ohlcv_min (time, asset_id, open, high, low, close, volume, source)
            VALUES %s
            ON CONFLICT (time, asset_id) DO UPDATE SET
                open   = EXCLUDED.open,
                high   = EXCLUDED.high,
                low    = EXCLUDED.low,
                close  = EXCLUDED.close,
                volume = EXCLUDED.volume,
                source = EXCLUDED.source
            """,
            rows,
        )
