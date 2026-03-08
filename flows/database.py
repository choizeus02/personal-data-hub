import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import execute_values


@contextmanager
def get_conn():
    host = os.environ["DB_HOST"]
    dbname = os.environ["DB_NAME"]
    print(f"[DB] 연결 시도: {host}/{dbname}")
    conn = psycopg2.connect(
        host=host,
        port=os.environ["DB_PORT"],
        dbname=dbname,
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
    print(f"[DB] 연결 성공")
    try:
        yield conn
        conn.commit()
        print(f"[DB] 커밋 완료")
    except Exception as e:
        conn.rollback()
        print(f"[DB] 롤백: {e}")
        raise
    finally:
        conn.close()
        print(f"[DB] 연결 종료")


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS kis_token (
                id SERIAL PRIMARY KEY,
                access_token TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS minute_candles (
                ticker      VARCHAR(10)   NOT NULL,
                datetime    TIMESTAMPTZ   NOT NULL,
                open        NUMERIC,
                high        NUMERIC,
                low         NUMERIC,
                close       NUMERIC,
                volume      BIGINT,
                PRIMARY KEY (ticker, datetime)
            )
        """)
    conn.commit()  # DDL은 즉시 커밋 (이후 롤백에 영향받지 않도록)


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


def get_latest_candle_datetime(conn):
    """DB에서 가장 최근 분봉 시간 반환. 데이터 없으면 None"""
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(datetime) FROM minute_candles")
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def upsert_candles(conn, rows: list[tuple]):
    """
    rows: [(ticker, datetime, open, high, low, close, volume), ...]
    """
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO minute_candles (ticker, datetime, open, high, low, close, volume)
            VALUES %s
            ON CONFLICT (ticker, datetime) DO UPDATE SET
                open   = EXCLUDED.open,
                high   = EXCLUDED.high,
                low    = EXCLUDED.low,
                close  = EXCLUDED.close,
                volume = EXCLUDED.volume
            """,
            rows,
        )
