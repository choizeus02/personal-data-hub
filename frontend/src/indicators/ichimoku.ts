import { LineStyle } from 'lightweight-charts'
import { calcIchimoku } from './utils'
import type { IndicatorDef } from './types'

export const ichimoku: IndicatorDef = {
  key: 'ICHIMOKU',
  label: '일목균형표',
  apply: ({ chart, candles, interval }) => {
    if (candles.length < 52) return
    const { tenkan, kijun, spanA, spanB, chikou } = calcIchimoku(candles, interval)
    const base = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const
    chart.addLineSeries({ ...base, color: '#ff4757' }).setData(tenkan)                       // 전환선
    chart.addLineSeries({ ...base, color: '#1e90ff' }).setData(kijun)                        // 기준선
    chart.addLineSeries({ ...base, color: '#2ed573', lineStyle: LineStyle.Dashed }).setData(spanA) // 선행스팬A
    chart.addLineSeries({ ...base, color: '#ff6b81', lineStyle: LineStyle.Dashed }).setData(spanB) // 선행스팬B
    chart.addLineSeries({ ...base, color: '#a29bfe' }).setData(chikou)                       // 후행스팬
  },
}
