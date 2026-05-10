import { useState, useEffect, useRef } from 'react'
import { fetchSectorCandles, fetchDaily, fetchWeekly, saveSectorMemo } from '../api'
import type { Sector, SectorStock, Candle } from '../types'
import StockChart, { type Timezone, type StockChartHandle } from '../components/StockChart'

type ChartType   = 'daily' | 'weekly' | 'minute'
type DailyPeriod  = '1M' | '3M' | '1Y' | 'ALL'
type MinutePeriod = '1D' | '3D' | '1W'

interface Props {
  sector: Sector
  onSelectSymbol?: (symbol: string, exchange: string) => void
  onEdit?: () => void
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const DAILY_PERIOD_DAYS: Record<DailyPeriod, number>   = { '1M': 30,  '3M': 90, '1Y': 365, 'ALL': 720 }
const MINUTE_PERIOD_DAYS: Record<MinutePeriod, number> = { '1D': 1, '3D': 3, '1W': 7 }

const EMPTY_OVERLAYS = new Set<string>()

function StockCard({
  stock,
  cardType,
  period,
  timezone,
  onSelect,
}: {
  stock: SectorStock
  cardType: 'daily' | 'weekly'
  period: DailyPeriod
  timezone: Timezone
  onSelect: () => void
}) {
  const [candles, setCandles] = useState<Candle[]>([])

  useEffect(() => {
    let cancelled = false
    const fetcher = cardType === 'weekly' ? fetchWeekly : fetchDaily
    fetcher(stock.symbol, stock.exchange)
      .then((data) => {
        if (!cancelled) {
          if (period === 'ALL') {
            setCandles(data)
          } else {
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - DAILY_PERIOD_DAYS[period])
            const cutoffStr = formatDate(cutoff)
            setCandles(data.filter((c) => c.time >= cutoffStr))
          }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [stock.symbol, stock.exchange, cardType, period])

  const periodChange =
    candles.length >= 2
      ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100
      : null

  return (
    <div
      onClick={onSelect}
      style={{ border: '1px solid #2a2a2a', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#141414' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3a3a5a')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
    >
      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e1e1e' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{stock.symbol}</span>
        {periodChange !== null && (
          <span style={{ fontSize: 12, color: periodChange >= 0 ? '#26a69a' : '#ef5350' }}>
            {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
          </span>
        )}
      </div>
      <div style={{ height: 160 }}>
        {candles.length > 0 && (
          <StockChart
            candles={candles}
            overlays={EMPTY_OVERLAYS}
            timezone={timezone}
            exchange={stock.exchange}
            isIntraday={false}
          />
        )}
      </div>
    </div>
  )
}

export default function SectorPage({ sector, onSelectSymbol, onEdit }: Props) {
  const chartRef = useRef<StockChartHandle>(null)
  const [chartType, setChartType]       = useState<ChartType>('daily')
  const [dailyPeriod, setDailyPeriod]   = useState<DailyPeriod>('1Y')
  const [minutePeriod, setMinutePeriod] = useState<MinutePeriod>('3D')
  const [cardType, setCardType]         = useState<'daily' | 'weekly'>('daily')
  const [cardPeriod, setCardPeriod]     = useState<DailyPeriod>('3M')
  const [timezone, setTimezone]         = useState<Timezone>('Asia/Seoul')
  const [candles, setCandles]           = useState<Candle[]>([])
  const [label, setLabel]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [memoOpen, setMemoOpen]         = useState(false)
  const [memo, setMemo]                 = useState(sector.memo ?? '')
  const [saveStatus, setSaveStatus]     = useState<'saved' | 'saving'>('saved')
  const savedMemoRef                    = useRef(sector.memo ?? '')

  useEffect(() => {
    setMemo(sector.memo ?? '')
    savedMemoRef.current = sector.memo ?? ''
    setSaveStatus('saved')
  }, [sector.id])

  useEffect(() => {
    if (memo === savedMemoRef.current) return
    setSaveStatus('saving')
    const timer = setTimeout(async () => {
      try {
        await saveSectorMemo(sector.id, memo)
        savedMemoRef.current = memo
        setSaveStatus('saved')
      } catch { /* keep saving state */ }
    }, 800)
    return () => clearTimeout(timer)
  }, [memo, sector.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles([])

    const today = new Date()
    const end   = formatDate(today)
    let start: string
    if (chartType === 'minute') {
      const days = MINUTE_PERIOD_DAYS[minutePeriod]
      start = formatDate(new Date(today.getTime() - (days - 1) * 86400000))
    } else {
      const days = DAILY_PERIOD_DAYS[dailyPeriod]
      start = formatDate(new Date(today.getTime() - (days - 1) * 86400000))
    }

    fetchSectorCandles(sector.id, start, end, chartType)
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
  }, [sector.id, chartType, dailyPeriod, minutePeriod])

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
      {/* ── Top: composite chart ─────────────────── */}
      <div style={{ height: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', borderBottom: '2px solid #222' }}>
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
          <div style={{ marginLeft: label ? 0 : 'auto', display: 'flex', gap: 6 }}>
            {onEdit && (
              <button onClick={onEdit} title="섹터 편집" style={{ background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: 12, padding: '3px 8px' }}>
                편집
              </button>
            )}
            <button
              onClick={() => setMemoOpen((v) => !v)}
              title="메모"
              style={{ background: memoOpen ? 'rgba(37,99,235,0.2)' : 'none', border: `1px solid ${memoOpen ? '#2563eb' : '#333'}`, borderRadius: 4, color: memoOpen ? '#60a5fa' : '#888', cursor: 'pointer', fontSize: 12, padding: '3px 8px' }}
            >
              메모{saveStatus === 'saving' ? ' •' : ''}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Chart type */}
          <button style={activeBtn(chartType === 'daily')}  onClick={() => setChartType('daily')}>일봉</button>
          <button style={activeBtn(chartType === 'weekly')} onClick={() => setChartType('weekly')}>주봉</button>
          <button style={activeBtn(chartType === 'minute')} onClick={() => setChartType('minute')}>분봉</button>

          <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />

          {/* Period */}
          {chartType !== 'minute' ? (
            (['1M', '3M', '1Y', 'ALL'] as DailyPeriod[]).map((p) => (
              <button key={p} style={activeBtn(dailyPeriod === p)} onClick={() => setDailyPeriod(p)}>{p}</button>
            ))
          ) : (
            (['1D', '3D', '1W'] as MinutePeriod[]).map((p) => (
              <button key={p} style={activeBtn(minutePeriod === p)} onClick={() => setMinutePeriod(p)}>{p}</button>
            ))
          )}

          <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />

          <button style={activeBtn(timezone === 'Asia/Seoul')} onClick={() => setTimezone('Asia/Seoul')}>KST</button>
          <button style={activeBtn(timezone === 'UTC')}        onClick={() => setTimezone('UTC')}>UTC</button>

          <div style={{ width: 1, height: 16, background: '#333', margin: '0 4px' }} />

          <button style={activeBtn(false)} onClick={() => chartRef.current?.resetZoom()}>전체보기</button>
        </div>

        {/* Composite chart + memo */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
              isIntraday={chartType === 'minute'}
            />
          )}
        </div>
        {memoOpen && (
          <div style={{ width: 220, borderLeft: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', background: '#111' }}>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="투자 메모, 섹터 분석..."
              style={{
                flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                color: '#ccc', fontSize: 12, lineHeight: 1.6, padding: '10px 12px',
                fontFamily: 'system-ui, sans-serif',
              }}
            />
            <div style={{ padding: '4px 12px', fontSize: 10, color: saveStatus === 'saving' ? '#f59e0b' : '#444', borderTop: '1px solid #1e1e1e', textAlign: 'right' }}>
              {saveStatus === 'saving' ? '저장 중...' : '저장됨'}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── Card controls ────────────────────────── */}
      <div style={{ padding: '6px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#111' }}>
        <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>개별</span>
        <button style={activeBtn(cardType === 'daily')}  onClick={() => setCardType('daily')}>일봉</button>
        <button style={activeBtn(cardType === 'weekly')} onClick={() => setCardType('weekly')}>주봉</button>
        <div style={{ width: 1, height: 14, background: '#333', margin: '0 2px' }} />
        {(['1M', '3M', '1Y', 'ALL'] as DailyPeriod[]).map((p) => (
          <button key={p} style={activeBtn(cardPeriod === p)} onClick={() => setCardPeriod(p)}>{p}</button>
        ))}
      </div>

      {/* ── Bottom: individual stock grid ────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#0f0f0f' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {sector.stocks.map((stock) => (
            <StockCard
              key={stock.asset_id}
              stock={stock}
              cardType={cardType}
              period={cardPeriod}
              timezone={timezone}
              onSelect={() => onSelectSymbol?.(stock.symbol, stock.exchange)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
