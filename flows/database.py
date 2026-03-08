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
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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
