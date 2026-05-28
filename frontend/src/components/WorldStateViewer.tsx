import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface WorldStateViewerProps {
  campaignId: number
  isDM: boolean
}

/**
 * Panel for viewing and editing the campaign's persistent world state.
 * Displays key-value facts the DM brain accumulates over time.
 * DMs can add, inline-edit, and delete entries. Changes are saved via PUT.
 */
export function WorldStateViewer({ campaignId, isDM }: WorldStateViewerProps) {
  const [worldState, setWorldState] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [showAddRow, setShowAddRow] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.campaigns.getWorldState(campaignId)
      .then((data) => {
        const typed = (data ?? {}) as Record<string, unknown>
        const stringified: Record<string, string> = {}
        for (const [k, v] of Object.entries(typed)) {
          stringified[k] = String(v)
        }
        setWorldState(stringified)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load world state.')
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  async function handleSave(updated: Record<string, string>) {
    setSaving(true)
    setError(null)
    try {
      const result = await api.campaigns.updateWorldState(campaignId, updated as Record<string, unknown>)
      const typed = (result ?? {}) as Record<string, unknown>
      const stringified: Record<string, string> = {}
      for (const [k, v] of Object.entries(typed)) {
        stringified[k] = String(v)
      }
      setWorldState(stringified)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save world state.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(key: string) {
    setEditingKey(key)
    setEditingValue(worldState[key] ?? '')
  }

  function commitEdit(key: string) {
    const updated = { ...worldState, [key]: editingValue }
    setWorldState(updated)
    setEditingKey(null)
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditingValue('')
  }

  function handleDelete(key: string) {
    const updated = { ...worldState }
    delete updated[key]
    setWorldState(updated)
  }

  function handleAddRow(e: React.FormEvent) {
    e.preventDefault()
    const k = newKey.trim()
    const v = newValue.trim()
    if (!k) return
    const updated = { ...worldState, [k]: v }
    setWorldState(updated)
    setNewKey('')
    setNewValue('')
    setShowAddRow(false)
  }

  const entries = Object.entries(worldState)

  return (
    <div
      className="world-state-viewer"
      role="region"
      aria-label="World State"
      style={{
        background: 'var(--bg-panel, var(--bg-secondary))',
        border: '1px solid var(--accent, #c4820a)',
        borderRadius: 'var(--radius, 6px)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
          🌍 World State
        </span>
        {isDM && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {!showAddRow && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => setShowAddRow(true)}
                aria-label="Add world fact"
                style={{ fontSize: '0.75rem' }}
              >
                + Add Fact
              </button>
            )}
            <button
              className="btn-primary btn-sm"
              onClick={() => handleSave(worldState)}
              disabled={saving}
              aria-label="Save world state"
              style={{ fontSize: '0.75rem' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'rgba(140,40,40,0.1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Add row form */}
      {isDM && showAddRow && (
        <form onSubmit={handleAddRow} style={{
          display: 'flex', gap: '0.4rem', padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <input
            type="text"
            placeholder="Key (e.g. faction_standing)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            required
            style={{ flex: 1, minWidth: 120, fontSize: '0.8rem', padding: '0.25rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' }}
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            style={{ flex: 2, minWidth: 140, fontSize: '0.8rem', padding: '0.25rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' }}
          />
          <button type="submit" className="btn-primary btn-sm" style={{ fontSize: '0.75rem' }}>Add</button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => { setShowAddRow(false); setNewKey(''); setNewValue('') }}
            style={{ fontSize: '0.75rem' }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center', fontStyle: 'italic' }}>
            No world facts recorded yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }} aria-label="World facts">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, padding: '0.25rem 0.5rem 0.4rem 0', borderBottom: '1px solid var(--border)', width: '35%' }}>
                  Key
                </th>
                <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, padding: '0.25rem 0.5rem 0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                  Value
                </th>
                {isDM && (
                  <th style={{ width: 60, borderBottom: '1px solid var(--border)' }} aria-label="Actions" />
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.3rem 0.5rem 0.3rem 0', color: 'var(--text-secondary)', verticalAlign: 'top', wordBreak: 'break-all' }}>
                    {key}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem 0.3rem 0', color: 'var(--text-primary)', verticalAlign: 'top', wordBreak: 'break-word' }}>
                    {isDM && editingKey === key ? (
                      <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(key)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          style={{ flex: 1, fontSize: '0.8rem', padding: '0.15rem 0.4rem', background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--text-primary)' }}
                        />
                        <button
                          onClick={() => commitEdit(key)}
                          style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', background: 'var(--accent)', border: 'none', borderRadius: 3, cursor: 'pointer', color: 'var(--bg-primary)' }}
                          aria-label="Confirm edit"
                        >✓</button>
                        <button
                          onClick={cancelEdit}
                          style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)' }}
                          aria-label="Cancel edit"
                        >✕</button>
                      </span>
                    ) : (
                      <span
                        onClick={isDM ? () => startEdit(key) : undefined}
                        title={isDM ? 'Click to edit' : undefined}
                        style={{ cursor: isDM ? 'pointer' : 'default', textDecoration: isDM ? 'underline dotted' : 'none' }}
                      >
                        {value || <em style={{ color: 'var(--text-muted)' }}>—</em>}
                      </span>
                    )}
                  </td>
                  {isDM && (
                    <td style={{ padding: '0.2rem 0', textAlign: 'right', verticalAlign: 'top' }}>
                      <button
                        onClick={() => handleDelete(key)}
                        style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.6 }}
                        aria-label={`Delete fact ${key}`}
                        title={`Delete ${key}`}
                      >✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
