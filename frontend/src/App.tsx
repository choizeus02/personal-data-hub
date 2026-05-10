import { useState, useEffect } from 'react'
import { fetchSymbols, fetchSectors, toggleFavorite } from './api'
import type { Symbol, Sector, Selected } from './types'
import ChartPage from './pages/ChartPage'
import SectorPage from './pages/SectorPage'
import SectorEditor from './components/SectorEditor'

export default function App() {
  const [symbols, setSymbols]   = useState<Symbol[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [selected, setSelected]           = useState<Selected | null>(null)
  const [sectors, setSectors]             = useState<Sector[]>([])
  const [editingSector, setEditingSector] = useState<Sector | 'new' | null>(null)

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
      <aside style={{ width: 200, minWidth: 200, background: '#1a1a1a', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a2a' }}>
        <div style={{ padding: '14px 16px', fontSize: 15, fontWeight: 700, color: '#fff', borderBottom: '1px solid #2a2a2a' }}>
          주가 대시보드
        </div>
        <input
          style={{ margin: 10, padding: '7px 10px', background: '#262626', border: '1px solid #333', borderRadius: 6, color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box', width: 'calc(100% - 20px)' }}
          placeholder="종목 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', background: '#0f0f0f' }}>
        {selected?.type === 'sector' ? (
          <SectorPage sector={selected.data} />
        ) : selected?.type === 'symbol' ? (
          <ChartPage symbol={selected.data} />
        ) : (
          <div style={{ padding: 40, color: '#444', fontSize: 15 }}>좌측에서 종목을 선택하세요.</div>
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
