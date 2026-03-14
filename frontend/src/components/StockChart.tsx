import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import type { Candle } from '../types'

export type Overlay = 'MA5' | 'MA20' | 'MA60' | 'MA120' | 'BB' | 'GRID' | 'ICHIMOKU' | 'VPROFILE'

interface Props {
  candles: Candle[]
  overlays: Set<Overlay>
}

type Time = import('lightweight-charts').Time

// ISO or date string → Unix timestamp (seconds)
function toTime(t: string): Time {
  return Math.floor(new Date(t.replace(' ', 'T')).getTime() / 1000) as unknown as Time
}

// Detect average interval between candles (seconds)
function detectInterval(candles: Candle[]): number {
  if (candles.length < 2) return 86400
  const t1 = new Date(candles[0].time).getTime()
  const t2 = new Date(candles[1].time).getTime()
  return Math.max(60, Math.round((t2 - t1) / 1000))
}

// Simple Moving Average
function calcSMA(candles: Candle[], period: number): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const sum = candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0)
    out.push({ time: toTime(candles[i].time), value: sum / period })
  }
  return out
}

// Bollinger Bands (period=20, mult=2)
function calcBB(candles: Candle[]) {
  const upper: { time: Time; value: number }[] = []
  const middle: { time: Time; value: number }[] = []
  const lower: { time: Time; value: number }[] = []
  for (let i = 19; i < candles.length; i++) {
    const sl = candles.slice(i - 19, i + 1)
    const avg = sl.reduce((s, c) => s + c.close, 0) / 20
    const std = Math.sqrt(sl.reduce((s, c) => s + (c.close - avg) ** 2, 0) / 20)
    const t = toTime(candles[i].time)
    middle.push({ time: t, value: avg })
    upper.push({ time: t, value: avg + 2 * std })
    lower.push({ time: t, value: avg - 2 * std })
  }
  return { upper, middle, lower }
}

// Ichimoku Kinko Hyo
function calcIchimoku(candles: Candle[], interval: number) {
  function hlAvg(lo: number, hi: number) {
    const sl = candles.slice(lo, hi)
    return (Math.max(...sl.map((c) => c.high)) + Math.min(...sl.map((c) => c.low))) / 2
  }

  const tenkan: { time: Time; value: number }[] = []
  const kijun: { time: Time; value: number }[] = []
  const spanA: { time: Time; value: number }[] = []
  const spanB: { time: Time; value: number }[] = []
  const chikou: { time: Time; value: number }[] = []

  const shift = 26 * interval

  for (let i = 8; i < candles.length; i++) {
    tenkan.push({ time: toTime(candles[i].time), value: hlAvg(i - 8, i + 1) })
  }
  for (let i = 25; i < candles.length; i++) {
    kijun.push({ time: toTime(candles[i].time), value: hlAvg(i - 25, i + 1) })
  }
  // Span A & B projected 26 periods forward
  for (let i = 25; i < candles.length; i++) {
    const baseTs = Math.floor(new Date(candles[i].time).getTime() / 1000)
    const t = (baseTs + shift) as unknown as Time
    const tv = hlAvg(i - 8, i + 1)
    const kv = hlAvg(i - 25, i + 1)
    spanA.push({ time: t, value: (tv + kv) / 2 })
  }
  for (let i = 51; i < candles.length; i++) {
    const baseTs = Math.floor(new Date(candles[i].time).getTime() / 1000)
    const t = (baseTs + shift) as unknown as Time
    spanB.push({ time: t, value: hlAvg(i - 51, i + 1) })
  }
  // Chikou: today's close plotted 26 periods back
  for (let i = 26; i < candles.length; i++) {
    chikou.push({ time: toTime(candles[i - 26].time), value: candles[i].close })
  }

  return { tenkan, kijun, spanA, spanB, chikou }
}

export default function StockChart({ candles, overlays }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const priceSerRef  = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return
    const el = containerRef.current

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#151515' },
        textColor: '#ccc',
      },
      grid: { vertLines: { color: '#1e1e1e' }, horzLines: { color: '#1e1e1e' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2a2a' },
      timeScale: { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart

    // Candlestick
    const cSeries = chart.addCandlestickSeries({
      upColor: '#ef5350', downColor: '#26a69a',
      borderUpColor: '#ef5350', borderDownColor: '#26a69a',
      wickUpColor: '#ef5350', wickDownColor: '#26a69a',
    })
    priceSerRef.current = cSeries

    // Volume (overlaid)
    const vSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    vSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    cSeries.setData(candles.map((c) => ({ time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close })))
    vSeries.setData(candles.map((c) => ({
      time: toTime(c.time),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(239,83,80,0.4)' : 'rgba(38,166,154,0.4)',
    })))

    // ── Overlays ──────────────────────────────────────────────

    const interval = detectInterval(candles)

    // MA (individual or grid)
    const maConfigs = [
      { key: 'MA5'  as Overlay, period: 5,   color: '#ff9800' },
      { key: 'MA20' as Overlay, period: 20,  color: '#2196f3' },
      { key: 'MA60' as Overlay, period: 60,  color: '#9c27b0' },
      { key: 'MA120'as Overlay, period: 120, color: '#f44336' },
    ]

    if (overlays.has('GRID')) {
      const gridCfg = [
        { period: 5,   color: '#ff9800' },
        { period: 10,  color: '#ffeb3b' },
        { period: 20,  color: '#2196f3' },
        { period: 60,  color: '#9c27b0' },
        { period: 120, color: '#f44336' },
      ]
      for (const { period, color } of gridCfg) {
        if (candles.length >= period) {
          const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          s.setData(calcSMA(candles, period))
        }
      }
    } else {
      for (const { key, period, color } of maConfigs) {
        if (overlays.has(key) && candles.length >= period) {
          const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          s.setData(calcSMA(candles, period))
        }
      }
    }

    // Bollinger Bands
    if (overlays.has('BB') && candles.length >= 20) {
      const { upper, middle, lower } = calcBB(candles)
      const opt = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const
      chart.addLineSeries({ ...opt, color: '#546e7a', lineStyle: LineStyle.Dashed }).setData(middle)
      chart.addLineSeries({ ...opt, color: '#42a5f5' }).setData(upper)
      chart.addLineSeries({ ...opt, color: '#42a5f5' }).setData(lower)
    }

    // Ichimoku
    if (overlays.has('ICHIMOKU') && candles.length >= 52) {
      const { tenkan, kijun, spanA, spanB, chikou } = calcIchimoku(candles, interval)
      const opt = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const
      chart.addLineSeries({ ...opt, color: '#ff4757' }).setData(tenkan)           // 전환선
      chart.addLineSeries({ ...opt, color: '#1e90ff' }).setData(kijun)            // 기준선
      chart.addLineSeries({ ...opt, color: '#2ed573', lineStyle: LineStyle.Dashed }).setData(spanA) // 선행스팬A
      chart.addLineSeries({ ...opt, color: '#ff6b81', lineStyle: LineStyle.Dashed }).setData(spanB) // 선행스팬B
      chart.addLineSeries({ ...opt, color: '#a29bfe' }).setData(chikou)           // 후행스팬
    }

    chart.timeScale().fitContent()

    // ── 매물대 (Volume Profile) — overlay canvas ──────────────
    const drawVolumeProfile = () => {
      const canvas = canvasRef.current
      const priceSer = priceSerRef.current
      if (!canvas || !priceSer || !overlays.has('VPROFILE')) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width  = el.clientWidth
      canvas.height = el.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const n = 50
      const lows  = candles.map((c) => c.low)
      const highs = candles.map((c) => c.high)
      const minP  = Math.min(...lows)
      const maxP  = Math.max(...highs)
      const size  = (maxP - minP) / n

      const buckets = new Array<number>(n).fill(0)
      for (const c of candles) {
        const idx = Math.min(Math.floor((c.close - minP) / size), n - 1)
        buckets[idx] += c.volume
      }

      const maxVol  = Math.max(...buckets)
      const maxBarW = canvas.width * 0.15

      for (let i = 0; i < n; i++) {
        const priceCenter = minP + (i + 0.5) * size
        const y = priceSer.priceToCoordinate(priceCenter)
        if (y === null) continue
        const barW = (buckets[i] / maxVol) * maxBarW
        const barH = Math.max(1, canvas.height / n - 1)
        ctx.fillStyle = buckets[i] > maxVol * 0.7 ? 'rgba(255,82,82,0.45)' : 'rgba(100,150,255,0.35)'
        ctx.fillRect(0, (y as number) - barH / 2, barW, barH)
      }
    }

    if (overlays.has('VPROFILE')) {
      setTimeout(drawVolumeProfile, 80)
      chart.timeScale().subscribeVisibleTimeRangeChange(() => requestAnimationFrame(drawVolumeProfile))
    }

    // Resize
    const ro = new ResizeObserver(() => {
      if (!chartRef.current) return
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
      if (overlays.has('VPROFILE')) requestAnimationFrame(drawVolumeProfile)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      priceSerRef.current = null
    }
  }, [candles, overlays])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
      />
    </div>
  )
}
