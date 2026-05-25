import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Character } from '../types'

interface Props {
  campaignId: string
  onClose: () => void
  onCreated?: (char: Character) => void
}

const DEFAULT_STATS = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }
const STAT_KEYS: (keyof typeof DEFAULT_STATS)[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

const STAT_LABELS: Record<keyof typeof DEFAULT_STATS, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

function calcModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function computeSuggestedHP(conScore: number, level: number): number {
  const conMod = Math.floor((conScore - 10) / 2)
  // D&D 5e default: d8 hit die, average 5 per level after first
  return Math.max(1, 8 + conMod + (level - 1) * (5 + conMod))
}

/**
 * Modal form for creating a new character in a campaign.
 *
 * Collects player name, character name, race, class, level, the six D&D ability
 * scores (STR/DEX/CON/INT/WIS/CHA), max HP (auto-suggested from CON and level using
 * the D&D 5e d8 hit die formula), starting inventory, and free-form notes.
 * On submit the character is persisted via the API and the store is updated.
 *
 * @param campaignId - ID of the campaign to attach the new character to.
 * @param onClose - Called after a successful creation or when the user dismisses the modal.
 * @param onCreated - Optional callback receiving the newly created character.
 */
export function CharacterForm({ campaignId, onClose, onCreated }: Props) {
  const { createCharacter, settings } = useGameStore()

  const [playerName, setPlayerName] = useState(settings.playerName)
  const [charName, setCharName] = useState('')
  const [race, setRace] = useState('')
  const [className, setClassName] = useState('')
  const [level, setLevel] = useState(1)
  const [stats, setStats] = useState({ ...DEFAULT_STATS })
  const [hpMax, setHpMax] = useState<number>(computeSuggestedHP(10, 1))
  const [hpMaxManual, setHpMaxManual] = useState(false)
  const [inventoryText, setInventoryText] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleStatChange(stat: keyof typeof DEFAULT_STATS, value: string) {
    const parsed = parseInt(value, 10)
    const clamped = isNaN(parsed) ? 1 : Math.min(30, Math.max(1, parsed))
    const newStats = { ...stats, [stat]: clamped }
    setStats(newStats)
    if (!hpMaxManual) {
      setHpMax(computeSuggestedHP(newStats.CON, level))
    }
  }

  function handleLevelChange(value: string) {
    const parsed = parseInt(value, 10)
    const clamped = isNaN(parsed) ? 1 : Math.min(20, Math.max(1, parsed))
    setLevel(clamped)
    if (!hpMaxManual) {
      setHpMax(computeSuggestedHP(stats.CON, clamped))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!charName.trim()) {
      setError('Character name is required.')
      return
    }
    if (!playerName.trim()) {
      setError('Player name is required.')
      return
    }
    setLoading(true)
    setError(null)

    const inventory = inventoryText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      const character = await createCharacter(campaignId, {
        player_name: playerName.trim(),
        name: charName.trim(),
        race: race.trim() || 'Human',
        class_name: className.trim() || 'Adventurer',
        level,
        hp_current: hpMax,
        hp_max: hpMax,
        stats,
        inventory,
        conditions: [],
        notes: notes.trim(),
      })
      onCreated?.(character)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create character.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box char-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Character</h2>
          <button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cf-player-name">Player Name *</label>
              <input
                id="cf-player-name"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name..."
                maxLength={40}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="cf-char-name">Character Name *</label>
              <input
                id="cf-char-name"
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="Thorin Ironforge..."
                maxLength={60}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label htmlFor="cf-race">Race</label>
              <input
                id="cf-race"
                type="text"
                value={race}
                onChange={(e) => setRace(e.target.value)}
                placeholder="Human"
                maxLength={40}
              />
            </div>
            <div className="form-group">
              <label htmlFor="cf-class">Class</label>
              <input
                id="cf-class"
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Fighter"
                maxLength={40}
              />
            </div>
            <div className="form-group">
              <label htmlFor="cf-level">Level</label>
              <input
                id="cf-level"
                type="number"
                min={1}
                max={20}
                value={level}
                onChange={(e) => handleLevelChange(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Ability Scores</label>
            <div className="stats-grid">
              {STAT_KEYS.map((stat) => (
                <div key={stat} className="stat-input-group">
                  <span className="stat-name">{stat}</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={stats[stat]}
                    onChange={(e) => handleStatChange(stat, e.target.value)}
                    className="stat-input"
                    title={STAT_LABELS[stat]}
                  />
                  <span className="stat-mod">{calcModifier(stats[stat])}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="cf-hp">
              Max Hit Points
              {!hpMaxManual && (
                <span className="field-hint" style={{ display: 'inline', marginLeft: 8 }}>
                  (suggested based on CON)
                </span>
              )}
            </label>
            <input
              id="cf-hp"
              type="number"
              min={1}
              max={999}
              value={hpMax}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v)) {
                  setHpMax(Math.max(1, v))
                  setHpMaxManual(true)
                }
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="cf-inventory">Starting Inventory</label>
            <input
              id="cf-inventory"
              type="text"
              value={inventoryText}
              onChange={(e) => setInventoryText(e.target.value)}
              placeholder="Longsword, Shield, Backpack, 10 gold..."
            />
            <p className="field-hint">Separate items with commas.</p>
          </div>

          <div className="form-group">
            <label htmlFor="cf-notes">Character Notes</label>
            <textarea
              id="cf-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Backstory, personality traits, special abilities..."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !charName.trim() || !playerName.trim()}
            >
              {loading ? 'Creating...' : 'Create Character'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .char-form-modal {
          max-width: 640px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: var(--space-2);
        }

        .stat-input-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          text-align: center;
        }

        .stat-name {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .stat-input {
          width: 100%;
          text-align: center;
          padding: var(--space-2);
          font-size: var(--font-size-base);
          font-weight: 600;
        }

        .stat-mod {
          font-size: var(--font-size-sm);
          color: var(--accent);
          font-weight: 700;
          min-height: 1.2em;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          margin-top: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border);
        }

        .field-hint {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          margin-top: var(--space-1);
          font-style: italic;
        }

        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
