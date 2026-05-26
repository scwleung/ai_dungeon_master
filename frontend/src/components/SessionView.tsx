import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { NarrativeLog } from './NarrativeLog'
import { PlayerInput } from './PlayerInput'
import { CharacterSheet } from './CharacterSheet'
import { CombatTracker } from './CombatTracker'
import { DiceCamera } from './DiceCamera'
import { DiceRoller } from './DiceRoller'
import { DMVoice } from './DMVoice'
import { DungeonMap } from './DungeonMap'
import { NPCTracker } from './NPCTracker'
import { QuestTracker } from './QuestTracker'

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
    campaignTokens,
    settings,
    characters,
    activePlayers,
    pendingRoll,
    combatActive,
    quests,
    sceneImage,
    setSceneImage,
    updateCharacter,
    loadQuests,
    endSession,
    setView,
  } = useGameStore()

  const isDM = !!(activeCampaign && campaignTokens[activeCampaign.id])

  const [showDiceCamera, setShowDiceCamera] = useState(false)
  const [showDiceRoller, setShowDiceRoller] = useState(false)
  const [showCharPanel, setShowCharPanel] = useState(true)
  const [showMapPanel, setShowMapPanel] = useState(false)
  const [showCombatPanel, setShowCombatPanel] = useState(false)
  const [showNpcPanel, setShowNpcPanel] = useState(false)
  const [showQuestPanel, setShowQuestPanel] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const { connected, sendAction, sendVoiceTranscript, sendDiceImage, sendManualRoll } =
    useWebSocket(activeSession?.id ?? null)

  // Auto-show dice camera and dice roller when a roll is pending
  useEffect(() => {
    if (pendingRoll) {
      setShowDiceCamera(true)
      setShowDiceRoller(true)
    }
  }, [pendingRoll])

  // Auto-show combat panel when combat starts
  useEffect(() => {
    if (combatActive) {
      setShowCombatPanel(true)
    }
  }, [combatActive])

  // Load existing quests when the session starts
  useEffect(() => {
    if (activeCampaign) {
      loadQuests(activeCampaign.id).catch(() => {})
    }
  }, [activeCampaign, loadQuests])

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

  async function handleCopyInvite() {
    if (!activeCampaign) return
    const code = campaignTokens[activeCampaign.id] ?? ''
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
          {isDM && <span className="dm-badge">DM</span>}
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
          <button
            className={`dice-toggle-btn btn-ghost btn-sm ${showDiceRoller ? 'active' : ''}`}
            onClick={() => setShowDiceRoller((v) => !v)}
            title={showDiceRoller ? 'Hide dice roller' : 'Show dice roller'}
          >
            🎲 Dice
          </button>
          <button
            className={`map-toggle-btn btn-ghost btn-sm ${showMapPanel ? 'active' : ''}`}
            onClick={() => setShowMapPanel((v) => !v)}
            title={showMapPanel ? 'Hide dungeon map' : 'Show dungeon map'}
          >
            ⬡ Map
          </button>
          <button
            className={`combat-toggle-btn btn-ghost btn-sm ${showCombatPanel ? 'active' : ''} ${combatActive ? 'combat-active-indicator' : ''}`}
            onClick={() => setShowCombatPanel((v) => !v)}
            title={showCombatPanel ? 'Hide combat tracker' : 'Show combat tracker'}
          >
            ⚔ Combat{combatActive ? ' ●' : ''}
          </button>
          <button
            className={`npc-toggle-btn btn-ghost btn-sm ${showNpcPanel ? 'active' : ''}`}
            onClick={() => setShowNpcPanel((v) => !v)}
            title={showNpcPanel ? 'Hide NPC tracker' : 'Show NPC tracker'}
          >
            ◈ NPCs
          </button>
          <button
            className={`quest-toggle-btn btn-ghost btn-sm ${showQuestPanel ? 'active' : ''}`}
            onClick={() => setShowQuestPanel((v) => !v)}
            title={showQuestPanel ? 'Hide quest log' : 'Show quest log'}
          >
            ⚑ Quests{quests.length > 0 ? ` (${quests.length})` : ''}
          </button>
          {myCharacter && (
            <button
              className={`char-toggle-btn btn-ghost btn-sm ${showCharPanel ? 'active' : ''}`}
              onClick={() => setShowCharPanel((v) => !v)}
              title={showCharPanel ? 'Hide character sheet' : 'Show character sheet'}
            >
              ☰ Sheet
            </button>
          )}
          {isDM && (
            <button
              className="btn-ghost btn-sm invite-btn"
              onClick={handleCopyInvite}
              title="Copy invite link"
            >
              {copiedInvite ? 'Copied!' : '🔗 Invite'}
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
          {/* Scene Image Hero Banner */}
          {sceneImage && (
            <div className="scene-image-banner">
              <button
                className="scene-image-dismiss"
                onClick={() => setSceneImage(null)}
                title="Dismiss scene image"
                aria-label="Dismiss scene image"
              >
                ✕
              </button>
              <img
                src={sceneImage.url}
                alt={sceneImage.description}
                className="scene-image-img"
              />
              {sceneImage.description && (
                <div className="scene-image-caption">{sceneImage.description}</div>
              )}
            </div>
          )}
          <NarrativeLog />
          <PlayerInput
            onSendAction={sendAction}
            onSendVoiceTranscript={sendVoiceTranscript}
            onOpenDiceCamera={() => setShowDiceCamera(true)}
            onOpenDiceRoller={() => setShowDiceRoller(true)}
            connected={connected}
          />
        </div>

        {/* Right Panel: Dice Roller */}
        {showDiceRoller && (
          <DiceRoller
            pendingRoll={pendingRoll}
            onSendManualRoll={sendManualRoll}
            onSendToChat={(text) => sendAction(text)}
            onClose={() => setShowDiceRoller(false)}
          />
        )}

        {/* Right Panel: Combat Tracker */}
        {showCombatPanel && (
          <div className="combat-panel">
            <CombatTracker isDM={isDM} onClose={() => setShowCombatPanel(false)} />
          </div>
        )}

        {/* Right Panel: NPC Tracker */}
        {showNpcPanel && (
          <div className="npc-panel">
            <NPCTracker onClose={() => setShowNpcPanel(false)} />
          </div>
        )}

        {/* Right Panel: Quest Tracker */}
        {showQuestPanel && (
          <div className="quest-panel">
            <QuestTracker onClose={() => setShowQuestPanel(false)} />
          </div>
        )}

        {/* Right Panel: Dungeon Map */}
        {showMapPanel && (
          <div className="map-panel">
            <DungeonMap onClose={() => setShowMapPanel(false)} />
          </div>
        )}

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

        .dm-badge {
          font-size: var(--font-size-xs);
          font-weight: 700;
          color: var(--accent);
          background: rgba(196, 130, 10, 0.15);
          border: 1px solid var(--accent);
          border-radius: var(--radius-full);
          padding: 1px 6px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          flex-shrink: 0;
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

        .char-toggle-btn.active,
        .map-toggle-btn.active,
        .combat-toggle-btn.active,
        .npc-toggle-btn.active,
        .quest-toggle-btn.active,
        .dice-toggle-btn.active {
          border-color: var(--accent);
          color: var(--accent);
        }

        .combat-active-indicator {
          color: var(--accent-danger);
        }

        .combat-active-indicator.active {
          border-color: var(--accent-danger);
          color: var(--accent-danger);
        }

        .map-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        .combat-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        .npc-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        .quest-panel {
          width: var(--sidebar-width);
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        /* Scene image hero banner */
        .scene-image-banner {
          position: relative;
          flex-shrink: 0;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          overflow: hidden;
          max-height: 320px;
        }

        .scene-image-img {
          width: 100%;
          max-height: 280px;
          object-fit: cover;
          display: block;
        }

        .scene-image-caption {
          padding: var(--space-2) var(--space-4);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          background: rgba(0, 0, 0, 0.6);
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
        }

        .scene-image-dismiss {
          position: absolute;
          top: var(--space-2);
          right: var(--space-2);
          z-index: 10;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--font-size-xs);
          transition: background var(--transition);
        }

        .scene-image-dismiss:hover {
          background: rgba(0, 0, 0, 0.85);
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
          .char-sheet-panel,
          .map-panel,
          .combat-panel,
          .npc-panel,
          .quest-panel {
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

        @media (max-width: 640px) {
          .session-topbar {
            flex-direction: column;
            align-items: stretch;
            gap: var(--space-2);
            padding: var(--space-2);
          }

          .session-info {
            justify-content: space-between;
          }

          .session-actions {
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 2px;
          }

          .session-actions::-webkit-scrollbar {
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
