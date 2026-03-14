import { calcSMA } from './utils'
import type { IndicatorDef } from './types'

function makeMa(period: number, color: string): IndicatorDef {
  return {
    key: `MA${period}`,
    label: `MA${period}`,
    apply: ({ chart, candles }) => {
      if (candles.length < period) return
      const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(calcSMA(candles, period))
    },
  }
}

export const ma5   = makeMa(5,   '#ff9800')
export const ma20  = makeMa(20,  '#2196f3')
export const ma60  = makeMa(60,  '#9c27b0')
export const ma120 = makeMa(120, '#f44336')
