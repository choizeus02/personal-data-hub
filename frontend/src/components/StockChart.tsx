import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import type { IChartApi } from 'lightweight-charts'

export interface StockChartHandle {
  resetZoom: () => void
}
import type { Candle } from '../types'
import { ALL_INDICATORS } from '../indicators'
import { toTime, detectInterval } from '../indicators/utils'

export type Timezone = 'UTC' | 'Asia/Seoul'

interface Props {
  candles: Candle[]
  overlays: Set<string>
  timezone: Timezone
  exchange: string
  isIntraday: boolean
}

// ── 시간대 포매터 ────────────────────────────────────────────────
function makeTimeFormatter(tz: Timezone, isIntraday: boolean) {
  const zone = tz === 'Asia/Seoul' ? 'Asia/Seoul' : 'UTC'
  return (unixSec: number) => {
    const d = new Date(unixSec * 1000)
    if (isIntraday) {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: zone, month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d)
    }
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: zone, year: '2-digit', month: '2-digit', day: '2-digit',
    }).format(d)
  }
}

// ── 장 운영 시간 여부 ─────────────────────────────────────────────
const MARKET_CFG: Record<string, { tz: string; open: number; close: number }> = {
  KRX:    { tz: 'Asia/Seoul',       open: 9 * 60,      close: 15 * 60 + 30 },
  NASDAQ: { tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
}

function isInMarket(timeStr: string, exchange: string): boolean {
  const cfg = MARKET_CFG[exchange] ?? MARKET_CFG.NASDAQ
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).format(new Date(timeStr.replace(' ', 'T')))
  const [h, m] = local.split(':').map(Number)
  const mins = h * 60 + (m || 0)
  return mins >= cfg.open && mins < cfg.close
}

// ── 가격 포매터 ──────────────────────────────────────────────────
function fmtPrice(v: number, exchange: string) {
  return exchange === 'KRX' ? Math.round(v).toLocaleString() : v.toFixed(2)
}
function fmtVol(v: number) {
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`
}

const StockChart = forwardRef<StockChartHandle, Props>(function StockChart(
  { candles, overlays, timezone, exchange, isIntraday }, ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  useImperativeHandle(ref, () => ({
    resetZoom: () => chartRef.current?.timeScale().fitContent(),
  }))
  const drawMktRef   = useRef<(() => void) | null>(null)
  const tzRef        = useRef(timezone)

  // timezone ref 최신 상태 유지 (클로저 stale 방지)
  useEffect(() => { tzRef.current = timezone }, [timezone])

  // ── Effect 2: timezone 변경 시 차트 재생성 없이 업데이트 ─────────
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.applyOptions({
      localization: { timeFormatter: makeTimeFormatter(timezone, isIntraday) },
    })
    drawMktRef.current?.()
  }, [timezone, isIntraday])

  // ── Effect 1: 차트 생성 ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return
    const el = containerRef.current

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { type: ColorType.Solid, color: '#151515' }, textColor: '#ccc' },
      grid: { vertLines: { color: '#1e1e1e' }, horzLines: { color: '#1e1e1e' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2a2a' },
      timeScale: { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false },
      localization: { timeFormatter: makeTimeFormatter(timezone, isIntraday) },
    })
    chartRef.current = chart

    // 캔들스틱 + 거래량
    const priceSeries = chart.addCandlestickSeries({
      upColor: '#ef5350', downColor: '#26a69a',
      borderUpColor: '#ef5350', borderDownColor: '#26a69a',
      wickUpColor: '#ef5350', wickDownColor: '#26a69a',
    })
    const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' })
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    priceSeries.setData(candles.map((c) => ({
      time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
    })))
    volSeries.setData(candles.map((c) => ({
      time: toTime(c.time), value: c.volume,
      color: c.close >= c.open ? 'rgba(239,83,80,0.4)' : 'rgba(38,166,154,0.4)',
    })))
    chart.timeScale().fitContent()

    // ── 지표 적용 ─────────────────────────────────────────────────
    const interval = detectInterval(candles)
    const indicatorCtx = { chart, priceSeries, candles, interval, container: el }
    const indicatorCleanups: (() => void)[] = []
    for (const ind of ALL_INDICATORS) {
      if (overlays.has(ind.key)) {
        const cleanup = ind.apply(indicatorCtx)
        if (cleanup) indicatorCleanups.push(cleanup)
      }
    }

    // ── 툴팁 (crosshair hover) ────────────────────────────────────
    const tooltip = document.createElement('div')
    Object.assign(tooltip.style, {
      position: 'absolute', zIndex: '10', display: 'none', pointerEvents: 'none',
      background: 'rgba(15,15,15,0.93)', border: '1px solid #2a2a2a',
      borderRadius: '6px', padding: '8px 12px', fontSize: '12px',
      color: '#ccc', lineHeight: '1.75', minWidth: '148px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
    })
    el.appendChild(tooltip)

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || param.seriesData.size === 0) {
        tooltip.style.display = 'none'
        return
      }
      const ohlc = param.seriesData.get(priceSeries) as
        { open: number; high: number; low: number; close: number } | undefined
      const vol = param.seriesData.get(volSeries) as { value: number } | undefined
      if (!ohlc) { tooltip.style.display = 'none'; return }

      const zone = tzRef.current === 'Asia/Seoul' ? 'Asia/Seoul' : 'UTC'
      const timeLabel = new Intl.DateTimeFormat('ko-KR', {
        timeZone: zone, month: '2-digit', day: '2-digit',
        ...(isIntraday ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
      }).format(new Date((param.time as number) * 1000))

      const chg = ohlc.close - ohlc.open
      const cc = chg >= 0 ? '#ef5350' : '#26a69a'
      const fp = (v: number) => fmtPrice(v, exchange)

      tooltip.innerHTML = `
        <div style="color:#555;font-size:10px;margin-bottom:3px">${timeLabel}</div>
        <div>O <b style="color:${cc}">${fp(ohlc.open)}</b></div>
        <div>H <b style="color:#ef5350">${fp(ohlc.high)}</b></div>
        <div>L <b style="color:#26a69a">${fp(ohlc.low)}</b></div>
        <div>C <b style="color:${cc}">${fp(ohlc.close)}</b>
          <span style="color:${cc};font-size:10px"> ${chg >= 0 ? '+' : ''}${fp(chg)}</span></div>
        ${vol ? `<div style="color:#444;font-size:10px;margin-top:1px">V ${fmtVol(vol.value)}</div>` : ''}
      `

      const tw = 160, th = 115
      const px = param.point.x, py = param.point.y
      tooltip.style.display = 'block'
      tooltip.style.left = `${px + 16 + tw > el.clientWidth ? px - tw - 16 : px + 16}px`
      tooltip.style.top  = `${Math.max(0, Math.min(py - th / 2, el.clientHeight - th))}px`
    })

    // ── Shift+드래그 범위 확대 ────────────────────────────────────
    const selCanvas = document.createElement('canvas')
    Object.assign(selCanvas.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '5',
    })
    el.appendChild(selCanvas)

    const zoomOverlay = document.createElement('div')
    Object.assign(zoomOverlay.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '6', cursor: 'crosshair',
    })
    el.appendChild(zoomOverlay)

    let selStart: number | null = null

    function clearSel() {
      selStart = null
      const c = selCanvas.getContext('2d')
      if (c) c.clearRect(0, 0, selCanvas.width, selCanvas.height)
    }

    function drawSel(x1: number, x2: number) {
      selCanvas.width  = el.clientWidth
      selCanvas.height = el.clientHeight
      const c = selCanvas.getContext('2d')!
      c.clearRect(0, 0, selCanvas.width, selCanvas.height)
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
      c.fillStyle   = 'rgba(37,99,235,0.10)'
      c.fillRect(lo, 0, hi - lo, selCanvas.height)
      c.strokeStyle = 'rgba(37,99,235,0.55)'
      c.lineWidth   = 1
      c.strokeRect(lo, 0, hi - lo, selCanvas.height)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) zoomOverlay.style.pointerEvents = 'auto'
    }
    const onKeyUp = () => {
      zoomOverlay.style.pointerEvents = 'none'
      clearSel()
    }

    zoomOverlay.addEventListener('mousedown', (e) => {
      selStart = e.clientX - el.getBoundingClientRect().left
    })
    zoomOverlay.addEventListener('mousemove', (e) => {
      if (selStart === null) return
      drawSel(selStart, e.clientX - el.getBoundingClientRect().left)
    })
    zoomOverlay.addEventListener('mouseup', (e) => {
      if (selStart === null) return
      const selEnd = e.clientX - el.getBoundingClientRect().left
      if (Math.abs(selEnd - selStart) > 10) {
        const lo = Math.min(selStart, selEnd), hi = Math.max(selStart, selEnd)
        const from = chart.timeScale().coordinateToTime(lo)
        const to   = chart.timeScale().coordinateToTime(hi)
        if (from !== null && to !== null) chart.timeScale().setVisibleRange({ from, to })
      }
      clearSel()
      zoomOverlay.style.pointerEvents = 'none'
    })
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    // ── 장 마감 시간대 어둡게 처리 ────────────────────────────────
    const mktCanvas = document.createElement('canvas')
    Object.assign(mktCanvas.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '2',
    })
    el.appendChild(mktCanvas)

    function drawMarketOverlay() {
      if (!isIntraday) return
      const c = mktCanvas.getContext('2d')
      if (!c) return
      mktCanvas.width  = el.clientWidth
      mktCanvas.height = el.clientHeight
      c.clearRect(0, 0, mktCanvas.width, mktCanvas.height)

      // 봉 너비 계산 (인접 두 봉의 x 좌표 차이)
      let candleW = 6
      if (candles.length >= 2) {
        const x0 = chart.timeScale().timeToCoordinate(toTime(candles[0].time))
        const x1 = chart.timeScale().timeToCoordinate(toTime(candles[1].time))
        if (x0 !== null && x1 !== null) candleW = Math.max(1, Math.abs((x1 as number) - (x0 as number)))
      }

      c.fillStyle = 'rgba(0,0,0,0.38)'
      for (const cv of candles) {
        if (isInMarket(cv.time, exchange)) continue
        const x = chart.timeScale().timeToCoordinate(toTime(cv.time))
        if (x === null) continue
        c.fillRect((x as number) - candleW / 2, 0, candleW + 1, mktCanvas.height)
      }
    }

    drawMktRef.current = drawMarketOverlay
    if (isIntraday) {
      setTimeout(drawMarketOverlay, 80)
      chart.timeScale().subscribeVisibleTimeRangeChange(() => requestAnimationFrame(drawMarketOverlay))
    }

    // ── 리사이즈 ──────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!chartRef.current) return
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
      if (isIntraday) requestAnimationFrame(drawMarketOverlay)
    })
    ro.observe(el)

    return () => {
      indicatorCleanups.forEach((fn) => fn())
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      drawMktRef.current = null
    }
  }, [candles, overlays, exchange, isIntraday]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 더블클릭 전체보기 ─────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDbl = () => chartRef.current?.timeScale().fitContent()
    el.addEventListener('dblclick', onDbl)
    return () => el.removeEventListener('dblclick', onDbl)
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

export default StockChart
