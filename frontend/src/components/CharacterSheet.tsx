import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { Character } from '../types'
import LevelUpWizard from './LevelUpWizard'
import { FeatureTracker } from './FeatureTracker'

interface LocalCombatStats {
  ac: number
  speed: number
  initiative_bonus: number
}

function loadCombatStats(characterId: string, dexMod: number): LocalCombatStats {
  try {
    const raw = localStorage.getItem(`char-stats-${characterId}`)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalCombatStats>
      return {
        ac: parsed.ac ?? 10,
        speed: parsed.speed ?? 30,
        initiative_bonus: parsed.initiative_bonus ?? dexMod,
      }
    }
  } catch { /* ignore */ }
  return { ac: 10, speed: 30, initiative_bonus: dexMod }
}

function saveCombatStats(characterId: string, stats: LocalCombatStats): void {
  try {
    localStorage.setItem(`char-stats-${characterId}`, JSON.stringify(stats))
  } catch { /* ignore */ }
}

interface Props {
  character: Character
  onUpdate: (id: string, updates: Partial<Character>) => void
  onSendAction?: (text: string) => void
  onRollSkill?: (skill: string, modifier: number) => void
  isGameMaster?: boolean
  onSendFeatureUse?: (characterId: string, featureId: string, delta: number) => void
}

function proficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2
}

const HIT_DIE: Record<string, number> = {
  barbarian: 12, fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
}
function getHitDie(cls: string) { return HIT_DIE[cls.toLowerCase()] ?? 8 }

const XP_TO_NEXT: Record<number, number> = {
  1: 300, 2: 900, 3: 2700, 4: 6500, 5: 14000, 6: 23000, 7: 34000,
  8: 48000, 9: 64000, 10: 85000, 11: 100000, 12: 120000, 13: 140000,
  14: 165000, 15: 195000, 16: 225000, 17: 265000, 18: 305000, 19: 355000,
}

// D&D 5e XP thresholds for levels 1–20 (index = level - 1)
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

function getLevel(xp: number): number {
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

const STAT_KEYS: (keyof Character['stats'])[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

function calcModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function abilityMod(score: number): number { return Math.floor((score - 10) / 2) }

const SKILLS = [
  { name: 'Acrobatics', ability: 'DEX' }, { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' }, { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' }, { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' }, { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' }, { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' }, { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' }, { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' }, { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' }, { name: 'Survival', ability: 'WIS' },
] as const

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
 * @param onSendAction - Optional callback to send a player action text to the DM.
 */
export function CharacterSheet({ character, onUpdate, onSendAction, onRollSkill, isGameMaster, onSendFeatureUse }: Props) {
  const { updateCharacter, settings, addToast } = useGameStore()
  const isOwner = isGameMaster || character.player_name === settings.playerName
  const [newItem, setNewItem] = useState('')
  const [newCondition, setNewCondition] = useState('')
  const [editingHp, setEditingHp] = useState(false)
  const [hpDraft, setHpDraft] = useState(character.hp_current)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(character.notes)
  const [levelUpAlert, setLevelUpAlert] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const prevXpRef = useRef(character.xp ?? 0)
  const [newSpellName, setNewSpellName] = useState('')
  const [newSpellLevel, setNewSpellLevel] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [auditLog, setAuditLog] = useState<Array<{ timestamp: string; change: string }>>(character.audit_log ?? [])
  const [activeTab, setActiveTab] = useState<'main' | 'features' | 'traits'>('main')
  const importFileRef = useRef<HTMLInputElement>(null)

  // Local combat stats (AC, Speed, Initiative) persisted to localStorage
  const dexMod = Math.floor(((character.stats?.DEX ?? 10) - 10) / 2)
  const [combatStats, setCombatStats] = useState<LocalCombatStats>(() =>
    loadCombatStats(character.id, dexMod)
  )

  function handleCombatStatChange(field: keyof LocalCombatStats, value: number) {
    const next = { ...combatStats, [field]: value }
    setCombatStats(next)
    saveCombatStats(character.id, next)
  }

  // Detect level-up when XP changes
  useEffect(() => {
    const prevXp = prevXpRef.current
    const currXp = character.xp ?? 0
    if (currXp > prevXp) {
      const prevLevel = getLevel(prevXp)
      const currLevel = getLevel(currXp)
      if (currLevel > prevLevel) {
        setLevelUpAlert(true)
        const t = setTimeout(() => setLevelUpAlert(false), 4000)
        prevXpRef.current = currXp
        return () => clearTimeout(t)
      }
    }
    prevXpRef.current = currXp
  }, [character.xp])

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

  function handleExportCharacter() {
    const exportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      character: character,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${character.name.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    importFileRef.current?.click()
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result
        if (typeof text !== 'string') throw new Error('Could not read file')
        const parsed = JSON.parse(text) as { character?: Partial<Character> }
        if (!parsed.character) throw new Error('Invalid export file: missing "character" key')
        const { id: _id, campaign_id: _cid, ...fields } = parsed.character as Character
        onUpdate(character.id, fields)
        updateCharacter(character.id, fields)
        addToast('Character imported successfully', 'success')
      } catch (err) {
        addToast(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
      }
      // Reset the input so the same file can be re-imported
      if (importFileRef.current) importFileRef.current.value = ''
    }
    reader.readAsText(file)
  }

  // XP calculations
  const xp = character.xp ?? 0
  const xpLevel = getLevel(xp)
  const xpLevelIdx = Math.min(xpLevel - 1, 19)
  const xpNextIdx = Math.min(xpLevel, 19)
  const xpForCurrentLevel = XP_THRESHOLDS[xpLevelIdx]
  const xpForNextLevel = xpLevel < 20 ? XP_THRESHOLDS[xpNextIdx] : null
  const xpProgress =
    xpForNextLevel !== null && xpForNextLevel > xpForCurrentLevel
      ? ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100
      : 100

  return (
    <div className="character-sheet">
      {/* Level Up Alert */}
      {levelUpAlert && (
        <div className="cs-levelup-alert">
          ⬆ Level Up! You&apos;ve reached level {xpLevel}.
        </div>
      )}

      {/* Header */}
      <div className="cs-header">
        <div className="cs-name-row">
          <span className="cs-char-name">{character.name}</span>
          <span className="cs-level-badge">Lv {character.level}</span>
          <button
            onClick={() => update({ inspiration: !character.inspiration })}
            style={{
              padding: '0.15rem 0.5rem',
              fontSize: '0.7rem',
              borderRadius: 4,
              border: '1px solid var(--color-accent)',
              background: character.inspiration ? 'var(--color-accent)' : 'transparent',
              color: character.inspiration ? 'var(--color-bg)' : 'var(--color-accent)',
              cursor: 'pointer',
            }}
            title="Toggle Inspiration"
          >✦ Inspired</button>
        </div>
        <div className="cs-class-row">
          {character.race} {character.class_name}
          <span className="cs-player"> — {character.player_name}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-accent)', marginLeft: '0.5rem' }}>
            Prof +{proficiencyBonus(character.level)}
          </span>
        </div>

        {/* AC / Speed / Initiative row */}
        <div className="cs-combat-stats-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <label className="cs-combat-stat-label" title="Armor Class">
            <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>AC</span>
            <input
              type="number"
              min={0}
              max={30}
              value={combatStats.ac}
              onChange={e => handleCombatStatChange('ac', parseInt(e.target.value) || 0)}
              onBlur={e => handleCombatStatChange('ac', parseInt(e.target.value) || 0)}
              style={{ width: 44, textAlign: 'center', fontSize: '0.8rem', padding: '0.1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', marginLeft: '0.25rem' }}
            />
          </label>
          <label className="cs-combat-stat-label" title="Speed">
            <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Speed</span>
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={combatStats.speed}
              onChange={e => handleCombatStatChange('speed', parseInt(e.target.value) || 0)}
              onBlur={e => handleCombatStatChange('speed', parseInt(e.target.value) || 0)}
              style={{ width: 44, textAlign: 'center', fontSize: '0.8rem', padding: '0.1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', marginLeft: '0.25rem' }}
            />
            <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginLeft: '0.1rem' }}>ft.</span>
          </label>
          <label className="cs-combat-stat-label" title="Initiative Bonus">
            <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Initiative</span>
            <input
              type="number"
              min={-10}
              max={20}
              value={combatStats.initiative_bonus}
              onChange={e => handleCombatStatChange('initiative_bonus', parseInt(e.target.value) || 0)}
              onBlur={e => handleCombatStatChange('initiative_bonus', parseInt(e.target.value) || 0)}
              style={{ width: 44, textAlign: 'center', fontSize: '0.8rem', padding: '0.1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', marginLeft: '0.25rem' }}
            />
          </label>
        </div>

        {/* Export / Import buttons (owner only) */}
        {isOwner && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            <button
              onClick={handleExportCharacter}
              className="btn-ghost btn-sm"
              title="Export character as JSON"
              style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
            >⬇ Export</button>
            <button
              onClick={handleImportClick}
              className="btn-ghost btn-sm"
              title="Import character from JSON"
              style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
            >⬆ Import</button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        )}

        {/* Saving Throws */}
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginBottom: '0.2rem' }}>Saving Throws</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {(['STR','DEX','CON','INT','WIS','CHA'] as const).map(attr => {
              const mod = Math.floor(((character.stats[attr] ?? 10) - 10) / 2)
              return (
                <span key={attr} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4 }}>
                  {attr} {mod >= 0 ? '+' : ''}{mod}
                </span>
              )
            })}
          </div>
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

        {/* Death Saves */}
        {character.hp_current === 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Death Saves</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem' }}>✓</span>
              {[0, 1, 2].map(i => (
                <button
                  key={i}
                  onClick={() => {
                    const ds = character.death_saves ?? { successes: 0, failures: 0 }
                    const newSuccesses = i < ds.successes ? i : Math.min(3, ds.successes + 1)
                    update({ death_saves: { ...ds, successes: newSuccesses } })
                  }}
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '1px solid var(--color-accent)',
                    background: i < (character.death_saves?.successes ?? 0) ? 'var(--color-accent)' : 'transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={`Success ${i + 1}`}
                />
              ))}
              <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>✗</span>
              {[0, 1, 2].map(i => (
                <button
                  key={i}
                  onClick={() => {
                    const ds = character.death_saves ?? { successes: 0, failures: 0 }
                    const newFailures = i < ds.failures ? i : Math.min(3, ds.failures + 1)
                    update({ death_saves: { ...ds, failures: newFailures } })
                  }}
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '1px solid #e74c3c',
                    background: i < (character.death_saves?.failures ?? 0) ? '#e74c3c' : 'transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={`Failure ${i + 1}`}
                />
              ))}
            </div>
            {(character.death_saves?.successes ?? 0) >= 3 && (
              <div style={{ color: 'var(--color-accent)', fontSize: '0.75rem' }}>Stabilized!</div>
            )}
            {(character.death_saves?.failures ?? 0) >= 3 && (
              <div style={{ color: '#e74c3c', fontSize: '0.75rem' }}>Character died!</div>
            )}
          </div>
        )}

        {/* Hit Dice */}
        {character.level > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--color-muted)' }}>Hit Dice (d{getHitDie(character.class_name)}): </span>
            <span>{character.hit_dice_remaining ?? character.level}/{character.level}</span>
            {(character.hit_dice_remaining ?? character.level) > 0 && character.hp_current < character.hp_max && (
              <button
                onClick={() => {
                  const die = getHitDie(character.class_name)
                  const conMod = Math.floor(((character.stats.CON ?? 10) - 10) / 2)
                  const roll = Math.floor(Math.random() * die) + 1
                  const heal = Math.max(1, roll + conMod)
                  const newHP = Math.min(character.hp_max, character.hp_current + heal)
                  const newHD = (character.hit_dice_remaining ?? character.level) - 1
                  update({ hp_current: newHP, hit_dice_remaining: newHD })
                }}
                style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: '1px solid var(--color-accent)', borderRadius: 3, cursor: 'pointer', color: 'var(--color-accent)' }}
                title="Roll hit die to recover HP"
              >Roll HD</button>
            )}
          </div>
        )}

        {/* XP Bar */}
        {character.xp !== undefined && (
          <div className="cs-xp-section">
            <div className="cs-xp-label">
              <span>XP</span>
              <span className="cs-xp-value">
                {xp.toLocaleString()}
                {xpForNextLevel !== null ? ` / ${xpForNextLevel.toLocaleString()}` : ' (Max)'}
              </span>
            </div>
            <div className="xp-bar-wrapper">
              <div
                className="xp-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, xpProgress))}%` }}
              />
            </div>
            <div className="cs-xp-sublabel" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Level {xpLevel}{xpForNextLevel !== null ? ` → ${xpLevel + 1}` : ' (Max)'}
              {character.xp !== undefined && character.level < 20 &&
                XP_TO_NEXT[character.level] !== undefined &&
                character.xp >= XP_TO_NEXT[character.level] && (
                <button
                  onClick={() => setShowLevelUp(true)}
                  style={{ padding: '0.2rem 0.6rem', background: 'var(--color-accent)', color: 'var(--color-bg)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: '0.5rem' }}
                >⬆ Level Up!</button>
              )}
            </div>
            {showLevelUp && (
              <LevelUpWizard
                character={character}
                onConfirm={(updates) => { onUpdate?.(character.id, updates); setShowLevelUp(false) }}
                onClose={() => setShowLevelUp(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="cs-tab-bar tab-bar">
        <button
          className={`cs-tab ${activeTab === 'main' ? 'cs-tab--active' : ''}`}
          onClick={() => setActiveTab('main')}
        >Stats</button>
        <button
          className={`cs-tab ${activeTab === 'features' ? 'cs-tab--active' : ''}`}
          onClick={() => setActiveTab('features')}
        >Features</button>
        <button
          className={`cs-tab ${activeTab === 'traits' ? 'cs-tab--active' : ''}`}
          onClick={() => setActiveTab('traits')}
        >Traits</button>
      </div>

      <div className="cs-body">
        {/* Features Tab */}
        {activeTab === 'features' && (
          <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <FeatureTracker
              character={character}
              isOwner={isOwner}
              onUse={(featureId, delta) => {
                if (onSendFeatureUse) {
                  onSendFeatureUse(character.id, featureId, delta)
                } else {
                  // local optimistic update
                  const updatedFeatures = (character.features ?? []).map(f =>
                    f.id === featureId
                      ? { ...f, uses_remaining: Math.max(0, Math.min(f.uses_max, f.uses_remaining + delta)) }
                      : f
                  )
                  update({ features: updatedFeatures })
                }
              }}
              onAddFeature={(feat) => {
                update({ features: [...(character.features ?? []), feat] })
              }}
            />
          </div>
        )}

        {/* Traits Tab */}
        {activeTab === 'traits' && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(['personality', 'ideals', 'bonds', 'flaws'] as const).map(field => {
              const labels: Record<string, string> = {
                personality: 'Personality Traits',
                ideals: 'Ideals',
                bonds: 'Bonds',
                flaws: 'Flaws',
              }
              return (
                <div key={field}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                    {labels[field]}
                  </div>
                  {isOwner ? (
                    <textarea
                      defaultValue={character[field] ?? ''}
                      onBlur={e => update({ [field]: e.target.value })}
                      placeholder={`Enter ${labels[field].toLowerCase()}...`}
                      rows={3}
                      style={{ fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
                    />
                  ) : (
                    <p style={{ fontSize: 'var(--font-size-sm)', color: character[field] ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: character[field] ? 'normal' : 'italic' }}>
                      {character[field] ?? `No ${labels[field].toLowerCase()} recorded.`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Main Tab */}
        {activeTab === 'main' && <>

        {/* Ability Scores */}
        <Section title="Ability Scores">
          <div className="cs-stats-grid character-sheet-grid">
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
          {/* Passive Perception */}
          <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span>
              Passive Perception:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {10 + Math.floor(((character.stats?.WIS ?? 10) - 10) / 2) + proficiencyBonus(character.level)}
              </strong>
            </span>
            <span>
              Prof Bonus:{' '}
              <strong style={{ color: 'var(--accent)' }}>+{proficiencyBonus(character.level)}</strong>
            </span>
          </div>
        </Section>

        {/* Languages & Tool Proficiencies */}
        <Section title="Languages & Tools" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Languages: </span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {(character.languages ?? []).length > 0 ? character.languages!.join(', ') : <em style={{ color: 'var(--text-muted)' }}>None recorded</em>}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Tool Proficiencies: </span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {(character.tool_proficiencies ?? []).length > 0 ? character.tool_proficiencies!.join(', ') : <em style={{ color: 'var(--text-muted)' }}>None recorded</em>}
              </span>
            </div>
          </div>
        </Section>

        {/* Skills */}
        <Section title="🎯 Skills" defaultOpen={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {SKILLS.map((sk) => {
              const score = character.stats[sk.ability as keyof Character['stats']]
              const mod = abilityMod(score)
              const sign = mod >= 0 ? '+' : ''
              return (
                <button
                  key={sk.name}
                  onClick={() => onRollSkill?.(sk.name, mod)}
                  title={`${sk.name} (${sk.ability}) ${sign}${mod}`}
                  style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.4rem',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 4, cursor: onRollSkill ? 'pointer' : 'default',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {sk.name} {sign}{mod}
                </button>
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
              {character.conditions.map((cond, i) => {
                const name = typeof cond === 'string' ? cond : cond.name
                const dur = typeof cond === 'string' ? null : cond.duration
                return (
                  <span key={i} className="condition-badge" title={dur !== null ? `${dur} turn(s) remaining` : ''}>
                    {name}{dur !== null ? ` (${dur})` : ''}
                    <button
                      className="condition-remove"
                      onClick={() => handleRemoveCondition(i)}
                      title={`Remove ${name}`}
                      aria-label={`Remove condition ${name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
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
          {/* Concentration */}
          <div style={{ marginTop: '0.5rem' }}>
            {character.concentration ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔵 Concentrating: {character.concentration}</span>
                <button
                  onClick={() => update({ concentration: undefined })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: '0.75rem' }}
                  title="Break concentration"
                >✕</button>
              </div>
            ) : null}
          </div>
          {/* Exhaustion */}
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.2rem' }}>Exhaustion</div>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              {[1,2,3,4,5,6].map(level => (
                <button
                  key={level}
                  onClick={() => update({ exhaustion: (character.exhaustion ?? 0) >= level ? level - 1 : level })}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', fontSize: '0.6rem',
                    border: `1px solid ${level <= (character.exhaustion ?? 0) ? '#e74c3c' : 'var(--color-border)'}`,
                    background: level <= (character.exhaustion ?? 0) ? '#e74c3c' : 'transparent',
                    color: level <= (character.exhaustion ?? 0) ? 'white' : 'var(--color-muted)',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={['', 'Disadvantage on ability checks', 'Speed halved', 'Disadv. on attacks & saves', 'HP max halved', 'Speed = 0', 'Death'][level]}
                >{level}</button>
              ))}
              {(character.exhaustion ?? 0) > 0 && (
                <span style={{ fontSize: '0.7rem', color: '#e74c3c', marginLeft: '0.25rem' }}>
                  {['','Disadv. checks','Speed halved','Disadv. attacks/saves','HP max halved','Speed 0','Death'][(character.exhaustion ?? 0)]}
                </span>
              )}
            </div>
          </div>
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
          {/* Currency */}
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.25rem' }}>💰 Currency</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(coin => (
                <label key={coin} style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                  <span style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '0.65rem' }}>{coin}</span>
                  <input
                    type="number" min={0}
                    value={character.currency?.[coin] ?? 0}
                    onChange={e => update({ currency: { ...(character.currency ?? { gp: 0, sp: 0, cp: 0 }), [coin]: parseInt(e.target.value) || 0 } })}
                    style={{ width: 44, textAlign: 'center', fontSize: '0.75rem', padding: '0.1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)' }}
                  />
                </label>
              ))}
            </div>
          </div>
        </Section>

        {/* Rests */}
        <Section title="Rests" defaultOpen={false}>
          <div className="rests-row">
            <button
              className="btn-ghost btn-sm rest-btn"
              disabled={!onSendAction}
              onClick={() => onSendAction?.("I'd like to take a short rest to recover.")}
              title={onSendAction ? 'Take a short rest' : 'No action handler available'}
            >
              Short Rest
            </button>
            <button
              className="btn-ghost btn-sm rest-btn"
              disabled={!onSendAction}
              onClick={() => onSendAction?.("I'd like to take a long rest.")}
              title={onSendAction ? 'Take a long rest' : 'No action handler available'}
            >
              Long Rest
            </button>
          </div>
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

        {/* Spellbook */}
        <Section title="📚 Spellbook" defaultOpen={false}>
          {(character.spellbook ?? []).length === 0 ? (
            <p className="cs-empty">No spells recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.5rem' }}>
              {(character.spellbook ?? []).map((spell, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={spell.prepared}
                    onChange={() => {
                      const updated = (character.spellbook ?? []).map((s, idx) => idx === i ? { ...s, prepared: !s.prepared } : s)
                      update({ spellbook: updated })
                    }}
                    title="Prepared"
                  />
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>{spell.name}</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)' }}>
                    {spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                  </span>
                  <button
                    onClick={() => {
                      const updated = (character.spellbook ?? []).filter((_, idx) => idx !== i)
                      update({ spellbook: updated })
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <input
              type="text"
              value={newSpellName}
              onChange={e => setNewSpellName(e.target.value)}
              placeholder="Spell name..."
              style={{ flex: 1, fontSize: '0.75rem', padding: '0.2rem 0.4rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
              maxLength={50}
            />
            <select
              value={newSpellLevel}
              onChange={e => setNewSpellLevel(parseInt(e.target.value))}
              style={{ fontSize: '0.75rem', padding: '0.2rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
            >
              {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l === 0 ? 'Cantrip' : `L${l}`}</option>)}
            </select>
            <button
              onClick={() => {
                if (!newSpellName.trim()) return
                const updated = [...(character.spellbook ?? []), { name: newSpellName.trim(), level: newSpellLevel, prepared: false }]
                update({ spellbook: updated })
                setNewSpellName('')
              }}
              className="btn-ghost btn-sm"
              disabled={!newSpellName.trim()}
            >+</button>
          </div>
        </Section>

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

        {/* Audit Log */}
        <Section title="📋 History" defaultOpen={false}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setShowHistory(v => !v)}
            >{showHistory ? 'Hide History' : 'Show History'}</button>
            <button
              className="btn-ghost btn-sm"
              onClick={async () => {
                try {
                  const res = await api.characters.getAuditLog(character.id)
                  setAuditLog(res.audit_log)
                } catch {
                  // ignore
                }
              }}
            >Load</button>
          </div>
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: 200, overflowY: 'auto' }}>
              {[...auditLog].reverse().slice(0, 20).map((entry, i) => (
                <div key={i} style={{ fontSize: '0.7rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.2rem' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{entry.change}</span>
                </div>
              ))}
              {auditLog.length === 0 && <p className="cs-empty">No history recorded.</p>}
            </div>
          )}
        </Section>

        </> /* end activeTab === 'main' */ }
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

        /* Level-up alert */
        .cs-levelup-alert {
          background: var(--accent-success, #2d6e2d);
          color: #fff;
          font-weight: 700;
          font-size: var(--font-size-sm);
          padding: var(--space-2) var(--space-4);
          text-align: center;
          flex-shrink: 0;
          animation: fadeInDown 0.3s ease;
        }

        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* XP section */
        .cs-xp-section {
          margin-top: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .cs-xp-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }

        .cs-xp-value {
          font-family: var(--font-mono);
          color: var(--text-secondary);
          font-size: var(--font-size-xs);
          text-transform: none;
          letter-spacing: 0;
        }

        .xp-bar-wrapper {
          height: 4px;
          background: var(--bg-primary);
          border-radius: 2px;
          overflow: hidden;
        }

        .xp-bar-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.4s ease;
        }

        .cs-xp-sublabel {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
        }

        /* Rest buttons */
        .rests-row {
          display: flex;
          gap: var(--space-2);
        }

        .rest-btn {
          flex: 1;
        }

        /* Tab bar */
        .cs-tab-bar {
          display: flex;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .cs-tab {
          flex: 1;
          padding: var(--space-2);
          font-size: var(--font-size-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: color var(--transition), border-color var(--transition);
          border-radius: 0;
          min-height: unset;
        }

        .cs-tab:hover {
          color: var(--text-primary);
          background: transparent;
          border-color: transparent;
          border-bottom-color: var(--border);
        }

        .cs-tab--active {
          color: var(--accent) !important;
          border-bottom-color: var(--accent) !important;
        }
      `}</style>
    </div>
  )
}
