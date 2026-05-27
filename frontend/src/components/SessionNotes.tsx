import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'

interface Props {
  onClose: () => void
}

/**
 * Collaborative session notes panel.
 *
 * Changes are applied to the store immediately and persisted to the backend
 * after a 1-second debounce.  A "Saving…" / "Saved" indicator appears in the
 * panel header while the request is in flight.
 */
export function SessionNotes({ onClose }: Props) {
  const { sessionNotes, activeSession, setSessionNotes, saveSessionNotes, loadSessionNotes } =
    useGameStore()

  const [isSaving, setIsSaving] = useState(false)
  const [savedRecently, setSavedRecently] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (activeSession?.id) {
      loadSessionNotes(activeSession.id).catch(() => {})
    }
  }, [activeSession?.id, loadSessionNotes])

  function handleChange(value: string) {
    setSessionNotes(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!activeSession?.id) return
      setIsSaving(true)
      setSavedRecently(false)
      try {
        await saveSessionNotes(activeSession.id, value)
        setSavedRecently(true)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSavedRecently(false), 2000)
      } finally {
        setIsSaving(false)
      }
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  return (
    <div className="session-notes-panel">
      <div className="sn-header">
        <span className="sn-title">📝 Notes</span>
        <div className="sn-header-right">
          {isSaving && <span className="sn-status sn-saving">Saving…</span>}
          {!isSaving && savedRecently && <span className="sn-status sn-saved">Saved</span>}
          <button className="btn-ghost btn-sm sn-close" onClick={onClose} aria-label="Close notes">
            ✕
          </button>
        </div>
      </div>

      <div className="sn-body">
        <textarea
          className="sn-textarea"
          value={sessionNotes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Shared session notes visible to all participants…"
          spellCheck
        />
      </div>

      <style>{`
        .session-notes-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border-left: 1px solid var(--border);
          animation: slideIn 0.2s ease;
        }

        .sn-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .sn-title {
          font-size: var(--font-size-sm);
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .sn-header-right {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .sn-status {
          font-size: var(--font-size-xs);
        }

        .sn-saving {
          color: var(--text-muted);
          font-style: italic;
        }

        .sn-saved {
          color: var(--accent-success);
        }

        .sn-close {
          padding: 2px 6px;
          font-size: var(--font-size-xs);
          opacity: 0.7;
        }

        .sn-close:hover {
          opacity: 1;
        }

        .sn-body {
          flex: 1;
          display: flex;
          overflow: hidden;
          padding: var(--space-3);
        }

        .sn-textarea {
          width: 100%;
          height: 100%;
          resize: none;
          background: var(--bg-primary);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-3);
          font-size: var(--font-size-sm);
          font-family: var(--font-body);
          line-height: 1.6;
          outline: none;
          transition: border-color var(--transition);
        }

        .sn-textarea:focus {
          border-color: var(--accent);
        }

        @media (max-width: 900px) {
          .session-notes-panel {
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
