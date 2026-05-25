import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { useTTS } from '../hooks/useTTS'

export function DMVoice() {
  const { messages, settings } = useGameStore()
  const { speak, stop, speaking } = useTTS()
  const lastSpokenIdRef = useRef<string | null>(null)

  // Watch for new DM messages and speak them
  useEffect(() => {
    if (settings.ttsProvider === 'none') return

    // Find the latest DM message
    const dmMessages = messages.filter((m) => m.role === 'dm')
    if (dmMessages.length === 0) return

    const latest = dmMessages[dmMessages.length - 1]

    // Don't re-speak messages we've already spoken
    if (lastSpokenIdRef.current === latest.id) return
    lastSpokenIdRef.current = latest.id

    speak(
      latest.text,
      settings.ttsProvider,
      settings.ttsVoiceId || undefined
    )
  }, [messages, settings.ttsProvider, settings.ttsVoiceId, speak])

  if (!speaking) return null

  return (
    <div className="dm-voice-indicator" aria-live="polite" aria-label="DM is speaking">
      <span className="voice-icon">🔊</span>
      <span className="voice-label">Speaking...</span>
      <button
        className="voice-stop-btn btn-ghost btn-sm"
        onClick={stop}
        title="Stop speech"
        aria-label="Stop speaking"
      >
        ⏹
      </button>

      <style>{`
        .dm-voice-indicator {
          position: fixed;
          bottom: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: var(--space-2);
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-full);
          padding: 6px var(--space-3) 6px var(--space-2);
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          box-shadow: 0 4px 16px var(--shadow);
          z-index: 500;
          animation: fadeIn 0.2s ease;
          pointer-events: all;
        }

        .voice-icon {
          font-size: 0.9rem;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .voice-label {
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: var(--font-size-xs);
        }

        .voice-stop-btn {
          padding: 1px 6px;
          font-size: 0.75rem;
          border-radius: var(--radius-full);
          color: var(--text-muted);
          min-width: unset;
        }

        .voice-stop-btn:hover {
          color: var(--accent-danger);
          border-color: var(--accent-danger);
        }
      `}</style>
    </div>
  )
}
