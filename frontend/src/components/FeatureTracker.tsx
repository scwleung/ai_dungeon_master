import { useState } from 'react'
import type { Character } from '../types'

type Feature = NonNullable<Character['features']>[number]

interface Props {
  character: Character
  isOwner: boolean
  onUse: (featureId: string, delta: number) => void
  onAddFeature?: (feature: Feature) => void
}

/**
 * Renders class features with pip-based uses tracking.
 * Used inside CharacterSheet and potentially as a standalone panel.
 */
export function FeatureTracker({ character, isOwner, onUse, onAddFeature }: Props) {
  const features = character.features ?? []
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newUsesMax, setNewUsesMax] = useState(1)
  const [newRecharge, setNewRecharge] = useState<'short' | 'long' | 'none'>('long')

  function handleAddFeature(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const feature: Feature = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim(),
      uses_remaining: newUsesMax,
      uses_max: newUsesMax,
      recharge: newRecharge,
    }
    onAddFeature?.(feature)
    setNewName('')
    setNewDesc('')
    setNewUsesMax(1)
    setNewRecharge('long')
    setShowAddForm(false)
  }

  const rechargeLabel = (r: 'short' | 'long' | 'none') => {
    if (r === 'short') return 'Short'
    if (r === 'long') return 'Long'
    return '—'
  }

  return (
    <div className="feature-tracker">
      {features.length === 0 && !showAddForm && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic', marginBottom: 'var(--space-2)' }}>
          No features recorded.
        </p>
      )}

      {features.map((feat) => {
        const canRecharge = feat.uses_remaining < feat.uses_max && feat.recharge !== 'none'
        return (
          <div key={feat.id} className="feature-item">
            <div className="feature-header">
              <strong className="feature-name">{feat.name}</strong>
              <span
                className="feature-recharge-tag"
                title={`Recharges on ${rechargeLabel(feat.recharge)} rest`}
              >
                {rechargeLabel(feat.recharge)} rest
              </span>
            </div>
            {feat.description && (
              <p className="feature-desc">{feat.description}</p>
            )}
            {feat.uses_max > 0 && (
              <div className="feature-uses">
                <div className="pip-track">
                  {Array.from({ length: feat.uses_max }).map((_, i) => {
                    const filled = i < feat.uses_remaining
                    return (
                      <button
                        key={i}
                        className={`pip ${filled ? 'pip-filled' : 'pip-empty'}`}
                        title={filled ? 'Click to spend use' : 'Spent'}
                        onClick={() => filled && isOwner && onUse(feat.id, -1)}
                        disabled={!filled || !isOwner}
                        aria-label={filled ? `Spend use ${i + 1} of ${feat.uses_max}` : `Spent use ${i + 1}`}
                      />
                    )
                  })}
                </div>
                <span className="pip-count">{feat.uses_remaining}/{feat.uses_max}</span>
                {canRecharge && isOwner && (
                  <button
                    className="feature-recharge-btn"
                    onClick={() => onUse(feat.id, feat.uses_max - feat.uses_remaining)}
                    title="Recharge all uses"
                  >
                    Recharge
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {isOwner && onAddFeature && (
        <>
          {!showAddForm ? (
            <button
              className="btn-ghost btn-sm"
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              onClick={() => setShowAddForm(true)}
            >
              + Add Feature
            </button>
          ) : (
            <form className="feature-add-form" onSubmit={handleAddFeature}>
              <input
                type="text"
                placeholder="Feature name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="add-input"
                required
              />
              <textarea
                placeholder="Description (optional)"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={2}
                style={{ fontSize: 'var(--font-size-xs)', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                  Uses max
                </label>
                <input
                  type="number" min={0} max={20}
                  value={newUsesMax}
                  onChange={e => setNewUsesMax(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: 56 }}
                />
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                  Recharge
                </label>
                <select
                  value={newRecharge}
                  onChange={e => setNewRecharge(e.target.value as 'short' | 'long' | 'none')}
                  style={{ flex: 1 }}
                >
                  <option value="short">Short rest</option>
                  <option value="long">Long rest</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button type="submit" className="btn-ghost btn-sm" disabled={!newName.trim()}>Add</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}

      <style>{`
        .feature-tracker {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .feature-item {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-2) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .feature-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }
        .feature-name {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
        }
        .feature-recharge-tag {
          font-size: 10px;
          padding: 1px 6px;
          background: rgba(196, 130, 10, 0.1);
          border: 1px solid rgba(196, 130, 10, 0.3);
          border-radius: var(--radius-full);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .feature-desc {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          line-height: 1.5;
          margin-bottom: 0;
        }
        .feature-uses {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .feature-recharge-btn {
          font-size: 10px;
          padding: 1px 6px;
          background: none;
          border: 1px solid var(--accent);
          border-radius: var(--radius);
          cursor: pointer;
          color: var(--accent);
          text-transform: none;
          letter-spacing: 0;
          font-weight: 500;
          min-width: unset;
        }
        .feature-recharge-btn:hover {
          background: rgba(196, 130, 10, 0.1);
        }
        .feature-add-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-2) var(--space-3);
          background: var(--bg-card);
        }
      `}</style>
    </div>
  )
}
