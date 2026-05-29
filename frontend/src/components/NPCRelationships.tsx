import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { NPC } from '../types'

interface NPCRelationshipsProps {
  campaignId: number
  isDM: boolean
}

const ATTITUDE_COLORS: Record<string, string> = {
  friendly: '#4caf50',
  neutral: '#c4820a',
  hostile: '#e74c3c',
  unknown: '#888',
}

/**
 * Panel showing NPC connections as a simple list view.
 * DMs can edit comma-separated connection strings inline.
 * Connection data is persisted to localStorage only.
 */
export function NPCRelationships({ campaignId, isDM }: NPCRelationshipsProps) {
  const storeNpcs = useGameStore((s) => s.npcs)
  const [npcs, setNpcs] = useState<NPC[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const storageKey = `npc-relationships-${campaignId}`

  // connections: { npcId -> string[] }
  const [connections, setConnections] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as Record<string, string[]>
    } catch {
      // ignore
    }
    return {}
  })

  function persistConnections(updated: Record<string, string[]>) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (storeNpcs.length > 0) {
      setNpcs(storeNpcs)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api.npcs.list(String(campaignId))
      .then((res) => {
        setNpcs(res.npcs ?? [])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load NPCs.')
      })
      .finally(() => setLoading(false))
  }, [campaignId, storeNpcs])

  function startEdit(id: string) {
    setEditingId(id)
    setEditingValue((connections[id] ?? []).join(', '))
  }

  function commitEdit(id: string) {
    const parts = editingValue
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const updated = { ...connections, [id]: parts }
    setConnections(updated)
    persistConnections(updated)
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingValue('')
  }

  function buildRelationshipText(npc: NPC): string {
    const conns = connections[npc.id] ?? []
    if (conns.length === 0) return ''
    return `${npc.name} → connected to → ${conns.join(', ')}`
  }

  return (
    <div
      className="npc-relationships"
      role="region"
      aria-label="NPC Relationships"
      style={{
        background: 'var(--bg-panel, var(--bg-secondary))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 6px)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        fontSize: '0.8rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-primary)',
        flexShrink: 0,
      }}>
        🕸 NPC Relationships
      </div>

      {error && (
        <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'rgba(140,40,40,0.1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>
            Loading…
          </div>
        ) : npcs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' }}>
            No NPCs found.
          </div>
        ) : (
          npcs.map((npc) => {
            const conns = connections[npc.id] ?? []
            const relText = buildRelationshipText(npc)
            const attitudeColor = ATTITUDE_COLORS[npc.attitude] ?? '#888'
            return (
              <div
                key={npc.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${attitudeColor}`,
                  borderRadius: 'var(--radius, 6px)',
                  padding: '0.5rem 0.6rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                {/* NPC name + attitude badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    {npc.name}
                  </span>
                  <span style={{
                    fontSize: '0.65rem', padding: '1px 6px',
                    background: `${attitudeColor}22`,
                    border: `1px solid ${attitudeColor}`,
                    borderRadius: 999,
                    color: attitudeColor,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}>
                    {npc.attitude}
                  </span>
                  {npc.faction && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {npc.faction}
                    </span>
                  )}
                </div>

                {/* Relationship line */}
                {relText && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {relText}
                  </div>
                )}

                {/* Connections edit */}
                {isDM && (
                  editingId === npc.id ? (
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        placeholder="e.g. Mira, Grolk (comma-separated)"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(npc.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        style={{
                          flex: 1, minWidth: 160, fontSize: '0.75rem', padding: '0.2rem 0.4rem',
                          background: 'var(--bg-primary)', border: '1px solid var(--accent)',
                          borderRadius: 3, color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        onClick={() => commitEdit(npc.id)}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.3rem', background: 'var(--accent)', border: 'none', borderRadius: 3, cursor: 'pointer', color: 'var(--bg-primary)' }}
                        aria-label="Confirm connections"
                      >✓</button>
                      <button
                        onClick={cancelEdit}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.3rem', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)' }}
                        aria-label="Cancel edit"
                      >✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(npc.id)}
                      style={{
                        alignSelf: 'flex-start', fontSize: '0.65rem', padding: '0.1rem 0.4rem',
                        background: 'none', border: '1px solid var(--border)', borderRadius: 3,
                        cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem',
                      }}
                      aria-label={`Edit connections for ${npc.name}`}
                    >
                      ✎ {conns.length === 0 ? 'Add connections' : 'Edit connections'}
                    </button>
                  )
                )}

                {/* Connections tags (read-only) */}
                {conns.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {conns.map((c) => (
                      <span
                        key={c}
                        style={{
                          fontSize: '0.65rem', padding: '1px 6px',
                          background: 'rgba(128,128,128,0.12)',
                          border: '1px solid var(--border)',
                          borderRadius: 999,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
