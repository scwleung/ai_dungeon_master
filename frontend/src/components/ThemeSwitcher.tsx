import { useGameStore } from '../store/gameStore'
import type { ThemeName } from '../types'

const THEMES: { name: ThemeName; label: string; icon: string }[] = [
  { name: 'fantasy', label: 'Fantasy', icon: '⚔' },
  { name: 'hud', label: 'HUD', icon: '◈' },
  { name: 'minimal', label: 'Minimal', icon: '◻' },
]

export function ThemeSwitcher() {
  const { settings, updateSettings } = useGameStore()

  function applyTheme(theme: ThemeName) {
    document.body.classList.remove('theme-fantasy', 'theme-hud', 'theme-minimal')
    document.body.classList.add(`theme-${theme}`)
    updateSettings({ theme })
  }

  return (
    <div className="theme-switcher">
      {THEMES.map((t) => (
        <button
          key={t.name}
          className={`theme-btn ${settings.theme === t.name ? 'active' : ''}`}
          onClick={() => applyTheme(t.name)}
          title={`Switch to ${t.label} theme`}
          aria-pressed={settings.theme === t.name}
        >
          <span className="theme-btn-icon">{t.icon}</span>
          <span className="theme-btn-label">{t.label}</span>
        </button>
      ))}

      <style>{`
        .theme-switcher {
          display: flex;
          gap: 4px;
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 3px;
        }

        .theme-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: 1px solid transparent;
          border-radius: calc(var(--radius-lg) - 2px);
          background: transparent;
          color: var(--text-muted);
          font-size: var(--font-size-xs);
          font-family: var(--font-primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all var(--transition);
          white-space: nowrap;
        }

        .theme-btn:hover {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border-color: var(--border);
        }

        .theme-btn.active {
          background: var(--bg-card);
          color: var(--accent);
          border-color: var(--border-light);
        }

        .theme-btn-icon {
          font-size: 0.9em;
          line-height: 1;
        }

        .theme-btn-label {
          line-height: 1;
        }

        @media (max-width: 600px) {
          .theme-btn-label {
            display: none;
          }
          .theme-btn {
            padding: 4px 8px;
          }
        }
      `}</style>
    </div>
  )
}
