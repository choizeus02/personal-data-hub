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
  const [name, setName]         = useState(sector?.name ?? '')
  const [stocks, setStocks]     = useState<SectorStock[]>(sector?.stocks ?? [])
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setName(sector?.name ?? '')
    setStocks(sector?.stocks ?? [])
  }, [sector?.id])

  const totalWeight = stocks.reduce((s, st) => s + st.weight, 0)

  function addStock(sym: Symbol) {
    const asset_id = (sym as any).asset_id
    if (!asset_id) return  // will be fixed in Task 8 when Symbol.id is added
    if (stocks.some((s) => s.symbol === sym.symbol && s.exchange === sym.exchange)) return
    const defaultWeight = stocks.length === 0 ? 100 : stocks[0].weight
    setStocks((prev) => [
      ...prev,
      { asset_id, weight: defaultWeight, symbol: sym.symbol, exchange: sym.exchange },
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
    setSaveError(null)
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!sector) return
    if (!confirm(`"${sector.name}" 섹터를 삭제할까요?`)) return
    try {
      await deleteSector(sector.id)
      onDelete(sector.id)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '삭제 실패')
    }
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

        {/* 에러 메시지 */}
        {saveError && (
          <div style={{ color: '#ef5350', fontSize: 12, marginBottom: 8, textAlign: 'right' }}>
            {saveError}
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
