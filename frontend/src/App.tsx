import { useState, useEffect } from 'react'
import { fetchSymbols } from './api'
import type { Symbol } from './types'
import ChartPage from './pages/ChartPage'

type ChartType = 'daily' | 'minute'

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function App() {
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Symbol | null>(null)
  const [chartType, setChartType] = useState<ChartType>('daily')

  const today = new Date()
  const defaultEnd = formatDate(today)
  const defaultStart = formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000))

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  useEffect(() => {
    fetchSymbols()
      .then((data) => {
        setSymbols(data)
        if (data.length > 0) setSelected(data[0])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = symbols.filter((s) => {
    const q = search.toLowerCase()
    return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  })

  const krxSymbols = filtered.filter((s) => s.exchange === 'KRX')
  const nasdaqSymbols = filtered.filter((s) => s.exchange === 'NASDAQ')

  const sidebarStyle: React.CSSProperties = {
    width: '260px',
    minWidth: '260px',
    height: '100vh',
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #2a2a2a',
    overflow: 'hidden',
  }

  const mainStyle: React.CSSProperties = {
    flex: 1,
    height: '100vh',
    overflow: 'auto',
    background: '#0f0f0f',
  }

  const titleStyle: React.CSSProperties = {
    padding: '16px',
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    borderBottom: '1px solid #2a2a2a',
    letterSpacing: '-0.3px',
  }

  const searchStyle: React.CSSProperties = {
    margin: '12px',
    padding: '8px 10px',
    background: '#262626',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#ccc',
    fontSize: '13px',
    outline: 'none',
    width: 'calc(100% - 24px)',
  }

  const symbolListStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: '8px',
  }

  const groupLabelStyle: React.CSSProperties = {
    padding: '8px 14px 4px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#555',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  }

  const bottomStyle: React.CSSProperties = {
    borderTop: '1px solid #2a2a2a',
    padding: '12px',
  }

  const toggleRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '6px',
    marginBottom: '10px',
  }

  const dateRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }

  const dateInputStyle: React.CSSProperties = {
    padding: '6px 8px',
    background: '#262626',
    border: '1px solid #333',
    borderRadius: '5px',
    color: '#ccc',
    fontSize: '12px',
    outline: 'none',
    width: '100%',
  }

  const dateLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#555',
    marginBottom: '2px',
  }

  function btnStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      padding: '7px 0',
      borderRadius: '5px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: active ? 600 : 400,
      background: active ? '#2563eb' : '#262626',
      color: active ? '#fff' : '#888',
      transition: 'background 0.15s',
    }
  }

  function itemStyle(isSelected: boolean): React.CSSProperties {
    return {
      padding: '8px 14px',
      cursor: 'pointer',
      background: isSelected ? '#1e3a5f' : 'transparent',
      borderLeft: isSelected ? '2px solid #2563eb' : '2px solid transparent',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
    }
  }

  function renderGroup(label: string, items: Symbol[]) {
    if (items.length === 0) return null
    return (
      <div key={label}>
        <div style={groupLabelStyle}>{label}</div>
        {items.map((s) => (
          <div
            key={`${s.exchange}-${s.symbol}`}
            style={itemStyle(selected?.symbol === s.symbol && selected?.exchange === s.exchange)}
            onClick={() => setSelected(s)}
          >
            <span style={{ fontSize: '13px', color: '#ddd', fontWeight: 500 }}>{s.symbol}</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{s.name}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={sidebarStyle}>
        <div style={titleStyle}>주가 대시보드</div>

        <input
          style={searchStyle}
          placeholder="종목 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={symbolListStyle}>
          {loading && (
            <div style={{ padding: '16px', color: '#555', fontSize: '13px' }}>불러오는 중...</div>
          )}
          {error && (
            <div style={{ padding: '16px', color: '#ef5350', fontSize: '13px' }}>{error}</div>
          )}
          {renderGroup('KRX', krxSymbols)}
          {renderGroup('NASDAQ', nasdaqSymbols)}
        </div>

        <div style={bottomStyle}>
          <div style={toggleRowStyle}>
            <button style={btnStyle(chartType === 'daily')} onClick={() => setChartType('daily')}>
              일봉
            </button>
            <button style={btnStyle(chartType === 'minute')} onClick={() => setChartType('minute')}>
              분봉
            </button>
          </div>

          {chartType === 'minute' && (
            <div style={dateRowStyle}>
              <div>
                <div style={dateLabelStyle}>시작일</div>
                <input
                  type="date"
                  style={dateInputStyle}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <div style={dateLabelStyle}>종료일</div>
                <input
                  type="date"
                  style={dateInputStyle}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </aside>

      <main style={mainStyle}>
        {selected ? (
          <ChartPage
            symbol={selected}
            chartType={chartType}
            startDate={startDate}
            endDate={endDate}
          />
        ) : (
          <div style={{ padding: '40px', color: '#444', fontSize: '15px' }}>
            좌측에서 종목을 선택하세요.
          </div>
        )}
      </main>
    </div>
  )
}
