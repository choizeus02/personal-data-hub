import { useState, useEffect } from 'react'
import { fetchSymbols, fetchSectors, toggleFavorite, addSymbol } from './api'
import type { Symbol, Sector, Selected } from './types'
import ChartPage from './pages/ChartPage'
import SectorPage from './pages/SectorPage'
import SectorEditor from './components/SectorEditor'
import HeatmapPage from './pages/HeatmapPage'
import AssetSettingsPage from './pages/AssetSettingsPage'

export default function App() {
  const [symbols, setSymbols]   = useState<Symbol[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [selected, setSelected]           = useState<Selected | null>(null)
  const [sectors, setSectors]             = useState<Sector[]>([])
  const [editingSector, setEditingSector] = useState<Sector | 'new' | null>(null)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [addingSymbol, setAddingSymbol]   = useState(false)
  const [newTicker, setNewTicker]         = useState('')
  const [newExchange, setNewExchange]     = useState('NASDAQ')
  const [addError, setAddError]           = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSymbols(), fetchSectors()])
      .then(([symbolData, sectorData]) => {
        setSymbols(symbolData)
        setSectors(sectorData)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleFav(e: React.MouseEvent, s: Symbol) {
    e.stopPropagation()
    // Optimistic update
    setSymbols((prev) =>
      prev.map((x) =>
        x.symbol === s.symbol && x.exchange === s.exchange
          ? { ...x, isFavorite: !x.isFavorite }
          : x
      )
    )
    try {
      const { isFavorite } = await toggleFavorite(s.symbol, s.exchange)
      setSymbols((prev) =>
        prev.map((x) =>
          x.symbol === s.symbol && x.exchange === s.exchange ? { ...x, isFavorite } : x
        )
      )
    } catch {
      // rollback on error
      setSymbols((prev) =>
        prev.map((x) =>
          x.symbol === s.symbol && x.exchange === s.exchange
            ? { ...x, isFavorite: s.isFavorite }
            : x
        )
      )
    }
  }

  function handleSelectFromHeatmap(symbol: string, exchange: string) {
    const sym = symbols.find((s) => s.symbol === symbol && s.exchange === exchange)
    if (sym) setSelected({ type: 'symbol', data: sym })
  }

  function handleSelectSectorFromHeatmap(sectorId: number) {
    const sector = sectors.find((s) => s.id === sectorId)
    if (sector) setSelected({ type: 'sector', data: sector })
  }

  async function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault()
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return
    setAddError(null)
    try {
      const currency = newExchange === 'KRX' ? 'KRW' : 'USD'
      const assetType = newExchange === 'CME' ? 'FUTURE' : 'STOCK'
      const added = await addSymbol(ticker, newExchange, assetType, currency)
      setSymbols((prev) => {
        const exists = prev.some((s) => s.symbol === added.symbol && s.exchange === added.exchange)
        return exists ? prev : [...prev, added]
      })
      setNewTicker('')
      setAddingSymbol(false)
    } catch {
      setAddError('추가 실패')
    }
  }

  const q        = search.toLowerCase()
  const filtered = symbols.filter(
    (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  )
  const favorites = filtered.filter((s) => s.isFavorite)
  const krx       = filtered.filter((s) => s.exchange === 'KRX')
  const nasdaq    = filtered.filter((s) => s.exchange === 'NASDAQ')
  const futures   = filtered.filter((s) => s.exchange === 'CME')

  function renderGroup(label: string, items: Symbol[], accent?: string) {
    if (!items.length) return null
    return (
      <div key={label}>
        <div style={{
          padding: '8px 14px 4px', fontSize: 11, fontWeight: 600,
          color: accent ?? '#555', letterSpacing: '0.8px',
        }}>
          {label}
        </div>
        {items.map((s) => {
          const isSelected = selected?.type === 'symbol' && selected.data.symbol === s.symbol && selected.data.exchange === s.exchange
          return (
            <div
              key={`${s.exchange}-${s.symbol}`}
              onClick={() => setSelected({ type: 'symbol', data: s })}
              style={{
                padding: '6px 10px 6px 14px',
                cursor: 'pointer',
                background: isSelected ? '#1e3a5f' : 'transparent',
                borderLeft: isSelected ? '2px solid #2563eb' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>{s.symbol}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{s.name}</div>
              </div>
              <button
                onClick={(e) => handleToggleFav(e, s)}
                title={s.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 15, padding: '2px 4px', lineHeight: 1,
                  color: s.isFavorite ? '#f59e0b' : '#333',
                  flexShrink: 0,
                }}
              >
                {s.isFavorite ? '★' : '☆'}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{
        width: sidebarOpen ? 200 : 0,
        minWidth: sidebarOpen ? 200 : 0,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        borderRight: sidebarOpen ? '1px solid #2a2a2a' : 'none',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}>
        <div
          onClick={() => setSelected(null)}
          style={{ padding: '14px 16px', fontSize: 15, fontWeight: 700, color: '#fff', borderBottom: '1px solid #2a2a2a', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        >
          주가 대시보드
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '10px 10px 0' }}>
          <input
            style={{ flex: 1, padding: '7px 10px', background: '#262626', border: '1px solid #333', borderRadius: 6, color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            placeholder="종목 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => { setAddingSymbol((v) => !v); setAddError(null); setNewTicker('') }}
            title="종목 추가"
            style={{ background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: 16, padding: '4px 7px', lineHeight: 1, flexShrink: 0 }}
          >+</button>
        </div>
        {addingSymbol && (
          <form onSubmit={handleAddSymbol} style={{ margin: '6px 10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              autoFocus
              style={{ padding: '5px 8px', background: '#262626', border: '1px solid #444', borderRadius: 4, color: '#ccc', fontSize: 12, outline: 'none' }}
              placeholder="티커 (예: AAPL)"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
            />
            <select
              value={newExchange}
              onChange={(e) => setNewExchange(e.target.value)}
              style={{ padding: '5px 8px', background: '#262626', border: '1px solid #444', borderRadius: 4, color: '#ccc', fontSize: 12, outline: 'none' }}
            >
              <option value="NASDAQ">NASDAQ</option>
              <option value="KRX">KRX</option>
              <option value="CME">CME (선물)</option>
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="submit" style={{ flex: 1, padding: '5px 0', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 4, color: '#90b8f8', fontSize: 12, cursor: 'pointer' }}>추가</button>
              <button type="button" onClick={() => setAddingSymbol(false)} style={{ flex: 1, padding: '5px 0', background: 'none', border: '1px solid #333', borderRadius: 4, color: '#666', fontSize: 12, cursor: 'pointer' }}>취소</button>
            </div>
            {addError && <div style={{ fontSize: 11, color: '#ef5350' }}>{addError}</div>}
          </form>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, color: '#555', fontSize: 13 }}>불러오는 중...</div>}
          {error && <div style={{ padding: 16, color: '#ef5350', fontSize: 13 }}>{error}</div>}
          {renderSectorGroup()}
          {renderGroup('★ 즐겨찾기', favorites, '#f59e0b')}
          {favorites.length > 0 && <div style={{ height: 1, background: '#222', margin: '4px 0' }} />}
          {renderGroup('FUTURES', futures, '#a78bfa')}
          {renderGroup('NASDAQ', nasdaq)}
          {renderGroup('KRX', krx)}
        </div>
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
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', background: '#0f0f0f', position: 'relative' }}>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 100,
            background: '#262626', border: '1px solid #333', borderRadius: 4,
            color: '#888', cursor: 'pointer', fontSize: 12, padding: '3px 7px',
            lineHeight: 1,
          }}
          title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
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
      </main>
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
            if (selected?.type === 'sector' && selected.data.id === saved.id) {
              setSelected({ type: 'sector', data: { ...saved, memo: selected.data.memo } })
            }
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
    </div>
  )
}
