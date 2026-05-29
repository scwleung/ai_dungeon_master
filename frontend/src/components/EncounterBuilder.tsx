import { useState } from 'react'

const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100,
  '5': 1800, '6': 2300, '7': 2900, '8': 3900,
  '9': 5000, '10': 5900, '11': 7200, '12': 8400,
  '13': 10000, '14': 11500, '15': 13000, '16': 15000,
  '17': 18000, '18': 20000, '19': 22000, '20': 25000,
}

const XP_THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400],
  4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
}

const CR_OPTIONS = ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

interface MonsterEntry {
  id: string
  name: string
  cr: string
  count: number
  hp: number
}

interface Props {
  onStartEncounter: (description: string) => void
  onClose: () => void
}

export default function EncounterBuilder({ onStartEncounter, onClose }: Props) {
  const [monsters, setMonsters] = useState<MonsterEntry[]>([])
  const [name, setName] = useState('')
  const [cr, setCr] = useState('1')
  const [count, setCount] = useState(1)
  const [hp, setHp] = useState(10)
  const [partySize, setPartySize] = useState(4)
  const [partyLevel, setPartyLevel] = useState(5)

  function addMonster(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setMonsters(prev => [...prev, {
      id: crypto.randomUUID(),
      name: name.trim(),
      cr, count, hp,
    }])
    setName('')
    setCount(1)
    setHp(10)
  }

  function removeMonster(id: string) {
    setMonsters(prev => prev.filter(m => m.id !== id))
  }

  const totalXp = monsters.reduce((sum, m) => sum + (CR_XP[m.cr] ?? 0) * m.count, 0)

  const levelKey = Math.max(1, Math.min(20, partyLevel))
  const thresholds = XP_THRESHOLDS[levelKey] ?? [25, 50, 75, 100]
  const partyThresholds = thresholds.map(t => t * partySize)

  let difficulty = 'Trivial'
  let diffColor = 'var(--color-muted)'
  if (totalXp >= partyThresholds[3]) { difficulty = 'Deadly'; diffColor = '#e74c3c' }
  else if (totalXp >= partyThresholds[2]) { difficulty = 'Hard'; diffColor = '#e67e22' }
  else if (totalXp >= partyThresholds[1]) { difficulty = 'Medium'; diffColor = '#f1c40f' }
  else if (totalXp >= partyThresholds[0]) { difficulty = 'Easy'; diffColor = '#2ecc71' }

  function handleStart() {
    if (monsters.length === 0) return
    const parts = monsters.map(m => `${m.count}x ${m.name} (CR ${m.cr}, HP ${m.hp})`)
    onStartEncounter(`Start combat with: ${parts.join(', ')}`)
  }

  return (
    <div className="eb-panel">
      <div className="eb-header">
        <span className="eb-title">Encounter Builder</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div className="eb-body">
        <form className="eb-form" onSubmit={addMonster}>
          <input
            className="eb-input"
            type="text"
            placeholder="Monster name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <div className="eb-row">
            <select className="eb-input" value={cr} onChange={e => setCr(e.target.value)}>
              {CR_OPTIONS.map(c => <option key={c} value={c}>CR {c}</option>)}
            </select>
            <input
              className="eb-input"
              type="number" min={1} max={99}
              placeholder="Count"
              value={count}
              onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <input
              className="eb-input"
              type="number" min={1}
              placeholder="HP"
              value={hp}
              onChange={e => setHp(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <button type="submit" className="btn-primary btn-sm" disabled={!name.trim()}>
            + Add Monster
          </button>
        </form>

        {monsters.length > 0 && (
          <div className="eb-list">
            {monsters.map(m => (
              <div key={m.id} className="eb-monster-row">
                <span className="eb-monster-name">{m.count}x {m.name}</span>
                <span className="eb-monster-cr">CR {m.cr}</span>
                <span className="eb-monster-hp">HP {m.hp}</span>
                <span className="eb-monster-xp">{(CR_XP[m.cr] ?? 0) * m.count} XP</span>
                <button
                  className="btn-ghost eb-remove"
                  onClick={() => removeMonster(m.id)}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="eb-party">
          <div className="eb-party-row">
            <label className="eb-label">Party size</label>
            <input
              className="eb-input eb-small"
              type="number" min={1} max={20}
              value={partySize}
              onChange={e => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="eb-party-row">
            <label className="eb-label">Avg level</label>
            <input
              className="eb-input eb-small"
              type="number" min={1} max={20}
              value={partyLevel}
              onChange={e => setPartyLevel(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        {monsters.length > 0 && (
          <div className="eb-summary">
            <div className="eb-xp">Total XP: {totalXp.toLocaleString()}</div>
            <div className="eb-difficulty" style={{ color: diffColor }}>
              Difficulty: {difficulty}
            </div>
            <div className="eb-thresholds">
              Easy: {partyThresholds[0]} / Medium: {partyThresholds[1]} / Hard: {partyThresholds[2]} / Deadly: {partyThresholds[3]}
            </div>
          </div>
        )}

        {monsters.length > 0 && (
          <button className="btn-primary eb-start" onClick={handleStart}>
            ⚔ Start Encounter
          </button>
        )}
      </div>

      <style>{`
        .eb-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          min-width: 280px;
        }
        .eb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }
        .eb-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .eb-body {
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          overflow-y: auto;
        }
        .eb-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .eb-row {
          display: flex;
          gap: var(--space-1);
        }
        .eb-input {
          padding: var(--space-1) var(--space-2);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text-primary);
          font-size: var(--font-size-xs);
          width: 100%;
          box-sizing: border-box;
        }
        .eb-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .eb-small {
          width: 60px;
        }
        .eb-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-top: 1px solid var(--border);
          padding-top: var(--space-2);
        }
        .eb-monster-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          font-size: var(--font-size-xs);
          padding: 2px var(--space-1);
          border-radius: var(--radius);
          background: var(--bg-card);
        }
        .eb-monster-name {
          flex: 1;
          color: var(--text-primary);
          font-weight: 600;
        }
        .eb-monster-cr, .eb-monster-hp {
          color: var(--text-muted);
          font-size: 10px;
        }
        .eb-monster-xp {
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: 10px;
        }
        .eb-remove {
          padding: 0 4px;
          font-size: 10px;
          opacity: 0.5;
        }
        .eb-remove:hover {
          opacity: 1;
          color: var(--accent-danger);
        }
        .eb-party {
          display: flex;
          gap: var(--space-3);
          border-top: 1px solid var(--border);
          padding-top: var(--space-2);
        }
        .eb-party-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .eb-label {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .eb-summary {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--space-2);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .eb-xp {
          font-size: var(--font-size-sm);
          font-weight: 700;
          color: var(--text-primary);
        }
        .eb-difficulty {
          font-size: var(--font-size-sm);
          font-weight: 700;
        }
        .eb-thresholds {
          font-size: 10px;
          color: var(--text-muted);
        }
        .eb-start {
          width: 100%;
        }
      `}</style>
    </div>
  )
}
