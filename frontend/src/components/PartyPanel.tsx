import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore'

interface Props {
  onClose: () => void
  isDM: boolean
}

/**
 * Sidebar panel showing the shared party resources: gold count and a list of items.
 * DMs can add/remove items and adjust gold. Changes are persisted via the REST API
 * and broadcast to all clients via the `party_update` WebSocket message.
 */
export function PartyPanel({ onClose, isDM }: Props) {
  const { partyState, savePartyState, activeCampaign } = useGameStore(
    useShallow(s => ({ partyState: s.partyState, savePartyState: s.savePartyState, activeCampaign: s.activeCampaign }))
  )
  const [goldInput, setGoldInput] = useState('')
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)

  const campaignId = activeCampaign?.id ?? ''

  async function save(newState: { gold: number; items: string[] }) {
    if (!campaignId) return
    setSaving(true)
    try {
      await savePartyState(campaignId, newState)
    } finally {
      setSaving(false)
    }
  }

  function handleGoldChange(delta: number) {
    const next = { ...partyState, gold: Math.max(0, partyState.gold + delta) }
    save(next).catch(console.error)
  }

  function handleGoldSet(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseInt(goldInput, 10)
    if (isNaN(parsed) || parsed < 0) return
    save({ ...partyState, gold: parsed }).catch(console.error)
    setGoldInput('')
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const item = newItem.trim()
    if (!item) return
    save({ ...partyState, items: [...partyState.items, item] }).catch(console.error)
    setNewItem('')
  }

  function handleRemoveItem(idx: number) {
    const next = partyState.items.filter((_, i) => i !== idx)
    save({ ...partyState, items: next }).catch(console.error)
  }

  return (
    <div className="party-panel">
      <div className="party-panel-header">
        <span className="party-panel-title">Party Resources</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="party-panel-body">
        {/* Gold */}
        <div className="party-gold-section">
          <div className="party-section-label">Gold</div>
          <div className="party-gold-display">
            <span className="party-gold-icon">🪙</span>
            <span className="party-gold-value">{partyState.gold.toLocaleString()}</span>
            <span className="party-gold-unit">gp</span>
          </div>
          {isDM && (
            <>
              <div className="party-gold-btns">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(-100)}
                  disabled={saving || partyState.gold < 100}
                  title="Remove 100 gold"
                >
                  −100
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(-10)}
                  disabled={saving || partyState.gold < 10}
                  title="Remove 10 gold"
                >
                  −10
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(-1)}
                  disabled={saving || partyState.gold < 1}
                  title="Remove 1 gold"
                >
                  −1
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(1)}
                  disabled={saving}
                  title="Add 1 gold"
                >
                  +1
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(10)}
                  disabled={saving}
                  title="Add 10 gold"
                >
                  +10
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleGoldChange(100)}
                  disabled={saving}
                  title="Add 100 gold"
                >
                  +100
                </button>
              </div>
              <form className="party-gold-set-form" onSubmit={handleGoldSet}>
                <input
                  type="number"
                  min={0}
                  className="party-input"
                  placeholder="Set gold amount..."
                  value={goldInput}
                  onChange={(e) => setGoldInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn-primary btn-sm"
                  disabled={saving || !goldInput.trim()}
                >
                  Set
                </button>
              </form>
            </>
          )}
        </div>

        {/* Items */}
        <div className="party-items-section">
          <div className="party-section-label">Party Items</div>

          {partyState.items.length === 0 ? (
            <p className="party-empty">No shared items.</p>
          ) : (
            <ul className="party-item-list">
              {partyState.items.map((item, i) => (
                <li key={i} className="party-item-row">
                  <span className="party-item-name">{item}</span>
                  {isDM && (
                    <button
                      className="party-item-remove"
                      onClick={() => handleRemoveItem(i)}
                      disabled={saving}
                      title={`Remove ${item}`}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isDM && (
            <form className="party-add-item-form add-row" onSubmit={handleAddItem}>
              <input
                type="text"
                className="add-input"
                placeholder="Add party item..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                maxLength={80}
                disabled={saving}
              />
              <button
                type="submit"
                className="btn-ghost btn-sm"
                disabled={saving || !newItem.trim()}
              >
                +
              </button>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .party-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-panel);
        }

        .party-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .party-panel-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .party-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }

        .party-section-label {
          font-size: var(--font-size-xs);
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: var(--space-2);
        }

        .party-gold-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .party-gold-display {
          display: flex;
          align-items: baseline;
          gap: var(--space-2);
        }

        .party-gold-icon {
          font-size: 1.2rem;
        }

        .party-gold-value {
          font-size: var(--font-size-2xl);
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--accent);
        }

        .party-gold-unit {
          font-size: var(--font-size-sm);
          color: var(--text-muted);
        }

        .party-gold-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .party-gold-btns button {
          flex: 1;
          min-width: 40px;
          font-size: var(--font-size-xs);
          padding: 2px 4px;
        }

        .party-gold-set-form {
          display: flex;
          gap: var(--space-2);
        }

        .party-input {
          flex: 1;
          font-size: var(--font-size-sm);
          padding: var(--space-1) var(--space-2);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text-primary);
        }

        .party-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .party-items-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .party-empty {
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          font-style: italic;
          margin-bottom: var(--space-2);
        }

        .party-item-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: var(--space-2);
          max-height: 300px;
          overflow-y: auto;
        }

        .party-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          padding: 4px var(--space-2);
          border-radius: var(--radius);
          transition: background var(--transition);
        }

        .party-item-row:hover {
          background: var(--bg-secondary);
        }

        .party-item-name {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          flex: 1;
        }

        .party-item-remove {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0 4px;
          font-size: 1rem;
          line-height: 1;
          opacity: 0;
          text-transform: none;
          letter-spacing: 0;
          min-width: unset;
          border-radius: var(--radius);
          transition: opacity var(--transition), color var(--transition);
        }

        .party-item-row:hover .party-item-remove {
          opacity: 1;
        }

        .party-item-remove:hover {
          color: var(--accent-danger);
          background: transparent;
          border-color: transparent;
        }

        .party-add-item-form {
          margin-top: var(--space-1);
        }

        @media (max-width: 900px) {
          .party-panel {
            position: fixed;
            top: var(--header-height, 48px);
            right: 0;
            bottom: 0;
            width: min(var(--sidebar-width, 320px), 100vw);
            z-index: 200;
            box-shadow: -4px 0 20px var(--shadow-lg);
          }
        }
      `}</style>
    </div>
  )
}
