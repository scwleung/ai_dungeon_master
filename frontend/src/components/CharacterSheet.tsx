import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Character } from '../types'

interface Props {
  character: Character
  onUpdate: (id: string, updates: Partial<Character>) => void
}

const STAT_KEYS: (keyof Character['stats'])[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

function calcModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="cs-section">
      <div className="collapsible-header" onClick={() => setOpen((v) => !v)}>
        <h4>{title}</h4>
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>▾</span>
      </div>
      {open && <div className="cs-section-body">{children}</div>}
    </div>
  )
}

/**
 * Collapsible character sheet panel rendered in the session sidebar.
 *
 * Displays the character's HP bar with quick-increment buttons (±1, ±5, full heal),
 * inline HP editing, ability score grid with computed modifiers, active conditions,
 * inventory list, and free-form notes. Every edit is optimistically applied to the
 * store and then persisted to the backend via a fire-and-forget API call.
 *
 * @param character - The character record to display and edit.
 * @param onUpdate - Callback invoked with the character ID and a partial update object
 *                   whenever the user makes a change; typically wraps `updateCharacter`
 *                   from the Zustand store.
 */
export function CharacterSheet({ character, onUpdate }: Props) {
  const { updateCharacter } = useGameStore()
  const [newItem, setNewItem] = useState('')
  const [newCondition, setNewCondition] = useState('')
  const [editingHp, setEditingHp] = useState(false)
  const [hpDraft, setHpDraft] = useState(character.hp_current)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(character.notes)

  const hpPct =
    character.hp_max > 0 ? (character.hp_current / character.hp_max) * 100 : 0
  const hpClass = hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low'

  function update(updates: Partial<Character>) {
    onUpdate(character.id, updates)
    updateCharacter(character.id, updates)
  }

  function handleHpSave() {
    const clamped = Math.max(0, Math.min(character.hp_max, hpDraft))
    update({ hp_current: clamped })
    setEditingHp(false)
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const item = newItem.trim()
    if (!item) return
    update({ inventory: [...character.inventory, item] })
    setNewItem('')
  }

  function handleRemoveItem(idx: number) {
    const next = character.inventory.filter((_, i) => i !== idx)
    update({ inventory: next })
  }

  function handleAddCondition(e: React.FormEvent) {
    e.preventDefault()
    const cond = newCondition.trim()
    if (!cond) return
    update({ conditions: [...character.conditions, cond] })
    setNewCondition('')
  }

  function handleRemoveCondition(idx: number) {
    const next = character.conditions.filter((_, i) => i !== idx)
    update({ conditions: next })
  }

  function handleNotesSave() {
    update({ notes: notesDraft })
    setEditingNotes(false)
  }

  return (
    <div className="character-sheet">
      {/* Header */}
      <div className="cs-header">
        <div className="cs-name-row">
          <span className="cs-char-name">{character.name}</span>
          <span className="cs-level-badge">Lv {character.level}</span>
        </div>
        <div className="cs-class-row">
          {character.race} {character.class_name}
          <span className="cs-player"> — {character.player_name}</span>
        </div>

        {/* HP */}
        <div className="cs-hp-section">
          <div className="cs-hp-label">
            <span>HP</span>
            {editingHp ? (
              <div className="hp-edit-row">
                <input
                  type="number"
                  min={0}
                  max={character.hp_max}
                  value={hpDraft}
                  onChange={(e) => setHpDraft(parseInt(e.target.value, 10) || 0)}
                  className="hp-edit-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleHpSave()
                    if (e.key === 'Escape') setEditingHp(false)
                  }}
                  autoFocus
                />
                <button className="btn-success btn-sm" onClick={handleHpSave}>✓</button>
                <button className="btn-ghost btn-sm" onClick={() => setEditingHp(false)}>✕</button>
              </div>
            ) : (
              <button
                className="hp-value btn-ghost"
                onClick={() => {
                  setHpDraft(character.hp_current)
                  setEditingHp(true)
                }}
                title="Click to edit HP"
              >
                <span className={`hp-current hp-${hpClass}`}>{character.hp_current}</span>
                <span className="hp-sep">/</span>
                <span className="hp-max">{character.hp_max}</span>
              </button>
            )}
          </div>
          <div className="hp-bar-wrapper">
            <div
              className={`hp-bar-fill ${hpClass}`}
              style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
            />
          </div>
          <div className="hp-quick-btns">
            <button
              className="btn-danger btn-sm"
              onClick={() => update({ hp_current: Math.max(0, character.hp_current - 1) })}
              title="Take 1 damage"
            >
              −1
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => update({ hp_current: Math.max(0, character.hp_current - 5) })}
              title="Take 5 damage"
            >
              −5
            </button>
            <button
              className="btn-success btn-sm"
              onClick={() => update({ hp_current: Math.min(character.hp_max, character.hp_current + 1) })}
              title="Heal 1"
            >
              +1
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => update({ hp_current: Math.min(character.hp_max, character.hp_current + 5) })}
              title="Heal 5"
            >
              +5
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => update({ hp_current: character.hp_max })}
              title="Full heal"
            >
              ♥
            </button>
          </div>
        </div>
      </div>

      <div className="cs-body">
        {/* Ability Scores */}
        <Section title="Ability Scores">
          <div className="cs-stats-grid">
            {STAT_KEYS.map((stat) => {
              const score = character.stats[stat]
              const mod = calcModifier(score)
              return (
                <div key={stat} className="cs-stat">
                  <div className="cs-stat-score">{score}</div>
                  <div className="cs-stat-mod">{mod}</div>
                  <div className="cs-stat-name">{stat}</div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Conditions */}
        <Section title="Conditions" defaultOpen={true}>
          {character.conditions.length === 0 ? (
            <p className="cs-empty">No active conditions.</p>
          ) : (
            <div className="conditions-list">
              {character.conditions.map((cond, i) => (
                <span key={i} className="condition-badge">
                  {cond}
                  <button
                    className="condition-remove"
                    onClick={() => handleRemoveCondition(i)}
                    title={`Remove ${cond}`}
                    aria-label={`Remove condition ${cond}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={handleAddCondition} className="add-row">
            <input
              type="text"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              placeholder="Add condition..."
              className="add-input"
              maxLength={30}
            />
            <button type="submit" className="btn-ghost btn-sm" disabled={!newCondition.trim()}>
              +
            </button>
          </form>
        </Section>

        {/* Inventory */}
        <Section title="Inventory" defaultOpen={false}>
          {character.inventory.length === 0 ? (
            <p className="cs-empty">Empty-handed.</p>
          ) : (
            <ul className="inventory-list">
              {character.inventory.map((item, i) => (
                <li key={i} className="inventory-item">
                  <span className="item-name">{item}</span>
                  <button
                    className="item-remove"
                    onClick={() => handleRemoveItem(i)}
                    title={`Remove ${item}`}
                    aria-label={`Remove ${item}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddItem} className="add-row">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add item..."
              className="add-input"
              maxLength={60}
            />
            <button type="submit" className="btn-ghost btn-sm" disabled={!newItem.trim()}>
              +
            </button>
          </form>
        </Section>

        {/* Spell Slots */}
        {character.spell_slots && Object.keys(character.spell_slots).length > 0 && (
          <Section title="Spell Slots" defaultOpen={true}>
            <div className="pips-section">
              {Object.keys(character.spell_slots)
                .sort((a, b) => Number(a) - Number(b))
                .map((level) => {
                  const slot = character.spell_slots![level]
                  return (
                    <div key={level} className="pip-row">
                      <span className="pip-label">Level {level}</span>
                      <div className="pip-track">
                        {Array.from({ length: slot.max }).map((_, i) => {
                          const filled = i < slot.max - slot.used
                          return (
                            <button
                              key={i}
                              className={`pip ${filled ? 'pip-filled' : 'pip-empty'}`}
                              title={filled ? 'Click to spend slot' : 'Click to recover slot'}
                              onClick={() => {
                                const newUsed = filled
                                  ? Math.min(slot.max, slot.used + 1)
                                  : Math.max(0, slot.used - 1)
                                update({
                                  spell_slots: {
                                    ...character.spell_slots,
                                    [level]: { ...slot, used: newUsed },
                                  },
                                })
                              }}
                            />
                          )
                        })}
                      </div>
                      <span className="pip-count">
                        {slot.max - slot.used}/{slot.max}
                      </span>
                    </div>
                  )
                })}
            </div>
          </Section>
        )}

        {/* Resources */}
        {character.resources && Object.keys(character.resources).length > 0 && (
          <Section title="Resources" defaultOpen={true}>
            <div className="pips-section">
              {Object.entries(character.resources).map(([key, res]) => (
                <div key={key} className="pip-row">
                  <span className="pip-label">{res.label}</span>
                  <div className="pip-track">
                    {Array.from({ length: res.max }).map((_, i) => {
                      const filled = i < res.max - res.used
                      return (
                        <button
                          key={i}
                          className={`pip ${filled ? 'pip-filled' : 'pip-empty'}`}
                          title={filled ? 'Click to spend' : 'Click to recover'}
                          onClick={() => {
                            const newUsed = filled
                              ? Math.min(res.max, res.used + 1)
                              : Math.max(0, res.used - 1)
                            update({
                              resources: {
                                ...character.resources,
                                [key]: { ...res, used: newUsed },
                              },
                            })
                          }}
                        />
                      )
                    })}
                  </div>
                  <span className="pip-count">
                    {res.max - res.used}/{res.max}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Notes */}
        <Section title="Notes" defaultOpen={false}>
          {editingNotes ? (
            <>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={5}
                className="notes-textarea"
                autoFocus
              />
              <div className="notes-actions">
                <button className="btn-ghost btn-sm" onClick={() => setEditingNotes(false)}>
                  Cancel
                </button>
                <button className="btn-success btn-sm" onClick={handleNotesSave}>
                  Save
                </button>
              </div>
            </>
          ) : (
            <div
              className="notes-display"
              onClick={() => {
                setNotesDraft(character.notes)
                setEditingNotes(true)
              }}
              title="Click to edit notes"
            >
              {character.notes ? (
                <p className="notes-text">{character.notes}</p>
              ) : (
                <p className="cs-empty notes-placeholder">Click to add notes...</p>
              )}
            </div>
          )}
        </Section>
      </div>

      <style>{`
        .character-sheet {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-panel);
          border-left: 1px solid var(--border);
        }

        .cs-header {
          padding: var(--space-4);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .cs-name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          margin-bottom: 4px;
        }

        .cs-char-name {
          font-size: var(--font-size-lg);
          font-weight: 700;
          color: var(--text-primary);
        }

        .cs-level-badge {
          font-size: var(--font-size-xs);
          font-weight: 700;
          color: var(--accent);
          border: 1px solid var(--accent);
          padding: 1px 6px;
          border-radius: var(--radius-full);
        }

        .cs-class-row {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          margin-bottom: var(--space-3);
          font-style: italic;
        }

        .cs-player {
          color: var(--text-muted);
        }

        .cs-hp-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .cs-hp-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }

        .hp-value {
          display: flex;
          align-items: baseline;
          gap: 3px;
          cursor: pointer;
          padding: 0;
          border: none;
          background: transparent;
          font-size: inherit;
        }

        .hp-value:hover {
          background: transparent;
          border: none;
        }

        .hp-current {
          font-size: var(--font-size-xl);
          font-weight: 700;
          font-family: var(--font-mono);
          line-height: 1;
          transition: color var(--transition);
        }

        .hp-current.hp-high { color: var(--hp-high); }
        .hp-current.hp-mid  { color: var(--hp-mid); }
        .hp-current.hp-low  { color: var(--hp-low); }

        .hp-sep {
          color: var(--text-muted);
          font-size: var(--font-size-base);
        }

        .hp-max {
          color: var(--text-secondary);
          font-size: var(--font-size-base);
          font-family: var(--font-mono);
        }

        .hp-edit-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }

        .hp-edit-input {
          width: 70px;
          text-align: center;
          padding: 2px 6px;
          font-size: var(--font-size-lg);
          font-family: var(--font-mono);
        }

        .hp-quick-btns {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .hp-quick-btns button {
          flex: 1;
          min-width: 0;
          padding: 2px 4px;
          font-size: var(--font-size-xs);
        }

        .cs-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2) 0;
        }

        .cs-section {
          border-bottom: 1px solid var(--border);
        }

        .cs-section .collapsible-header {
          padding: var(--space-3) var(--space-4);
        }

        .cs-section-body {
          padding: 0 var(--space-4) var(--space-3);
        }

        .cs-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-2);
        }

        .cs-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-2);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          gap: 2px;
        }

        .cs-stat-score {
          font-size: var(--font-size-xl);
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
          line-height: 1;
        }

        .cs-stat-mod {
          font-size: var(--font-size-sm);
          color: var(--accent);
          font-weight: 700;
        }

        .cs-stat-name {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
        }

        .cs-empty {
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          font-style: italic;
          margin-bottom: var(--space-2);
        }

        .conditions-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
          margin-bottom: var(--space-2);
        }

        .condition-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: rgba(139, 32, 32, 0.15);
          border: 1px solid var(--accent-danger);
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          color: #e07070;
        }

        .condition-remove {
          background: transparent;
          border: none;
          color: currentColor;
          cursor: pointer;
          padding: 0;
          font-size: 0.9em;
          line-height: 1;
          opacity: 0.6;
          text-transform: none;
          letter-spacing: 0;
          min-width: unset;
          border-radius: 50%;
        }

        .condition-remove:hover {
          opacity: 1;
          background: transparent;
          border-color: transparent;
        }

        .add-row {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }

        .add-input {
          flex: 1;
          font-size: var(--font-size-sm);
          padding: var(--space-1) var(--space-2);
        }

        .inventory-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: var(--space-2);
          max-height: 200px;
          overflow-y: auto;
        }

        .inventory-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          padding: 3px var(--space-2);
          border-radius: var(--radius);
          transition: background var(--transition);
        }

        .inventory-item:hover {
          background: var(--bg-secondary);
        }

        .item-name {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          flex: 1;
        }

        .item-remove {
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

        .inventory-item:hover .item-remove {
          opacity: 1;
        }

        .item-remove:hover {
          color: var(--accent-danger);
          background: transparent;
          border-color: transparent;
        }

        .notes-display {
          cursor: pointer;
          padding: var(--space-2);
          border-radius: var(--radius);
          min-height: 60px;
          transition: background var(--transition);
          border: 1px dashed transparent;
        }

        .notes-display:hover {
          background: var(--bg-primary);
          border-color: var(--border);
        }

        .notes-text {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
          margin-bottom: 0;
        }

        .notes-placeholder {
          margin-bottom: 0;
        }

        .notes-textarea {
          font-size: var(--font-size-sm);
          min-height: 100px;
        }

        .notes-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }

        .pips-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .pip-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .pip-label {
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          min-width: 56px;
          flex-shrink: 0;
        }

        .pip-track {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          flex: 1;
        }

        .pip {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid var(--border);
          cursor: pointer;
          padding: 0;
          min-width: unset;
          transition: background var(--transition), border-color var(--transition);
        }

        .pip-filled {
          background: var(--accent);
          border-color: var(--accent);
        }

        .pip-empty {
          background: var(--bg-primary);
          border-color: var(--border);
        }

        .pip:hover {
          border-color: var(--accent);
        }

        .pip-count {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-family: var(--font-mono);
          min-width: 28px;
          text-align: right;
        }
      `}</style>
    </div>
  )
}
