import { useState } from 'react'

interface Props { onAddToInventory?: (item: string) => void; onClose: () => void }

const EQUIPMENT = [
  // Weapons
  { name: 'Dagger', category: 'Weapon', cost: '2 gp', weight: '1 lb', notes: 'Finesse, light, thrown (20/60)' },
  { name: 'Shortsword', category: 'Weapon', cost: '10 gp', weight: '2 lb', notes: 'Finesse, light, 1d6 piercing' },
  { name: 'Longsword', category: 'Weapon', cost: '15 gp', weight: '3 lb', notes: '1d8 slashing (1d10 two-handed)' },
  { name: 'Greatsword', category: 'Weapon', cost: '50 gp', weight: '6 lb', notes: 'Heavy, two-handed, 2d6 slashing' },
  { name: 'Greataxe', category: 'Weapon', cost: '30 gp', weight: '7 lb', notes: 'Heavy, two-handed, 1d12 slashing' },
  { name: 'Handaxe', category: 'Weapon', cost: '5 gp', weight: '2 lb', notes: 'Light, thrown (20/60), 1d6 slashing' },
  { name: 'Rapier', category: 'Weapon', cost: '25 gp', weight: '2 lb', notes: 'Finesse, 1d8 piercing' },
  { name: 'Quarterstaff', category: 'Weapon', cost: '2 sp', weight: '4 lb', notes: '1d6 bludgeoning (1d8 two-handed)' },
  { name: 'Mace', category: 'Weapon', cost: '5 gp', weight: '4 lb', notes: '1d6 bludgeoning' },
  { name: 'Warhammer', category: 'Weapon', cost: '15 gp', weight: '2 lb', notes: '1d8 bludgeoning (1d10 two-handed)' },
  { name: 'Shortbow', category: 'Weapon', cost: '25 gp', weight: '2 lb', notes: 'Ammunition, range (80/320), two-handed, 1d6 piercing' },
  { name: 'Longbow', category: 'Weapon', cost: '50 gp', weight: '2 lb', notes: 'Heavy, ammunition, range (150/600), two-handed, 1d8 piercing' },
  { name: 'Light Crossbow', category: 'Weapon', cost: '25 gp', weight: '5 lb', notes: 'Ammunition, range (80/320), loading, two-handed, 1d8 piercing' },
  { name: 'Hand Crossbow', category: 'Weapon', cost: '75 gp', weight: '3 lb', notes: 'Ammunition, range (30/120), light, loading, 1d6 piercing' },
  { name: 'Javelin', category: 'Weapon', cost: '5 sp', weight: '2 lb', notes: 'Thrown (30/120), 1d6 piercing' },
  { name: 'Spear', category: 'Weapon', cost: '1 gp', weight: '3 lb', notes: 'Thrown (20/60), versatile (1d8), 1d6 piercing' },
  { name: 'Flail', category: 'Weapon', cost: '10 gp', weight: '2 lb', notes: '1d8 bludgeoning' },
  { name: 'Trident', category: 'Weapon', cost: '5 gp', weight: '4 lb', notes: 'Thrown (20/60), versatile (1d8), 1d6 piercing' },
  // Armor
  { name: 'Padded Armor', category: 'Armor', cost: '5 gp', weight: '8 lb', notes: 'AC 11 + DEX; disadvantage on Stealth' },
  { name: 'Leather Armor', category: 'Armor', cost: '10 gp', weight: '10 lb', notes: 'AC 11 + DEX' },
  { name: 'Studded Leather', category: 'Armor', cost: '45 gp', weight: '13 lb', notes: 'AC 12 + DEX' },
  { name: 'Scale Mail', category: 'Armor', cost: '50 gp', weight: '45 lb', notes: 'AC 14 + DEX (max 2); Stealth disadv.' },
  { name: 'Chain Mail', category: 'Armor', cost: '75 gp', weight: '55 lb', notes: 'AC 16; STR 13 required; Stealth disadv.' },
  { name: 'Breastplate', category: 'Armor', cost: '400 gp', weight: '20 lb', notes: 'AC 14 + DEX (max 2)' },
  { name: 'Half Plate', category: 'Armor', cost: '750 gp', weight: '40 lb', notes: 'AC 15 + DEX (max 2); Stealth disadv.' },
  { name: 'Full Plate', category: 'Armor', cost: '1500 gp', weight: '65 lb', notes: 'AC 18; STR 15 required; Stealth disadv.' },
  { name: 'Shield', category: 'Armor', cost: '10 gp', weight: '6 lb', notes: '+2 AC' },
  // Gear
  { name: 'Backpack', category: 'Gear', cost: '2 gp', weight: '5 lb', notes: 'Holds 30 lb' },
  { name: 'Bedroll', category: 'Gear', cost: '1 gp', weight: '7 lb', notes: '' },
  { name: 'Rope, Hempen (50 ft)', category: 'Gear', cost: '1 gp', weight: '10 lb', notes: '' },
  { name: 'Rope, Silk (50 ft)', category: 'Gear', cost: '10 gp', weight: '5 lb', notes: '' },
  { name: 'Torch', category: 'Gear', cost: '1 cp', weight: '1 lb', notes: 'Bright light 20 ft, dim 20 ft; 1 hr' },
  { name: 'Lantern, Hooded', category: 'Gear', cost: '5 gp', weight: '2 lb', notes: 'Bright light 30 ft; 6 hrs/flask' },
  { name: 'Rations (1 day)', category: 'Gear', cost: '5 sp', weight: '2 lb', notes: '' },
  { name: "Healer's Kit", category: 'Gear', cost: '5 gp', weight: '3 lb', notes: '10 uses: stabilize dying creature' },
  { name: "Thieves' Tools", category: 'Gear', cost: '25 gp', weight: '1 lb', notes: 'Pick locks, disarm traps (proficiency required)' },
  { name: "Herbalism Kit", category: 'Gear', cost: '5 gp', weight: '3 lb', notes: 'Craft antitoxin, poultices' },
  { name: 'Grappling Hook', category: 'Gear', cost: '2 gp', weight: '4 lb', notes: '' },
  { name: 'Mirror, Steel', category: 'Gear', cost: '5 gp', weight: '0.5 lb', notes: '' },
  { name: 'Tinderbox', category: 'Gear', cost: '5 sp', weight: '1 lb', notes: 'Light torch: 1 action; other fire: 1 minute' },
  { name: 'Waterskin', category: 'Gear', cost: '2 sp', weight: '5 lb', notes: 'Holds 4 pints' },
  { name: 'Crowbar', category: 'Gear', cost: '2 gp', weight: '5 lb', notes: 'Advantage on STR checks to open' },
  { name: 'Ink & Quill (1 oz)', category: 'Gear', cost: '10 gp', weight: '0', notes: '' },
  { name: 'Spellbook', category: 'Gear', cost: '50 gp', weight: '3 lb', notes: '100 pages' },
  { name: 'Holy Symbol', category: 'Gear', cost: '5 gp', weight: '1 lb', notes: 'Arcane/divine focus' },
  { name: 'Component Pouch', category: 'Gear', cost: '25 gp', weight: '2 lb', notes: 'Spell material components (no cost/weight listed)' },
]

const CATEGORIES = ['All', 'Weapon', 'Armor', 'Gear']

export default function Equipment({ onAddToInventory, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = EQUIPMENT.filter(item => {
    const matchesSearch = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'All' || item.category === category
    return matchesSearch && matchesCategory
  })

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 500,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem',
      width: 460, maxWidth: '95vw',
      maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)' }}>⚔ Equipment</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search equipment..."
          style={{ flex: 1, padding: '0.3rem 0.5rem', background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)', borderRadius: 4, color: 'var(--color-text, #e0d6c8)', fontSize: '0.85rem' }}
        />
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '0.25rem 0.5rem', fontSize: '0.75rem',
                background: category === cat ? 'var(--color-accent, #c4820a)' : 'var(--color-bg, #0d0d1a)',
                color: category === cat ? 'var(--color-bg, #0d0d1a)' : 'var(--color-text, #e0d6c8)',
                border: '1px solid var(--color-border, #333)', borderRadius: 4, cursor: 'pointer',
              }}
            >{cat}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border, #333)', color: 'var(--color-muted, #888)' }}>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', fontWeight: 600 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', fontWeight: 600 }}>Cost</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', fontWeight: 600 }}>Weight</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', fontWeight: 600 }}>Notes</th>
              {onAddToInventory && <th style={{ padding: '0.25rem 0.4rem' }} />}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--color-text, #e0d6c8)', fontWeight: 500 }}>{item.name}</td>
                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--color-muted, #aaa)', whiteSpace: 'nowrap' }}>{item.cost}</td>
                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--color-muted, #aaa)', whiteSpace: 'nowrap' }}>{item.weight}</td>
                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--color-muted, #aaa)' }}>{item.notes}</td>
                {onAddToInventory && (
                  <td style={{ padding: '0.3rem 0.4rem' }}>
                    <button
                      onClick={() => onAddToInventory(item.name)}
                      style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'none', border: '1px solid var(--color-accent, #c4820a)', borderRadius: 3, cursor: 'pointer', color: 'var(--color-accent, #c4820a)', whiteSpace: 'nowrap' }}
                    >+ Add</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '0.85rem', padding: '1rem' }}>No equipment found.</div>
        )}
      </div>
    </div>
  )
}
