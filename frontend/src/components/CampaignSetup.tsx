import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { RulesetName } from '../types'

interface Props {
  onClose: () => void
  onCreated?: () => void
}

const RULESETS: { value: RulesetName; label: string; desc: string }[] = [
  {
    value: 'dnd5e',
    label: 'D&D 5th Edition',
    desc: 'The classic fantasy RPG. Balanced mechanics with a rich structured ruleset.',
  },
  {
    value: 'pathfinder2e',
    label: 'Pathfinder 2e',
    desc: 'Tactical and detailed. Action economy, deeper character customization.',
  },
  {
    value: 'freeform',
    label: 'Freeform',
    desc: 'No fixed rules. Pure collaborative storytelling guided by the AI Dungeon Master.',
  },
]

/**
 * Modal form for creating a new campaign.
 *
 * Lets the user pick a name, ruleset (D&D 5e / Pathfinder 2e / Freeform), and optional
 * premise text. On success the new campaign is set as active and the view transitions
 * to `campaign_detail`. Closes itself by calling `onClose`.
 *
 * @param onClose - Called after a successful creation or when the user dismisses the modal.
 * @param onCreated - Optional callback fired immediately after the campaign is created.
 */
export function CampaignSetup({ onClose, onCreated }: Props) {
  const { createCampaign, setActiveCampaign, setView, loadCharacters } = useGameStore()

  const [name, setName] = useState('')
  const [ruleset, setRuleset] = useState<RulesetName>('dnd5e')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Campaign name is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        ruleset,
        description: description.trim(),
      })
      setActiveCampaign(campaign)
      await loadCharacters(campaign.id)
      setView('campaign_detail')
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box campaign-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Campaign</h2>
          <button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="campaign-name">Campaign Name *</label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Shattered Realms..."
              maxLength={80}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Ruleset</label>
            <div className="ruleset-options">
              {RULESETS.map((r) => (
                <label key={r.value} className={`ruleset-option ${ruleset === r.value ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="ruleset"
                    value={r.value}
                    checked={ruleset === r.value}
                    onChange={() => setRuleset(r.value)}
                    className="ruleset-radio"
                  />
                  <div className="ruleset-content">
                    <span className="ruleset-label">{r.label}</span>
                    <span className="ruleset-desc">{r.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="campaign-desc">Premise / Description</label>
            <textarea
              id="campaign-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your campaign world, setting, or starting scenario... (optional)"
              rows={4}
              maxLength={1000}
            />
            <div className="char-count">{description.length}/1000</div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-lg" disabled={loading || !name.trim()}>
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Creating...
                </>
              ) : (
                'Begin Campaign'
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .campaign-setup-modal {
          max-width: 560px;
        }

        .ruleset-options {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .ruleset-option {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition);
          text-transform: none;
          letter-spacing: 0;
          font-size: var(--font-size-base);
          font-weight: normal;
          color: var(--text-primary);
          background: var(--bg-card);
          margin-bottom: 0;
        }

        .ruleset-option:hover {
          border-color: var(--border-light);
          background: var(--bg-secondary);
        }

        .ruleset-option.selected {
          border-color: var(--accent);
          background: var(--bg-secondary);
        }

        .ruleset-radio {
          width: auto;
          flex-shrink: 0;
          margin-top: 3px;
          accent-color: var(--accent);
        }

        .ruleset-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ruleset-label {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--font-size-base);
        }

        .ruleset-option.selected .ruleset-label {
          color: var(--accent);
        }

        .ruleset-desc {
          font-size: var(--font-size-sm);
          color: var(--text-muted);
          font-style: italic;
        }

        .char-count {
          text-align: right;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          margin-top: 2px;
        }

        .modal-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--space-3);
          margin-top: var(--space-5);
        }

        .btn-primary.btn-lg {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
        }
      `}</style>
    </div>
  )
}
