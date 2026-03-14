import { useState, useEffect, useMemo } from 'react'
import { fetchDaily, fetchMinute } from '../api'
import type { Symbol, Candle } from '../types'
import StockChart from '../components/StockChart'
import { ALL_INDICATORS } from '../indicators'

type ChartType = 'daily' | 'minute'
type DailyPeriod = '1M' | '3M' | '1Y' | 'ALL'
type MinutePeriod = '1D' | '3D' | '1W'

interface Props {
  symbol: Symbol
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function ChartPage({ symbol }: Props) {
  const [chartType, setChartType]       = useState<ChartType>('daily')
  const [dailyPeriod, setDailyPeriod]   = useState<DailyPeriod>('1Y')
  const [minutePeriod, setMinutePeriod] = useState<MinutePeriod>('3D')
  const [overlays, setOverlays]         = useState<Set<string>>(new Set())
  const [allCandles, setAllCandles]     = useState<Candle[]>([])
  const [minuteLabel, setMinuteLabel]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Fetch data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setAllCandles([])

    const today = new Date()
    const periodDays: Record<MinutePeriod, number> = { '1D': 1, '3D': 3, '1W': 7 }

    const run = async () => {
      try {
        if (chartType === 'daily') {
          const data = await fetchDaily(symbol.symbol, symbol.exchange)
          if (!cancelled) setAllCandles(data)
        } else {
          const end = formatDate(today)
          const start = formatDate(new Date(today.getTime() - (periodDays[minutePeriod] - 1) * 86400000))
          const data = await fetchMinute(symbol.symbol, symbol.exchange, start, end)
          if (!cancelled) {
            setAllCandles(data.candles)
            setMinuteLabel(data.label)
          }
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '데이터 로드 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [symbol.symbol, symbol.exchange, chartType, minutePeriod])

  // Client-side filter for daily period
  const candles = useMemo(() => {
    if (chartType !== 'daily' || dailyPeriod === 'ALL') return allCandles
    const days: Record<DailyPeriod, number> = { '1M': 30, '3M': 90, '1Y': 365, 'ALL': 0 }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days[dailyPeriod])
    const cutoffStr = formatDate(cutoff)
    return allCandles.filter((c) => c.time >= cutoffStr)
  }, [allCandles, chartType, dailyPeriod])

  function toggleOverlay(key: string) {
    setOverlays((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const label = chartType === 'daily' ? '일봉' : minuteLabel

  // Styles
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

  const overlayBtn = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    borderRadius: 4,
    border: `1px solid ${active ? '#2563eb' : '#333'}`,
    cursor: 'pointer',
    fontSize: 11,
    background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
    color: active ? '#60a5fa' : '#666',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{symbol.symbol}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{symbol.name}</span>
        <span style={{ fontSize: 11, color: '#444', marginLeft: 4 }}>{symbol.exchange}</span>
        {label && <span style={{ fontSize: 12, color: '#2563eb', marginLeft: 'auto' }}>{label}</span>}
        {!loading && candles.length > 0 && (
          <span style={{ fontSize: 11, color: '#444' }}>{candles.length.toLocaleString()}봉</span>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Chart type */}
        <button style={activeBtn(chartType === 'daily')} onClick={() => setChartType('daily')}>일봉</button>
        <button style={activeBtn(chartType === 'minute')} onClick={() => setChartType('minute')}>분봉</button>

        <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />

        {/* Period */}
        {chartType === 'daily' ? (
          (['1M', '3M', '1Y', 'ALL'] as DailyPeriod[]).map((p) => (
            <button key={p} style={activeBtn(dailyPeriod === p)} onClick={() => setDailyPeriod(p)}>{p}</button>
          ))
        ) : (
          (['1D', '3D', '1W'] as MinutePeriod[]).map((p) => (
            <button key={p} style={activeBtn(minutePeriod === p)} onClick={() => setMinutePeriod(p)}>{p}</button>
          ))
        )}

        <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />

        {/* Overlays — ALL_INDICATORS에서 자동으로 버튼 생성 */}
        {ALL_INDICATORS.map(({ key, label: olabel }) => (
          <button key={key} style={overlayBtn(overlays.has(key))} onClick={() => toggleOverlay(key)}>
            {olabel}
          </button>
        ))}
      </div>

      {/* Chart area */}
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
          <StockChart candles={candles} overlays={overlays} />
        )}
      </div>
    </div>
  )
}
