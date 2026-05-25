import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { ThemeSwitcher } from './ThemeSwitcher'
import type { TTSProvider } from '../types'

const TTS_PROVIDERS: { value: TTSProvider; label: string }[] = [
  { value: 'browser', label: 'Browser (built-in)' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'none', label: 'None (silent)' },
]

export function Header() {
  const { view, activeCampaign, settings, updateSettings, setView } = useGameStore()
  const [showSettings, setShowSettings] = useState(false)
  const [playerNameDraft, setPlayerNameDraft] = useState(settings.playerName)
  const [voiceIdDraft, setVoiceIdDraft] = useState(settings.ttsVoiceId)

  function handleSaveSettings() {
    updateSettings({
      playerName: playerNameDraft.trim() || 'Adventurer',
      ttsVoiceId: voiceIdDraft.trim(),
    })
    setShowSettings(false)
  }

  function handleBack() {
    if (view === 'session') {
      setView('campaign_detail')
    } else if (view === 'campaign_detail') {
      setView('campaigns')
    }
  }

  const canGoBack = view === 'campaign_detail' || view === 'session'

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          {canGoBack && (
            <button
              className="btn-ghost btn-icon back-btn"
              onClick={handleBack}
              title="Go back"
            >
              ←
            </button>
          )}
          <button
            className="header-title-btn"
            onClick={() => setView('campaigns')}
          >
            <span className="header-sword">⚔</span>
            <span className="header-title">AI Dungeon Master</span>
          </button>
          {activeCampaign && view !== 'campaigns' && (
            <>
              <span className="header-sep">/</span>
              <span className="header-campaign-name">{activeCampaign.name}</span>
            </>
          )}
        </div>

        <div className="header-right">
          <ThemeSwitcher />
          <button
            className="btn-ghost btn-icon settings-btn"
            onClick={() => {
              setPlayerNameDraft(settings.playerName)
              setVoiceIdDraft(settings.ttsVoiceId)
              setShowSettings(true)
            }}
            title="Settings"
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-box settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button
                className="btn-ghost btn-icon"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="settings-player-name">Your Name</label>
              <input
                id="settings-player-name"
                type="text"
                value={playerNameDraft}
                onChange={(e) => setPlayerNameDraft(e.target.value)}
                placeholder="Enter your adventurer name..."
                maxLength={40}
              />
              <p className="field-hint">
                This is how you appear to other players in the session.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="settings-tts-provider">Voice Provider</label>
              <select
                id="settings-tts-provider"
                value={settings.ttsProvider}
                onChange={(e) =>
                  updateSettings({ ttsProvider: e.target.value as TTSProvider })
                }
              >
                {TTS_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                Controls how the Dungeon Master's narration is read aloud.
              </p>
            </div>

            {(settings.ttsProvider === 'elevenlabs' ||
              settings.ttsProvider === 'openai') && (
              <div className="form-group">
                <label htmlFor="settings-voice-id">Voice ID</label>
                <input
                  id="settings-voice-id"
                  type="text"
                  value={voiceIdDraft}
                  onChange={(e) => setVoiceIdDraft(e.target.value)}
                  placeholder={
                    settings.ttsProvider === 'elevenlabs'
                      ? 'ElevenLabs voice ID (e.g. 21m00Tcm4TlvDq8ikWAM)'
                      : 'OpenAI voice (alloy, echo, fable, onyx, nova, shimmer)'
                  }
                />
                {settings.ttsProvider === 'elevenlabs' && (
                  <p className="field-hint">
                    Find your voice ID in the ElevenLabs dashboard. Leave blank to use server default.
                  </p>
                )}
                {settings.ttsProvider === 'openai' && (
                  <p className="field-hint">
                    Choose from: alloy, echo, fable, onyx, nova, or shimmer.
                  </p>
                )}
              </div>
            )}

            <div className="settings-player-id">
              <span className="field-hint">
                Player ID: <code>{settings.playerId}</code>
              </span>
            </div>

            <div className="modal-actions">
              <button
                className="btn-ghost"
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveSettings}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .app-header {
          height: var(--header-height);
          background: var(--bg-panel);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-5);
          gap: var(--space-4);
          flex-shrink: 0;
          z-index: 100;
          position: relative;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          min-width: 0;
          flex: 1;
        }

        .header-title-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: var(--font-primary);
          font-size: var(--font-size-lg);
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: none;
          padding: 0;
          cursor: pointer;
          transition: color var(--transition);
          white-space: nowrap;
        }

        .header-title-btn:hover {
          color: var(--accent);
          background: transparent;
          border-color: transparent;
        }

        .header-sword {
          font-size: 1.2em;
          color: var(--accent);
        }

        .header-title {
          font-size: var(--font-size-lg);
        }

        .header-sep {
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          margin: 0 var(--space-1);
        }

        .header-campaign-name {
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-shrink: 0;
        }

        .settings-btn {
          font-size: 1.1rem;
          color: var(--text-muted);
          transition: color var(--transition);
        }

        .settings-btn:hover {
          color: var(--accent);
        }

        .back-btn {
          font-size: 1rem;
          color: var(--text-muted);
          transition: color var(--transition);
        }

        .back-btn:hover {
          color: var(--text-secondary);
        }

        .settings-modal {
          max-width: 480px;
        }

        .field-hint {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          margin-top: var(--space-1);
          font-style: italic;
        }

        .settings-player-id {
          padding: var(--space-2) 0;
          margin-bottom: var(--space-4);
        }

        .settings-player-id code {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          background: var(--bg-primary);
          padding: 2px 6px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          color: var(--text-muted);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          margin-top: var(--space-2);
        }

        @media (max-width: 600px) {
          .header-title {
            font-size: var(--font-size-base);
          }
          .header-campaign-name {
            display: none;
          }
        }
      `}</style>
    </>
  )
}
