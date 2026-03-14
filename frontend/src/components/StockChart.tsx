import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import type { Candle } from '../types'
import { ALL_INDICATORS } from '../indicators'
import { toTime, detectInterval } from '../indicators/utils'

interface Props {
  candles: Candle[]
  overlays: Set<string>
}

export default function StockChart({ candles, overlays }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

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

    // 캔들스틱
    const priceSeries = chart.addCandlestickSeries({
      upColor: '#ef5350', downColor: '#26a69a',
      borderUpColor: '#ef5350', borderDownColor: '#26a69a',
      wickUpColor: '#ef5350', wickDownColor: '#26a69a',
    })
    priceSeries.setData(candles.map((c) => ({
      time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
    })))

    // 거래량
    const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' })
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    volSeries.setData(candles.map((c) => ({
      time: toTime(c.time),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(239,83,80,0.4)' : 'rgba(38,166,154,0.4)',
    })))

    chart.timeScale().fitContent()

    // 활성화된 지표 적용
    const interval = detectInterval(candles)
    const ctx = { chart, priceSeries, candles, interval, container: el }
    const cleanups: (() => void)[] = []
    for (const indicator of ALL_INDICATORS) {
      if (overlays.has(indicator.key)) {
        const cleanup = indicator.apply(ctx)
        if (cleanup) cleanups.push(cleanup)
      }
    }

    // 리사이즈
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)

    return () => {
      cleanups.forEach((fn) => fn())
      ro.disconnect()
      chart.remove()
    }
  }, [candles, overlays])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
