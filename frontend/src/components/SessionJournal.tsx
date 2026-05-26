import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Session } from '../types'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function JournalEntry({ session }: { session: Session & { session_summary: string } }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="journal-entry">
      <div
        className="journal-entry-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <div className="journal-entry-meta">
          <span className="journal-date">{formatDate(session.started_at)}</span>
          <span className="journal-msg-count">
            {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className={`journal-chevron ${expanded ? 'open' : ''}`}>▾</span>
      </div>
      {expanded && (
        <div className="journal-summary">
          <p>{session.session_summary}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Session journal panel showing reverse-chronological session summaries.
 *
 * Only sessions that have a `session_summary` are displayed; sessions without
 * one (e.g. very short sessions) are omitted. Shows an empty state when no
 * summaries exist yet.
 */
export function SessionJournal() {
  const { sessions, activeCampaign } = useGameStore()

  // Only show sessions that have a summary, sorted newest first
  const journalSessions = [...sessions]
    .filter((s): s is Session & { session_summary: string } => Boolean((s as any).session_summary))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  function handleExport() {
    if (!activeCampaign) return
    const lines: string[] = [`# Campaign Journal: ${activeCampaign.name}`, '']
    for (const s of journalSessions) {
      lines.push(`## Session — ${formatDate(s.started_at)}`, '')
      lines.push(s.session_summary, '')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeCampaign.name.toLowerCase().replace(/\s+/g, '-')}-journal.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (journalSessions.length === 0) {
    return (
      <div className="journal-empty">
        <p>No session summaries yet</p>
        <span className="journal-empty-sub">
          The AI will automatically summarise sessions as they grow. Start playing to build your journal!
        </span>
        <style>{journalStyles}</style>
      </div>
    )
  }

  return (
    <div className="session-journal">
      <div className="journal-export-row">
        <button className="btn-ghost btn-sm" onClick={handleExport}>
          ↓ Export
        </button>
      </div>
      <div className="journal-list">
        {journalSessions.map((s) => (
          <JournalEntry key={s.id} session={s} />
        ))}
      </div>
      <style>{journalStyles}</style>
    </div>
  )
}

const journalStyles = `
  .session-journal {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .journal-export-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-1);
  }

  .journal-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .journal-entry {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .journal-entry-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    user-select: none;
    gap: var(--space-3);
    transition: background var(--transition);
  }

  .journal-entry-header:hover {
    background: var(--bg-secondary);
  }

  .journal-entry-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .journal-date {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .journal-msg-count {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .journal-chevron {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    transition: transform var(--transition);
    flex-shrink: 0;
  }

  .journal-chevron.open {
    transform: rotate(180deg);
  }

  .journal-summary {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--bg-primary);
  }

  .journal-summary p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .journal-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8) var(--space-4);
    text-align: center;
    color: var(--text-muted);
  }

  .journal-empty p {
    margin: 0;
    font-weight: 600;
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }

  .journal-empty-sub {
    font-size: var(--font-size-sm);
    font-style: italic;
    max-width: 400px;
    line-height: 1.6;
  }
`
