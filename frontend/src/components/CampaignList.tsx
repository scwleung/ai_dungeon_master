import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CampaignSetup } from './CampaignSetup'
import type { Campaign } from '../types'

const RULESET_LABELS: Record<Campaign['ruleset'], string> = {
  dnd5e: 'D&D 5e',
  pathfinder2e: 'PF2e',
  freeform: 'Freeform',
}

const RULESET_BADGE_CLASS: Record<Campaign['ruleset'], string> = {
  dnd5e: 'badge-accent',
  pathfinder2e: 'badge-info',
  freeform: 'badge-success',
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

/**
 * Full-page view listing all of the user's campaigns.
 *
 * Displays a card grid with each campaign's name, ruleset badge, description excerpt,
 * creation date, and session count. Provides "Continue" navigation to `campaign_detail`
 * and inline delete-with-confirmation. Opens the {@link CampaignSetup} modal when the
 * user wants to create a new campaign.
 *
 * Reads from and writes to the Zustand store; no props are required.
 */
export function CampaignList() {
  const { campaigns, deleteCampaign, setActiveCampaign, setView, loadCharacters, loadSessions } =
    useGameStore()
  const [showSetup, setShowSetup] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue(campaign: Campaign) {
    setActiveCampaign(campaign)
    try {
      await Promise.all([loadCharacters(campaign.id), loadSessions(campaign.id)])
    } catch {
      // Non-fatal — data can load lazily in campaign detail
    }
    setView('campaign_detail')
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      await deleteCampaign(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign.')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="campaign-list-page">
      <div className="campaign-list-header">
        <div>
          <h1 className="page-title">Your Campaigns</h1>
          <p className="page-subtitle">
            {campaigns.length === 0
              ? 'No campaigns yet. Start your first adventure!'
              : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="btn-primary btn-lg" onClick={() => setShowSetup(true)}>
          + New Campaign
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚔</div>
          <h2>No Campaigns Yet</h2>
          <p>
            Create your first campaign to begin your adventure. The AI Dungeon Master will guide
            your party through an epic tale.
          </p>
          <button className="btn-primary btn-lg" onClick={() => setShowSetup(true)}>
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="campaign-grid">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="campaign-card card">
              <div className="campaign-card-header">
                <h3 className="campaign-card-name">{campaign.name}</h3>
                <span className={`badge ${RULESET_BADGE_CLASS[campaign.ruleset]}`}>
                  {RULESET_LABELS[campaign.ruleset]}
                </span>
              </div>

              {campaign.description && (
                <p className="campaign-card-desc">
                  {campaign.description.length > 140
                    ? campaign.description.slice(0, 140) + '…'
                    : campaign.description}
                </p>
              )}

              <div className="campaign-card-meta">
                <span className="meta-item">
                  <span className="meta-icon">🗓</span>
                  {formatDate(campaign.created_at)}
                </span>
                <span className="meta-item">
                  <span className="meta-icon">📜</span>
                  {campaign.session_count} session{campaign.session_count !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="campaign-card-actions">
                <button
                  className="btn-primary"
                  onClick={() => handleContinue(campaign)}
                >
                  Continue →
                </button>

                {confirmDeleteId === campaign.id ? (
                  <div className="confirm-delete">
                    <span className="confirm-text">Delete?</span>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDelete(campaign.id)}
                      disabled={deletingId === campaign.id}
                    >
                      {deletingId === campaign.id ? '...' : 'Yes'}
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-ghost btn-sm delete-btn"
                    onClick={() => setConfirmDeleteId(campaign.id)}
                    title="Delete campaign"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSetup && <CampaignSetup onClose={() => setShowSetup(false)} />}

      <style>{`
        .campaign-list-page {
          flex: 1;
          padding: var(--space-8) var(--space-6);
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          overflow-y: auto;
        }

        .campaign-list-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }

        .page-title {
          font-size: var(--font-size-3xl);
          color: var(--text-primary);
          margin-bottom: var(--space-1);
        }

        .page-subtitle {
          color: var(--text-muted);
          font-size: var(--font-size-base);
          margin-bottom: 0;
        }

        .campaign-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: var(--space-5);
        }

        .campaign-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          transition: transform var(--transition), box-shadow var(--transition);
        }

        .campaign-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px var(--shadow);
        }

        .campaign-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-2);
        }

        .campaign-card-name {
          font-size: var(--font-size-lg);
          color: var(--text-primary);
          font-weight: 700;
          line-height: 1.3;
          flex: 1;
        }

        .campaign-card-desc {
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          line-height: 1.6;
          font-style: italic;
          margin-bottom: 0;
          flex: 1;
        }

        .campaign-card-meta {
          display: flex;
          gap: var(--space-4);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .campaign-card-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          margin-top: var(--space-1);
          padding-top: var(--space-3);
          border-top: 1px solid var(--border);
        }

        .delete-btn {
          color: var(--text-muted);
          font-size: 1rem;
        }

        .delete-btn:hover {
          color: var(--accent-danger);
        }

        .confirm-delete {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .confirm-text {
          font-size: var(--font-size-xs);
          color: var(--accent-danger);
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: var(--space-12) var(--space-8);
          color: var(--text-muted);
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: var(--space-4);
          color: var(--accent);
          opacity: 0.5;
        }

        .empty-state h2 {
          font-size: var(--font-size-2xl);
          color: var(--text-secondary);
          margin-bottom: var(--space-3);
        }

        .empty-state p {
          max-width: 400px;
          margin: 0 auto var(--space-6);
          font-size: var(--font-size-base);
          line-height: 1.7;
        }

        @media (max-width: 600px) {
          .campaign-list-page {
            padding: var(--space-4);
          }
          .campaign-list-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .page-title {
            font-size: var(--font-size-2xl);
          }
        }
      `}</style>
    </div>
  )
}
