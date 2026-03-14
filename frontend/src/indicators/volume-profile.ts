import type { IndicatorDef } from './types'

const BUCKETS = 50

export const volumeProfile: IndicatorDef = {
  key: 'VPROFILE',
  label: '매물대',
  apply: ({ chart, priceSeries, candles, container }) => {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1'
    container.appendChild(canvas)

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width  = container.clientWidth
      canvas.height = container.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const minP = Math.min(...candles.map((c) => c.low))
      const maxP = Math.max(...candles.map((c) => c.high))
      const size = (maxP - minP) / BUCKETS

      const buckets = new Array<number>(BUCKETS).fill(0)
      for (const c of candles) {
        const idx = Math.min(Math.floor((c.close - minP) / size), BUCKETS - 1)
        buckets[idx] += c.volume
      }

      const maxVol  = Math.max(...buckets)
      const maxBarW = canvas.width * 0.15

      for (let i = 0; i < BUCKETS; i++) {
        if (buckets[i] === 0) continue
        const y = priceSeries.priceToCoordinate(minP + (i + 0.5) * size)
        if (y === null) continue
        const barW = (buckets[i] / maxVol) * maxBarW
        const barH = Math.max(1, canvas.height / BUCKETS - 1)
        ctx.fillStyle = buckets[i] > maxVol * 0.7
          ? 'rgba(255,82,82,0.45)'
          : 'rgba(100,150,255,0.35)'
        ctx.fillRect(0, (y as number) - barH / 2, barW, barH)
      }
    }

    draw()
    chart.timeScale().subscribeVisibleTimeRangeChange(() => requestAnimationFrame(draw))

    return () => canvas.remove()
  },
}
