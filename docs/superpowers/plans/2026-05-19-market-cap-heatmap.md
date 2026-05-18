# 시총 기반 히트맵 타일 크기 조정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 섹터 히트맵의 타일 크기(종목 및 섹터 카드)를 `weight × market_cap`에 비례하게 만들고, shares_outstanding을 yfinance로 매일 자동 수집하며 설정 페이지에서 수동 입력 가능하게 한다.

**Architecture:** assets 테이블에 `shares_outstanding` 컬럼을 추가하고, Prefect가 매일 yfinance로 업데이트한다. API의 `/api/heatmap`이 `market_cap = close × shares_outstanding`을 계산해 반환하고, 프론트엔드는 이 값으로 tile `flexGrow`를 결정한다. 사이드바 하단 ⚙ 버튼에서 접근하는 설정 페이지에서 수동 입력도 가능하다.

**Tech Stack:** Python/Prefect/yfinance (backend), FastAPI/psycopg2 (API), React/TypeScript (frontend)

---

## 파일 구조

| 파일 | 변경 |
|------|------|
| `flows/nasdaq/ingestion.py` | `update_shares_flow` 추가 |
| `prefect.yaml` | `update-shares` 배포 추가 |
| `api/main.py` | `/api/heatmap` 수정, `/api/assets/settings` + `/api/assets/{id}/shares` 추가 |
| `frontend/src/types.ts` | `AssetSetting` 타입 추가, `Selected` 유니언에 `'settings'` 추가 |
| `frontend/src/api.ts` | `fetchAssetSettings`, `updateShares` 추가 |
| `frontend/src/pages/AssetSettingsPage.tsx` | 신규 |
| `frontend/src/App.tsx` | ⚙ 버튼 + settings 라우팅 |
| `frontend/src/pages/HeatmapPage.tsx` | tile 크기 공식 변경, 섹터 카드 flex 변경 |

---

## Task 1: DB DDL (사용자 수동 실행)

**Files:** NAS PostgreSQL 직접 접속

- [ ] **Step 1: NAS에서 DDL 실행**

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;
```

접속 방법:
```bash
psql -h 192.168.45.147 -U postgres trading_db
```

- [ ] **Step 2: 컬럼 확인**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'assets' AND column_name = 'shares_outstanding';
```

Expected: `shares_outstanding | bigint` 행 1개 반환

---

## Task 2: Prefect flow — update_shares_flow

**Files:**
- Modify: `flows/nasdaq/ingestion.py`
- Modify: `prefect.yaml`

- [ ] **Step 1: `flows/nasdaq/ingestion.py` 상단 import 확인**

파일 상단에 이미 있는 import:
```python
import time
import os
from prefect import flow, get_run_logger
from shared.database import get_conn
```

yfinance import는 아직 없으므로 파일 상단 import 블록에 추가:
```python
import yfinance as yf
```

- [ ] **Step 2: 파일 맨 아래 `if __name__ == "__main__":` 위에 flow 추가**

```python
@flow(name="update-shares", log_prints=True)
def update_shares_flow():
    logger = get_run_logger()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, symbol, exchange FROM assets WHERE asset_type != 'FUTURE' ORDER BY exchange, symbol"
            )
            assets = [{"id": r[0], "symbol": r[1], "exchange": r[2]} for r in cur.fetchall()]

    logger.info(f"주식수 업데이트 시작: {len(assets)}종목")
    updated, skipped = 0, 0

    for asset in assets:
        symbol = asset["symbol"]
        yf_symbol = symbol + ".KS" if asset["exchange"] == "KRX" else symbol
        try:
            shares = yf.Ticker(yf_symbol).info.get("sharesOutstanding")
            if shares:
                with get_conn() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE assets SET shares_outstanding = %s WHERE id = %s",
                            (shares, asset["id"]),
                        )
                    conn.commit()
                updated += 1
                logger.info(f"[{symbol}] {shares:,}")
            else:
                skipped += 1
                logger.warning(f"[{symbol}] sharesOutstanding 없음 — 스킵")
        except Exception as e:
            skipped += 1
            logger.warning(f"[{symbol}] 실패: {e}")
        time.sleep(0.5)

    logger.info(f"완료 — 업데이트: {updated}, 스킵: {skipped}")
```

- [ ] **Step 3: `prefect.yaml`에 배포 추가**

`prefect.yaml`의 마지막 배포 항목 아래에 추가:
```yaml
  - name: update-shares
    entrypoint: flows/nasdaq/ingestion.py:update_shares_flow
    work_pool:
      name: personal-data-hub-pool
    schedules:
      - cron: "0 22 * * 1-5"
        timezone: UTC
        # 매일 장 마감 후 22:00 UTC (평일만)
```

- [ ] **Step 4: 빌드 검증**

```bash
cd /Users/choizeus/prj/personal-data-hub
python -c "from flows.nasdaq.ingestion import update_shares_flow; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: 커밋**

```bash
git add flows/nasdaq/ingestion.py prefect.yaml
git commit -m "feat: update-shares Prefect flow 추가 (매일 yfinance로 주식수 업데이트)"
```

---

## Task 3: API — /api/heatmap 수정

**Files:**
- Modify: `api/main.py` (GET /api/heatmap, 약 375–440라인)

- [ ] **Step 1: heatmap 쿼리에 shares_outstanding 추가**

`api/main.py`의 `get_heatmap` 함수에서 SELECT 절 수정. 현재:
```python
                SELECT
                    s.id          AS sector_id,
                    s.name        AS sector_name,
                    a.id          AS asset_id,
                    a.symbol,
                    a.exchange,
                    ss.weight,
                    t.close,
```

다음으로 교체:
```python
                SELECT
                    s.id          AS sector_id,
                    s.name        AS sector_name,
                    a.id          AS asset_id,
                    a.symbol,
                    a.exchange,
                    ss.weight,
                    a.shares_outstanding,
                    t.close,
```

- [ ] **Step 2: 응답에 market_cap 필드 추가**

`get_heatmap` 함수의 응답 조립 부분. 현재:
```python
            sectors[sid]["stocks"].append({
                "asset_id": row["asset_id"],
                "symbol":   row["symbol"],
                "exchange": row["exchange"],
                "weight":   float(row["weight"]),
                "close":    float(row["close"]) if row["close"] is not None else None,
                "change_pct": float(row["change_pct"]) if row["change_pct"] is not None else None,
            })
```

다음으로 교체:
```python
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
```

- [ ] **Step 3: API 서버 로컬 기동 후 확인**

```bash
cd /Users/choizeus/prj/personal-data-hub/api
uvicorn main:app --reload --port 8001
```

별도 터미널:
```bash
curl -s "http://localhost:8001/api/heatmap" | python3 -m json.tool | grep -A2 "market_cap"
```

Expected: `"market_cap": <숫자 또는 null>` 필드 존재

- [ ] **Step 4: 커밋**

```bash
git add api/main.py
git commit -m "feat: heatmap API에 market_cap 필드 추가 (close × shares_outstanding)"
```

---

## Task 4: API — /api/assets/settings + /api/assets/{id}/shares

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: `SharesUpdate` Pydantic 모델 추가**

`api/main.py`의 기존 모델들 (`SectorCreate`, `SectorMemoUpdate` 등) 바로 아래에 추가:
```python
class SharesUpdate(BaseModel):
    shares_outstanding: int = Field(..., gt=0)
```

- [ ] **Step 2: GET /api/assets/settings 엔드포인트 추가**

`POST /api/symbols` 엔드포인트 바로 아래에 추가:
```python
@app.get("/api/assets/settings")
def get_asset_settings(exchange: Optional[str] = Query(None)):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if exchange:
                cur.execute(
                    "SELECT id, symbol, exchange, asset_type, shares_outstanding FROM assets WHERE exchange = %s ORDER BY symbol",
                    (exchange.upper(),),
                )
            else:
                cur.execute(
                    "SELECT id, symbol, exchange, asset_type, shares_outstanding FROM assets ORDER BY exchange, symbol"
                )
            rows = cur.fetchall()
        return [
            {
                "id": row["id"],
                "symbol": row["symbol"],
                "exchange": row["exchange"],
                "name": NAMES.get(row["symbol"], row["symbol"]),
                "asset_type": row["asset_type"],
                "shares_outstanding": row["shares_outstanding"],
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@app.patch("/api/assets/{asset_id}/shares")
def update_asset_shares(asset_id: int, body: SharesUpdate):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assets SET shares_outstanding = %s WHERE id = %s",
                (body.shares_outstanding, asset_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="asset not found")
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

- [ ] **Step 3: 엔드포인트 확인**

```bash
curl -s "http://localhost:8001/api/assets/settings?exchange=NASDAQ" | python3 -m json.tool | head -20
```

Expected: `symbol`, `exchange`, `asset_type`, `shares_outstanding` 필드를 가진 배열

- [ ] **Step 4: 커밋**

```bash
git add api/main.py
git commit -m "feat: /api/assets/settings, /api/assets/{id}/shares 엔드포인트 추가"
```

---

## Task 5: 프론트엔드 types.ts + api.ts

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: `types.ts`에 `AssetSetting` 타입 추가**

`frontend/src/types.ts` 파일 끝에 추가:
```typescript
export interface AssetSetting {
  id: number
  symbol: string
  exchange: string
  name: string
  asset_type: string
  shares_outstanding: number | null
}
```

- [ ] **Step 2: `Selected` 유니언에 `'settings'` 추가**

`frontend/src/types.ts`의 `Selected` 타입 수정:
```typescript
// 기존
export type Selected =
  | { type: 'symbol'; data: Symbol }
  | { type: 'sector'; data: Sector }

// 변경
export type Selected =
  | { type: 'symbol'; data: Symbol }
  | { type: 'sector'; data: Sector }
  | { type: 'settings' }
```

- [ ] **Step 3: `api.ts`에 import 추가 및 함수 추가**

`frontend/src/api.ts` 상단 import 수정:
```typescript
import type { Symbol, Candle, MinuteResponse, Sector, AssetSetting } from './types'
```

파일 끝에 추가:
```typescript
export async function fetchAssetSettings(exchange?: string): Promise<AssetSetting[]> {
  const url = exchange
    ? `/trading/api/assets/settings?exchange=${exchange}`
    : '/trading/api/assets/settings'
  const res = await fetch(url)
  if (!res.ok) throw new Error('asset settings fetch failed')
  return res.json()
}

export async function updateShares(id: number, shares: number): Promise<void> {
  const res = await fetch(`/trading/api/assets/${id}/shares`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shares_outstanding: shares }),
  })
  if (!res.ok) throw new Error('shares update failed')
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/choizeus/prj/personal-data-hub/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in`

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: AssetSetting 타입, fetchAssetSettings/updateShares API 함수 추가"
```

---

## Task 6: AssetSettingsPage.tsx 신규

**Files:**
- Create: `frontend/src/pages/AssetSettingsPage.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { useState, useEffect } from 'react'
import { fetchAssetSettings, updateShares } from '../api'
import type { AssetSetting } from '../types'

type Tab = 'ALL' | 'NASDAQ' | 'KRX' | 'CME'

export default function AssetSettingsPage() {
  const [assets, setAssets]       = useState<AssetSetting[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<Tab>('ALL')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    fetchAssetSettings()
      .then(setAssets)
      .finally(() => setLoading(false))
  }, [])

  const filtered = tab === 'ALL' ? assets : assets.filter((a) => a.exchange === tab)
  const missingCount = assets.filter(
    (a) => a.asset_type !== 'FUTURE' && a.shares_outstanding === null
  ).length

  async function handleSave(asset: AssetSetting) {
    const shares = parseInt(editValue.replace(/,/g, ''), 10)
    if (isNaN(shares) || shares <= 0) return
    setSaving(true)
    try {
      await updateShares(asset.id, shares)
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, shares_outstanding: shares } : a))
      )
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(asset: AssetSetting) {
    setEditingId(asset.id)
    setEditValue(asset.shares_outstanding ? String(asset.shares_outstanding) : '')
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 12,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    background: tab === t ? '#2563eb' : '#262626',
    color: tab === t ? '#fff' : '#888',
  })

  return (
    <div style={{ padding: 24, color: '#ccc', fontFamily: 'system-ui, sans-serif', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚙ 자산 설정</div>
        {missingCount > 0 && (
          <div style={{ fontSize: 12, color: '#ef5350' }}>
            ⚠ 주식수 미입력 종목 {missingCount}개 — 클릭해서 입력하면 히트맵 크기에 반영됩니다
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['ALL', 'NASDAQ', 'KRX', 'CME'] as Tab[]).map((t) => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t === 'ALL' ? '전체' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#555', fontSize: 13 }}>불러오는 중...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>종목</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>이름</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>거래소</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>주식수</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => {
              const isFuture  = asset.asset_type === 'FUTURE'
              const isEditing = editingId === asset.id
              const isMissing = !isFuture && asset.shares_outstanding === null

              return (
                <tr
                  key={asset.id}
                  style={{
                    borderBottom: '1px solid #1a1a1a',
                    background: isMissing ? '#1a0000' : 'transparent',
                    cursor: isFuture ? 'default' : 'pointer',
                  }}
                  onClick={() => !isFuture && !isEditing && startEdit(asset)}
                >
                  <td style={{ padding: '7px 10px', color: '#ddd', fontWeight: 500 }}>{asset.symbol}</td>
                  <td style={{ padding: '7px 10px', color: '#888' }}>{asset.name}</td>
                  <td style={{ padding: '7px 10px', color: '#666', fontSize: 11 }}>{asset.exchange}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {isFuture ? (
                      <span style={{ color: '#444' }}>해당없음</span>
                    ) : isEditing ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(asset)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          style={{
                            width: 160,
                            padding: '3px 8px',
                            background: '#262626',
                            border: '1px solid #444',
                            borderRadius: 4,
                            color: '#ccc',
                            fontSize: 12,
                            outline: 'none',
                          }}
                          placeholder="예: 15204000000"
                        />
                        <button
                          onClick={() => handleSave(asset)}
                          disabled={saving}
                          style={{ padding: '3px 10px', background: '#2563eb', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ padding: '3px 8px', background: 'none', border: '1px solid #333', borderRadius: 4, color: '#666', fontSize: 12, cursor: 'pointer' }}
                        >
                          취소
                        </button>
                      </div>
                    ) : isMissing ? (
                      <span style={{ color: '#ef5350', fontSize: 12 }}>⚠ 입력 필요</span>
                    ) : (
                      <span style={{ color: '#4ade80', fontSize: 12 }}>
                        {asset.shares_outstanding!.toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/choizeus/prj/personal-data-hub/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in`

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/pages/AssetSettingsPage.tsx
git commit -m "feat: AssetSettingsPage 신규 (주식수 테이블 + 인라인 편집)"
```

---

## Task 7: App.tsx — ⚙ 버튼 + 설정 라우팅

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: AssetSettingsPage import 추가**

`App.tsx` 상단 import 블록에 추가:
```typescript
import AssetSettingsPage from './pages/AssetSettingsPage'
```

- [ ] **Step 2: 사이드바 하단에 ⚙ 버튼 추가**

`App.tsx`에서 `</aside>` 닫는 태그 바로 위 `<div style={{ flex: 1, overflowY: 'auto' }}>` 다음, 스크롤 영역 끝난 뒤에 추가:

현재 `<div style={{ flex: 1, overflowY: 'auto' }}>...</div>` 닫는 부분 바로 뒤 `</aside>` 전에 삽입:
```tsx
        <div
          style={{
            padding: '8px 10px',
            borderTop: '1px solid #2a2a2a',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSelected({ type: 'settings' })}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: selected?.type === 'settings' ? '#1e3a5f' : 'none',
              border: selected?.type === 'settings' ? '1px solid #2563eb' : '1px solid transparent',
              borderRadius: 4,
              color: selected?.type === 'settings' ? '#90b8f8' : '#555',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
              whiteSpace: 'nowrap',
            }}
          >
            ⚙ 자산 설정
          </button>
        </div>
```

- [ ] **Step 3: 메인 영역 분기에 settings 케이스 추가**

`App.tsx`의 메인 영역 분기 부분. 현재:
```tsx
        {selected?.type === 'sector' ? (
          <SectorPage ... />
        ) : selected?.type === 'symbol' ? (
          <ChartPage symbol={selected.data} />
        ) : (
          <HeatmapPage ... />
        )}
```

다음으로 교체:
```tsx
        {selected?.type === 'settings' ? (
          <AssetSettingsPage />
        ) : selected?.type === 'sector' ? (
          <SectorPage
            sector={selected.data}
            onSelectSymbol={handleSelectFromHeatmap}
            onEdit={() => setEditingSector(selected.data)}
          />
        ) : selected?.type === 'symbol' ? (
          <ChartPage symbol={selected.data} />
        ) : (
          <HeatmapPage
            symbols={symbols}
            sectors={sectors}
            onSelectSymbol={handleSelectFromHeatmap}
            onSelectSector={handleSelectSectorFromHeatmap}
          />
        )}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/choizeus/prj/personal-data-hub/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in`

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/App.tsx
git commit -m "feat: 사이드바 하단 ⚙ 자산 설정 버튼 + 설정 페이지 라우팅"
```

---

## Task 8: HeatmapPage.tsx — 시총 기반 타일 크기

**Files:**
- Modify: `frontend/src/pages/HeatmapPage.tsx`

- [ ] **Step 1: HeatmapStock 인터페이스에 market_cap 추가**

파일 상단의 `HeatmapStock` 인터페이스 수정:
```typescript
// 기존
interface HeatmapStock {
  asset_id: number
  symbol: string
  exchange: string
  weight: number
  close: number | null
  change_pct: number | null
}

// 변경
interface HeatmapStock {
  asset_id: number
  symbol: string
  exchange: string
  weight: number
  close: number | null
  change_pct: number | null
  market_cap: number | null
}
```

- [ ] **Step 2: eff 헬퍼 함수 추가 및 섹터 컨테이너 flex 변경**

`export default function HeatmapPage(...)` 함수 바로 안 `return` 앞에 헬퍼 추가:

현재 `return (` 바로 앞에 삽입:
```typescript
  const eff = (s: HeatmapStock) =>
    s.market_cap !== null ? s.weight * s.market_cap : s.weight
```

- [ ] **Step 3: 섹터 카드 컨테이너 grid → flex 변경**

현재:
```tsx
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 10,
      }}>
```

다음으로 교체:
```tsx
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-start',
      }}>
```

- [ ] **Step 4: 각 섹터 카드에 flexGrow 추가**

현재 섹터 카드 `<div key={sector.id} style={{ border: ...`:
```tsx
            <div key={sector.id} style={{ border: '1px solid #2a2a2a', borderRadius: 6, overflow: 'hidden' }}>
```

다음으로 교체 (섹터 시총 합산 기반 flexGrow):
```tsx
            <div key={sector.id} style={{
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              overflow: 'hidden',
              flexGrow: sector.stocks.reduce((sum, s) => sum + eff(s), 0) || 1,
              flexShrink: 0,
              flexBasis: 280,
              minWidth: 280,
            }}>
```

- [ ] **Step 5: 종목 타일 widthPct + flexGrow 변경**

`heatmap.map((sector) => {` 블록 안 상단에서 `totalWeight` 계산 라인을 찾아 `totalEff`로 교체:

```tsx
// 기존 (삭제)
const totalWeight = sector.stocks.reduce((s, st) => s + st.weight, 0)

// 변경 (totalEff는 섹터 루프 안, 종목 루프 밖에서 한 번만 계산)
const totalEff = sector.stocks.reduce((sum, s) => sum + eff(s), 0)
```

같은 블록 안 종목 루프 내 widthPct:
```tsx
// 기존
const widthPct = Math.max(8, (stock.weight / totalWeight) * 100)

// 변경
const widthPct = Math.max(8, (eff(stock) / totalEff) * 100)
```

타일 스타일의 `flexGrow`:
```tsx
// 기존
flexGrow: stock.weight,

// 변경
flexGrow: eff(stock),
```

- [ ] **Step 6: 빌드 확인**

```bash
cd /Users/choizeus/prj/personal-data-hub/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in`

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/pages/HeatmapPage.tsx
git commit -m "feat: 히트맵 타일 크기 weight×market_cap 비례로 변경, 섹터 카드도 시총 비례"
```

---

## Task 9: 최종 push + prefect deploy

- [ ] **Step 1: push**

```bash
git pull --rebase origin main && git push origin main
```

- [ ] **Step 2: Prefect 배포 등록 (Mac에서 실행)**

```bash
prefect profile use nas
prefect deploy --all
```

Expected: `update-shares` 배포가 목록에 포함됨

- [ ] **Step 3: 동작 확인 체크리스트**

1. 브라우저에서 `http://192.168.45.200` 접속
2. 사이드바 하단 "⚙ 자산 설정" 버튼 클릭 → 설정 페이지 열림
3. 주식수 미입력 종목에 ⚠ 표시 확인
4. 종목 클릭 → 인라인 input 활성화 → 숫자 입력 → 저장
5. Prefect UI (`http://192.168.45.147:4200`)에서 `update-shares` 배포 수동 실행
6. DB에서 확인: `SELECT symbol, shares_outstanding FROM assets WHERE shares_outstanding IS NOT NULL LIMIT 5;`
7. 히트맵 페이지(홈)에서 섹터별 카드 크기가 달라졌는지 확인
