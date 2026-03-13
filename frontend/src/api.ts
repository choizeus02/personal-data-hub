import type { Symbol, Candle, MinuteResponse } from './types'

export async function fetchSymbols(): Promise<Symbol[]> {
  const res = await fetch('/api/symbols')
  if (!res.ok) throw new Error('symbols fetch failed')
  return res.json()
}

export async function fetchDaily(symbol: string, exchange: string): Promise<Candle[]> {
  const res = await fetch(`/api/candles/daily/${symbol}?exchange=${exchange}`)
  if (!res.ok) throw new Error('daily fetch failed')
  return res.json()
}

export async function fetchMinute(
  symbol: string,
  exchange: string,
  start: string,
  end: string
): Promise<MinuteResponse> {
  const res = await fetch(`/api/candles/minute/${symbol}?exchange=${exchange}&start=${start}&end=${end}`)
  if (!res.ok) throw new Error('minute fetch failed')
  return res.json()
}
