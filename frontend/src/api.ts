import type { Symbol, Candle, MinuteResponse, Sector } from './types'

export async function fetchSymbols(): Promise<Symbol[]> {
  const res = await fetch('/trading/api/symbols')
  if (!res.ok) throw new Error('symbols fetch failed')
  return res.json()
}

export async function toggleFavorite(symbol: string, exchange: string): Promise<{ isFavorite: boolean }> {
  const res = await fetch(`/trading/api/symbols/${symbol}/favorite?exchange=${exchange}`, { method: 'PATCH' })
  if (!res.ok) throw new Error('favorite toggle failed')
  return res.json()
}

export async function fetchDaily(symbol: string, exchange: string): Promise<Candle[]> {
  const res = await fetch(`/trading/api/candles/daily/${symbol}?exchange=${exchange}`)
  if (!res.ok) throw new Error('daily fetch failed')
  return res.json()
}

export async function fetchWeekly(symbol: string, exchange: string): Promise<Candle[]> {
  const res = await fetch(`/trading/api/candles/weekly/${symbol}?exchange=${exchange}`)
  if (!res.ok) throw new Error('weekly fetch failed')
  return res.json()
}

export async function fetchMinute(
  symbol: string,
  exchange: string,
  start: string,
  end: string
): Promise<MinuteResponse> {
  const res = await fetch(`/trading/api/candles/minute/${symbol}?exchange=${exchange}&start=${start}&end=${end}`)
  if (!res.ok) throw new Error('minute fetch failed')
  return res.json()
}

export async function fetchSectors(): Promise<Sector[]> {
  const res = await fetch('/trading/api/sectors')
  if (!res.ok) throw new Error('sectors fetch failed')
  return res.json()
}

export async function createSector(name: string): Promise<Sector> {
  const res = await fetch('/trading/api/sectors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('sector create failed')
  return res.json()
}

export async function deleteSector(id: number): Promise<void> {
  const res = await fetch(`/trading/api/sectors/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('sector delete failed')
}

export async function updateSectorStocks(
  id: number,
  stocks: { asset_id: number; weight: number }[]
): Promise<void> {
  const res = await fetch(`/trading/api/sectors/${id}/stocks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stocks),
  })
  if (!res.ok) throw new Error('sector stocks update failed')
}

export async function fetchSectorCandles(
  id: number,
  start: string,
  end: string,
  chartType: 'daily' | 'weekly' | 'minute' = 'minute'
): Promise<MinuteResponse> {
  const res = await fetch(`/trading/api/sectors/${id}/candles?start=${start}&end=${end}&chart_type=${chartType}`)
  if (!res.ok) throw new Error('sector candles fetch failed')
  return res.json()
}
