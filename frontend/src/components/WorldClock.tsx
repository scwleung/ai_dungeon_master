import type { WorldTime } from '../types'

interface Props {
  worldTime: WorldTime
  isDM: boolean
  onUpdate: (data: Partial<WorldTime>) => void
  onClose: () => void
}

const WEATHER_EMOJI: Record<string, string> = {
  clear: '☀️', cloudy: '⛅', rain: '🌧', storm: '⛈', snow: '❄️', fog: '🌫',
}

export default function WorldClock({ worldTime, isDM, onUpdate, onClose }: Props) {
  function adjustTime(hourDelta: number) {
    let newHour = worldTime.hour + hourDelta
    let newDay = worldTime.day

    if (newHour >= 24) {
      newDay += Math.floor(newHour / 24)
      newHour = newHour % 24
    } else if (newHour < 0) {
      const daysBack = Math.ceil(Math.abs(newHour) / 24)
      newDay = Math.max(1, newDay - daysBack)
      newHour = ((newHour % 24) + 24) % 24
    }

    onUpdate({ hour: newHour, day: newDay })
  }

  const timeStr = `${String(worldTime.hour).padStart(2, '0')}:${String(worldTime.minute).padStart(2, '0')}`
  const weatherEmoji = WEATHER_EMOJI[worldTime.weather] ?? '🌤'

  return (
    <div style={{
      position: 'fixed', top: 80, right: 16, zIndex: 400,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem', minWidth: 220,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)', fontSize: '0.9rem' }}>⏰ World Time</strong>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1rem' }}
        >✕</button>
      </div>

      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text, #e0d6c8)' }}>
        Day {worldTime.day}, {worldTime.time_of_day}
      </div>

      <div style={{
        fontSize: '2rem', fontWeight: 'bold', fontFamily: 'monospace',
        color: 'var(--color-text, #e0d6c8)', marginBottom: '0.5rem', letterSpacing: '0.05em',
      }}>
        {timeStr}
      </div>

      <div style={{ fontSize: '0.85rem', color: 'var(--color-text, #e0d6c8)', marginBottom: '0.25rem' }}>
        {weatherEmoji} {worldTime.weather.charAt(0).toUpperCase() + worldTime.weather.slice(1)}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-muted, #888)', marginBottom: isDM ? '0.75rem' : 0 }}>
        {worldTime.temperature.charAt(0).toUpperCase() + worldTime.temperature.slice(1)}
      </div>

      {isDM && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            DM Controls
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {([
              ['+1h', 1],
              ['-1h', -1],
              ['+8h (Rest)', 8],
              ['+1d', 24],
            ] as [string, number][]).map(([label, delta]) => (
              <button
                key={label}
                onClick={() => adjustTime(delta)}
                style={{
                  padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                  background: 'var(--color-bg, #0d0d1a)',
                  border: '1px solid var(--color-border, #333)',
                  borderRadius: 4, cursor: 'pointer',
                  color: 'var(--color-text, #e0d6c8)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: '0.4rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', display: 'block', marginBottom: '0.2rem' }}>
              Weather
            </label>
            <select
              value={worldTime.weather}
              onChange={(e) => onUpdate({ weather: e.target.value })}
              style={{
                width: '100%', padding: '0.25rem', fontSize: '0.8rem',
                background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
                borderRadius: 4, color: 'var(--color-text, #e0d6c8)',
              }}
            >
              {['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'].map((w) => (
                <option key={w} value={w}>{WEATHER_EMOJI[w] ?? ''} {w.charAt(0).toUpperCase() + w.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', display: 'block', marginBottom: '0.2rem' }}>
              Temperature
            </label>
            <select
              value={worldTime.temperature}
              onChange={(e) => onUpdate({ temperature: e.target.value })}
              style={{
                width: '100%', padding: '0.25rem', fontSize: '0.8rem',
                background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
                borderRadius: 4, color: 'var(--color-text, #e0d6c8)',
              }}
            >
              {['freezing', 'cold', 'mild', 'warm', 'hot'].map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
