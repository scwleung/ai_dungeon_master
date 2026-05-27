import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface ReadAloudEntry { id: string; title: string; content: string; created_at: string }

interface Props {
  campaignId: string
  isDM: boolean
  onRead: (text: string) => void
  onClose: () => void
}

export default function ReadAloud({ campaignId, isDM, onRead, onClose }: Props) {
  const [entries, setEntries] = useState<ReadAloudEntry[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    try {
      const res = await api.campaigns.getReadalouds(campaignId)
      setEntries(res.readalouds)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load()
  }, [campaignId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) return
    setLoading(true)
    try {
      await api.campaigns.createReadaloud(campaignId, { title: newTitle.trim(), content: newContent.trim() })
      setNewTitle('')
      setNewContent('')
      await load()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.campaigns.deleteReadaloud(campaignId, id)
      await load()
    } catch {
      // ignore
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 80, right: '1rem', width: 380, maxHeight: 560,
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>📢 Read Aloud</span>
        <button onClick={onClose} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {entries.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
            No read-aloud texts yet.
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{entry.title}</strong>
              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <button
                  onClick={() => onRead(entry.content)}
                  style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'var(--accent)', border: 'none', borderRadius: 3, cursor: 'pointer', color: 'var(--bg-primary)' }}
                >Read</button>
                {isDM && (
                  <button
                    onClick={() => handleDelete(entry.id)}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)' }}
                  >✕</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              {entry.content.slice(0, 60)}{entry.content.length > 60 ? '…' : ''}
            </p>
          </div>
        ))}
      </div>

      {isDM && (
        <form onSubmit={handleCreate} style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Title..."
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
          />
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Read-aloud text..."
            rows={3}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', resize: 'vertical' }}
          />
          <button
            type="submit"
            disabled={loading || !newTitle.trim() || !newContent.trim()}
            style={{ fontSize: '0.8rem', padding: '0.3rem', background: 'var(--accent)', border: 'none', borderRadius: 4, cursor: 'pointer', color: 'var(--bg-primary)' }}
          >{loading ? 'Saving…' : 'Add Entry'}</button>
        </form>
      )}
    </div>
  )
}
