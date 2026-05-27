import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

interface Props {
  sessionId: string
  onClose: () => void
}

export default function DMNotes({ sessionId, onClose }: Props) {
  const [text, setText] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.campaigns.getDMNotes(sessionId)
      .then(res => setText(res.dm_notes ?? ''))
      .catch(() => {})
  }, [sessionId])

  const handleChange = useCallback((value: string) => {
    setText(value)
    setSaveStatus('saving')
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(async () => {
      try {
        await api.campaigns.saveDMNotes(sessionId, value)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    }, 1500)
    setDebounceTimer(timer)
  }, [sessionId, debounceTimer])

  useEffect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [debounceTimer])

  return (
    <div style={{
      position: 'fixed', top: 80, right: '1rem', width: 360, maxHeight: 500,
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>🔒 DM Notes (Private)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {saveStatus === 'saving' && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Saving…</span>}
          {saveStatus === 'saved' && <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>Saved</span>}
          <button
            onClick={onClose}
            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >✕</button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Private DM notes (not visible to players)..."
        style={{
          flex: 1, resize: 'none', padding: '0.75rem', fontSize: '0.85rem',
          background: 'var(--bg-primary)', border: 'none', color: 'var(--text-primary)',
          lineHeight: 1.6, minHeight: 200,
        }}
      />
    </div>
  )
}
