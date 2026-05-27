import { useState } from 'react'

interface Props {
  onClose: () => void
}

const MONSTERS = [
  { name: 'Rat', cr: '0', hp: 1, ac: 10, speed: 20, size: 'Tiny', attacks: 'Bite +0 (1)' },
  { name: 'Commoner', cr: '0', hp: 4, ac: 10, speed: 30, size: 'Medium', attacks: 'Club +2 (1d4)' },
  { name: 'Kobold', cr: '1/8', hp: 5, ac: 12, speed: 30, size: 'Small', attacks: 'Dagger +4 (1d4+2)' },
  { name: 'Guard', cr: '1/8', hp: 11, ac: 16, speed: 30, size: 'Medium', attacks: 'Spear +3 (1d6+1)' },
  { name: 'Goblin', cr: '1/4', hp: 7, ac: 15, speed: 30, size: 'Small', attacks: 'Scimitar +4 (1d6+2)' },
  { name: 'Skeleton', cr: '1/4', hp: 13, ac: 13, speed: 30, size: 'Medium', attacks: 'Shortsword +4 (1d6+2)' },
  { name: 'Wolf', cr: '1/4', hp: 11, ac: 13, speed: 40, size: 'Medium', attacks: 'Bite +4 (2d4+2)' },
  { name: 'Zombie', cr: '1/4', hp: 22, ac: 8, speed: 20, size: 'Medium', attacks: 'Slam +3 (1d6+1)' },
  { name: 'Orc', cr: '1/2', hp: 15, ac: 13, speed: 30, size: 'Medium', attacks: 'Greataxe +5 (1d12+3)' },
  { name: 'Black Bear', cr: '1/2', hp: 19, ac: 11, speed: 40, size: 'Medium', attacks: 'Claw +5 (2d6+4)' },
  { name: 'Scout', cr: '1/2', hp: 16, ac: 13, speed: 30, size: 'Medium', attacks: 'Shortsword +4 (1d6+2)' },
  { name: 'Bugbear', cr: '1', hp: 27, ac: 16, speed: 30, size: 'Medium', attacks: 'Morningstar +4 (2d8+2)' },
  { name: 'Dire Wolf', cr: '1', hp: 37, ac: 14, speed: 50, size: 'Large', attacks: 'Bite +5 (2d6+3)' },
  { name: 'Ghoul', cr: '1', hp: 22, ac: 12, speed: 30, size: 'Medium', attacks: 'Claws +4 (2d4+2)' },
  { name: 'Goblin Boss', cr: '1', hp: 21, ac: 17, speed: 30, size: 'Small', attacks: 'Scimitar +4 (2d6+2)' },
  { name: 'Bandit Captain', cr: '2', hp: 65, ac: 15, speed: 30, size: 'Medium', attacks: 'Scimitar +5 (2d6+3)' },
  { name: 'Gargoyle', cr: '2', hp: 52, ac: 15, speed: 30, size: 'Medium', attacks: 'Claw +4 (2d6+2)' },
  { name: 'Ogre', cr: '2', hp: 59, ac: 11, speed: 40, size: 'Large', attacks: 'Greatclub +6 (2d8+4)' },
  { name: 'Owlbear', cr: '3', hp: 59, ac: 13, speed: 40, size: 'Large', attacks: 'Beak +7 (1d10+5)' },
  { name: 'Wight', cr: '3', hp: 45, ac: 14, speed: 30, size: 'Medium', attacks: 'Longsword +4 (1d8+2)' },
  { name: 'Banshee', cr: '4', hp: 58, ac: 12, speed: 40, size: 'Medium', attacks: 'Corrupting Touch +2 (3d6)' },
  { name: 'Ettin', cr: '4', hp: 85, ac: 12, speed: 40, size: 'Large', attacks: 'Battleaxe +7 (2x, 2d8+5)' },
  { name: 'Gladiator', cr: '5', hp: 112, ac: 16, speed: 30, size: 'Medium', attacks: 'Spear +7 (3x, 2d6+4)' },
  { name: 'Hill Giant', cr: '5', hp: 105, ac: 13, speed: 40, size: 'Huge', attacks: 'Greatclub +8 (2x, 3d8+5)' },
  { name: 'Troll', cr: '5', hp: 84, ac: 15, speed: 30, size: 'Large', attacks: 'Claw +7 (2d6+4)' },
  { name: 'Young Red Dragon', cr: '10', hp: 178, ac: 18, speed: 40, size: 'Large', attacks: 'Fire Breath (10d10) + Bite +10 (2d10+6)' },
  { name: 'Mummy Lord', cr: '15', hp: 97, ac: 17, speed: 20, size: 'Medium', attacks: 'Fist +8 (3d6+4)' },
  { name: 'Adult Red Dragon', cr: '17', hp: 256, ac: 19, speed: 40, size: 'Huge', attacks: 'Fire Breath (18d10) + Bite +14 (2d10+8)' },
  { name: 'Lich', cr: '21', hp: 135, ac: 17, speed: 30, size: 'Medium', attacks: 'Paralyzing Touch +12 (3d6)' },
  { name: 'Ancient Red Dragon', cr: '24', hp: 546, ac: 22, speed: 40, size: 'Gargantuan', attacks: 'Fire Breath (26d10) + Bite +17 (2d10+10)' },
]

const CR_OPTIONS = ['All', '0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '10+']

function crValue(cr: string): number {
  if (cr === '1/8') return 0.125
  if (cr === '1/4') return 0.25
  if (cr === '1/2') return 0.5
  return parseFloat(cr) || 0
}

export default function Bestiary({ onClose }: Props) {
  const [search, setSearch] = useState('')
  const [crFilter, setCrFilter] = useState('All')
  const [copiedName, setCopiedName] = useState<string | null>(null)

  const filtered = MONSTERS.filter((m) => {
    const matchesName = m.name.toLowerCase().includes(search.toLowerCase())
    if (!matchesName) return false
    if (crFilter === 'All') return true
    if (crFilter === '10+') return crValue(m.cr) >= 10
    return m.cr === crFilter
  })

  async function handleCopy(name: string) {
    try {
      await navigator.clipboard.writeText(name)
    } catch {
      const el = document.createElement('textarea')
      el.value = name
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedName(name)
    setTimeout(() => setCopiedName(null), 1500)
  }

  return (
    <div style={{
      position: 'fixed', top: 80, right: 16, zIndex: 400,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem', width: 360,
      maxHeight: '75vh', overflow: 'auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)', fontSize: '0.9rem' }}>📖 Bestiary</strong>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1rem' }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Search monsters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.8rem',
            background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
            borderRadius: 4, color: 'var(--color-text, #e0d6c8)',
          }}
        />
        <select
          value={crFilter}
          onChange={(e) => setCrFilter(e.target.value)}
          style={{
            padding: '0.3rem 0.4rem', fontSize: '0.8rem',
            background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)',
            borderRadius: 4, color: 'var(--color-text, #e0d6c8)', flexShrink: 0,
          }}
        >
          {CR_OPTIONS.map((cr) => (
            <option key={cr} value={cr}>CR {cr}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {filtered.map((m) => (
          <div
            key={m.name}
            onClick={() => handleCopy(m.name)}
            title="Click to copy name"
            style={{
              position: 'relative',
              padding: '0.4rem 0.6rem', fontSize: '0.8rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border, #333)',
              borderRadius: 4, cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent, #c4820a)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border, #333)' }}
          >
            {copiedName === m.name && (
              <span style={{
                position: 'absolute', top: 4, right: 6, fontSize: '0.7rem',
                color: 'var(--color-accent, #c4820a)', fontWeight: 'bold',
              }}>Copied!</span>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--color-text, #e0d6c8)' }}>{m.name}</strong>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>CR {m.cr}</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>|</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>HP {m.hp}</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>|</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>AC {m.ac}</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>|</span>
              <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>Spd {m.speed} ft</span>
            </div>
            <div style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem', marginTop: '0.15rem', fontStyle: 'italic' }}>
              {m.attacks}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted, #888)', fontStyle: 'italic', textAlign: 'center' }}>
            No monsters found.
          </p>
        )}
      </div>
    </div>
  )
}
