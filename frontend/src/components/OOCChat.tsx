import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'

interface Props {
  onSend: (text: string) => void
  onClose: () => void
}

export default function OOCChat({ onSend, onClose }: Props) {
  const { oocMessages, clearOOCMessages, settings } = useGameStore()
  const [inputText, setInputText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [oocMessages])

  function handleSend() {
    const text = inputText.trim()
    if (!text) return
    onSend(text)
    setInputText('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatTime(iso: string): string {
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  }

  return (
    <div style={{
      position: 'fixed', bottom: '4rem', right: '1rem', width: 320, maxHeight: 400,
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>💬 OOC Chat</span>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            onClick={clearOOCMessages}
            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)' }}
          >Clear</button>
          <button
            onClick={onClose}
            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >✕</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minHeight: 0 }}>
        {oocMessages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
            No OOC messages yet.
          </div>
        )}
        {oocMessages.map((msg) => (
          <div
            key={msg.id}
            style={{ fontSize: '0.8rem', lineHeight: 1.4, color: msg.player_id === settings.playerId ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem', fontSize: '0.7rem' }}>[{formatTime(msg.timestamp)}]</span>
            <strong>{msg.player_name}:</strong> {msg.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="OOC message..."
          style={{
            flex: 1, fontSize: '0.8rem', padding: '0.3rem 0.5rem',
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 4, color: 'var(--text-primary)',
          }}
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          style={{
            fontSize: '0.8rem', padding: '0.3rem 0.6rem',
            background: 'var(--accent)', border: 'none', borderRadius: 4,
            cursor: 'pointer', color: 'var(--bg-primary)',
          }}
        >Send</button>
      </div>
    </div>
  )
}
