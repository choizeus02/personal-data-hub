import type { Candle } from '../types'

type Time = import('lightweight-charts').Time

/** ISO / 날짜 문자열 → Unix timestamp (초) */
export function toTime(t: string): Time {
  return Math.floor(new Date(t.replace(' ', 'T')).getTime() / 1000) as unknown as Time
}

/** 연속된 봉 사이 평균 간격 (초) */
export function detectInterval(candles: Candle[]): number {
  if (candles.length < 2) return 86400
  const t1 = new Date(candles[0].time).getTime()
  const t2 = new Date(candles[1].time).getTime()
  return Math.max(60, Math.round((t2 - t1) / 1000))
}

/** 단순이동평균 */
export function calcSMA(candles: Candle[], period: number): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const sum = candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0)
    out.push({ time: toTime(candles[i].time), value: sum / period })
  }
  return out
}

/** 볼린저밴드 (기본 20기간, 2σ) */
export function calcBollingerBands(candles: Candle[], period = 20, mult = 2) {
  const upper: { time: Time; value: number }[] = []
  const middle: { time: Time; value: number }[] = []
  const lower: { time: Time; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const sl = candles.slice(i - period + 1, i + 1)
    const avg = sl.reduce((s, c) => s + c.close, 0) / period
    const std = Math.sqrt(sl.reduce((s, c) => s + (c.close - avg) ** 2, 0) / period)
    const t = toTime(candles[i].time)
    middle.push({ time: t, value: avg })
    upper.push({ time: t, value: avg + mult * std })
    lower.push({ time: t, value: avg - mult * std })
  }
  return { upper, middle, lower }
}

/** 일목균형표 5선 계산 (span A/B는 interval초 기준으로 26봉 선행) */
export function calcIchimoku(candles: Candle[], interval: number) {
  function hlAvg(lo: number, hi: number) {
    const sl = candles.slice(lo, hi)
    return (Math.max(...sl.map((c) => c.high)) + Math.min(...sl.map((c) => c.low))) / 2
  }

  const tenkan: { time: Time; value: number }[] = []
  const kijun:  { time: Time; value: number }[] = []
  const spanA:  { time: Time; value: number }[] = []
  const spanB:  { time: Time; value: number }[] = []
  const chikou: { time: Time; value: number }[] = []
  const shift = 26 * interval

  for (let i = 8; i < candles.length; i++)
    tenkan.push({ time: toTime(candles[i].time), value: hlAvg(i - 8, i + 1) })

  for (let i = 25; i < candles.length; i++)
    kijun.push({ time: toTime(candles[i].time), value: hlAvg(i - 25, i + 1) })

  for (let i = 25; i < candles.length; i++) {
    const t = (Math.floor(new Date(candles[i].time).getTime() / 1000) + shift) as unknown as Time
    spanA.push({ time: t, value: (hlAvg(i - 8, i + 1) + hlAvg(i - 25, i + 1)) / 2 })
  }
  for (let i = 51; i < candles.length; i++) {
    const t = (Math.floor(new Date(candles[i].time).getTime() / 1000) + shift) as unknown as Time
    spanB.push({ time: t, value: hlAvg(i - 51, i + 1) })
  }
  for (let i = 26; i < candles.length; i++)
    chikou.push({ time: toTime(candles[i - 26].time), value: candles[i].close })

  return { tenkan, kijun, spanA, spanB, chikou }
}
