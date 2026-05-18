export interface Symbol {
  id: number
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

export interface SectorStock {
  asset_id: number
  weight: number
  symbol: string
  exchange: string
}

export interface Sector {
  id: number
  name: string
  memo?: string | null
  stocks: SectorStock[]
}

export type Selected =
  | { type: 'symbol'; data: Symbol }
  | { type: 'sector'; data: Sector }
  | { type: 'settings' }

export interface AssetSetting {
  id: number
  symbol: string
  exchange: string
  name: string
  asset_type: string
  shares_outstanding: number | null
}
