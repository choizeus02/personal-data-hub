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

const EMPTY_OVERLAYS = new Set<string>()

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

  const periodChange = candles.length >= 2
    ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close * 100).toFixed(2)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{sector.name}</span>
        <span style={{ fontSize: 11, color: '#555' }}>{sector.stocks.length}개 종목</span>
        {periodChange !== null && (
          <span style={{ fontSize: 13, color: Number(periodChange) >= 0 ? '#26a69a' : '#ef5350', marginLeft: 4 }}>
            {Number(periodChange) >= 0 ? '+' : ''}{periodChange}%
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
            overlays={EMPTY_OVERLAYS}
            timezone={timezone}
            exchange="SECTOR"
            isIntraday={false}
          />
        )}
      </div>
    </div>
  )
}
