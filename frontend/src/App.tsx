import { useState, useEffect } from 'react'
import { fetchSymbols } from './api'
import type { Symbol } from './types'
import ChartPage from './pages/ChartPage'

export default function App() {
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Symbol | null>(null)

  useEffect(() => {
    fetchSymbols()
      .then((data) => {
        setSymbols(data)
        if (data.length > 0) setSelected(data[0])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const q = search.toLowerCase()
  const filtered = symbols.filter(
    (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  )
  const krx = filtered.filter((s) => s.exchange === 'KRX')
  const nasdaq = filtered.filter((s) => s.exchange === 'NASDAQ')

  function renderGroup(label: string, items: Symbol[]) {
    if (!items.length) return null
    return (
      <div key={label}>
        <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: '#555', letterSpacing: '0.8px' }}>
          {label}
        </div>
        {items.map((s) => {
          const isSelected = selected?.symbol === s.symbol && selected?.exchange === s.exchange
          return (
            <div
              key={`${s.exchange}-${s.symbol}`}
              onClick={() => setSelected(s)}
              style={{
                padding: '7px 14px',
                cursor: 'pointer',
                background: isSelected ? '#1e3a5f' : 'transparent',
                borderLeft: isSelected ? '2px solid #2563eb' : '2px solid transparent',
              }}
            >
              <div style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>{s.symbol}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{s.name}</div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 240, minWidth: 240, background: '#1a1a1a', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a2a' }}>
        <div style={{ padding: '14px 16px', fontSize: 15, fontWeight: 700, color: '#fff', borderBottom: '1px solid #2a2a2a' }}>
          주가 대시보드
        </div>
        <input
          style={{ margin: 10, padding: '7px 10px', background: '#262626', border: '1px solid #333', borderRadius: 6, color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          placeholder="종목 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, color: '#555', fontSize: 13 }}>불러오는 중...</div>}
          {error && <div style={{ padding: 16, color: '#ef5350', fontSize: 13 }}>{error}</div>}
          {renderGroup('KRX', krx)}
          {renderGroup('NASDAQ', nasdaq)}
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', background: '#0f0f0f' }}>
        {selected ? (
          <ChartPage symbol={selected} />
        ) : (
          <div style={{ padding: 40, color: '#444', fontSize: 15 }}>좌측에서 종목을 선택하세요.</div>
        )}
      </main>
    </div>
  )
}
