import { useGameStore } from '../store/gameStore'
import type { NPC } from '../types'

const ATTITUDE_ORDER: NPC['attitude'][] = ['friendly', 'hostile', 'neutral', 'unknown']

const ATTITUDE_LABELS: Record<NPC['attitude'], string> = {
  friendly: 'Friendly',
  neutral: 'Neutral',
  hostile: 'Hostile',
  unknown: 'Unknown',
}

const ATTITUDE_BADGE_CLASS: Record<NPC['attitude'], string> = {
  friendly: 'npc-badge--friendly',
  neutral: 'npc-badge--neutral',
  hostile: 'npc-badge--hostile',
  unknown: 'npc-badge--unknown',
}

/**
 * NPC registry panel that displays known NPCs grouped by their attitude
 * towards the party.
 *
 * NPCs are pushed from the server via `npc_update` WebSocket messages and stored
 * in the Zustand store by {@link useWebSocket}.
 */
export function NPCTracker({ onClose }: { onClose: () => void }) {
  const npcs = useGameStore(s => s.npcs)

  const grouped = ATTITUDE_ORDER.reduce<Record<NPC['attitude'], NPC[]>>(
    (acc, att) => {
      acc[att] = npcs.filter((n) => n.attitude === att)
      return acc
    },
    { friendly: [], neutral: [], hostile: [], unknown: [] }
  )

  const hasAny = npcs.length > 0

  return (
    <div className="npc-tracker">
      <div className="npc-tracker-header">
        <span className="npc-tracker-title">NPCs</span>
        <button className="npc-close-btn btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      {!hasAny ? (
        <div className="npc-empty-state">
          <p>No NPCs tracked yet</p>
          <span className="npc-empty-sub">NPCs will appear here as the DM introduces them</span>
        </div>
      ) : (
        <div className="npc-list">
          {ATTITUDE_ORDER.map((attitude) => {
            const group = grouped[attitude]
            if (group.length === 0) return null
            return (
              <div key={attitude} className="npc-group">
                <div className="npc-group-label">{ATTITUDE_LABELS[attitude]}</div>
                {group.map((npc) => (
                  <NPCCard key={npc.id} npc={npc} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      <style>{npcStyles}</style>
    </div>
  )
}

function NPCCard({ npc }: { npc: NPC }) {
  return (
    <div className="npc-card">
      <div className="npc-card-top">
        <span className="npc-name">{npc.name}</span>
        <span className={`npc-badge ${ATTITUDE_BADGE_CLASS[npc.attitude]}`}>
          {ATTITUDE_LABELS[npc.attitude]}
        </span>
      </div>
      {npc.faction && (
        <div className="npc-faction">{npc.faction}</div>
      )}
      {npc.location && (
        <div className="npc-location">@ {npc.location}</div>
      )}
      {npc.description && (
        <div className="npc-description">{npc.description}</div>
      )}
    </div>
  )
}

const npcStyles = `
  .npc-tracker {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg-panel);
  }

  .npc-tracker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .npc-tracker-title {
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .npc-close-btn {
    padding: 2px 6px;
    font-size: var(--font-size-xs);
  }

  .npc-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--text-muted);
    text-align: center;
    flex: 1;
  }

  .npc-empty-state p {
    margin: 0;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .npc-empty-sub {
    font-size: var(--font-size-xs);
    font-style: italic;
  }

  .npc-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .npc-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .npc-group-label {
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    padding: 0 var(--space-1);
    margin-bottom: var(--space-1);
  }

  .npc-card {
    padding: var(--space-2) var(--space-3);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .npc-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .npc-name {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .npc-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .npc-badge--friendly {
    background: rgba(45, 110, 45, 0.15);
    border: 1px solid var(--accent-success);
    color: var(--accent-success);
  }

  .npc-badge--hostile {
    background: rgba(140, 40, 40, 0.15);
    border: 1px solid var(--accent-danger);
    color: var(--accent-danger);
  }

  .npc-badge--neutral {
    background: rgba(100, 100, 100, 0.12);
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
  }

  .npc-badge--unknown {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .npc-faction {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-style: italic;
  }

  .npc-location {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .npc-description {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    line-height: 1.4;
    margin-top: 2px;
  }
`
