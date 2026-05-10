# Sector Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 종목을 묶어 커스텀 섹터를 만들고, 기준 100 가중 지수 캔들 차트로 합산 퍼포먼스를 확인한다.

**Architecture:** DB에 sectors/sector_stocks 저장, 백엔드 SQL에서 가중 OHLCV 합산 계산, 프론트엔드는 기존 StockChart 재사용. 섹터 선택 시 SectorPage를 렌더링하고 App.tsx의 selected 타입을 Symbol | Sector 유니온으로 확장한다.

**Tech Stack:** FastAPI + psycopg2 (API), React + TypeScript (Frontend), LightweightCharts (차트), TimescaleDB time_bucket (SQL 집계)

---

## File Map

| 파일 | 작업 |
|------|------|
| DB (수동 DDL) | sectors, sector_stocks 테이블 생성 |
| `api/main.py` | 섹터 CRUD 4개 + 합산 캔들 엔드포인트 1개 추가 |
| `frontend/src/types.ts` | `Sector`, `SectorStock`, `Selected` 타입 추가 |
| `frontend/src/api.ts` | 섹터 fetch 함수 4개 추가 |
| `frontend/src/pages/SectorPage.tsx` | 신규 — 섹터 합산 캔들 차트 페이지 |
| `frontend/src/components/SectorEditor.tsx` | 신규 — 섹터 생성/편집 모달 |
| `frontend/src/App.tsx` | sectors 상태, 섹터 사이드바 그룹, SectorPage 라우팅 |

---

## Task 1: DB 스키마 적용

**Files:**
- 수동 DDL (psql 직접 실행)

- [ ] **Step 1: NAS PostgreSQL에 접속해 테이블 생성**

```sql
CREATE TABLE sectors (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR NOT NULL
);

CREATE TABLE sector_stocks (
  sector_id  INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
  asset_id   INTEGER REFERENCES assets(id)  ON DELETE CASCADE,
  weight     NUMERIC NOT NULL DEFAULT 1.0,
  PRIMARY KEY (sector_id, asset_id)
);
```

실행:
```bash
psql -h 192.168.45.147 -U choizeus -d trading_db
```

- [ ] **Step 2: 테이블 생성 확인**

```sql
\d sectors
\d sector_stocks
```

Expected: 각 테이블 컬럼/제약 출력.

---

## Task 2: API — 섹터 CRUD

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Pydantic 모델 추가**

`api/main.py`의 imports 아래, `get_connection()` 함수 위에 추가:

```python
from pydantic import BaseModel

class SectorCreate(BaseModel):
    name: str

class SectorStockItem(BaseModel):
    asset_id: int
    weight: float
```

- [ ] **Step 2: GET /api/sectors 추가**

```python
@app.get("/api/sectors")
def get_sectors():
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name FROM sectors ORDER BY id")
            sectors = cur.fetchall()
            result = []
            for s in sectors:
                cur.execute(
                    """
                    SELECT ss.asset_id, ss.weight, a.symbol, a.exchange
                    FROM sector_stocks ss
                    JOIN assets a ON a.id = ss.asset_id
                    WHERE ss.sector_id = %s
                    ORDER BY ss.asset_id
                    """,
                    (s["id"],),
                )
                stocks = cur.fetchall()
                result.append({
                    "id": s["id"],
                    "name": s["name"],
                    "stocks": [
                        {
                            "asset_id": st["asset_id"],
                            "weight": float(st["weight"]),
                            "symbol": st["symbol"],
                            "exchange": st["exchange"],
                        }
                        for st in stocks
                    ],
                })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
```

- [ ] **Step 3: POST /api/sectors 추가**

```python
@app.post("/api/sectors", status_code=201)
def create_sector(body: SectorCreate):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO sectors (name) VALUES (%s) RETURNING id, name",
                (body.name,),
            )
            row = cur.fetchone()
        conn.commit()
        return {"id": row["id"], "name": row["name"], "stocks": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
```

- [ ] **Step 4: DELETE /api/sectors/:id 추가**

```python
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
```

- [ ] **Step 5: PUT /api/sectors/:id/stocks 추가**

```python
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
```

- [ ] **Step 6: 동작 확인**

```bash
curl http://localhost:8000/api/sectors
# → []

curl -X POST http://localhost:8000/api/sectors \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트"}'
# → {"id":1,"name":"테스트","stocks":[]}

curl -X DELETE http://localhost:8000/api/sectors/1
# → 204
```

- [ ] **Step 7: 커밋**

```bash
git add api/main.py
git commit -m "feat: 섹터 CRUD API 추가 (GET/POST/DELETE/PUT)"
```

---

## Task 3: API — 섹터 합산 캔들

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: GET /api/sectors/:id/candles 추가**

`api/main.py`에 추가 (Task 2 코드 아래):

```python
@app.get("/api/sectors/{sector_id}/candles")
def get_sector_candles(
    sector_id: int,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    conn = None
    try:
        today = date.today()
        end_date   = date.fromisoformat(end)   if end   else today
        start_date = date.fromisoformat(start) if start else (today - timedelta(days=7))

        days = (end_date - start_date).days
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
                    SUM((b.open  / bp.base_close) * 100 * nw.w) AS open,
                    SUM((b.high  / bp.base_close) * 100 * nw.w) AS high,
                    SUM((b.low   / bp.base_close) * 100 * nw.w) AS low,
                    SUM((b.close / bp.base_close) * 100 * nw.w) AS close,
                    SUM(b.volume * nw.w)::BIGINT                 AS volume
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
```

- [ ] **Step 2: 동작 확인 (섹터에 종목이 있어야 함)**

```bash
# 섹터 생성 후 종목 추가 (asset_id는 DB에서 확인)
curl -X POST http://localhost:8000/api/sectors \
  -H "Content-Type: application/json" -d '{"name":"반도체"}'

curl -X PUT http://localhost:8000/api/sectors/1/stocks \
  -H "Content-Type: application/json" \
  -d '[{"asset_id":1,"weight":60},{"asset_id":2,"weight":40}]'

curl "http://localhost:8000/api/sectors/1/candles?start=2026-05-01&end=2026-05-09"
# → {"label":"5분봉","candles":[{"time":"...","open":100.0,...},...]}
```

- [ ] **Step 3: 커밋**

```bash
git add api/main.py
git commit -m "feat: 섹터 합산 OHLCV 캔들 API 추가"
```

---

## Task 4: 프론트엔드 — 타입 및 API 함수

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: types.ts에 섹터 타입 추가**

```typescript
export interface SectorStock {
  asset_id: number
  weight: number
  symbol: string
  exchange: string
}

export interface Sector {
  id: number
  name: string
  stocks: SectorStock[]
}

export type Selected =
  | { type: 'symbol'; data: Symbol }
  | { type: 'sector'; data: Sector }
```

- [ ] **Step 2: api.ts에 섹터 fetch 함수 추가**

`api.ts` 끝에 추가:

```typescript
export async function fetchSectors(): Promise<Sector[]> {
  const res = await fetch('/trading/api/sectors')
  if (!res.ok) throw new Error('sectors fetch failed')
  return res.json()
}

export async function createSector(name: string): Promise<Sector> {
  const res = await fetch('/trading/api/sectors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('sector create failed')
  return res.json()
}

export async function deleteSector(id: number): Promise<void> {
  const res = await fetch(`/trading/api/sectors/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('sector delete failed')
}

export async function updateSectorStocks(
  id: number,
  stocks: { asset_id: number; weight: number }[]
): Promise<void> {
  const res = await fetch(`/trading/api/sectors/${id}/stocks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stocks),
  })
  if (!res.ok) throw new Error('sector stocks update failed')
}

export async function fetchSectorCandles(
  id: number,
  start: string,
  end: string
): Promise<MinuteResponse> {
  const res = await fetch(`/trading/api/sectors/${id}/candles?start=${start}&end=${end}`)
  if (!res.ok) throw new Error('sector candles fetch failed')
  return res.json()
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: 섹터 타입 및 API 함수 추가"
```

---

## Task 5: 프론트엔드 — SectorPage

**Files:**
- Create: `frontend/src/pages/SectorPage.tsx`

- [ ] **Step 1: SectorPage.tsx 생성**

```typescript
import { useState, useEffect, useRef } from 'react'
import { fetchSectorCandles } from '../api'
import type { Sector, Candle } from '../types'
import StockChart, { type Timezone, type StockChartHandle } from '../components/StockChart'

type Period = '1D' | '3D' | '1W' | '1M' | '3M'

interface Props {
  sector: Sector
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const PERIOD_DAYS: Record<Period, number> = {
  '1D': 1, '3D': 3, '1W': 7, '1M': 30, '3M': 90,
}

export default function SectorPage({ sector }: Props) {
  const chartRef = useRef<StockChartHandle>(null)
  const [period, setPeriod]     = useState<Period>('1W')
  const [timezone, setTimezone] = useState<Timezone>('Asia/Seoul')
  const [candles, setCandles]   = useState<Candle[]>([])
  const [label, setLabel]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles([])

    const today = new Date()
    const end   = formatDate(today)
    const start = formatDate(new Date(today.getTime() - (PERIOD_DAYS[period] - 1) * 86400000))

    fetchSectorCandles(sector.id, start, end)
      .then((data) => {
        if (!cancelled) {
          setCandles(data.candles)
          setLabel(data.label)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '데이터 로드 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [sector.id, period])

  const activeBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? '#2563eb' : '#262626',
    color: active ? '#fff' : '#888',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  })

  const todayChange = candles.length >= 2
    ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close * 100).toFixed(2)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{sector.name}</span>
        <span style={{ fontSize: 11, color: '#555' }}>{sector.stocks.length}개 종목</span>
        {todayChange !== null && (
          <span style={{ fontSize: 13, color: Number(todayChange) >= 0 ? '#26a69a' : '#ef5350', marginLeft: 4 }}>
            {Number(todayChange) >= 0 ? '+' : ''}{todayChange}%
          </span>
        )}
        {label && <span style={{ fontSize: 12, color: '#2563eb', marginLeft: 'auto' }}>{label}</span>}
      </div>

      {/* Controls */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {(['1D', '3D', '1W', '1M', '3M'] as Period[]).map((p) => (
          <button key={p} style={activeBtn(period === p)} onClick={() => setPeriod(p)}>{p}</button>
        ))}
        <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />
        <button style={activeBtn(timezone === 'Asia/Seoul')} onClick={() => setTimezone('Asia/Seoul')}>KST</button>
        <button style={activeBtn(timezone === 'UTC')} onClick={() => setTimezone('UTC')}>UTC</button>
        <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />
        <button style={activeBtn(false)} onClick={() => chartRef.current?.resetZoom()}>전체보기</button>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14, zIndex: 10 }}>
            로딩 중...
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350', fontSize: 14, zIndex: 10 }}>
            오류: {error}
          </div>
        )}
        {!loading && !error && candles.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 14, zIndex: 10 }}>
            데이터 없음
          </div>
        )}
        {!loading && !error && candles.length > 0 && (
          <StockChart
            ref={chartRef}
            candles={candles}
            overlays={new Set()}
            timezone={timezone}
            exchange="SECTOR"
            isIntraday={false}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/pages/SectorPage.tsx
git commit -m "feat: SectorPage 추가 (섹터 합산 캔들 차트)"
```

---

## Task 6: 프론트엔드 — SectorEditor 모달

**Files:**
- Create: `frontend/src/components/SectorEditor.tsx`

- [ ] **Step 1: SectorEditor.tsx 생성**

```typescript
import { useState, useEffect } from 'react'
import type { Sector, SectorStock, Symbol } from '../types'
import { createSector, updateSectorStocks, deleteSector } from '../api'

interface Props {
  sector: Sector | null        // null = 신규 생성
  symbols: Symbol[]
  onSave: (sector: Sector) => void
  onDelete: (id: number) => void
  onClose: () => void
}

export default function SectorEditor({ sector, symbols, onSave, onDelete, onClose }: Props) {
  const [name, setName]     = useState(sector?.name ?? '')
  const [stocks, setStocks] = useState<SectorStock[]>(sector?.stocks ?? [])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(sector?.name ?? '')
    setStocks(sector?.stocks ?? [])
  }, [sector])

  const totalWeight = stocks.reduce((s, st) => s + st.weight, 0)

  function addStock(sym: Symbol) {
    const assetId = symbols.find(
      (s) => s.symbol === sym.symbol && s.exchange === sym.exchange
    )
    if (!assetId) return
    if (stocks.some((s) => s.symbol === sym.symbol && s.exchange === sym.exchange)) return
    const defaultWeight = stocks.length === 0 ? 100 : stocks[0].weight
    setStocks((prev) => [
      ...prev,
      { asset_id: (sym as any).asset_id ?? 0, weight: defaultWeight, symbol: sym.symbol, exchange: sym.exchange },
    ])
    setSearch('')
  }

  function removeStock(symbol: string, exchange: string) {
    setStocks((prev) => prev.filter((s) => !(s.symbol === symbol && s.exchange === exchange)))
  }

  function setWeight(symbol: string, exchange: string, value: number) {
    setStocks((prev) =>
      prev.map((s) => s.symbol === symbol && s.exchange === exchange ? { ...s, weight: value } : s)
    )
  }

  async function handleSave() {
    if (!name.trim() || stocks.length === 0) return
    setSaving(true)
    try {
      let saved: Sector
      if (sector) {
        await updateSectorStocks(sector.id, stocks.map((s) => ({ asset_id: s.asset_id, weight: s.weight })))
        saved = { ...sector, name, stocks }
      } else {
        saved = await createSector(name.trim())
        await updateSectorStocks(saved.id, stocks.map((s) => ({ asset_id: s.asset_id, weight: s.weight })))
        saved = { ...saved, stocks }
      }
      onSave(saved)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!sector) return
    if (!confirm(`"${sector.name}" 섹터를 삭제할까요?`)) return
    await deleteSector(sector.id)
    onDelete(sector.id)
  }

  const filtered = symbols.filter(
    (s) =>
      !stocks.some((st) => st.symbol === s.symbol && st.exchange === s.exchange) &&
      (s.symbol.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase()))
  )

  const inputStyle: React.CSSProperties = {
    background: '#262626', border: '1px solid #333', borderRadius: 6,
    color: '#ccc', fontSize: 13, padding: '6px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
        padding: 24, width: 420, maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
          {sector ? '섹터 편집' : '섹터 추가'}
        </div>

        {/* 섹터명 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>섹터명</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 반도체" />
        </div>

        {/* 종목 검색 */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>종목 추가</div>
          <input
            style={inputStyle}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="종목 검색..."
          />
          {search && (
            <div style={{ border: '1px solid #333', borderRadius: 6, marginTop: 4, maxHeight: 150, overflowY: 'auto' }}>
              {filtered.slice(0, 10).map((s) => (
                <div
                  key={`${s.exchange}-${s.symbol}`}
                  onClick={() => addStock(s)}
                  style={{ padding: '6px 10px', cursor: 'pointer', color: '#ccc', fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#262626')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {s.symbol} <span style={{ color: '#555', fontSize: 11 }}>{s.name}</span>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: '6px 10px', color: '#555', fontSize: 13 }}>결과 없음</div>}
            </div>
          )}
        </div>

        {/* 종목 목록 & 비중 */}
        {stocks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginBottom: 4 }}>
              <span>구성 종목</span>
              <span>합계: {totalWeight.toFixed(0)}</span>
            </div>
            {stocks.map((s) => (
              <div key={`${s.exchange}-${s.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13, color: '#ddd' }}>{s.symbol}</span>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, width: 70 }}
                  value={s.weight}
                  onChange={(e) => setWeight(s.symbol, s.exchange, Number(e.target.value))}
                />
                <button
                  onClick={() => removeStock(s.symbol, s.exchange)}
                  style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {sector && (
            <button
              onClick={handleDelete}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #ef5350', background: 'transparent', color: '#ef5350', cursor: 'pointer', fontSize: 13 }}
            >
              삭제
            </button>
          )}
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 13 }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || stocks.length === 0}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/SectorEditor.tsx
git commit -m "feat: SectorEditor 모달 추가"
```

---

## Task 7: 프론트엔드 — App.tsx 통합

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: imports 교체 및 상태 추가**

기존 import 블록을:

```typescript
import { useState, useEffect } from 'react'
import { fetchSymbols, toggleFavorite } from './api'
import type { Symbol } from './types'
import ChartPage from './pages/ChartPage'
```

아래로 교체:

```typescript
import { useState, useEffect } from 'react'
import { fetchSymbols, fetchSectors, toggleFavorite } from './api'
import type { Symbol, Sector, Selected } from './types'
import ChartPage from './pages/ChartPage'
import SectorPage from './pages/SectorPage'
import SectorEditor from './components/SectorEditor'
```

- [ ] **Step 2: 컴포넌트 상태 추가**

기존:
```typescript
const [selected, setSelected] = useState<Symbol | null>(null)
```

교체:
```typescript
const [selected, setSelected]       = useState<Selected>(null)
const [sectors, setSectors]         = useState<Sector[]>([])
const [editingSector, setEditingSector] = useState<Sector | null | 'new'>('new' as const | null)
```

`editingSector`는 `null`(모달 닫힘) | `Sector`(편집) | `'new'`(신규 생성).

실제 상태 타입:
```typescript
const [editingSector, setEditingSector] = useState<Sector | 'new' | null>(null)
```

- [ ] **Step 3: fetchSectors useEffect 추가**

기존 `fetchSymbols` useEffect 안에 sectors 로드 추가:

```typescript
useEffect(() => {
  Promise.all([fetchSymbols(), fetchSectors()])
    .then(([symbolData, sectorData]) => {
      setSymbols(symbolData)
      setSectors(sectorData)
      if (symbolData.length > 0) setSelected({ type: 'symbol', data: symbolData[0] })
    })
    .catch((e) => setError(e.message))
    .finally(() => setLoading(false))
}, [])
```

- [ ] **Step 4: toggleFavorite 핸들러 수정**

`handleToggleFav` 내부 `setSelected` 호출을 타입에 맞게 수정:

```typescript
// 기존 setSelected(data[0]) → 아래로 교체
if (symbolData.length > 0) setSelected({ type: 'symbol', data: symbolData[0] })
```

`handleToggleFav`는 Symbol 타입만 다루므로 변경 없음.

- [ ] **Step 5: filter 로직 및 섹터 그룹 렌더링 추가**

기존:
```typescript
const favorites = filtered.filter((s) => s.isFavorite)
const krx       = filtered.filter((s) => s.exchange === 'KRX')
const nasdaq    = filtered.filter((s) => s.exchange === 'NASDAQ')
const futures   = filtered.filter((s) => s.exchange === 'CME')
```

아래 유지하고, `renderGroup` 함수 아래에 섹터 렌더 함수 추가:

```typescript
function renderSectorGroup() {
  const filteredSectors = sectors.filter((s) =>
    s.name.toLowerCase().includes(q)
  )
  return (
    <div>
      <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: '#a78bfa', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>섹터</span>
        <button
          onClick={() => setEditingSector('new')}
          style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          title="섹터 추가"
        >+</button>
      </div>
      {filteredSectors.map((sector) => {
        const isSelected = selected?.type === 'sector' && selected.data.id === sector.id
        return (
          <div
            key={sector.id}
            onClick={() => setSelected({ type: 'sector', data: sector })}
            style={{
              padding: '6px 10px 6px 14px',
              cursor: 'pointer',
              background: isSelected ? '#1e3a5f' : 'transparent',
              borderLeft: isSelected ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>{sector.name}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{sector.stocks.length}개 종목</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setEditingSector(sector) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', color: '#444' }}
              title="편집"
            >✏</button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: JSX 렌더 수정**

사이드바 그룹 순서를 아래로 교체:

```tsx
{renderSectorGroup()}
{renderGroup('★ 즐겨찾기', favorites, '#f59e0b')}
{favorites.length > 0 && <div style={{ height: 1, background: '#222', margin: '4px 0' }} />}
{renderGroup('FUTURES', futures, '#a78bfa')}
{renderGroup('NASDAQ', nasdaq)}
{renderGroup('KRX', krx)}
```

main 영역 수정:

```tsx
<main style={{ flex: 1, overflow: 'hidden', background: '#0f0f0f' }}>
  {selected?.type === 'sector' ? (
    <SectorPage sector={selected.data} />
  ) : selected?.type === 'symbol' ? (
    <ChartPage symbol={selected.data} />
  ) : (
    <div style={{ padding: 40, color: '#444', fontSize: 15 }}>좌측에서 종목을 선택하세요.</div>
  )}
</main>
```

SectorEditor 모달 (닫힌 상태 기본):

```tsx
{editingSector !== null && (
  <SectorEditor
    sector={editingSector === 'new' ? null : editingSector}
    symbols={symbols}
    onSave={(saved) => {
      setSectors((prev) =>
        editingSector === 'new'
          ? [...prev, saved]
          : prev.map((s) => (s.id === saved.id ? saved : s))
      )
      setEditingSector(null)
    }}
    onDelete={(id) => {
      setSectors((prev) => prev.filter((s) => s.id !== id))
      if (selected?.type === 'sector' && selected.data.id === id) setSelected(null)
      setEditingSector(null)
    }}
    onClose={() => setEditingSector(null)}
  />
)}
```

- [ ] **Step 7: ChartPage의 symbol prop 타입 확인**

`ChartPage`는 `symbol: Symbol`을 받음. `selected.data`가 `Symbol` 타입이므로 그대로 전달 가능. 변경 없음.

- [ ] **Step 8: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 9: 커밋 및 push**

```bash
git add frontend/src/App.tsx
git commit -m "feat: App.tsx 섹터 사이드바 및 SectorPage 라우팅 통합"
git pull --rebase origin main && git push origin main
```

---

## Task 8: SectorEditor에 asset_id 주입

**Note:** SectorEditor에서 종목 추가 시 `asset_id`가 필요한데, 현재 `Symbol` 타입에는 없음. `fetchSymbols` 응답에 `asset_id`를 포함하거나, SectorEditor에서 추가 API 호출로 해결.

**Files:**
- Modify: `api/main.py`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/SectorEditor.tsx`

- [ ] **Step 1: GET /api/symbols 응답에 asset_id 추가**

`api/main.py`의 `get_symbols()` 반환값에 `id` 필드 추가:

```python
cur.execute("SELECT id, symbol, exchange, is_favorite FROM assets ORDER BY exchange, symbol")
rows = cur.fetchall()
return [
    {
        "id": row["id"],           # 추가
        "symbol": row["symbol"],
        "exchange": row["exchange"],
        "name": NAMES.get(row["symbol"], row["symbol"]),
        "isFavorite": row["is_favorite"] == 1,
    }
    for row in rows
]
```

- [ ] **Step 2: Symbol 타입에 id 추가**

`frontend/src/types.ts`:

```typescript
export interface Symbol {
  id: number        // 추가
  symbol: string
  exchange: string
  name: string
  isFavorite: boolean
}
```

- [ ] **Step 3: SectorEditor의 addStock 수정**

`SectorEditor.tsx`의 `addStock` 함수 교체:

```typescript
function addStock(sym: Symbol) {
  if (stocks.some((s) => s.symbol === sym.symbol && s.exchange === sym.exchange)) return
  const defaultWeight = stocks.length === 0 ? 100 : stocks[0].weight
  setStocks((prev) => [
    ...prev,
    { asset_id: sym.id, weight: defaultWeight, symbol: sym.symbol, exchange: sym.exchange },
  ])
  setSearch('')
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 빌드 성공.

- [ ] **Step 5: 커밋 및 push**

```bash
git add api/main.py frontend/src/types.ts frontend/src/components/SectorEditor.tsx
git commit -m "fix: Symbol에 asset_id(id) 추가, SectorEditor 종목 추가 연결"
git pull --rebase origin main && git push origin main
```

---

## 최종 배포

- [ ] DB DDL 적용 (Task 1) 확인
- [ ] ArgoCD에서 api + frontend Pod rollout 완료 확인
- [ ] `192.168.45.200/trading/` 접속 → 사이드바 "섹터" 그룹 + `+` 버튼 표시 확인
- [ ] 섹터 생성 → 종목 추가 → 저장 → 섹터 클릭 → 캔들 차트 표시 확인
