import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { api } from '../api/client'
import { CharacterForm } from './CharacterForm'
import { SessionJournal } from './SessionJournal'
import type { Character, Session } from '../types'

const RULESET_LABELS: Record<string, string> = {
  dnd5e: 'D&D 5th Edition',
  pathfinder2e: 'Pathfinder 2e',
  freeform: 'Freeform',
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function WorldState({ worldState }: { worldState: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(worldState)
  if (entries.length === 0) return null

  return (
    <div className="world-state-section">
      <div className="collapsible-header" onClick={() => setOpen((v) => !v)}>
        <h4>World State</h4>
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>▾</span>
      </div>
      {open && (
        <div className="world-state-grid">
          {entries.map(([k, v]) => (
            <div key={k} className="world-state-entry">
              <span className="ws-key">{k}</span>
              <span className="ws-val">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CharacterRow({
  character,
  onSelect,
}: {
  character: Character
  onSelect?: (c: Character) => void
}) {
  const hpPct = character.hp_max > 0 ? (character.hp_current / character.hp_max) * 100 : 0
  const hpClass = hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low'

  return (
    <div className={`char-row ${onSelect ? 'selectable' : ''}`} onClick={() => onSelect?.(character)}>
      <div className="char-row-left">
        <span className="char-row-name">{character.name}</span>
        <span className="char-row-meta">
          {character.race} {character.class_name} — Level {character.level}
        </span>
      </div>
      <div className="char-row-right">
        <div className="char-row-player">{character.player_name}</div>
        <div className="char-hp-mini">
          <span className={`hp-mini-text hp-${hpClass}`}>
            {character.hp_current}/{character.hp_max}
          </span>
          <div className="hp-bar-wrapper" style={{ width: 60, height: 4 }}>
            <div
              className={`hp-bar-fill ${hpClass}`}
              style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionRow({ session }: { session: Session }) {
  const isActive = !session.ended_at
  return (
    <div className={`session-row ${isActive ? 'active' : ''}`}>
      <div className="session-row-left">
        <span className="session-date">{formatShortDate(session.started_at)}</span>
        {isActive && <span className="badge badge-success">Active</span>}
      </div>
      <div className="session-row-right">
        <span className="session-msgs">
          {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
        </span>
        {session.ended_at && (
          <span className="session-ended">Ended {formatShortDate(session.ended_at)}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Detail page for the currently active campaign.
 *
 * Shows the campaign hero (name, ruleset badge, description, and a collapsible
 * world-state key-value grid), a character roster, and a reverse-chronological
 * session history. Provides the "Start New Session" action which calls the API
 * and navigates to the `session` view. Opens the {@link CharacterForm} modal for
 * adding new characters.
 *
 * When the current client holds a campaign access token (`isDM` is true) a
 * "🔗 Copy Invite" button is shown. Clicking it writes a
 * `?campaign=<id>&code=<token>` URL to the clipboard; recipients who open
 * that link are automatically authenticated and taken to this campaign detail
 * page. The button shows a "Copied!" flash for 1.5 s on success.
 *
 * Reads `activeCampaign`, `characters`, `sessions`, and `campaignTokens` from
 * the Zustand store; no props are required.
 */
export function CampaignDetail() {
  const {
    activeCampaign,
    characters,
    sessions,
    campaignTokens,
    storeCampaignToken,
    startSession,
    setActiveSession,
    setView,
    loadSessions,
    loadQuests,
  } = useGameStore()

  const isDM = !!(activeCampaign && campaignTokens[activeCampaign.id])

  const [showCharForm, setShowCharForm] = useState(false)
  const [startingSession, setStartingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'journal'>('overview')
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [rotateFlash, setRotateFlash] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (activeCampaign) {
      loadQuests(activeCampaign.id).catch(() => {})
    }
  }, [activeCampaign, loadQuests])

  if (!activeCampaign) return null

  async function handleStartSession() {
    if (!activeCampaign) return
    setStartingSession(true)
    setSessionError(null)
    try {
      const session = await startSession(activeCampaign.id)
      setActiveSession(session)
      setView('session')
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to start session.')
    } finally {
      setStartingSession(false)
    }
  }

  async function handleCharCreated() {
    setShowCharForm(false)
  }

  async function handleCopyInvite() {
    if (!activeCampaign) return
    const code = campaignTokens[activeCampaign.id] ?? activeCampaign.access_code
    const url = `${window.location.origin}${window.location.pathname}?campaign=${activeCampaign.id}&code=${code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 1500)
  }

  async function handleReloadSessions() {
    if (!activeCampaign) return
    try {
      await loadSessions(activeCampaign.id)
    } catch {
      // ignore
    }
  }

  async function handleExport() {
    if (!activeCampaign) return
    setExportError(null)
    try {
      const data = await api.campaigns.export(activeCampaign.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeCampaign.name.replace(/\s+/g, '_')}_export.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    }
  }

  async function handleRotateCode() {
    if (!activeCampaign) return
    try {
      const res = await api.campaigns.rotateAccessCode(activeCampaign.id)
      storeCampaignToken(activeCampaign.id, res.access_code)
      setRotateFlash(true)
      setTimeout(() => setRotateFlash(false), 2000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to rotate access code.')
    }
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )

  return (
    <div className="campaign-detail-page">
      {/* Campaign Header */}
      <div className="campaign-detail-hero">
        <div className="campaign-detail-title-row">
          <div>
            <h1 className="campaign-detail-name">{activeCampaign.name}</h1>
            <div className="campaign-detail-meta">
              <span className="badge badge-accent">
                {RULESET_LABELS[activeCampaign.ruleset] ?? activeCampaign.ruleset}
              </span>
              <span className="campaign-detail-date">
                Created {formatDate(activeCampaign.created_at)}
              </span>
            </div>
          </div>
          <div className="campaign-header-actions">
            {isDM && (
              <button
                className="btn-ghost btn-sm"
                onClick={handleExport}
                title="Export campaign as JSON"
              >
                ⬇ Export
              </button>
            )}
            {isDM && (
              <button
                className="btn-ghost btn-sm"
                onClick={handleRotateCode}
                title="Rotate access code"
              >
                {rotateFlash ? 'Code rotated!' : '🔄 Rotate Code'}
              </button>
            )}
            {isDM && (
              <button
                className="btn-ghost btn-sm copy-invite-btn"
                onClick={handleCopyInvite}
                title="Copy invite link"
              >
                {copiedInvite ? 'Copied!' : '🔗 Copy Invite'}
              </button>
            )}
            <button
              className="btn-primary btn-lg start-session-btn"
              onClick={handleStartSession}
              disabled={startingSession}
            >
              {startingSession ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Starting...
                </>
              ) : (
                '▶ Start New Session'
              )}
            </button>
          </div>
        </div>

        {activeCampaign.description && (
          <p className="campaign-detail-desc">{activeCampaign.description}</p>
        )}

        {sessionError && <div className="error-banner">{sessionError}</div>}
        {exportError && <div className="error-banner">{exportError}</div>}

        <WorldState worldState={activeCampaign.world_state} />
      </div>

      {/* Tab Bar */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'overview' ? 'detail-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`detail-tab ${activeTab === 'journal' ? 'detail-tab--active' : ''}`}
          onClick={() => setActiveTab('journal')}
        >
          Journal
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="campaign-detail-body">
          {/* Characters Section */}
          <section className="detail-section">
            <div className="detail-section-header">
              <h2>Characters</h2>
              <button className="btn-ghost btn-sm" onClick={() => setShowCharForm(true)}>
                + Add Character
              </button>
            </div>

            {characters.length === 0 ? (
              <div className="detail-empty">
                <p>No characters yet. Add a character before starting a session.</p>
                <button className="btn-primary" onClick={() => setShowCharForm(true)}>
                  Create Character
                </button>
              </div>
            ) : (
              <div className="char-list">
                {characters.map((c) => (
                  <CharacterRow key={c.id} character={c} />
                ))}
              </div>
            )}
          </section>

          {/* Sessions Section */}
          <section className="detail-section">
            <div className="detail-section-header">
              <h2>Session History</h2>
              <button className="btn-ghost btn-sm" onClick={handleReloadSessions}>
                ↻ Refresh
              </button>
            </div>

            {sortedSessions.length === 0 ? (
              <div className="detail-empty">
                <p>No sessions yet. Start your first adventure!</p>
              </div>
            ) : (
              <div className="session-list">
                {sortedSessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="campaign-detail-body">
          <section className="detail-section">
            <div className="detail-section-header">
              <h2>Session Journal</h2>
              <button className="btn-ghost btn-sm" onClick={handleReloadSessions}>
                ↻ Refresh
              </button>
            </div>
            <SessionJournal />
          </section>
        </div>
      )}

      {showCharForm && (
        <CharacterForm
          campaignId={activeCampaign.id}
          onClose={() => setShowCharForm(false)}
          onCreated={handleCharCreated}
        />
      )}

      <style>{`
        .campaign-detail-page {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .campaign-detail-hero {
          background: var(--bg-panel);
          border-bottom: 1px solid var(--border);
          padding: var(--space-6) var(--space-8);
        }

        .campaign-detail-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-4);
          margin-bottom: var(--space-4);
        }

        .campaign-detail-name {
          font-size: var(--font-size-3xl);
          margin-bottom: var(--space-2);
        }

        .campaign-detail-meta {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
        }

        .campaign-detail-date {
          font-size: var(--font-size-sm);
          color: var(--text-muted);
          font-style: italic;
        }

        .campaign-detail-desc {
          font-style: italic;
          color: var(--text-secondary);
          font-size: var(--font-size-base);
          line-height: 1.7;
          max-width: 800px;
          margin-bottom: var(--space-4);
        }

        .campaign-header-actions {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-shrink: 0;
        }

        .copy-invite-btn {
          white-space: nowrap;
        }

        .start-session-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .world-state-section {
          margin-top: var(--space-3);
        }

        .world-state-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: var(--space-2);
          margin-top: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-primary);
          border-radius: var(--radius);
          border: 1px solid var(--border);
        }

        .world-state-entry {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ws-key {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
        }

        .ws-val {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
        }

        .detail-tabs {
          display: flex;
          gap: 0;
          padding: 0 var(--space-8);
          border-bottom: 1px solid var(--border);
          background: var(--bg-panel);
          flex-shrink: 0;
        }

        .detail-tab {
          padding: var(--space-3) var(--space-5);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-muted);
          transition: all var(--transition);
          margin-bottom: -1px;
        }

        .detail-tab:hover {
          color: var(--text-secondary);
        }

        .detail-tab--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

        .campaign-detail-body {
          padding: var(--space-6) var(--space-8);
          display: flex;
          flex-direction: column;
          gap: var(--space-8);
          max-width: 900px;
        }

        .detail-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .detail-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border);
        }

        .detail-section-header h2 {
          font-size: var(--font-size-xl);
        }

        .detail-empty {
          text-align: center;
          padding: var(--space-6);
          color: var(--text-muted);
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          align-items: center;
        }

        .detail-empty p {
          margin-bottom: 0;
          font-size: var(--font-size-sm);
          font-style: italic;
        }

        .char-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .char-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          gap: var(--space-3);
          transition: border-color var(--transition);
        }

        .char-row.selectable {
          cursor: pointer;
        }

        .char-row.selectable:hover {
          border-color: var(--border-light);
        }

        .char-row-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .char-row-name {
          font-weight: 700;
          font-size: var(--font-size-base);
          color: var(--text-primary);
        }

        .char-row-meta {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
        }

        .char-row-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: var(--space-1);
          flex-shrink: 0;
        }

        .char-row-player {
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          font-weight: 600;
        }

        .char-hp-mini {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .hp-mini-text {
          font-size: var(--font-size-xs);
          font-weight: 700;
          font-family: var(--font-mono);
        }

        .hp-mini-text.hp-high { color: var(--hp-high); }
        .hp-mini-text.hp-mid  { color: var(--hp-mid); }
        .hp-mini-text.hp-low  { color: var(--hp-low); }

        .session-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .session-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          gap: var(--space-3);
        }

        .session-row.active {
          border-color: var(--accent-success);
          background: rgba(45, 110, 45, 0.05);
        }

        .session-row-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .session-date {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-primary);
        }

        .session-row-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .session-msgs {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .session-ended {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
        }

        @media (max-width: 768px) {
          .campaign-detail-hero,
          .campaign-detail-body {
            padding: var(--space-4);
          }

          .campaign-detail-title-row {
            flex-direction: column;
            align-items: stretch;
          }

          .campaign-detail-name {
            font-size: var(--font-size-2xl);
          }
        }
      `}</style>
    </div>
  )
}
