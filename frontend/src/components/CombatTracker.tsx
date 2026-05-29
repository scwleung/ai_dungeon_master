import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { Combatant } from '../types'
import { ConditionReference } from './ConditionReference'

const STAT_BLOCKS: Record<string, { ac: number; speed: string; cr: string; abilities: string }> = {
  'Goblin': { ac: 15, speed: '30 ft.', cr: '1/4', abilities: 'Nimble Escape, Scimitar +4 (2d6+2)' },
  'Orc': { ac: 13, speed: '30 ft.', cr: '1/2', abilities: 'Aggressive, Greataxe +5 (1d12+3)' },
  'Skeleton': { ac: 13, speed: '30 ft.', cr: '1/4', abilities: 'Shortsword +4 (1d6+2), Shortbow +4 (1d6+2)' },
  'Zombie': { ac: 8, speed: '20 ft.', cr: '1/4', abilities: 'Undead Fortitude, Slam +3 (1d6+1)' },
  'Wolf': { ac: 13, speed: '40 ft.', cr: '1/4', abilities: 'Pack Tactics, Bite +4 (2d4+2) + Prone DC 11' },
  'Bandit': { ac: 12, speed: '30 ft.', cr: '1/8', abilities: 'Scimitar +3 (1d6+1), Crossbow +3 (1d6+1)' },
  'Guard': { ac: 16, speed: '30 ft.', cr: '1/8', abilities: 'Spear +3 (1d6+1)' },
  'Giant Spider': { ac: 14, speed: '30 ft., climb 30 ft.', cr: '1', abilities: 'Web Sense, Bite +5 (1d8+3) + Poison DC 11' },
  'Ogre': { ac: 11, speed: '40 ft.', cr: '2', abilities: 'Greatclub +6 (2d8+4), Javelin +6 (2d6+4)' },
  'Troll': { ac: 15, speed: '30 ft.', cr: '5', abilities: 'Regeneration 10 HP/turn, Multiattack, Claw +7 (2d6+4)' },
}

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
export function CombatTracker({
  onClose,
  isDM,
  onUseReaction,
  onResetReactions,
  onLegendaryAction,
}: {
  onClose: () => void
  isDM: boolean
  onUseReaction?: (name: string) => void
  onResetReactions?: () => void
  onLegendaryAction?: (name: string, delta: number) => void
}) {
  const { combatActive, combatRound, combatTurnIndex, combatants, activeSession } = useGameStore(
    useShallow(s => ({ combatActive: s.combatActive, combatRound: s.combatRound, combatTurnIndex: s.combatTurnIndex, combatants: s.combatants, activeSession: s.activeSession }))
  )
  const sessionId = activeSession?.id ?? null

  const [turnDuration, setTurnDuration] = useState(60)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!combatActive) {
      setTimeLeft(null)
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(turnDuration)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [combatTurnIndex, combatActive, turnDuration])

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
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              if (!sessionId) return
              try { await api.combat.rollInitiative(sessionId) } catch (e) { console.error(e) }
            }}
            aria-label="Roll initiative for all combatants"
          >🎲 Roll Initiative</button>
          {onResetReactions && (
            <button
              className="btn-ghost btn-sm"
              onClick={onResetReactions}
              title="Reset all reactions"
              aria-label="Reset all reactions"
            >⚡ Reset Reactions</button>
          )}
        </div>
      )}

      {controlError && (
        <div className="combat-control-error">{controlError}</div>
      )}

      {combatActive && timeLeft !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.25rem 0.5rem', marginBottom: '0.5rem',
          background: timeLeft <= 10 ? 'rgba(231, 76, 60, 0.2)' : 'transparent',
          border: timeLeft <= 10 ? '1px solid #e74c3c' : '1px solid transparent',
          borderRadius: 4, transition: 'all 0.3s',
        }}>
          <span style={{ fontSize: '0.8rem', color: timeLeft <= 10 ? '#e74c3c' : 'var(--color-muted)' }}>
            ⏱ {timeLeft}s
          </span>
          <input
            type="number" min={10} max={300} value={turnDuration}
            onChange={e => setTurnDuration(Number(e.target.value))}
            style={{ width: 48, fontSize: '0.75rem', padding: '0.1rem 0.25rem',
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 3, color: 'var(--color-text)' }}
            title="Seconds per turn"
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>s/turn</span>
          <button
            onClick={() => setTimeLeft(turnDuration)}
            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem',
              background: 'none', border: '1px solid var(--color-border)',
              borderRadius: 3, cursor: 'pointer', color: 'var(--color-muted)' }}
          >↺</button>
        </div>
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
            onUseReaction={onUseReaction}
            onLegendaryAction={onLegendaryAction}
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
  onUseReaction,
  onLegendaryAction,
}: {
  combatant: Combatant
  isActive: boolean
  sessionId: string | null
  isDM: boolean
  onRemove: (name: string) => void
  onUseReaction?: (name: string) => void
  onLegendaryAction?: (name: string, delta: number) => void
}) {
  const hpPct = combatant.hp_max > 0 ? (combatant.hp_current / combatant.hp_max) * 100 : 0
  const hpClass = hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low'
  const [editingHP, setEditingHP] = useState<{ name: string; delta: string } | null>(null)
  const [showStatBlock, setShowStatBlock] = useState(false)
  const statBlock = STAT_BLOCKS[combatant.name] ?? null

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
          {statBlock && (
            <button
              onClick={() => setShowStatBlock(v => !v)}
              style={{ marginLeft: 4, fontSize: '0.65rem', padding: '0 3px', background: 'none', border: '1px solid var(--color-border,#333)', borderRadius: 3, cursor: 'pointer', color: 'var(--color-muted,#888)' }}
              aria-label={`Show stat block for ${combatant.name}`}
            >ℹ</button>
          )}
          {onUseReaction && isDM && (
            <button
              onClick={() => !combatant.reaction_used && onUseReaction(combatant.name)}
              title={combatant.reaction_used ? 'Reaction used' : 'Use reaction'}
              aria-label={`${combatant.reaction_used ? 'Reaction used' : 'Use reaction'} for ${combatant.name}`}
              style={{ marginLeft: 4, fontSize: '0.65rem', padding: '0 3px', background: 'none', border: '1px solid var(--color-border,#333)', borderRadius: 3, cursor: combatant.reaction_used ? 'default' : 'pointer', color: combatant.reaction_used ? 'var(--color-muted,#888)' : 'var(--color-accent,#c4820a)', opacity: combatant.reaction_used ? 0.4 : 1 }}
            >⚡</button>
          )}
        </div>
        {showStatBlock && statBlock && (
          <div style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', background: 'var(--color-bg,#0d0d1a)', border: '1px solid var(--color-accent,#c4820a)', borderRadius: 4, margin: '0.2rem 0', color: 'var(--color-text,#e0d6c8)' }}>
            <strong>AC</strong> {statBlock.ac} · <strong>Speed</strong> {statBlock.speed} · <strong>CR</strong> {statBlock.cr}<br/>
            <span style={{ color: 'var(--color-muted,#aaa)' }}>{statBlock.abilities}</span>
          </div>
        )}
        {combatant.conditions.length > 0 && (
          <div className="combat-conditions">
            {combatant.conditions.map((cond, i) => {
              const name = typeof cond === 'string' ? cond : cond.name
              const dur = typeof cond === 'string' ? null : cond.duration
              return (
                <span
                  key={`${name}-${i}`}
                  className="condition-tag"
                  title={dur !== null ? `${dur} turn(s) remaining` : ''}
                >
                  {name}{dur !== null ? ` (${dur})` : ''}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <div className="combat-row-hp">
        <span
          onClick={() => setEditingHP({ name: combatant.name, delta: '' })}
          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
          title="Click to adjust HP"
          className={`combat-hp-text hp-${hpClass}`}
        >
          {combatant.hp_current}/{combatant.hp_max}
        </span>
        {editingHP?.name === combatant.name && (
          <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', marginLeft: '0.25rem' }}>
            <input
              type="number"
              value={editingHP.delta}
              onChange={e => setEditingHP({ name: combatant.name, delta: e.target.value })}
              placeholder="±HP"
              style={{ width: 52, fontSize: '0.75rem', padding: '0.1rem 0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-accent)', borderRadius: 3, color: 'var(--color-text)' }}
              autoFocus
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  const delta = parseInt(editingHP.delta)
                  if (!isNaN(delta) && sessionId) {
                    await api.combat.updateCombatantHP(sessionId, combatant.name, delta)
                  }
                  setEditingHP(null)
                }
                if (e.key === 'Escape') setEditingHP(null)
              }}
            />
            <button onClick={async () => {
              const delta = parseInt(editingHP.delta)
              if (!isNaN(delta) && sessionId) {
                await api.combat.updateCombatantHP(sessionId, combatant.name, delta)
              }
              setEditingHP(null)
            }} style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', background: 'var(--color-accent)', border: 'none', borderRadius: 3, cursor: 'pointer', color: 'var(--color-bg)' }}>✓</button>
            <button onClick={() => setEditingHP(null)} style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 3, cursor: 'pointer', color: 'var(--color-muted)' }}>✕</button>
          </span>
        )}
        <div className="combat-hp-bar">
          <div
            className={`combat-hp-fill hp-${hpClass}`}
            style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
          />
        </div>
        {(combatant.legendary_actions_max ?? 0) > 0 && onLegendaryAction && (
          <div style={{ fontSize: '0.72rem', marginTop: '0.2rem', color: 'var(--color-accent,#c4820a)' }}>
            {'◆'.repeat(combatant.legendary_actions_remaining ?? 0)}{'◇'.repeat((combatant.legendary_actions_max ?? 0) - (combatant.legendary_actions_remaining ?? 0))}
            {isDM && (
              <button
                onClick={() => onLegendaryAction(combatant.name, (combatant.legendary_actions_max ?? 0) - (combatant.legendary_actions_remaining ?? 0))}
                style={{ marginLeft: 4, fontSize: '0.65rem', padding: '0 3px', background: 'none', border: '1px solid var(--color-border,#333)', borderRadius: 3, cursor: 'pointer', color: 'var(--color-muted,#888)' }}
                aria-label={`Reset legendary actions for ${combatant.name}`}
              >↺</button>
            )}
          </div>
        )}
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
