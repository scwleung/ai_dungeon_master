import { useCallback, useEffect, useState } from 'react'

type ShortcutHandlers = Record<string, () => void>

/**
 * Hook that registers global keyboard shortcuts.
 * @param handlers - Map of key to callback.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when typing in inputs / textareas
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const handler = handlers[e.key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}

const DEFAULT_SHORTCUTS = [
  { key: '?', description: 'Toggle this help modal' },
  { key: 'n', description: 'Focus narrative/action input' },
  { key: 'd', description: 'Open Dice Roller' },
  { key: 'Escape', description: 'Close open modal or panel' },
]

interface Props {
  onFocusInput?: () => void
  onToggleDice?: () => void
  onEscape?: () => void
}

/**
 * Global keyboard shortcuts handler + help modal.
 * Mount this near the root of the session. It self-registers global keydown listeners.
 */
export default function KeyboardShortcuts({ onFocusInput, onToggleDice, onEscape }: Props) {
  const [showHelp, setShowHelp] = useState(false)

  const handlers = useCallback((): ShortcutHandlers => ({
    '?': () => setShowHelp(v => !v),
    'n': () => {
      onFocusInput?.()
      // Also try to focus the player input directly
      const input = document.querySelector<HTMLElement>('.player-input textarea, .player-input input[type="text"]')
      input?.focus()
    },
    'd': () => {
      onToggleDice?.()
      window.dispatchEvent(new CustomEvent('toggle-dice-roller'))
    },
    'Escape': () => {
      if (showHelp) {
        setShowHelp(false)
        return
      }
      onEscape?.()
      window.dispatchEvent(new CustomEvent('close-all-panels'))
    },
  }), [showHelp, onFocusInput, onToggleDice, onEscape])

  useKeyboardShortcuts(handlers())

  if (!showHelp) return null

  return (
    <div
      className="ks-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ks-title"
      onClick={(e) => { if (e.target === e.currentTarget) setShowHelp(false) }}
    >
      <div className="ks-modal">
        <div className="ks-header">
          <h3 id="ks-title" className="ks-title">Keyboard Shortcuts</h3>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setShowHelp(false)}
            aria-label="Close keyboard shortcuts help"
          >
            ✕
          </button>
        </div>
        <table className="ks-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_SHORTCUTS.map(sc => (
              <tr key={sc.key}>
                <td><kbd className="ks-kbd">{sc.key}</kbd></td>
                <td className="ks-desc">{sc.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ks-note">Shortcuts are disabled when typing in input fields.</p>
      </div>

      <style>{`
        .ks-overlay {
          position: fixed;
          inset: 0;
          background: var(--bg-overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: var(--space-4);
          animation: fadeInScale 0.2s ease;
        }
        .ks-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          padding: var(--space-5) var(--space-6);
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 60px var(--shadow-lg);
        }
        .ks-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
        }
        .ks-title {
          font-size: var(--font-size-lg);
          color: var(--text-primary);
        }
        .ks-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: var(--space-4);
        }
        .ks-table th {
          text-align: left;
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding-bottom: var(--space-2);
          border-bottom: 1px solid var(--border);
          font-weight: 700;
        }
        .ks-table td {
          padding: var(--space-2) var(--space-1);
          border-bottom: 1px solid var(--border);
        }
        .ks-table tr:last-child td {
          border-bottom: none;
        }
        .ks-kbd {
          display: inline-block;
          padding: 1px 6px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius);
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--text-primary);
          white-space: nowrap;
        }
        .ks-desc {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
        }
        .ks-note {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
          margin-bottom: 0;
        }
      `}</style>
    </div>
  )
}
