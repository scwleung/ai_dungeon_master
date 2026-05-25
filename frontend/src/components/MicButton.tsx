import { useEffect, useState } from 'react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function MicButton({ onTranscript, disabled }: Props) {
  const { supported, listening, transcript, startListening, stopListening, clearTranscript } =
    useSpeechRecognition()

  const [pendingTranscript, setPendingTranscript] = useState('')

  useEffect(() => {
    if (transcript) {
      setPendingTranscript(transcript)
    }
  }, [transcript])

  // When listening stops and we have a transcript, auto-confirm
  useEffect(() => {
    if (!listening && pendingTranscript) {
      onTranscript(pendingTranscript)
      setPendingTranscript('')
      clearTranscript()
    }
  }, [listening, pendingTranscript, onTranscript, clearTranscript])

  if (!supported) return null

  function handleClick() {
    if (disabled) return
    if (listening) {
      stopListening()
    } else {
      setPendingTranscript('')
      startListening()
    }
  }

  const state: 'idle' | 'listening' | 'has-transcript' = listening
    ? 'listening'
    : pendingTranscript
      ? 'has-transcript'
      : 'idle'

  return (
    <div className="mic-wrapper">
      {pendingTranscript && !listening && (
        <div className="mic-preview">
          <span className="mic-preview-text">{pendingTranscript}</span>
          <button
            className="mic-preview-clear"
            onClick={() => {
              setPendingTranscript('')
              clearTranscript()
            }}
            title="Clear transcript"
          >
            ✕
          </button>
        </div>
      )}

      <button
        className={`mic-btn mic-btn-${state} btn-icon`}
        onClick={handleClick}
        disabled={disabled}
        title={
          listening
            ? 'Stop recording (click to finish)'
            : 'Start voice input'
        }
        aria-label={listening ? 'Stop recording' : 'Start voice input'}
        aria-pressed={listening}
      >
        {state === 'listening' ? (
          <span className="mic-listening-icon">⏹</span>
        ) : (
          <span className="mic-idle-icon">🎤</span>
        )}
      </button>

      <style>{`
        .mic-wrapper {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .mic-btn {
          width: 38px;
          height: 38px;
          border-radius: var(--radius-full);
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          transition: all var(--transition);
          flex-shrink: 0;
          padding: 0;
        }

        .mic-btn:hover:not(:disabled) {
          border-color: var(--border-light);
          color: var(--text-secondary);
        }

        .mic-btn-listening {
          border-color: #e03030;
          background: rgba(224, 48, 48, 0.1);
          color: #e03030;
          animation: pulse 1.2s ease-in-out infinite;
        }

        .mic-btn-listening:hover:not(:disabled) {
          background: rgba(224, 48, 48, 0.2);
          border-color: #ff4848;
        }

        .mic-btn-has-transcript {
          border-color: var(--accent);
          background: rgba(196, 130, 10, 0.1);
          color: var(--accent);
        }

        .mic-idle-icon,
        .mic-listening-icon {
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mic-preview {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius);
          padding: 4px var(--space-3);
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          font-style: italic;
          max-width: 220px;
        }

        .mic-preview-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mic-preview-clear {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          font-size: 0.75rem;
          line-height: 1;
          text-transform: none;
          letter-spacing: 0;
          min-width: unset;
          opacity: 0.7;
        }

        .mic-preview-clear:hover {
          opacity: 1;
          color: var(--accent-danger);
          background: transparent;
          border-color: transparent;
        }
      `}</style>
    </div>
  )
}
