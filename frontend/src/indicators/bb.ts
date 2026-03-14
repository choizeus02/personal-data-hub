import { LineStyle } from 'lightweight-charts'
import { calcBollingerBands } from './utils'
import type { IndicatorDef } from './types'

export const bollingerBands: IndicatorDef = {
  key: 'BB',
  label: '볼린저밴드',
  apply: ({ chart, candles }) => {
    if (candles.length < 20) return
    const { upper, middle, lower } = calcBollingerBands(candles)
    const base = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const
    chart.addLineSeries({ ...base, color: '#546e7a', lineStyle: LineStyle.Dashed }).setData(middle)
    chart.addLineSeries({ ...base, color: '#42a5f5' }).setData(upper)
    chart.addLineSeries({ ...base, color: '#42a5f5' }).setData(lower)
  },
}
