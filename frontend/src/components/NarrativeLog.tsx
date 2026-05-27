import { useEffect, useRef, useState } from 'react'
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

/**
 * Scrollable narrative log that renders the session message history.
 *
 * DM messages appear left-aligned in italic; player messages are right-aligned;
 * system notices (dice requests, join/leave events) are centred in pill badges.
 * While the DM is streaming a response, a live `StreamingMessage` with a blinking
 * cursor is appended below the history. The log auto-scrolls to the bottom when
 * new content arrives, unless the user has manually scrolled up.
 *
 * Press Ctrl+F or click the search icon to filter messages by text.
 *
 * `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch` are
 * applied to prevent page bounce on iOS when the log reaches its scroll boundary.
 *
 * Reads `messages` and `streamingText` from the Zustand store; no props are required.
 */
export function NarrativeLog() {
  const { messages, streamingText } = useGameStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isNearBottomRef = useRef(true)

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCount, setShowCount] = useState(150)

  const filteredMessages = searchQuery.trim()
    ? messages.filter((msg) =>
        msg.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages

  const visibleMessages = filteredMessages.slice(-showCount)
  const hasMore = filteredMessages.length > showCount

  const matchCount = searchQuery.trim() ? filteredMessages.length : 0

  // Reset showCount when search query changes
  useEffect(() => {
    setShowCount(150)
  }, [searchQuery])

  // Focus search input when it appears
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus()
    }
  }, [showSearch])

  // Track whether user is near the bottom
  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
  }

  // Auto-scroll when new messages arrive or streaming text updates
  useEffect(() => {
    if (isNearBottomRef.current && !searchQuery.trim()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingText, searchQuery])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault()
      setShowSearch((v) => !v)
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setSearchQuery('')
      setShowSearch(false)
    }
  }

  function handleToggleSearch() {
    setShowSearch((v) => {
      if (v) setSearchQuery('')
      return !v
    })
  }

  return (
    <div
      className="narrative-log-wrapper"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}
    >
      {/* Search Bar */}
      {showSearch && (
        <div className="log-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            className="log-search-input"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search messages"
          />
          {searchQuery.trim() && (
            <span className="log-search-count">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            className="log-search-close btn-ghost btn-sm"
            onClick={() => {
              setSearchQuery('')
              setShowSearch(false)
            }}
            aria-label="Close search"
          >
            ×
          </button>
        </div>
      )}

      <div
        className="narrative-log"
        ref={containerRef}
        onScroll={handleScroll}
        aria-live="polite"
        aria-label="Story log"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {/* Search icon button — floats in the top-right of the log */}
        <button
          className="log-search-toggle btn-ghost btn-sm"
          onClick={handleToggleSearch}
          title={showSearch ? 'Hide search' : 'Search messages (Ctrl+F)'}
          aria-label="Toggle search"
        >
          🔍
        </button>

        {filteredMessages.length === 0 && !streamingText && (
          <div className="log-empty">
            {searchQuery.trim() ? (
              <>
                <p className="log-empty-icon">🔍</p>
                <p>No messages match &ldquo;{searchQuery}&rdquo;</p>
              </>
            ) : (
              <>
                <p className="log-empty-icon">⚔</p>
                <p>Your adventure begins when you speak...</p>
              </>
            )}
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => setShowCount(c => c + 100)}
            style={{ width: '100%', padding: '0.4rem', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}
          >Show {filteredMessages.length - showCount} older messages</button>
        )}

        {visibleMessages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} />
        ))}

        {!searchQuery.trim() && streamingText && <StreamingMessage text={streamingText} />}

        <div ref={bottomRef} className="scroll-anchor" />

        <style>{`
          .narrative-log-wrapper {
            position: relative;
          }

          .log-search-bar {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
          }

          .log-search-input {
            flex: 1;
            font-size: var(--font-size-sm);
            padding: var(--space-1) var(--space-2);
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
          }

          .log-search-input:focus {
            outline: none;
            border-color: var(--accent);
          }

          .log-search-count {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            white-space: nowrap;
          }

          .log-search-close {
            padding: 2px 8px;
            font-size: var(--font-size-sm);
          }

          .log-search-toggle {
            position: absolute;
            top: var(--space-3);
            right: var(--space-3);
            z-index: 10;
            padding: 2px 6px;
            font-size: var(--font-size-sm);
            opacity: 0.5;
            transition: opacity var(--transition);
          }

          .log-search-toggle:hover {
            opacity: 1;
          }

          .narrative-log {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-5) var(--space-6);
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
            scroll-behavior: smooth;
            position: relative;
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
    </div>
  )
}
