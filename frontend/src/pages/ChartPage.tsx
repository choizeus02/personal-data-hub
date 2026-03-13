import { useState, useEffect } from 'react'
import { fetchDaily, fetchMinute } from '../api'
import type { Symbol, Candle } from '../types'
import StockChart from '../components/StockChart'

interface Props {
  symbol: Symbol
  chartType: 'daily' | 'minute'
  startDate: string
  endDate: string
}

export default function ChartPage({ symbol, chartType, startDate, endDate }: Props) {
  const [candles, setCandles] = useState<Candle[]>([])
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles([])

    const run = async () => {
      try {
        if (chartType === 'daily') {
          const data = await fetchDaily(symbol.symbol, symbol.exchange)
          if (!cancelled) {
            setCandles(data)
            setLabel('일봉')
          }
        } else {
          const data = await fetchMinute(symbol.symbol, symbol.exchange, startDate, endDate)
          if (!cancelled) {
            setCandles(data.candles)
            setLabel(data.label)
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '데이터 로드 실패')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [symbol.symbol, symbol.exchange, chartType, startDate, endDate])

  const headerStyle: React.CSSProperties = {
    padding: '20px 24px 12px',
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  }

  const bodyStyle: React.CSSProperties = {
    padding: '16px 24px',
  }

  return (
    <div>
      <div style={headerStyle}>
        <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>
          {symbol.symbol}
        </span>
        <span style={{ fontSize: '14px', color: '#888' }}>{symbol.name}</span>
        <span style={{ fontSize: '13px', color: '#555', marginLeft: 'auto' }}>
          {symbol.exchange}
        </span>
        {label && (
          <span style={{ fontSize: '13px', color: '#2563eb', marginLeft: '8px' }}>
            {label}
          </span>
        )}
        {!loading && candles.length > 0 && (
          <span style={{ fontSize: '12px', color: '#444' }}>
            {candles.length}개 봉
          </span>
        )}
      </div>

      <div style={bodyStyle}>
        {loading && (
          <div style={{ color: '#555', fontSize: '14px', padding: '40px 0' }}>
            로딩 중...
          </div>
        )}
        {error && (
          <div style={{ color: '#ef5350', fontSize: '14px', padding: '40px 0' }}>
            오류: {error}
          </div>
        )}
        {!loading && !error && candles.length === 0 && (
          <div style={{ color: '#444', fontSize: '14px', padding: '40px 0' }}>
            데이터가 없습니다.
          </div>
        )}
        {!loading && !error && candles.length > 0 && (
          <StockChart candles={candles} height={560} />
        )}
      </div>
    </div>
  )
}
