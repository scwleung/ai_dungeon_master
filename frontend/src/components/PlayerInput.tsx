import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore'
import { MicButton } from './MicButton'

interface Props {
  onSendAction: (text: string) => void
  onSendVoiceTranscript: (text: string) => void
  onOpenDiceCamera: () => void
  onOpenDiceRoller?: () => void
  connected: boolean
}

/**
 * Bottom input bar for the active session.
 *
 * Provides a multiline textarea (submitted with Ctrl+Enter), a {@link MicButton}
 * for voice input, and a send button. When a dice roll is pending a banner
 * appears with three quick-action buttons: "📷 Camera" (opens DiceCamera),
 * "✎ Manual" (also opens DiceCamera in manual mode), and "🎲 Roll" (opens the
 * virtual DiceRoller sidebar). A reconnection warning appears when the WebSocket
 * is down; a "DM is narrating…" indicator shows while streaming.
 *
 * The textarea uses `font-size: max(16px, ...)` to prevent iOS from auto-zooming
 * when the field receives focus.
 *
 * @param onSendAction - Called with the trimmed action text when the user submits.
 * @param onSendVoiceTranscript - Called with the STT transcript when the mic finishes.
 * @param onOpenDiceCamera - Called when the user clicks the Camera or Manual roll button.
 * @param onOpenDiceRoller - Called when the user clicks the "🎲 Roll" button.
 * @param connected - Whether the WebSocket is currently open; disables input when false.
 */
export function PlayerInput({
  onSendAction,
  onSendVoiceTranscript,
  onOpenDiceCamera,
  onOpenDiceRoller,
  connected,
}: Props) {
  const { streamingText, pendingRoll } = useGameStore(useShallow(s => ({ streamingText: s.streamingText, pendingRoll: s.pendingRoll })))
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isStreaming = streamingText.length > 0
  const disabled = isStreaming || !connected

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSendAction(trimmed)
    setText('')
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleMicTranscript(transcript: string) {
    // Send as voice transcript and also populate the text box
    if (!transcript.trim() || disabled) return
    onSendVoiceTranscript(transcript)
    setText((prev) => (prev ? prev + ' ' + transcript : transcript))
    textareaRef.current?.focus()
  }

  return (
    <div className="player-input-container">
      {/* Pending Roll Banner */}
      {pendingRoll && (
        <div className="pending-roll-banner">
          <div className="roll-banner-info">
            <span className="roll-dice">{pendingRoll.dice}</span>
            <span className="roll-skill">{pendingRoll.skill}</span>
            {pendingRoll.dc !== undefined && (
              <span className="roll-dc">DC {pendingRoll.dc}</span>
            )}
          </div>
          <div className="roll-banner-actions">
            <span className="roll-label">Roll required</span>
            <button className="btn-primary btn-sm" onClick={onOpenDiceCamera}>
              📷 Camera
            </button>
            <button className="btn-ghost btn-sm" onClick={onOpenDiceCamera}>
              ✎ Manual
            </button>
            {onOpenDiceRoller && (
              <button className="btn-ghost btn-sm" onClick={onOpenDiceRoller}>
                🎲 Roll
              </button>
            )}
          </div>
        </div>
      )}

      {/* Not connected warning */}
      {!connected && (
        <div className="connection-warning">
          <span className="connection-dot disconnected" />
          Reconnecting to server...
        </div>
      )}

      {/* Streaming state */}
      {isStreaming && (
        <div className="streaming-indicator">
          <span className="streaming-dots">
            <span />
            <span />
            <span />
          </span>
          DM is narrating...
        </div>
      )}

      <div className="input-row">
        <textarea
          ref={textareaRef}
          className="action-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Waiting for the Dungeon Master...'
              : connected
                ? 'Describe your action... (Ctrl+Enter to send)'
                : 'Connecting...'
          }
          disabled={disabled}
          rows={2}
          maxLength={2000}
          aria-label="Player action input"
        />

        <div className="input-controls">
          <MicButton
            onTranscript={handleMicTranscript}
            disabled={disabled}
          />
          <button
            className="btn-primary send-btn"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            title="Send action (Ctrl+Enter)"
            aria-label="Send action"
          >
            <span className="send-icon">→</span>
            <span className="send-label">Send</span>
          </button>
        </div>
      </div>

      <div className="input-footer">
        <span className="input-hint">Ctrl+Enter to send</span>
        {text.length > 1800 && (
          <span className="char-warning">{2000 - text.length} chars left</span>
        )}
      </div>

      <style>{`
        .player-input-container {
          flex-shrink: 0;
          border-top: 1px solid var(--border);
          background: var(--bg-panel);
          padding: var(--space-3) var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        /* Pending Roll Banner */
        .pending-roll-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-4);
          background: rgba(196, 130, 10, 0.1);
          border: 1px solid var(--accent);
          border-radius: var(--radius);
          flex-wrap: wrap;
        }

        .roll-banner-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .roll-dice {
          font-family: var(--font-mono);
          font-size: var(--font-size-lg);
          font-weight: 700;
          color: var(--dice-color);
        }

        .roll-skill {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--font-size-sm);
        }

        .roll-dc {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 2px 8px;
          border-radius: var(--radius-full);
          border: 1px solid var(--border);
        }

        .roll-banner-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .roll-label {
          font-size: var(--font-size-xs);
          color: var(--accent);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        /* Connection warning */
        .connection-warning {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          padding: 4px var(--space-2);
        }

        .connection-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .connection-dot.connected {
          background: var(--accent-success);
          box-shadow: 0 0 4px var(--accent-success);
        }

        .connection-dot.disconnected {
          background: var(--accent-danger);
          animation: pulse 1.5s ease-in-out infinite;
        }

        /* Streaming indicator */
        .streaming-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          padding: 2px var(--space-2);
        }

        .streaming-dots {
          display: flex;
          gap: 3px;
          align-items: center;
        }

        .streaming-dots span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 1.2s ease-in-out infinite;
        }

        .streaming-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .streaming-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }

        /* Input row */
        .input-row {
          display: flex;
          gap: var(--space-3);
          align-items: flex-end;
        }

        .action-textarea {
          flex: 1;
          resize: none;
          font-size: max(16px, var(--font-size-base));
          line-height: 1.5;
          min-height: 56px;
          max-height: 160px;
        }

        .action-textarea:disabled {
          opacity: 0.6;
        }

        .input-controls {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .send-btn {
          height: 38px;
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: 0 var(--space-4);
        }

        .send-icon {
          font-size: 1.1rem;
          line-height: 1;
        }

        .send-label {
          font-size: var(--font-size-sm);
        }

        .input-footer {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          padding: 0 2px;
        }

        .char-warning {
          color: var(--accent-danger);
          font-weight: 600;
        }

        @media (max-width: 480px) {
          .send-label {
            display: none;
          }
          .send-btn {
            padding: 0 var(--space-3);
          }
          .pending-roll-banner {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 360px) {
          .input-row {
            flex-direction: column;
            align-items: stretch;
          }
          .input-controls {
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  )
}
