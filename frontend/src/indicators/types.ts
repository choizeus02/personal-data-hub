import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Candle } from '../types'

export interface IndicatorContext {
  chart: IChartApi
  priceSeries: ISeriesApi<'Candlestick'>
  candles: Candle[]
  interval: number    // 봉 간격 (초)
  container: HTMLElement
}

export interface IndicatorDef {
  key: string
  label: string
  apply: (ctx: IndicatorContext) => (() => void) | void
}
