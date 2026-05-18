import { useState, useEffect } from 'react'
import type { Symbol, Sector } from '../types'

interface HeatmapStock {
  asset_id: number
  symbol: string
  exchange: string
  weight: number
  close: number | null
  change_pct: number | null
  market_cap: number | null
}

interface HeatmapSector {
  id: number
  name: string
  stocks: HeatmapStock[]
}

interface Props {
  symbols: Symbol[]
  sectors: Sector[]
  onSelectSymbol: (symbol: string, exchange: string) => void
  onSelectSector: (sectorId: number) => void
}

function pctColor(pct: number | null): string {
  if (pct === null) return '#1e1e1e'
  if (pct >= 3)  return '#0a5c23'
  if (pct >= 2)  return '#0e7a30'
  if (pct >= 1)  return '#148c3b'
  if (pct >= 0)  return '#0d4a1e'
  if (pct > -1)  return '#5c1212'
  if (pct > -2)  return '#7a1818'
  if (pct > -3)  return '#941e1e'
  return '#b82424'
}

export default function HeatmapPage({ symbols, sectors, onSelectSymbol, onSelectSector }: Props) {
  const [heatmap, setHeatmap] = useState<HeatmapSector[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/trading/api/heatmap')
      .then((r) => r.json())
      .then(setHeatmap)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: 40, color: '#555', fontSize: 14 }}>로딩 중...</div>
  }

  if (heatmap.length === 0) {
    return (
      <div style={{ padding: 40, color: '#444', fontSize: 14 }}>
        섹터를 추가하면 히트맵이 표시됩니다.
      </div>
    )
  }

  const eff = (s: HeatmapStock) =>
    s.market_cap !== null ? s.weight * s.market_cap : s.weight

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 12, background: '#0f0f0f' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        {heatmap.map((sector) => {
          const totalEff = sector.stocks.reduce((sum, s) => sum + eff(s), 0)
          const validStocks = sector.stocks.filter((st) => st.change_pct !== null)
          const weightedSum = validStocks.reduce((s, st) => s + st.weight * st.change_pct!, 0)
          const validWeight = validStocks.reduce((s, st) => s + st.weight, 0)
          const sectorChange = validWeight > 0 ? weightedSum / validWeight : null
          return (
            <div key={sector.id} style={{
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              overflow: 'hidden',
              flexGrow: sector.stocks.reduce((sum, s) => sum + eff(s), 0) || 1,
              flexShrink: 0,
              flexBasis: 280,
              minWidth: 280,
            }}>
              <div
                onClick={() => onSelectSector(sector.id)}
                style={{
                  padding: '5px 10px',
                  background: '#1a1a1a',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#a78bfa',
                  letterSpacing: '0.8px',
                  borderBottom: '1px solid #2a2a2a',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{sector.name.toUpperCase()}</span>
                {sectorChange !== null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: sectorChange >= 0 ? '#26a69a' : '#ef5350',
                    letterSpacing: 0,
                  }}>
                    {sectorChange >= 0 ? '+' : ''}{sectorChange.toFixed(2)}%
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 2, background: '#0f0f0f' }}>
                {sector.stocks.map((stock) => {
                  const widthPct = Math.max(8, (eff(stock) / totalEff) * 100)
                  return (
                    <div
                      key={stock.asset_id}
                      onClick={() => onSelectSymbol(stock.symbol, stock.exchange)}
                      style={{
                        flexGrow: eff(stock),
                        flexShrink: 0,
                        flexBasis: `calc(${widthPct}% - 2px)`,
                        minWidth: 44,
                        height: 64,
                        background: pctColor(stock.change_pct),
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 3,
                        padding: '4px 2px',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.35)')}
                      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                      title={`${stock.symbol}  ${stock.change_pct !== null ? (stock.change_pct >= 0 ? '+' : '') + stock.change_pct + '%' : 'N/A'}`}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2 }}>
                        {stock.symbol}
                      </span>
                      {stock.change_pct !== null && (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                          {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
