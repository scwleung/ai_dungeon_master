import { useState } from 'react'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { Combatant } from '../types'
import { ConditionReference } from './ConditionReference'

/**
 * Real-time combat initiative tracker.
 *
 * Displays the active combat round, turn order, and HP for each combatant.
 * Receives updates from the server via `combat_update` WebSocket messages which
 * are applied to the Zustand store by {@link useWebSocket}.
 *
 * When a session is active, exposes REST controls: Next Turn, End Combat,
 * per-combatant Remove, and an Add Combatant form.
 */
export function CombatTracker({ onClose, isDM }: { onClose: () => void; isDM: boolean }) {
  const { combatActive, combatRound, combatTurnIndex, combatants, activeSession } = useGameStore()
  const sessionId = activeSession?.id ?? null

  const [nextTurnLoading, setNextTurnLoading] = useState(false)
  const [endCombatLoading, setEndCombatLoading] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addInitiative, setAddInitiative] = useState('')
  const [addHpMax, setAddHpMax] = useState('')
  const [addHpCurrent, setAddHpCurrent] = useState('')
  const [addIsPlayer, setAddIsPlayer] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [showConditions, setShowConditions] = useState(false)

  async function handleNextTurn() {
    if (!sessionId) return
    setNextTurnLoading(true)
    setControlError(null)
    try {
      await api.combat.nextTurn(sessionId)
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Failed to advance turn.')
    } finally {
      setNextTurnLoading(false)
    }
  }

  async function handleEndCombat() {
    if (!sessionId) return
    setEndCombatLoading(true)
    setControlError(null)
    try {
      await api.combat.endCombat(sessionId)
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Failed to end combat.')
    } finally {
      setEndCombatLoading(false)
    }
  }

  async function handleRemoveCombatant(name: string) {
    if (!sessionId) return
    setControlError(null)
    try {
      await api.combat.removeCombatant(sessionId, name)
    } catch (err) {
      setControlError(err instanceof Error ? err.message : `Failed to remove ${name}.`)
    }
  }

  async function handleAddCombatant(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId) return
    const initiative = parseInt(addInitiative, 10)
    const hpMax = parseInt(addHpMax, 10)
    const hpCurrent = addHpCurrent !== '' ? parseInt(addHpCurrent, 10) : hpMax
    if (isNaN(initiative) || isNaN(hpMax) || hpMax < 1 || (!isNaN(hpCurrent) && hpCurrent < 0)) {
      setControlError('Initiative and HP must be valid numbers (HP Max ≥ 1, HP Current ≥ 0).')
      return
    }
    setAddLoading(true)
    setControlError(null)
    try {
      await api.combat.addCombatant(sessionId, {
        name: addName.trim(),
        initiative,
        hp_max: hpMax,
        hp_current: isNaN(hpCurrent) ? hpMax : hpCurrent,
        is_player: addIsPlayer,
      })
      setAddName('')
      setAddInitiative('')
      setAddHpMax('')
      setAddHpCurrent('')
      setAddIsPlayer(false)
      setShowAddForm(false)
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Failed to add combatant.')
    } finally {
      setAddLoading(false)
    }
  }

  if (!combatActive) {
    return (
      <div className="combat-tracker combat-tracker--empty">
        <div className="combat-tracker-header">
          <span className="combat-tracker-title">Combat Tracker</span>
          <button className="combat-close-btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="combat-empty-state">
          <p>No active combat</p>
          <span className="combat-empty-sub">Combat will appear here when the DM starts an encounter</span>
        </div>

        {showConditions && (
          <div className="combat-conditions-inline">
            <ConditionReference onClose={() => setShowConditions(false)} />
          </div>
        )}

        <div className="combat-conditions-footer">
          <button
            className="btn-ghost btn-sm combat-conditions-toggle"
            onClick={() => setShowConditions((v) => !v)}
          >
            📖 Conditions
          </button>
        </div>

        <style>{combatStyles}</style>
      </div>
    )
  }

  return (
    <div className="combat-tracker">
      <div className="combat-tracker-header">
        <span className="combat-tracker-title">
          Combat — Round {combatRound}
        </span>
        <button className="combat-close-btn btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      {sessionId && isDM && (
        <div className="combat-controls">
          <button
            className="btn-primary btn-sm"
            onClick={handleNextTurn}
            disabled={nextTurnLoading}
          >
            {nextTurnLoading ? '...' : 'Next Turn'}
          </button>
          <button
            className="btn-danger btn-sm"
            onClick={handleEndCombat}
            disabled={endCombatLoading}
          >
            {endCombatLoading ? '...' : 'End Combat'}
          </button>
        </div>
      )}

      {controlError && (
        <div className="combat-control-error">{controlError}</div>
      )}

      <div className="combat-list">
        {combatants.map((c, idx) => (
          <CombatantRow
            key={`${c.name}-${idx}`}
            combatant={c}
            isActive={idx === combatTurnIndex}
            sessionId={sessionId}
            isDM={isDM}
            onRemove={handleRemoveCombatant}
          />
        ))}
      </div>

      {showConditions && (
        <div className="combat-conditions-inline">
          <ConditionReference onClose={() => setShowConditions(false)} />
        </div>
      )}

      <div className="combat-conditions-footer">
        <button
          className="btn-ghost btn-sm combat-conditions-toggle"
          onClick={() => setShowConditions((v) => !v)}
        >
          📖 Conditions
        </button>
      </div>

      {sessionId && isDM && (
        <div className="combat-add-section">
          {!showAddForm ? (
            <button
              className="btn-ghost btn-sm combat-add-toggle"
              onClick={() => setShowAddForm(true)}
            >
              + Add Combatant
            </button>
          ) : (
            <form className="combat-add-form" onSubmit={handleAddCombatant}>
              <div className="combat-add-form-title">Add Combatant</div>
              <input
                className="combat-add-input"
                type="text"
                placeholder="Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
              />
              <div className="combat-add-row">
                <input
                  className="combat-add-input"
                  type="number"
                  placeholder="Initiative"
                  value={addInitiative}
                  onChange={(e) => setAddInitiative(e.target.value)}
                  required
                />
                <input
                  className="combat-add-input"
                  type="number"
                  placeholder="HP Max"
                  value={addHpMax}
                  onChange={(e) => setAddHpMax(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <input
                className="combat-add-input"
                type="number"
                placeholder="HP Current (defaults to HP Max)"
                value={addHpCurrent}
                onChange={(e) => setAddHpCurrent(e.target.value)}
                min={0}
              />
              <label className="combat-add-checkbox">
                <input
                  type="checkbox"
                  checked={addIsPlayer}
                  onChange={(e) => setAddIsPlayer(e.target.checked)}
                />
                <span>Is Player Character</span>
              </label>
              <div className="combat-add-actions">
                <button type="submit" className="btn-primary btn-sm" disabled={addLoading}>
                  {addLoading ? '...' : 'Add'}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <style>{combatStyles}</style>
    </div>
  )
}

function CombatantRow({
  combatant,
  isActive,
  sessionId,
  isDM,
  onRemove,
}: {
  combatant: Combatant
  isActive: boolean
  sessionId: string | null
  isDM: boolean
  onRemove: (name: string) => void
}) {
  const hpPct = combatant.hp_max > 0 ? (combatant.hp_current / combatant.hp_max) * 100 : 0
  const hpClass = hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low'

  return (
    <div className={`combat-row ${isActive ? 'combat-row--active' : ''} ${combatant.is_player ? 'combat-row--player' : 'combat-row--enemy'}`}>
      <div className="combat-row-init">
        <span className="init-value">{combatant.initiative}</span>
      </div>
      <div className="combat-row-info">
        <div className="combat-row-name">
          {isActive && <span className="turn-arrow">▶ </span>}
          {combatant.name}
          {combatant.is_player && <span className="pc-badge">PC</span>}
        </div>
        {combatant.conditions.length > 0 && (
          <div className="combat-conditions">
            {combatant.conditions.map((cond) => (
              <span key={cond} className="condition-tag">{cond}</span>
            ))}
          </div>
        )}
      </div>
      <div className="combat-row-hp">
        <span className={`combat-hp-text hp-${hpClass}`}>
          {combatant.hp_current}/{combatant.hp_max}
        </span>
        <div className="combat-hp-bar">
          <div
            className={`combat-hp-fill hp-${hpClass}`}
            style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
          />
        </div>
      </div>
      {sessionId && isDM && (
        <button
          className="combat-remove-btn btn-ghost"
          onClick={() => onRemove(combatant.name)}
          title={`Remove ${combatant.name}`}
        >
          ✕
        </button>
      )}
    </div>
  )
}

const combatStyles = `
  .combat-tracker {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg-panel);
  }

  .combat-tracker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .combat-tracker-title {
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .combat-close-btn {
    padding: 2px 6px;
    font-size: var(--font-size-xs);
  }

  .combat-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--text-muted);
    text-align: center;
    flex: 1;
  }

  .combat-empty-state p {
    margin: 0;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .combat-empty-sub {
    font-size: var(--font-size-xs);
    font-style: italic;
  }

  .combat-controls {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .combat-control-error {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--accent-danger);
    background: rgba(140, 40, 40, 0.08);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .combat-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .combat-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-card);
    transition: all var(--transition);
  }

  .combat-row--active {
    border-color: var(--accent);
    background: rgba(196, 130, 10, 0.08);
    box-shadow: 0 0 6px rgba(196, 130, 10, 0.2);
  }

  .combat-row--player {
    border-left: 3px solid var(--accent-success);
  }

  .combat-row--enemy {
    border-left: 3px solid var(--accent-danger);
  }

  .combat-row-init {
    min-width: 28px;
    text-align: center;
    flex-shrink: 0;
  }

  .init-value {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .combat-row-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .combat-row-name {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .turn-arrow {
    color: var(--accent);
    font-size: var(--font-size-xs);
  }

  .pc-badge {
    font-size: 10px;
    padding: 1px 5px;
    background: rgba(45, 110, 45, 0.15);
    border: 1px solid var(--accent-success);
    border-radius: var(--radius-full);
    color: var(--accent-success);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .combat-conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .condition-tag {
    font-size: 10px;
    padding: 1px 5px;
    background: rgba(160, 100, 0, 0.15);
    border: 1px solid rgba(160, 100, 0, 0.4);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
  }

  .combat-row-hp {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
    min-width: 52px;
  }

  .combat-hp-text {
    font-size: var(--font-size-xs);
    font-weight: 700;
    font-family: var(--font-mono);
  }

  .combat-hp-text.hp-high { color: var(--hp-high); }
  .combat-hp-text.hp-mid  { color: var(--hp-mid); }
  .combat-hp-text.hp-low  { color: var(--hp-low); }

  .combat-hp-bar {
    width: 52px;
    height: 3px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .combat-hp-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .combat-hp-fill.hp-high { background: var(--hp-high); }
  .combat-hp-fill.hp-mid  { background: var(--hp-mid); }
  .combat-hp-fill.hp-low  { background: var(--hp-low); }

  .combat-remove-btn {
    padding: 1px 5px;
    font-size: var(--font-size-xs);
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity var(--transition);
  }

  .combat-remove-btn:hover {
    opacity: 1;
    color: var(--accent-danger);
  }

  .combat-add-section {
    border-top: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
    flex-shrink: 0;
  }

  .combat-add-toggle {
    width: 100%;
  }

  .combat-add-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .combat-add-form-title {
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .combat-add-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: var(--font-size-xs);
    box-sizing: border-box;
  }

  .combat-add-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .combat-add-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .combat-add-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .combat-add-actions {
    display: flex;
    gap: var(--space-2);
  }

  .combat-conditions-footer {
    border-top: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
    flex-shrink: 0;
  }

  .combat-conditions-toggle {
    width: 100%;
    font-size: var(--font-size-xs);
  }

  .combat-conditions-inline {
    flex: 0 0 auto;
    max-height: 300px;
    overflow: hidden;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
`
