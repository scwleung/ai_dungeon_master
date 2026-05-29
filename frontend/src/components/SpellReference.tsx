import { useState } from 'react'

interface Props {
  onClose: () => void
}

const SPELLS = [
  { name: 'Fire Bolt', level: 0, school: 'Evocation', range: '120 ft', effect: 'Ranged spell attack, 1d10 fire (2d10 at 5th, 3d10 at 11th, 4d10 at 17th).' },
  { name: 'Prestidigitation', level: 0, school: 'Transmutation', range: '10 ft', effect: 'Minor magical tricks: clean, soil, light/snuff flame, chill/warm, create odor or mark.' },
  { name: 'Eldritch Blast', level: 0, school: 'Evocation', range: '120 ft', effect: 'Ranged spell attack, 1d10 force. Extra beam at 5th, 11th, 17th level.' },
  { name: 'Mage Hand', level: 0, school: 'Conjuration', range: '30 ft', effect: 'Spectral hand manipulates objects up to 10 lb. Concentration, up to 1 min.' },
  { name: 'Minor Illusion', level: 0, school: 'Illusion', range: '30 ft', effect: 'Create a sound or image within 5-ft cube. Lasts 1 min.' },
  { name: 'Cure Wounds', level: 1, school: 'Evocation', range: 'Touch', effect: 'Touch creature heals 1d8 + spellcasting mod HP. +1d8 per slot above 1st.' },
  { name: 'Detect Magic', level: 1, school: 'Divination', range: 'Self', effect: 'Sense magic within 30 ft and see auras. Concentration, up to 10 min. Ritual.' },
  { name: 'Magic Missile', level: 1, school: 'Evocation', range: '120 ft', effect: '3 darts, each deals 1d4+1 force (auto-hit). +1 dart per slot above 1st.' },
  { name: 'Shield', level: 1, school: 'Abjuration', range: 'Self', effect: 'Reaction: +5 AC until start of next turn, immune to Magic Missile.' },
  { name: 'Thunderwave', level: 1, school: 'Evocation', range: 'Self (15-ft cube)', effect: 'Creatures in cube: 2d8 thunder, pushed 10 ft (save for half, no push). +2d8 per slot above 1st.' },
  { name: 'Charm Person', level: 1, school: 'Enchantment', range: '30 ft', effect: 'Charmed until end of long rest or takes damage. WIS save. +1 target per slot above 1st.' },
  { name: 'Burning Hands', level: 1, school: 'Evocation', range: 'Self (15-ft cone)', effect: '3d6 fire, DEX save for half. +1d6 per slot above 1st.' },
  { name: 'Hold Person', level: 2, school: 'Enchantment', range: '60 ft', effect: 'Paralyze humanoid. WIS save each turn. Concentration, up to 1 min. +1 target per slot above 2nd.' },
  { name: 'Misty Step', level: 2, school: 'Conjuration', range: 'Self', effect: 'Bonus action: teleport up to 30 ft to unoccupied visible space.' },
  { name: 'Invisibility', level: 2, school: 'Illusion', range: 'Touch', effect: 'Target invisible until it attacks or casts. Concentration, up to 1 hr. +1 target per slot above 2nd.' },
  { name: 'Shatter', level: 2, school: 'Evocation', range: '60 ft', effect: '10-ft-radius sphere: 3d8 thunder, CON save for half. +1d8 per slot above 2nd.' },
  { name: 'Mirror Image', level: 2, school: 'Illusion', range: 'Self', effect: '3 illusory duplicates. Attackers may hit duplicate instead (AC 10). 1 min, no conc.' },
  { name: 'Fireball', level: 3, school: 'Evocation', range: '150 ft', effect: '20-ft-radius explosion: 8d6 fire, DEX save for half. +1d6 per slot above 3rd.' },
  { name: 'Lightning Bolt', level: 3, school: 'Evocation', range: 'Self (100-ft line)', effect: '8d6 lightning in a line, DEX save for half. +1d6 per slot above 3rd.' },
  { name: 'Counterspell', level: 3, school: 'Abjuration', range: '60 ft', effect: 'Reaction: interrupt a spell being cast. Auto-negates ≤3rd level; higher needs ability check.' },
  { name: 'Hypnotic Pattern', level: 3, school: 'Illusion', range: '120 ft', effect: 'Creatures in 30-ft cube: WIS save or charmed/incapacitated for 1 min. Concentration.' },
  { name: 'Blink', level: 3, school: 'Transmutation', range: 'Self', effect: 'Roll d20 at end of turn — 11+ you vanish to Ethereal Plane until start of next turn. 1 min.' },
  { name: 'Banishment', level: 4, school: 'Abjuration', range: '60 ft', effect: 'Send creature to demiplane. CHA save. Concentration. 1 min → permanent if maintained.' },
  { name: 'Polymorph', level: 4, school: 'Transmutation', range: '60 ft', effect: 'Transform creature into beast. WIS save (unwilling). Concentration, up to 1 hr.' },
  { name: 'Wall of Fire', level: 4, school: 'Evocation', range: '120 ft', effect: '60-ft wall: 5d8 fire to creatures within 10 ft (DEX save for half). Concentration.' },
  { name: 'Dimension Door', level: 4, school: 'Conjuration', range: '500 ft', effect: 'Teleport self + one willing creature up to 500 ft to known location.' },
  { name: 'Cone of Cold', level: 5, school: 'Evocation', range: 'Self (60-ft cone)', effect: '8d8 cold, CON save for half. +1d8 per slot above 5th.' },
  { name: 'Hold Monster', level: 5, school: 'Enchantment', range: '90 ft', effect: 'Paralyze any creature (not just humanoid). WIS save. Concentration. +1 target per slot above 5th.' },
  { name: 'Wall of Force', level: 5, school: 'Evocation', range: '120 ft', effect: 'Invisible wall (immune to damage). Concentration, up to 10 min.' },
  { name: 'Disintegrate', level: 6, school: 'Transmutation', range: '60 ft', effect: '10d6+40 force, DEX save or disintegrate. Kills at 0 HP.' },
  { name: 'Chain Lightning', level: 6, school: 'Evocation', range: '150 ft', effect: 'Primary: 10d8 lightning. Jumps to 3 secondary targets: 5d8. DEX save for half.' },
  { name: 'Finger of Death', level: 7, school: 'Necromancy', range: '60 ft', effect: '7d8+30 necrotic. CON save for half. Humanoid killed rises as zombie.' },
  { name: 'Power Word Kill', level: 9, school: 'Enchantment', range: '60 ft', effect: 'Creature with ≤100 HP dies instantly. No save.' },
  { name: 'Wish', level: 9, school: 'Conjuration', range: 'Self', effect: 'Duplicate any spell of 8th level or lower, or reshape reality at DM discretion.' },
]

export default function SpellReference({ onClose }: Props) {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | number>('all')

  const filtered = SPELLS.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.school.toLowerCase().includes(search.toLowerCase())
    const matchesLevel = levelFilter === 'all' || s.level === levelFilter
    return matchesSearch && matchesLevel
  })

  return (
    <div style={{
      position: 'fixed', top: 80, right: '1rem', width: 400, maxHeight: 560,
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>✨ Spell Reference</span>
        <button onClick={onClose} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search spells..."
          style={{ flex: 1, fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
        />
        <select
          value={String(levelFilter)}
          onChange={e => setLevelFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
          style={{ fontSize: '0.75rem', padding: '0.3rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          <option value="0">Cantrip</option>
          {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>

      {/* Spell list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
            No spells found.
          </div>
        )}
        {filtered.map(spell => (
          <div key={spell.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{spell.name}</strong>
              <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--accent)', fontWeight: 700 }}>
                {spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{spell.school}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{spell.range}</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{spell.effect}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
