import { useGameStore } from '../store/gameStore'

interface Props {
  onClose: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * Sidebar panel displaying the dice roll history for the current session.
 *
 * Entries are shown newest-first.  Each entry shows the timestamp, roller,
 * dice notation, individual values, and the final total.  Secret rolls are
 * labelled with a badge.
 */
export function DiceLog({ onClose }: Props) {
  const diceLog = useGameStore((s) => s.diceLog)

  return (
    <div className="dice-log-panel">
      <div className="dl-header">
        <span className="dl-title">🎲 Dice Log</span>
        <button className="btn-ghost btn-sm dl-close" onClick={onClose} aria-label="Close dice log">
          ✕
        </button>
      </div>

      <div className="dl-body">
        {diceLog.length === 0 ? (
          <p className="dl-empty">No rolls yet this session.</p>
        ) : (
          <ul className="dl-list">
            {diceLog.map((entry) => (
              <li key={entry.id} className="dl-entry">
                <div className="dl-entry-top">
                  <span className="dl-time">{formatTime(entry.timestamp)}</span>
                  <span className={`dl-roller ${entry.roller === 'DM' ? 'dl-roller-dm' : 'dl-roller-player'}`}>
                    {entry.roller}
                  </span>
                  {entry.secret && <span className="dl-secret-badge">Secret</span>}
                </div>
                <div className="dl-entry-bottom">
                  <span className="dl-dice">{entry.dice}</span>
                  <span className="dl-values">[{entry.values.join(', ')}]</span>
                  {entry.modifier !== 0 && (
                    <span className="dl-modifier">
                      {entry.modifier > 0 ? `+${entry.modifier}` : entry.modifier}
                    </span>
                  )}
                  <span className="dl-equals">=</span>
                  <span className="dl-total">{entry.total}</span>
                </div>
                {entry.skill && (
                  <div className="dl-skill">{entry.skill}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .dice-log-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        .dl-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .dl-title {
          font-size: var(--font-size-sm);
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .dl-close {
          padding: 2px 6px;
          font-size: var(--font-size-xs);
          opacity: 0.7;
        }

        .dl-close:hover {
          opacity: 1;
        }

        .dl-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2) 0;
        }

        .dl-empty {
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          font-style: italic;
          padding: var(--space-4);
          text-align: center;
        }

        .dl-list {
          list-style: none;
          display: flex;
          flex-direction: column;
        }

        .dl-entry {
          padding: var(--space-2) var(--space-4);
          border-bottom: 1px solid var(--border);
          transition: background var(--transition);
        }

        .dl-entry:hover {
          background: var(--bg-secondary);
        }

        .dl-entry-top {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: 3px;
        }

        .dl-time {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .dl-roller {
          font-size: var(--font-size-xs);
          font-weight: 600;
        }

        .dl-roller-dm {
          color: var(--accent);
        }

        .dl-roller-player {
          color: var(--text-secondary);
        }

        .dl-secret-badge {
          font-size: 10px;
          padding: 1px 5px;
          background: rgba(100, 100, 100, 0.2);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .dl-entry-bottom {
          display: flex;
          align-items: baseline;
          gap: 5px;
          flex-wrap: wrap;
        }

        .dl-dice {
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
        }

        .dl-values {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .dl-modifier {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .dl-equals {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .dl-total {
          font-size: var(--font-size-lg);
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-mono);
          line-height: 1;
        }

        .dl-skill {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          margin-top: 2px;
        }

        @media (max-width: 900px) {
          .dice-log-panel {
            position: fixed;
            top: var(--header-height);
            right: 0;
            bottom: 0;
            width: min(var(--sidebar-width), 100vw);
            z-index: 200;
            box-shadow: -4px 0 20px var(--shadow-lg);
          }
        }
      `}</style>
    </div>
  )
}
