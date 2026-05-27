import { useState } from 'react'
import { api } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { Handout } from '../types'

interface Props {
  campaignId: string
  handouts: Handout[]
  isDM: boolean
  onClose: () => void
}

export default function Handouts({ campaignId, handouts, isDM, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<'text' | 'image'>('text')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    try {
      await api.campaigns.deleteHandout(campaignId, id)
      useGameStore.getState().setHandouts(handouts.filter((h) => h.id !== id))
    } catch (err) {
      console.error('Failed to delete handout:', err)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await api.campaigns.createHandout(campaignId, { title: title.trim(), content: content.trim(), type })
      // The WS broadcast handles updating all clients
      setTitle('')
      setContent('')
      setType('text')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create handout.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 80, right: 16, zIndex: 400,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem', width: 320,
      maxHeight: '70vh', overflow: 'auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)', fontSize: '0.9rem' }}>📜 Handouts</strong>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1rem' }}
        >✕</button>
      </div>

      {handouts.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted, #888)', fontStyle: 'italic', marginBottom: '0.75rem' }}>
          No handouts yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {handouts.map((h) => (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border, #333)', borderRadius: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{
                  fontSize: '0.65rem', padding: '0.1rem 0.4rem',
                  background: h.type === 'image' ? 'rgba(0,100,200,0.2)' : 'rgba(100,60,0,0.3)',
                  border: `1px solid ${h.type === 'image' ? 'rgba(0,100,200,0.5)' : 'rgba(196,130,10,0.4)'}`,
                  borderRadius: 3, color: 'var(--color-text, #e0d6c8)',
                  flexShrink: 0,
                }}>
                  {h.type}
                </span>
                <span style={{
                  fontSize: '0.85rem', color: 'var(--color-text, #e0d6c8)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {h.title}
                </span>
              </div>
              {isDM && (
                <button
                  onClick={() => handleDelete(h.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-muted, #888)', fontSize: '0.8rem', flexShrink: 0,
                  }}
                  title="Delete handout"
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isDM && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '1px solid var(--color-border, #333)', paddingTop: '0.75rem' }}>
            New Handout
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                padding: '0.3rem 0.5rem', fontSize: '0.85rem',
                background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
                borderRadius: 4, color: 'var(--color-text, #e0d6c8)', width: '100%', boxSizing: 'border-box',
              }}
              required
            />
            {type === 'text' ? (
              <textarea
                placeholder="Content..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                style={{
                  padding: '0.3rem 0.5rem', fontSize: '0.85rem',
                  background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
                  borderRadius: 4, color: 'var(--color-text, #e0d6c8)', width: '100%',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                required
              />
            ) : (
              <input
                type="url"
                placeholder="Image URL..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  padding: '0.3rem 0.5rem', fontSize: '0.85rem',
                  background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
                  borderRadius: 4, color: 'var(--color-text, #e0d6c8)', width: '100%', boxSizing: 'border-box',
                }}
                required
              />
            )}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--color-text, #e0d6c8)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input type="radio" name="handout-type" value="text" checked={type === 'text'} onChange={() => setType('text')} />
                Text
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input type="radio" name="handout-type" value="image" checked={type === 'image'} onChange={() => setType('image')} />
                Image
              </label>
            </div>
            {error && (
              <p style={{ fontSize: '0.8rem', color: '#e74c3c', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              style={{
                padding: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold',
                background: 'var(--color-accent, #c4820a)', color: '#000',
                border: 'none', borderRadius: 4,
                cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Pushing...' : '📢 Push to Players'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
