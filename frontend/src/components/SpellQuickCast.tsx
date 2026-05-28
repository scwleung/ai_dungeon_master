import { useState } from 'react'
import type { Character } from '../types'

interface SpellQuickCastProps {
  character: Character
  onCast: (text: string) => void
}

/**
 * Quick-cast panel showing prepared spells grouped by level.
 * Cantrips are free; levelled spells optimistically decrement a local
 * spell-slot counter. The `onCast` callback sends the cast action as text.
 */
export function SpellQuickCast({ character, onCast }: SpellQuickCastProps) {
  const preparedSpells = (character.spellbook ?? []).filter((s) => s.prepared)

  // Local spell-slot state (optimistic copy of character.spell_slots)
  const [localSlots, setLocalSlots] = useState<Record<string, { max: number; used: number }>>(
    () => {
      const slots: Record<string, { max: number; used: number }> = {}
      for (const [lvl, slot] of Object.entries(character.spell_slots ?? {})) {
        slots[lvl] = { ...slot }
      }
      return slots
    },
  )

  if (preparedSpells.length === 0) return null

  // Group by level
  const grouped: Record<number, typeof preparedSpells> = {}
  for (const spell of preparedSpells) {
    if (!grouped[spell.level]) grouped[spell.level] = []
    grouped[spell.level].push(spell)
  }
  const levels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  function slotsRemaining(level: number): number {
    if (level === 0) return Infinity
    const slot = localSlots[String(level)]
    if (!slot) return 0
    return slot.max - slot.used
  }

  function castSpell(spell: { name: string; level: number }) {
    if (spell.level > 0) {
      const slot = localSlots[String(spell.level)]
      if (!slot || slot.max - slot.used <= 0) return
      setLocalSlots((prev) => ({
        ...prev,
        [String(spell.level)]: {
          ...prev[String(spell.level)],
          used: prev[String(spell.level)].used + 1,
        },
      }))
    }
    onCast(`I cast ${spell.name}`)
  }

  return (
    <div
      className="spell-quickcast"
      role="region"
      aria-label="Spell Quick Cast"
      style={{
        background: 'var(--bg-panel, var(--bg-secondary))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 6px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0.4rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        fontSize: '0.75rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-primary)',
      }}>
        ✨ Quick Cast
      </div>

      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {levels.map((level) => {
          const spells = grouped[level]
          const remaining = slotsRemaining(level)
          const levelLabel = level === 0 ? 'Cantrips' : `Level ${level}`
          return (
            <div key={level}>
              {/* Level heading + slots indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  {levelLabel}
                </span>
                {level > 0 && (
                  <span
                    title={`${remaining} slot(s) remaining`}
                    style={{
                      fontSize: '0.65rem',
                      color: remaining > 0 ? 'var(--accent)' : 'var(--accent-danger)',
                      fontWeight: 600,
                    }}
                  >
                    {remaining === 0 ? 'No slots' : `${remaining} slot${remaining === 1 ? '' : 's'}`}
                  </span>
                )}
              </div>
              {/* Spell buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {spells.map((spell) => {
                  const canCast = level === 0 || remaining > 0
                  return (
                    <button
                      key={spell.name}
                      onClick={() => castSpell(spell)}
                      disabled={!canCast}
                      aria-label={`Cast ${spell.name}${level > 0 ? ` (level ${level} slot)` : ''}`}
                      title={!canCast ? 'No spell slots remaining' : `Cast ${spell.name}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.75rem',
                        background: canCast ? 'rgba(196,130,10,0.08)' : 'transparent',
                        border: `1px solid ${canCast ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-full, 999px)',
                        color: canCast ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: canCast ? 'pointer' : 'not-allowed',
                        opacity: canCast ? 1 : 0.5,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{spell.name}</span>
                      {level > 0 && (
                        <span style={{
                          fontSize: '0.6rem',
                          padding: '0 3px',
                          background: 'rgba(196,130,10,0.2)',
                          borderRadius: 3,
                          color: 'var(--accent)',
                          fontWeight: 700,
                        }}>
                          L{level}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
