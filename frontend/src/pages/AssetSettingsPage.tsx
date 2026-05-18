import { useState, useEffect } from 'react'
import { fetchAssetSettings, updateShares } from '../api'
import type { AssetSetting } from '../types'

type Tab = 'ALL' | 'NASDAQ' | 'KRX' | 'CME'

export default function AssetSettingsPage() {
  const [assets, setAssets]       = useState<AssetSetting[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<Tab>('ALL')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    fetchAssetSettings()
      .then(setAssets)
      .finally(() => setLoading(false))
  }, [])

  const filtered = tab === 'ALL' ? assets : assets.filter((a) => a.exchange === tab)
  const missingCount = assets.filter(
    (a) => a.asset_type !== 'FUTURE' && a.shares_outstanding === null
  ).length

  async function handleSave(asset: AssetSetting) {
    const shares = parseInt(editValue.replace(/,/g, ''), 10)
    if (isNaN(shares) || shares <= 0) return
    setSaving(true)
    try {
      await updateShares(asset.id, shares)
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, shares_outstanding: shares } : a))
      )
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(asset: AssetSetting) {
    setEditingId(asset.id)
    setEditValue(asset.shares_outstanding ? String(asset.shares_outstanding) : '')
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 12,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    background: tab === t ? '#2563eb' : '#262626',
    color: tab === t ? '#fff' : '#888',
  })

  return (
    <div style={{ padding: 24, color: '#ccc', fontFamily: 'system-ui, sans-serif', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚙ 자산 설정</div>
        {missingCount > 0 && (
          <div style={{ fontSize: 12, color: '#ef5350' }}>
            ⚠ 주식수 미입력 종목 {missingCount}개 — 클릭해서 입력하면 히트맵 크기에 반영됩니다
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['ALL', 'NASDAQ', 'KRX', 'CME'] as Tab[]).map((t) => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t === 'ALL' ? '전체' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#555', fontSize: 13 }}>불러오는 중...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>종목</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>이름</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>거래소</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#555', fontWeight: 600 }}>주식수</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => {
              const isFuture  = asset.asset_type === 'FUTURE'
              const isEditing = editingId === asset.id
              const isMissing = !isFuture && asset.shares_outstanding === null

              return (
                <tr
                  key={asset.id}
                  style={{
                    borderBottom: '1px solid #1a1a1a',
                    background: isMissing ? '#1a0000' : 'transparent',
                    cursor: isFuture ? 'default' : 'pointer',
                  }}
                  onClick={() => !isFuture && !isEditing && startEdit(asset)}
                >
                  <td style={{ padding: '7px 10px', color: '#ddd', fontWeight: 500 }}>{asset.symbol}</td>
                  <td style={{ padding: '7px 10px', color: '#888' }}>{asset.name}</td>
                  <td style={{ padding: '7px 10px', color: '#666', fontSize: 11 }}>{asset.exchange}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {isFuture ? (
                      <span style={{ color: '#444' }}>해당없음</span>
                    ) : isEditing ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(asset)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          style={{
                            width: 160,
                            padding: '3px 8px',
                            background: '#262626',
                            border: '1px solid #444',
                            borderRadius: 4,
                            color: '#ccc',
                            fontSize: 12,
                            outline: 'none',
                          }}
                          placeholder="예: 15204000000"
                        />
                        <button
                          onClick={() => handleSave(asset)}
                          disabled={saving}
                          style={{ padding: '3px 10px', background: '#2563eb', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ padding: '3px 8px', background: 'none', border: '1px solid #333', borderRadius: 4, color: '#666', fontSize: 12, cursor: 'pointer' }}
                        >
                          취소
                        </button>
                      </div>
                    ) : isMissing ? (
                      <span style={{ color: '#ef5350', fontSize: 12 }}>⚠ 입력 필요</span>
                    ) : (
                      <span style={{ color: '#4ade80', fontSize: 12 }}>
                        {asset.shares_outstanding!.toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
