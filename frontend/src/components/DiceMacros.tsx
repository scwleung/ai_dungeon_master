import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'

interface Props {
  onRoll: (values: number[], total: number, notation: string) => void
  onClose: () => void
}

function rollNotation(notation: string): { values: number[]; total: number } {
  const match = notation.toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) return { values: [0], total: 0 }
  const count = parseInt(match[1])
  const sides = parseInt(match[2])
  const mod = parseInt(match[3] ?? '0')
  const arr = new Uint32Array(count)
  crypto.getRandomValues(arr)
  const values = Array.from(arr).map(n => (n % sides) + 1)
  const total = values.reduce((a, b) => a + b, 0) + mod
  return { values, total }
}

export default function DiceMacros({ onRoll, onClose }: Props) {
  const { diceMacros, setDiceMacros } = useGameStore()
  const [newName, setNewName] = useState('')
  const [newNotation, setNewNotation] = useState('')
  const [lastRoll, setLastRoll] = useState<{ notation: string; values: number[]; total: number } | null>(null)

  // Load macros from localStorage on mount (sync with store)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dm_dice_macros')
      if (raw) {
        const loaded = JSON.parse(raw) as Array<{ id: string; name: string; notation: string }>
        setDiceMacros(loaded)
      }
    } catch {
      // ignore
    }
  }, [setDiceMacros])

  function addMacro(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newNotation.trim()) return
    const updated = [...diceMacros, { id: crypto.randomUUID(), name: newName.trim(), notation: newNotation.trim() }]
    setDiceMacros(updated)
    setNewName('')
    setNewNotation('')
  }

  function removeMacro(id: string) {
    setDiceMacros(diceMacros.filter(m => m.id !== id))
  }

  function handleRoll(notation: string) {
    const result = rollNotation(notation)
    setLastRoll({ notation, ...result })
    onRoll(result.values, result.total, notation)
  }

  return (
    <div className="dm-panel">
      <div className="dm-header">
        <span className="dm-title">Dice Macros</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div className="dm-body">
        {diceMacros.length === 0 && (
          <p className="dm-empty">No macros yet. Add some below.</p>
        )}

        {diceMacros.map(macro => (
          <div key={macro.id} className="dm-macro-row">
            <div className="dm-macro-info">
              <span className="dm-macro-name">{macro.name}</span>
              <span className="dm-macro-notation">{macro.notation}</span>
            </div>
            <button
              className="btn-primary btn-sm dm-roll-btn"
              onClick={() => handleRoll(macro.notation)}
              title={`Roll ${macro.notation}`}
            >
              🎲
            </button>
            <button
              className="btn-ghost btn-sm dm-remove"
              onClick={() => removeMacro(macro.id)}
              title="Remove macro"
            >
              ✕
            </button>
          </div>
        ))}

        {lastRoll && (
          <div className="dm-last-roll">
            <span className="dm-last-notation">{lastRoll.notation}</span>
            <span className="dm-last-values">[{lastRoll.values.join(', ')}]</span>
            <span className="dm-last-total">= {lastRoll.total}</span>
          </div>
        )}

        <form className="dm-add-form" onSubmit={addMacro}>
          <div className="dm-add-row">
            <input
              className="dm-input"
              type="text"
              placeholder="Name (e.g. Attack)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              maxLength={30}
            />
            <input
              className="dm-input"
              type="text"
              placeholder="Notation (e.g. 1d20+5)"
              value={newNotation}
              onChange={e => setNewNotation(e.target.value)}
              maxLength={20}
            />
          </div>
          <button
            type="submit"
            className="btn-ghost btn-sm"
            disabled={!newName.trim() || !newNotation.trim()}
          >
            + Save Macro
          </button>
        </form>
      </div>

      <style>{`
        .dm-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          min-width: 260px;
        }
        .dm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }
        .dm-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .dm-body {
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          overflow-y: auto;
          max-height: 400px;
        }
        .dm-empty {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          margin: 0;
        }
        .dm-macro-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }
        .dm-macro-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .dm-macro-name {
          font-size: var(--font-size-xs);
          font-weight: 600;
          color: var(--text-primary);
        }
        .dm-macro-notation {
          font-size: 10px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }
        .dm-roll-btn {
          padding: 2px 8px;
          font-size: var(--font-size-xs);
        }
        .dm-remove {
          padding: 2px 6px;
          font-size: var(--font-size-xs);
          opacity: 0.5;
        }
        .dm-remove:hover {
          opacity: 1;
          color: var(--accent-danger);
        }
        .dm-last-roll {
          display: flex;
          gap: var(--space-2);
          align-items: center;
          padding: var(--space-1) var(--space-2);
          background: rgba(196, 130, 10, 0.1);
          border: 1px solid rgba(196, 130, 10, 0.3);
          border-radius: var(--radius);
          font-size: var(--font-size-xs);
        }
        .dm-last-notation {
          color: var(--text-muted);
          font-family: var(--font-mono);
        }
        .dm-last-values {
          color: var(--text-secondary);
          font-family: var(--font-mono);
        }
        .dm-last-total {
          font-weight: 700;
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
        }
        .dm-add-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          border-top: 1px solid var(--border);
          padding-top: var(--space-2);
        }
        .dm-add-row {
          display: flex;
          gap: var(--space-1);
        }
        .dm-input {
          flex: 1;
          padding: var(--space-1) var(--space-2);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text-primary);
          font-size: var(--font-size-xs);
          min-width: 0;
        }
        .dm-input:focus {
          outline: none;
          border-color: var(--accent);
        }
      `}</style>
    </div>
  )
}
