export interface Symbol {
  symbol: string
  exchange: string
  name: string
  isFavorite: boolean
}

export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MinuteResponse {
  label: string
  candles: Candle[]
}
