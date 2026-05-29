import { useEffect, useState } from 'react'
import type { PendingRoll } from '../store/gameStore'

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const
type DieType = (typeof DICE_TYPES)[number]

interface RollHistoryEntry {
  notation: string
  values: number[]
  total: number
  modifier: number
}

interface Props {
  pendingRoll: PendingRoll | null
  onSendManualRoll: (rollRequestId: string, values: number[], total: number) => void
  onSendToChat: (text: string) => void
  onClose: () => void
}

function rollDice(count: number, sides: DieType): number[] {
  const values: number[] = []
  const buf = new Uint32Array(count)
  crypto.getRandomValues(buf)
  for (let i = 0; i < count; i++) {
    values.push((buf[i] % sides) + 1)
  }
  return values
}

/**
 * Virtual dice roller panel.
 *
 * When a {@link PendingRoll} is active, pre-selects the requested dice and
 * exposes a Submit button that sends the result via {@link onSendManualRoll}.
 * For freeform rolls, {@link onSendToChat} broadcasts the result as a player
 * action so all session participants see it.
 */
function rollAdvantage(modifier: number, keepHighest: boolean): { values: [number, number]; kept: number; total: number } {
  const arr = new Uint32Array(2)
  crypto.getRandomValues(arr)
  const a = (arr[0] % 20) + 1
  const b = (arr[1] % 20) + 1
  const kept = keepHighest ? Math.max(a, b) : Math.min(a, b)
  return { values: [a, b], kept, total: kept + modifier }
}

export function DiceRoller({ pendingRoll, onSendManualRoll, onSendToChat, onClose }: Props) {
  const [selectedDie, setSelectedDie] = useState<DieType>(20)
  const [count, setCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [lastValues, setLastValues] = useState<number[] | null>(null)
  const [lastTotal, setLastTotal] = useState<number | null>(null)
  const [history, setHistory] = useState<RollHistoryEntry[]>([])
  const [advantageRolls, setAdvantageRolls] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (pendingRoll) {
      const match = pendingRoll.dice.match(/^(\d+)d(\d+)$/i)
      if (match) {
        const parsedCount = Math.min(10, Math.max(1, parseInt(match[1], 10)))
        const parsedSides = parseInt(match[2], 10) as DieType
        if ((DICE_TYPES as readonly number[]).includes(parsedSides)) {
          setSelectedDie(parsedSides)
        }
        setCount(parsedCount)
      }
      setModifier(0)
      setLastValues(null)
      setLastTotal(null)
      setAdvantageRolls(null)
    }
  }, [pendingRoll])

  function handleRoll() {
    if (pendingRoll?.advantage || pendingRoll?.disadvantage) {
      const keepHighest = !!pendingRoll.advantage
      const result = rollAdvantage(modifier, keepHighest)
      setAdvantageRolls(result.values)
      setLastValues([result.kept])
      setLastTotal(result.total)
      const notation = `2d20${keepHighest ? ' adv' : ' dis'}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`
      setHistory((prev) => [{ notation, values: result.values as number[], total: result.total, modifier }, ...prev].slice(0, 6))
    } else {
      const values = rollDice(count, selectedDie)
      const sum = values.reduce((a, b) => a + b, 0)
      const total = sum + modifier
      setLastValues(values)
      setLastTotal(total)
      setAdvantageRolls(null)
      const notation = `${count}d${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`
      const entry: RollHistoryEntry = { notation, values, total, modifier }
      setHistory((prev) => [entry, ...prev].slice(0, 6))
    }
  }

  function handleSubmitRoll() {
    if (!pendingRoll || lastValues === null || lastTotal === null) return
    const submitValues = advantageRolls ? Array.from(advantageRolls) : lastValues
    onSendManualRoll(pendingRoll.roll_request_id, submitValues, lastTotal)
  }

  function handleSendToChat() {
    if (lastValues === null || lastTotal === null) return
    const notation = `${count}d${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`
    onSendToChat(`🎲 Rolled ${notation}: [${lastValues.join(', ')}] = ${lastTotal}`)
  }

  const hasRolled = lastValues !== null && lastTotal !== null

  return (
    <div className="dice-roller-panel">
      <div className="dice-roller-header">
        <span className="dice-roller-title">🎲 Dice Roller</span>
        <button className="btn-ghost btn-sm dice-roller-close" onClick={onClose}>✕</button>
      </div>

      {pendingRoll && (
        <div className="dice-pending-banner">
          <div className="dice-pending-label">Roll Required</div>
          <div className="dice-pending-info">
            Roll {pendingRoll.dice} for <strong>{pendingRoll.skill}</strong>
            {pendingRoll.dc !== undefined && (
              <span className="dice-pending-dc"> (DC {pendingRoll.dc})</span>
            )}
            {pendingRoll.advantage && (
              <span style={{ marginLeft: '0.5rem', color: '#2ecc71', fontWeight: 700, fontSize: '0.8rem' }}>⬆ Advantage</span>
            )}
            {pendingRoll.disadvantage && (
              <span style={{ marginLeft: '0.5rem', color: '#e74c3c', fontWeight: 700, fontSize: '0.8rem' }}>⬇ Disadvantage</span>
            )}
          </div>
        </div>
      )}

      <div className="dice-roller-body">
        <div className="dice-type-grid">
          {DICE_TYPES.map((d) => (
            <button
              key={d}
              className={`dice-btn ${selectedDie === d ? 'dice-btn--active' : ''}`}
              onClick={() => setSelectedDie(d)}
            >
              d{d}
            </button>
          ))}
        </div>

        <div className="dice-config-row">
          <div className="dice-config-field">
            <label className="dice-config-label">Count</label>
            <input
              type="number"
              className="dice-config-input"
              value={count}
              min={1}
              max={10}
              onChange={(e) => setCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            />
          </div>
          <div className="dice-config-field">
            <label className="dice-config-label">Modifier</label>
            <input
              type="number"
              className="dice-config-input"
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </div>

        <button className="btn-primary dice-roll-btn" onClick={handleRoll}>
          Roll {count}d{selectedDie}{modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}
        </button>

        {hasRolled && (
          <div className="dice-result">
            {advantageRolls ? (
              <>
                <div className="dice-result-values">Rolled: [{advantageRolls[0]}, {advantageRolls[1]}] — keeping {lastValues![0]}</div>
              </>
            ) : (
              <div className="dice-result-values">[{lastValues!.join(', ')}]</div>
            )}
            <div className="dice-result-total">
              = <span className="dice-result-num">{lastTotal}</span>
            </div>
            {pendingRoll ? (
              <button
                className="btn-primary dice-submit-btn"
                onClick={handleSubmitRoll}
              >
                Submit Roll
              </button>
            ) : (
              <button
                className="btn-ghost btn-sm dice-chat-btn"
                onClick={handleSendToChat}
              >
                Send to Chat
              </button>
            )}
          </div>
        )}

        {!hasRolled && pendingRoll && (
          <button className="btn-primary dice-submit-btn" disabled>
            Submit Roll
          </button>
        )}

        {history.length > 0 && (
          <div className="dice-history">
            <div className="dice-history-title">Recent Rolls</div>
            {history.map((entry, i) => (
              <div key={i} className="dice-history-entry">
                <span className="dice-history-notation">{entry.notation}</span>
                <span className="dice-history-values">[{entry.values.join(', ')}]</span>
                <span className="dice-history-total">= {entry.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .dice-roller-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          background: var(--bg-panel);
          overflow: hidden;
          animation: slideIn 0.2s ease;
        }

        .dice-roller-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .dice-roller-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .dice-roller-close {
          padding: 2px 6px;
          font-size: var(--font-size-xs);
        }

        .dice-pending-banner {
          background: rgba(196, 130, 10, 0.12);
          border-bottom: 1px solid var(--accent);
          padding: var(--space-3) var(--space-4);
          flex-shrink: 0;
        }

        .dice-pending-label {
          font-size: var(--font-size-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent);
          margin-bottom: var(--space-1);
        }

        .dice-pending-info {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
        }

        .dice-pending-dc {
          color: var(--text-muted);
          font-size: var(--font-size-xs);
        }

        .dice-roller-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .dice-type-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-2);
        }

        .dice-btn {
          padding: var(--space-2) var(--space-1);
          font-size: var(--font-size-sm);
          font-weight: 700;
          font-family: var(--font-mono);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          border-radius: var(--radius);
          transition: all var(--transition);
          cursor: pointer;
        }

        .dice-btn:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(196, 130, 10, 0.08);
        }

        .dice-btn--active {
          border-color: var(--accent) !important;
          color: var(--accent) !important;
          background: rgba(196, 130, 10, 0.15) !important;
          box-shadow: 0 0 6px rgba(196, 130, 10, 0.2);
        }

        .dice-config-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-3);
        }

        .dice-config-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .dice-config-label {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          margin-bottom: 0;
        }

        .dice-config-input {
          width: 100%;
          padding: var(--space-1) var(--space-2);
          font-size: var(--font-size-sm);
          text-align: center;
          font-family: var(--font-mono);
        }

        .dice-roll-btn {
          width: 100%;
          padding: var(--space-3);
          font-size: var(--font-size-base);
        }

        .dice-result {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-4);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }

        .dice-result-values {
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
          color: var(--text-muted);
        }

        .dice-result-total {
          font-size: var(--font-size-lg);
          color: var(--text-secondary);
          font-weight: 600;
        }

        .dice-result-num {
          font-size: var(--font-size-2xl);
          font-weight: 700;
          color: var(--dice-color);
          font-family: var(--font-mono);
        }

        .dice-submit-btn {
          width: 100%;
          padding: var(--space-2) var(--space-4);
        }

        .dice-chat-btn {
          width: 100%;
        }

        .dice-history {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .dice-history-title {
          font-size: var(--font-size-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          padding-bottom: var(--space-1);
          border-bottom: 1px solid var(--border);
          margin-bottom: var(--space-1);
        }

        .dice-history-entry {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: var(--bg-secondary);
          border-radius: var(--radius);
          font-size: var(--font-size-xs);
        }

        .dice-history-notation {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--accent);
          min-width: 60px;
        }

        .dice-history-values {
          flex: 1;
          color: var(--text-muted);
          font-family: var(--font-mono);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dice-history-total {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--text-primary);
          flex-shrink: 0;
        }

        @media (max-width: 900px) {
          .dice-roller-panel {
            position: fixed;
            top: var(--header-height);
            right: 0;
            bottom: 0;
            width: min(var(--sidebar-width), 100vw);
            z-index: 200;
            box-shadow: -4px 0 20px var(--shadow-lg);
          }
        }
      `}</style>
    </div>
  )
}
