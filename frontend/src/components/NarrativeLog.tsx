import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import type { NarrativeMessage } from '../types'

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function MessageItem({ msg }: { msg: NarrativeMessage }) {
  const roleClass = `msg-${msg.role}`
  return (
    <div className={`message-item ${roleClass} animate-fade-in`} title={formatTime(msg.timestamp)}>
      {msg.role === 'player' && msg.player_name && (
        <span className="msg-player-name">{msg.player_name}: </span>
      )}
      <span className="msg-text">{msg.text}</span>
      <span className="msg-timestamp" aria-hidden="true">
        {formatTime(msg.timestamp)}
      </span>
    </div>
  )
}

function StreamingMessage({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="message-item msg-dm msg-streaming animate-fade-in">
      <span className="msg-text">
        {text}
        <span className="streaming-cursor" aria-hidden="true" />
      </span>
    </div>
  )
}

export function NarrativeLog() {
  const { messages, streamingText } = useGameStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  // Track whether user is near the bottom
  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
  }

  // Auto-scroll when new messages arrive or streaming text updates
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingText])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  return (
    <div
      className="narrative-log"
      ref={containerRef}
      onScroll={handleScroll}
      aria-live="polite"
      aria-label="Story log"
    >
      {messages.length === 0 && !streamingText && (
        <div className="log-empty">
          <p className="log-empty-icon">⚔</p>
          <p>Your adventure begins when you speak...</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}

      {streamingText && <StreamingMessage text={streamingText} />}

      <div ref={bottomRef} className="scroll-anchor" />

      <style>{`
        .narrative-log {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-5) var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          scroll-behavior: smooth;
        }

        .scroll-anchor {
          height: 1px;
          flex-shrink: 0;
        }

        .log-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-style: italic;
          gap: var(--space-3);
          text-align: center;
          opacity: 0.6;
        }

        .log-empty-icon {
          font-size: 2.5rem;
          color: var(--accent);
          opacity: 0.4;
          margin-bottom: 0;
        }

        /* === DM Messages === */
        .msg-dm {
          max-width: 90%;
          align-self: flex-start;
          position: relative;
        }

        .msg-dm .msg-text {
          display: block;
          font-style: italic;
          font-size: var(--font-size-lg);
          line-height: 1.75;
          color: var(--text-primary);
        }

        /* fantasy.css and other themes can override .msg-dm for decoration */
        .msg-dm {
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius);
        }

        /* === Player Messages === */
        .msg-player {
          max-width: 75%;
          align-self: flex-end;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius);
          position: relative;
        }

        .msg-player .msg-player-name {
          font-weight: 700;
          color: var(--accent);
          font-size: var(--font-size-sm);
          font-style: normal;
        }

        .msg-player .msg-text {
          color: var(--text-secondary);
          font-size: var(--font-size-base);
          line-height: 1.5;
        }

        /* === System Messages === */
        .msg-system {
          align-self: center;
          text-align: center;
          max-width: 80%;
        }

        .msg-system .msg-text {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          background: var(--bg-secondary);
          padding: 3px var(--space-3);
          border-radius: var(--radius-full);
          border: 1px solid var(--border);
          display: inline-block;
        }

        /* === Timestamps === */
        .msg-timestamp {
          display: none;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          margin-left: var(--space-2);
          font-family: var(--font-mono);
          font-style: normal;
          vertical-align: middle;
          opacity: 0.7;
        }

        .message-item:hover .msg-timestamp {
          display: inline;
        }

        /* === Streaming cursor === */
        .streaming-cursor {
          display: inline-block;
          width: 2px;
          height: 1.1em;
          background: var(--accent);
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink 1s step-end infinite;
        }

        /* === Streaming state === */
        .msg-streaming {
          opacity: 0.9;
        }

        @media (max-width: 768px) {
          .narrative-log {
            padding: var(--space-3) var(--space-4);
          }

          .msg-dm .msg-text {
            font-size: var(--font-size-base);
          }

          .msg-player {
            max-width: 90%;
          }
        }
      `}</style>
    </div>
  )
}
