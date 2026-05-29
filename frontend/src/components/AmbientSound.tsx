import { useEffect, useRef } from 'react'
import type { AmbientSound } from '../types'

interface Props {
  currentAmbient: AmbientSound
  onSelect: (sound: AmbientSound) => void
  onClose: () => void
}

const PRESETS: Array<{ sound: AmbientSound; label: string; emoji: string }> = [
  { sound: 'tavern', label: 'Tavern', emoji: '🍺' },
  { sound: 'dungeon', label: 'Dungeon', emoji: '🏚' },
  { sound: 'battle', label: 'Battle', emoji: '⚔' },
  { sound: 'forest', label: 'Forest', emoji: '🌲' },
  { sound: 'rain', label: 'Rain', emoji: '🌧' },
  { sound: 'none', label: 'None', emoji: '🔇' },
]

export default function AmbientSoundPanel({ currentAmbient, onSelect, onClose }: Props) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<AudioNode[]>([])

  function stopAmbient() {
    nodesRef.current.forEach(n => {
      try { (n as AudioBufferSourceNode).stop?.() } catch { /* ignore */ }
    })
    nodesRef.current = []
  }

  function playAmbient(sound: AmbientSound) {
    stopAmbient()
    if (sound === 'none') return

    let ctx: AudioContext
    try {
      ctx = audioCtxRef.current ?? new AudioContext()
      audioCtxRef.current = ctx
    } catch {
      return
    }

    const bufferSize = ctx.sampleRate * 3
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    let lastSample = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      if (sound === 'rain' || sound === 'battle') {
        data[i] = white * 0.15
      } else {
        lastSample = (lastSample + 0.02 * white) / 1.02
        data[i] = lastSample * 3.5
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    const freqMap: Record<string, number> = {
      tavern: 600, dungeon: 120, battle: 800, forest: 400, rain: 2000,
    }
    filter.frequency.value = freqMap[sound] ?? 400
    filter.Q.value = sound === 'rain' ? 0.5 : 1.5

    const gain = ctx.createGain()
    gain.gain.value = 0.12

    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start()

    nodesRef.current = [source, filter, gain]
  }

  useEffect(() => {
    playAmbient(currentAmbient)
    return () => stopAmbient()
  }, [currentAmbient])

  return (
    <div className="as-panel">
      <div className="as-header">
        <span className="as-title">Ambient Sound</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div className="as-body">
        {currentAmbient !== 'none' && (
          <div className="as-now-playing">
            🎵 Now playing: {PRESETS.find(p => p.sound === currentAmbient)?.label ?? currentAmbient}
          </div>
        )}

        <div className="as-presets">
          {PRESETS.map(preset => (
            <button
              key={preset.sound}
              className={`as-preset-btn btn-ghost ${currentAmbient === preset.sound ? 'as-active' : ''}`}
              onClick={() => onSelect(preset.sound)}
              title={preset.label}
            >
              <span className="as-emoji">{preset.emoji}</span>
              <span className="as-label">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .as-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          min-width: 240px;
        }
        .as-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }
        .as-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .as-body {
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .as-now-playing {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          font-style: italic;
        }
        .as-presets {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-1);
        }
        .as-preset-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: var(--space-2);
          border-radius: var(--radius);
          transition: all var(--transition);
        }
        .as-preset-btn.as-active {
          border-color: var(--accent);
          background: rgba(196, 130, 10, 0.1);
          color: var(--accent);
        }
        .as-emoji {
          font-size: 1.2rem;
        }
        .as-label {
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
        }
        .as-preset-btn.as-active .as-label {
          color: var(--accent);
        }
      `}</style>
    </div>
  )
}
