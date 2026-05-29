import { useState, useEffect } from 'react'
import { api, setAccessCode } from '../api/client'
import type { TimelineEntry } from '../types'

interface Props {
  campaignId: string
  accessCode: string
  onClose: () => void
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function Timeline({ campaignId, accessCode, onClose }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [description, setDescription] = useState('')
  const [sessionTag, setSessionTag] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadTimeline() {
    try {
      setAccessCode(accessCode)
      const res = await api.campaigns.getTimeline(campaignId)
      setEntries([...res.timeline].reverse())
    } catch (err) {
      console.error('Failed to load timeline:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTimeline()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  async function handleDelete(id: string) {
    try {
      setAccessCode(accessCode)
      await api.campaigns.deleteTimelineEntry(campaignId, id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete entry:', err)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      setAccessCode(accessCode)
      await api.campaigns.addTimelineEntry(campaignId, {
        description: description.trim(),
        session_tag: sessionTag.trim() || undefined,
      })
      setDescription('')
      setSessionTag('')
      await loadTimeline()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 80, right: 16, zIndex: 400,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem', width: 340,
      maxHeight: '75vh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)', fontSize: '0.9rem' }}>📅 Timeline</strong>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1rem' }}
        >✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem' }}>
        {loading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted, #888)', fontStyle: 'italic' }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted, #888)', fontStyle: 'italic' }}>No timeline entries yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {entries.map((entry) => (
              <div key={entry.id} style={{
                padding: '0.5rem 0.6rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border, #333)',
                borderRadius: 4, borderLeft: '3px solid var(--color-accent, #c4820a)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', marginBottom: '0.2rem' }}>
                      {formatDate(entry.created_at)}
                      {entry.session_tag && (
                        <span style={{
                          marginLeft: '0.4rem', padding: '0.05rem 0.35rem',
                          background: 'rgba(196,130,10,0.2)', borderRadius: 3,
                          border: '1px solid rgba(196,130,10,0.4)',
                          color: 'var(--color-accent, #c4820a)', fontSize: '0.7rem',
                        }}>
                          {entry.session_tag}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text, #e0d6c8)', lineHeight: 1.4 }}>
                      {entry.description}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-muted, #888)', fontSize: '0.8rem', flexShrink: 0,
                      padding: '0.1rem',
                    }}
                    title="Delete entry"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border, #333)', paddingTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Add Entry
        </div>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <textarea
            placeholder="What happened..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              padding: '0.3rem 0.5rem', fontSize: '0.85rem',
              background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
              borderRadius: 4, color: 'var(--color-text, #e0d6c8)',
              resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
            }}
            required
          />
          <input
            type="text"
            placeholder="Session 3"
            value={sessionTag}
            onChange={(e) => setSessionTag(e.target.value)}
            style={{
              padding: '0.3rem 0.5rem', fontSize: '0.85rem',
              background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
              borderRadius: 4, color: 'var(--color-text, #e0d6c8)', width: '100%', boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ fontSize: '0.8rem', color: '#e74c3c', margin: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            style={{
              padding: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold',
              background: 'var(--color-accent, #c4820a)', color: '#000',
              border: 'none', borderRadius: 4,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Adding...' : '+ Add Entry'}
          </button>
        </form>
      </div>
    </div>
  )
}
