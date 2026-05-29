import { useState } from 'react'
import { api } from '../api/client'

interface Props {
  sessionId: number
}

/**
 * Session recap generator — calls the backend to generate an AI recap
 * of the session and displays it in a styled parchment box.
 */
export default function SessionRecap({ sessionId }: Props) {
  const [recap, setRecap] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerateRecap() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.sessions.generateRecap(sessionId) as { recap?: string; text?: string }
      const text = result?.recap ?? result?.text ?? 'No recap generated.'
      setRecap(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recap')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="session-recap">
      <div className="sr-header">
        <span className="sr-title">Session Recap</span>
      </div>

      <div className="sr-body">
        {!recap && !error && (
          <p className="sr-intro">
            Generate an AI-written recap of this session's events, decisions, and memorable moments.
          </p>
        )}

        {error && (
          <p className="sr-error">{error}</p>
        )}

        <button
          className="btn-primary"
          onClick={handleGenerateRecap}
          disabled={loading}
          style={{ width: '100%' }}
          aria-label="Generate session recap"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'center' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              Generating...
            </span>
          ) : (
            recap ? '↺ Regenerate Recap' : '✦ Generate Recap'
          )}
        </button>

        {recap && (
          <div
            className="sr-parchment"
            role="region"
            aria-label="Session recap text"
          >
            <div className="sr-parchment-title">Session Recap</div>
            <blockquote className="sr-text">{recap}</blockquote>
          </div>
        )}
      </div>

      <style>{`
        .session-recap {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-panel);
        }
        .sr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }
        .sr-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .sr-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .sr-intro {
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          font-style: italic;
          margin-bottom: 0;
        }
        .sr-error {
          color: var(--accent-danger);
          font-size: var(--font-size-sm);
          margin-bottom: 0;
        }
        .sr-parchment {
          background: var(--bg-secondary);
          border: 2px solid rgba(196, 130, 10, 0.4);
          border-radius: var(--radius-lg);
          padding: var(--space-5) var(--space-6);
          position: relative;
          box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.3);
        }
        .sr-parchment-title {
          font-size: var(--font-size-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--accent);
          margin-bottom: var(--space-3);
          text-align: center;
        }
        .sr-text {
          font-family: var(--font-primary);
          font-size: var(--font-size-base);
          line-height: 1.8;
          color: var(--text-primary);
          font-style: italic;
          border-left: 3px solid rgba(196, 130, 10, 0.4);
          padding-left: var(--space-4);
          margin: 0;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  )
}
