import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'

interface RandomTable {
  id: string
  name: string
  dice: string
  entries: string[]
}

interface Props {
  campaignId: number
  isDM: boolean
}

const DICE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

/**
 * Random table manager — create, roll, and delete encounter/loot/event tables.
 */
export default function RandomTables({ campaignId, isDM }: Props) {
  const { addToast } = useGameStore()
  const [tables, setTables] = useState<RandomTable[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDice, setNewDice] = useState('d6')
  const [newEntries, setNewEntries] = useState('')
  const [creating, setCreating] = useState(false)

  const [lastResults, setLastResults] = useState<Record<string, string>>({})
  const [rolling, setRolling] = useState<string | null>(null)

  useEffect(() => {
    fetchTables()
  }, [campaignId])

  async function fetchTables() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.campaigns.getTables(campaignId) as { tables?: RandomTable[] }
      setTables(data?.tables ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newEntries.trim()) return
    setCreating(true)
    try {
      const entries = newEntries.split('\n').map(l => l.trim()).filter(Boolean)
      if (entries.length < 2) {
        addToast('Enter at least 2 entries (one per line)', 'warning')
        return
      }
      const result = await api.campaigns.createTable(campaignId, {
        name: newName.trim(),
        dice: newDice,
        entries,
      }) as { table?: RandomTable }
      if (result?.table) {
        setTables(prev => [...prev, result.table!])
      }
      setNewName('')
      setNewEntries('')
      setNewDice('d6')
      setShowCreate(false)
      addToast(`Table "${newName.trim()}" created`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create table', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleRoll(table: RandomTable) {
    setRolling(table.id)
    try {
      const result = await api.campaigns.rollTable(campaignId, table.id) as { result?: string }
      const resultText = result?.result ?? `Rolled on ${table.name}`
      setLastResults(prev => ({ ...prev, [table.id]: resultText }))
      addToast(`${table.name}: ${resultText}`, 'info', 5000)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Roll failed', 'error')
    } finally {
      setRolling(null)
    }
  }

  async function handleDelete(table: RandomTable) {
    if (!window.confirm(`Delete table "${table.name}"?`)) return
    try {
      await api.campaigns.deleteTable(campaignId, table.id)
      setTables(prev => prev.filter(t => t.id !== table.id))
      addToast(`Table "${table.name}" deleted`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  return (
    <div className="random-tables">
      <div className="rt-header">
        <span className="rt-title">Random Tables</span>
        {isDM && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => setShowCreate(v => !v)}
          >
            {showCreate ? '✕ Cancel' : '+ Create'}
          </button>
        )}
      </div>

      {showCreate && isDM && (
        <form className="rt-create-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Table name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            required
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              Dice:
              <select
                value={newDice}
                onChange={e => setNewDice(e.target.value)}
                style={{ width: 'auto' }}
              >
                {DICE_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            placeholder="Entries (one per line)"
            value={newEntries}
            onChange={e => setNewEntries(e.target.value)}
            rows={5}
            required
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button type="submit" className="btn-primary btn-sm" disabled={creating || !newName.trim() || !newEntries.trim()}>
              {creating ? '...' : 'Create Table'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>Loading tables...</p>}
      {error && <p style={{ color: 'var(--accent-danger)', fontSize: 'var(--font-size-sm)' }}>{error}</p>}

      {!loading && tables.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
          No random tables yet.{isDM ? ' Create one above.' : ''}
        </p>
      )}

      <div className="rt-list">
        {tables.map(table => (
          <div key={table.id} className="rt-card">
            <div className="rt-card-header">
              <span className="rt-name">{table.name}</span>
              <span className="rt-dice-badge">{table.dice}</span>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => handleRoll(table)}
                  disabled={rolling === table.id}
                  aria-label={`Roll on ${table.name}`}
                >
                  {rolling === table.id ? '...' : '🎲 Roll'}
                </button>
                {isDM && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => handleDelete(table)}
                    aria-label={`Delete ${table.name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {lastResults[table.id] && (
              <div className="rt-last-result">
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>Last result: </span>
                <strong style={{ color: 'var(--accent)', fontSize: 'var(--font-size-sm)' }}>{lastResults[table.id]}</strong>
              </div>
            )}
            <div className="rt-entries">
              {table.entries.slice(0, 5).map((entry, i) => (
                <span key={i} className="rt-entry">{entry}</span>
              ))}
              {table.entries.length > 5 && (
                <span className="rt-entry rt-entry-more">+{table.entries.length - 5} more</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .random-tables {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          padding: var(--space-3);
          height: 100%;
          overflow-y: auto;
        }
        .rt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }
        .rt-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .rt-create-form {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .rt-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .rt-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-2) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .rt-card-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .rt-name {
          flex: 1;
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-primary);
        }
        .rt-dice-badge {
          font-size: 10px;
          padding: 1px 6px;
          background: rgba(196, 130, 10, 0.1);
          border: 1px solid rgba(196, 130, 10, 0.3);
          border-radius: var(--radius-full);
          color: var(--accent);
          font-family: var(--font-mono);
        }
        .rt-last-result {
          padding: var(--space-1) var(--space-2);
          background: rgba(196, 130, 10, 0.08);
          border-radius: var(--radius);
          border: 1px solid rgba(196, 130, 10, 0.2);
        }
        .rt-entries {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .rt-entry {
          font-size: 10px;
          padding: 1px 5px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          color: var(--text-muted);
        }
        .rt-entry-more {
          color: var(--text-muted);
          font-style: italic;
        }
      `}</style>
    </div>
  )
}
