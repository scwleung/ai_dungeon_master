import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { NarrativeLog } from './NarrativeLog'
import { PlayerInput } from './PlayerInput'
import { CharacterSheet } from './CharacterSheet'
import { DiceCamera } from './DiceCamera'
import { DMVoice } from './DMVoice'

/**
 * Root layout for an active play session.
 *
 * Mounts the WebSocket connection via {@link useWebSocket} and arranges the
 * two-panel layout: the left {@link NarrativeLog} + {@link PlayerInput} panel
 * and an optional right {@link CharacterSheet} sidebar for the current player's
 * character. A session top-bar shows the campaign name, connection status,
 * active-player pills, and the "End Session" action.
 *
 * When a `pendingRoll` appears in the store the {@link DiceCamera} overlay is
 * displayed automatically. {@link DMVoice} is mounted as a hidden audio driver
 * that auto-plays DM narration via the configured TTS provider.
 *
 * Reads all necessary state from the Zustand store; no props are required.
 */
export function SessionView() {
  const {
    activeSession,
    activeCampaign,
    settings,
    characters,
    activePlayers,
    pendingRoll,
    updateCharacter,
    endSession,
    setView,
  } = useGameStore()

  const [showDiceCamera, setShowDiceCamera] = useState(false)
  const [showCharPanel, setShowCharPanel] = useState(true)
  const [endingSession, setEndingSession] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)

  const { connected, sendAction, sendVoiceTranscript, sendDiceImage, sendManualRoll } =
    useWebSocket(activeSession?.id ?? null)

  // Auto-show dice camera when a roll is pending
  useEffect(() => {
    if (pendingRoll) {
      setShowDiceCamera(true)
    }
  }, [pendingRoll])

  // Find current player's character
  const myCharacter = characters.find(
    (c) => c.player_name === settings.playerName
  ) ?? characters[0] ?? null

  async function handleEndSession() {
    setEndingSession(true)
    setEndError(null)
    try {
      await endSession()
      setView('campaign_detail')
    } catch (err) {
      setEndError(err instanceof Error ? err.message : 'Failed to end session.')
      setEndingSession(false)
    }
  }

  if (!activeSession) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading session...</span>
      </div>
    )
  }

  return (
    <div className="session-view">
      {/* Session Top Bar */}
      <div className="session-topbar">
        <div className="session-info">
          {activeCampaign && (
            <span className="session-campaign">{activeCampaign.name}</span>
          )}
          <div className={`conn-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="conn-dot" />
            {connected ? 'Connected' : 'Reconnecting...'}
          </div>
        </div>

        {/* Active Players */}
        <div className="active-players">
          {activePlayers.map((p) => (
            <span
              key={p.player_id}
              className={`player-pill ${p.player_id === settings.playerId ? 'me' : ''}`}
              title={p.player_id === settings.playerId ? 'You' : p.player_name}
            >
              {p.player_name}
              {p.player_id === settings.playerId && ' (you)'}
            </span>
          ))}
        </div>

        <div className="session-actions">
          {myCharacter && (
            <button
              className={`char-toggle-btn btn-ghost btn-sm ${showCharPanel ? 'active' : ''}`}
              onClick={() => setShowCharPanel((v) => !v)}
              title={showCharPanel ? 'Hide character sheet' : 'Show character sheet'}
            >
              ⚔ Sheet
            </button>
          )}
          <button
            className="btn-danger btn-sm"
            onClick={handleEndSession}
            disabled={endingSession}
            title="End this session"
          >
            {endingSession ? 'Ending...' : '⏹ End Session'}
          </button>
        </div>
      </div>

      {endError && <div className="error-banner session-error">{endError}</div>}

      {/* Main content */}
      <div className="session-main">
        {/* Left Panel: Narrative + Input */}
        <div className="narrative-panel">
          <NarrativeLog />
          <PlayerInput
            onSendAction={sendAction}
            onSendVoiceTranscript={sendVoiceTranscript}
            onOpenDiceCamera={() => setShowDiceCamera(true)}
            connected={connected}
          />
        </div>

        {/* Right Panel: Character Sheet */}
        {myCharacter && showCharPanel && (
          <div className="char-sheet-panel">
            <CharacterSheet
              character={myCharacter}
              onUpdate={updateCharacter}
            />
          </div>
        )}
      </div>

      {/* Dice Camera Overlay */}
      {showDiceCamera && pendingRoll && (
        <DiceCamera
          onSendDiceImage={sendDiceImage}
          onSendManualRoll={sendManualRoll}
          onClose={() => setShowDiceCamera(false)}
        />
      )}

      {/* DM Voice (hidden, auto-plays) */}
      <DMVoice />

      <style>{`
        .session-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* Top bar */
        .session-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-5);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .session-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          min-width: 0;
        }

        .session-campaign {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-secondary);
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
        }

        .conn-status {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
        }

        .conn-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          transition: background var(--transition);
        }

        .conn-status.connected .conn-dot {
          background: var(--accent-success);
          box-shadow: 0 0 4px var(--accent-success);
        }

        .conn-status.disconnected .conn-dot {
          background: var(--accent-danger);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .conn-status.disconnected {
          color: var(--accent-danger);
        }

        .active-players {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
          flex: 1;
          justify-content: center;
        }

        .player-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 10px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .player-pill.me {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(196, 130, 10, 0.08);
        }

        .session-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .char-toggle-btn.active {
          border-color: var(--accent);
          color: var(--accent);
        }

        .session-error {
          margin: var(--space-2) var(--space-4);
        }

        /* Main layout */
        .session-main {
          flex: 1;
          display: flex;
          overflow: hidden;
          min-height: 0;
        }

        .narrative-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .char-sheet-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        @media (max-width: 900px) {
          .char-sheet-panel {
            position: fixed;
            top: var(--header-height);
            right: 0;
            bottom: 0;
            width: min(var(--sidebar-width), 100vw);
            z-index: 200;
            box-shadow: -4px 0 20px var(--shadow-lg);
          }

          .session-topbar {
            padding: var(--space-2) var(--space-3);
          }

          .active-players {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .session-campaign {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
