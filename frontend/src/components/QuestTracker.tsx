/**
 * Quest log panel displaying active, completed, and failed quests.
 *
 * Quests are pushed from the server via `quest_update` WebSocket messages and
 * stored in the Zustand store by {@link useWebSocket}. The DM advances quest
 * state via the `upsert_quest` tool.
 */
import { useGameStore } from '../store/gameStore'
import type { Quest } from '../types'

const STATUS_ORDER: Quest['status'][] = ['active', 'completed', 'failed']

const STATUS_LABELS: Record<Quest['status'], string> = {
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
}

const STATUS_BADGE_CLASS: Record<Quest['status'], string> = {
  active: 'quest-badge--active',
  completed: 'quest-badge--completed',
  failed: 'quest-badge--failed',
}

export function QuestTracker({ onClose }: { onClose: () => void }) {
  const { quests } = useGameStore()

  const grouped = STATUS_ORDER.reduce<Record<Quest['status'], Quest[]>>(
    (acc, status) => {
      acc[status] = quests.filter((q) => q.status === status)
      return acc
    },
    { active: [], completed: [], failed: [] }
  )

  const hasAny = quests.length > 0

  return (
    <div className="quest-tracker">
      <div className="quest-tracker-header">
        <span className="quest-tracker-title">Quests</span>
        <button className="quest-close-btn btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      {!hasAny ? (
        <div className="quest-empty-state">
          <p>No quests yet. The DM will add quests as the story unfolds.</p>
        </div>
      ) : (
        <div className="quest-list">
          {STATUS_ORDER.map((status) => {
            const group = grouped[status]
            if (group.length === 0) return null
            return (
              <div key={status} className="quest-group">
                <div className="quest-group-label">{STATUS_LABELS[status]}</div>
                {group.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      <style>{questStyles}</style>
    </div>
  )
}

function QuestCard({ quest }: { quest: Quest }) {
  return (
    <div className="quest-card">
      <div className="quest-card-top">
        <span className="quest-name">{quest.name}</span>
        <span className={`quest-badge ${STATUS_BADGE_CLASS[quest.status]}`}>
          {STATUS_LABELS[quest.status]}
        </span>
      </div>
      {quest.description && (
        <div className="quest-description">{quest.description}</div>
      )}
    </div>
  )
}

const questStyles = `
  .quest-tracker {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg-panel);
  }

  .quest-tracker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .quest-tracker-title {
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .quest-close-btn {
    padding: 2px 6px;
    font-size: var(--font-size-xs);
  }

  .quest-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--text-muted);
    text-align: center;
    flex: 1;
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  .quest-empty-state p {
    margin: 0;
  }

  .quest-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .quest-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .quest-group-label {
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    padding: 0 var(--space-1);
    margin-bottom: var(--space-1);
  }

  .quest-card {
    padding: var(--space-2) var(--space-3);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .quest-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .quest-name {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quest-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .quest-badge--active {
    background: rgba(196, 130, 10, 0.15);
    border: 1px solid var(--accent);
    color: var(--accent);
  }

  .quest-badge--completed {
    background: rgba(45, 110, 45, 0.15);
    border: 1px solid var(--accent-success);
    color: var(--accent-success);
  }

  .quest-badge--failed {
    background: rgba(140, 40, 40, 0.15);
    border: 1px solid var(--accent-danger);
    color: var(--accent-danger);
  }

  .quest-description {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    line-height: 1.4;
    margin-top: 2px;
  }
`
