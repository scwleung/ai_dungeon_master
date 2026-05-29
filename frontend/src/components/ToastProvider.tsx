import { useGameStore } from '../store/gameStore'

export default function ToastProvider() {
  const { toasts, removeToast } = useGameStore()

  if (toasts.length === 0) return null

  const colors: Record<string, string> = {
    success: '#27ae60', error: '#e74c3c', info: 'var(--color-accent)', warning: '#f39c12',
  }

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            padding: '0.6rem 1rem', borderRadius: 6,
            background: 'var(--color-surface)',
            border: `1px solid ${colors[t.type] ?? 'var(--color-border)'}`,
            borderLeft: `4px solid ${colors[t.type] ?? 'var(--color-border)'}`,
            color: 'var(--color-text)', fontSize: '0.85rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'auto', cursor: 'pointer',
            animation: 'toast-in 0.2s ease',
            maxWidth: 320,
          }}
        >
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
