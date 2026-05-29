import { useState } from 'react'
import type { Character, CharacterUpdate } from '../types'

interface Props {
  character: Character
  onConfirm: (updates: CharacterUpdate) => void
  onClose: () => void
}

const HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
}

function getHitDie(className: string): number {
  return HIT_DIE[className.toLowerCase()] ?? 8
}

const ASI_LEVELS = new Set([4, 8, 12, 16, 19])

const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const

export default function LevelUpWizard({ character, onConfirm, onClose }: Props) {
  const newLevel = character.level + 1
  const hitDie = getHitDie(character.class_name)
  const average = Math.floor(hitDie / 2) + 1

  const [step, setStep] = useState<'hp' | 'asi'>('hp')
  const [rolledHp, setRolledHp] = useState<number | null>(null)
  const [newStats, setNewStats] = useState({ ...character.stats })
  const [pointsLeft, setPointsLeft] = useState(2)

  const hasASI = ASI_LEVELS.has(newLevel)

  function rollHpDie() {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const result = (buf[0] % hitDie) + 1
    setRolledHp(result)
  }

  function takeAverage() {
    setRolledHp(average)
  }

  function handleHpNext() {
    if (rolledHp === null) return
    if (hasASI) {
      setStep('asi')
    } else {
      handleConfirm(rolledHp)
    }
  }

  function handleStatIncrement(stat: keyof typeof character.stats) {
    if (pointsLeft <= 0) return
    setNewStats((prev) => ({ ...prev, [stat]: prev[stat] + 1 }))
    setPointsLeft((p) => p - 1)
  }

  function handleConfirm(hpRoll: number) {
    onConfirm({
      level: newLevel,
      hp_max: character.hp_max + hpRoll,
      stats: newStats,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
    }}>
      <div style={{
        background: 'var(--color-surface, #1a1a2e)', border: '2px solid var(--color-accent, #c4820a)',
        borderRadius: 8, padding: '1.5rem', maxWidth: 400, width: '90%',
      }}>
        <h3 style={{ margin: '0 0 1rem', color: 'var(--color-accent, #c4820a)', fontSize: '1.1rem' }}>
          ⬆ Level Up — Level {newLevel}
        </h3>

        {step === 'hp' && (
          <div>
            <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text, #e0d6c8)' }}>
              Hit Die: d{hitDie} &nbsp;|&nbsp; Average: {average}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={rollHpDie}
                style={{
                  flex: 1, padding: '0.5rem', background: 'var(--color-accent, #c4820a)',
                  color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
                }}
              >
                🎲 Roll 1d{hitDie}
              </button>
              <button
                onClick={takeAverage}
                style={{
                  flex: 1, padding: '0.5rem', background: 'transparent',
                  color: 'var(--color-accent, #c4820a)', border: '1px solid var(--color-accent, #c4820a)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                Take Average ({average})
              </button>
            </div>
            {rolledHp !== null && (
              <p style={{ marginBottom: '1rem', color: 'var(--color-text, #e0d6c8)', fontSize: '0.9rem' }}>
                Rolled: <strong>{rolledHp}</strong> &nbsp;→&nbsp; New HP Max: {character.hp_max + rolledHp}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.4rem 0.9rem', background: 'transparent',
                  color: 'var(--color-muted, #888)', border: '1px solid var(--color-border, #333)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleHpNext}
                disabled={rolledHp === null}
                style={{
                  padding: '0.4rem 0.9rem', background: rolledHp !== null ? 'var(--color-accent, #c4820a)' : '#555',
                  color: rolledHp !== null ? '#000' : '#999', border: 'none',
                  borderRadius: 4, cursor: rolledHp !== null ? 'pointer' : 'not-allowed', fontWeight: 'bold',
                }}
              >
                {hasASI ? 'Next: ASI →' : 'Confirm Level Up'}
              </button>
            </div>
          </div>
        )}

        {step === 'asi' && (
          <div>
            <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text, #e0d6c8)' }}>
              Ability Score Improvement — {pointsLeft} point{pointsLeft !== 1 ? 's' : ''} remaining
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {STAT_KEYS.map((stat) => (
                <div key={stat} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '0.5rem', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--color-border, #333)', borderRadius: 4,
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', marginBottom: '0.25rem' }}>{stat}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-text, #e0d6c8)' }}>
                    {newStats[stat]}
                  </div>
                  <button
                    onClick={() => handleStatIncrement(stat)}
                    disabled={pointsLeft <= 0}
                    style={{
                      marginTop: '0.25rem', padding: '0.1rem 0.5rem',
                      background: pointsLeft > 0 ? 'var(--color-accent, #c4820a)' : '#555',
                      color: pointsLeft > 0 ? '#000' : '#999',
                      border: 'none', borderRadius: 3,
                      cursor: pointsLeft > 0 ? 'pointer' : 'not-allowed', fontSize: '0.8rem',
                    }}
                  >
                    +1
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setStep('hp')}
                style={{
                  padding: '0.4rem 0.9rem', background: 'transparent',
                  color: 'var(--color-muted, #888)', border: '1px solid var(--color-border, #333)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => handleConfirm(rolledHp!)}
                style={{
                  padding: '0.4rem 0.9rem', background: 'var(--color-accent, #c4820a)',
                  color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
                }}
              >
                Confirm Level Up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
