import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type HistogramSeriesOptions,
} from 'lightweight-charts'
import type { Candle } from '../types'

interface Props {
  candles: Candle[]
  height?: number
}

export default function StockChart({ candles, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#ccc',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderUpColor: '#ef5350',
      borderDownColor: '#26a69a',
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    } as Partial<CandlestickSeriesOptions>)

    candleSeriesRef.current = candleSeries

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    } as Partial<HistogramSeriesOptions>)

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    volumeSeriesRef.current = volumeSeries

    const candleData = candles.map((c) => ({
      time: c.time as import('lightweight-charts').Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const volumeData = candles.map((c) => ({
      time: c.time as import('lightweight-charts').Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(239,83,80,0.5)' : 'rgba(38,166,154,0.5)',
    }))

    candleSeries.setData(candleData)
    volumeSeries.setData(volumeData)

    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !chartRef.current) return
      const { width } = entries[0].contentRect
      chartRef.current.applyOptions({ width })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [candles, height])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: `${height}px`, borderRadius: '8px', overflow: 'hidden' }}
    />
  )
}
