import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'

/**
 * Private per-player notes stored entirely in localStorage.
 * Never sent to the server — invisible to the DM.
 * Includes auto-resize, debounced saving, and a character count.
 */
export function PersonalNotes() {
  const settings = useGameStore((s) => s.settings)
  const storageKey = `personal-notes-${settings.playerName}`

  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? ''
    } catch {
      return ''
    }
  })
  const [saved, setSaved] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resize textarea to fit content
  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Load from storage when player name changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) ?? ''
      setNotes(stored)
      setSaved(true)
    } catch {
      // ignore
    }
  }, [storageKey])

  // Auto-resize on content change
  useEffect(() => {
    autoResize()
  }, [notes])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNotes(value)
    setSaved(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, value)
        setSaved(true)
      } catch {
        // ignore storage errors
      }
    }, 500)
  }, [storageKey])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div
      className="personal-notes"
      role="region"
      aria-label="My Private Notes"
      style={{
        background: 'var(--bg-panel, var(--bg-secondary))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 6px)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          🔒 My Private Notes
        </span>
        <span style={{
          fontSize: '0.65rem',
          color: saved ? 'var(--accent-success, #4caf50)' : 'var(--text-muted)',
          fontStyle: 'italic',
        }}>
          {saved ? 'Saved' : 'Saving…'}
        </span>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '0.5rem 0.75rem' }}>
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={handleChange}
          placeholder="Your private notes (never shared with the DM)…"
          aria-label="Private notes textarea"
          rows={6}
          style={{
            flex: 1,
            width: '100%',
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            fontFamily: 'inherit',
            overflow: 'hidden',
            minHeight: '120px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Footer: character count */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '0.25rem 0.75rem',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          {notes.length.toLocaleString()} characters
        </span>
      </div>
    </div>
  )
}
