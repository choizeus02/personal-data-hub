import { calcSMA } from './utils'
import type { IndicatorDef } from './types'

const GRID_MAS = [
  { period: 5,   color: '#ff9800' },
  { period: 10,  color: '#ffeb3b' },
  { period: 20,  color: '#2196f3' },
  { period: 60,  color: '#9c27b0' },
  { period: 120, color: '#f44336' },
]

export const grid: IndicatorDef = {
  key: 'GRID',
  label: '그물차트',
  apply: ({ chart, candles }) => {
    for (const { period, color } of GRID_MAS) {
      if (candles.length < period) continue
      const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(calcSMA(candles, period))
    }
  },
}
