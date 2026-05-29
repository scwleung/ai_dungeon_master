import { useState } from 'react'

interface Props { onClose: () => void }

const MAGIC_ITEMS = [
  { name: 'Potion of Healing', rarity: 'Common', type: 'Potion', attunement: false, effect: 'Drink to regain 2d4+2 HP.' },
  { name: 'Potion of Greater Healing', rarity: 'Uncommon', type: 'Potion', attunement: false, effect: 'Regain 4d4+4 HP.' },
  { name: 'Potion of Superior Healing', rarity: 'Rare', type: 'Potion', attunement: false, effect: 'Regain 8d4+8 HP.' },
  { name: 'Potion of Supreme Healing', rarity: 'Very Rare', type: 'Potion', attunement: false, effect: 'Regain 10d4+20 HP.' },
  { name: 'Potion of Speed', rarity: 'Very Rare', type: 'Potion', attunement: false, effect: 'Haste effect for 1 minute.' },
  { name: 'Potion of Invisibility', rarity: 'Very Rare', type: 'Potion', attunement: false, effect: 'Invisible for 1 hour or until you attack/cast.' },
  { name: 'Antitoxin', rarity: 'Common', type: 'Potion', attunement: false, effect: 'Advantage on CON saves vs. poison for 1 hour.' },
  { name: '+1 Weapon', rarity: 'Uncommon', type: 'Weapon', attunement: false, effect: '+1 bonus to attack and damage rolls.' },
  { name: '+2 Weapon', rarity: 'Rare', type: 'Weapon', attunement: false, effect: '+2 bonus to attack and damage rolls.' },
  { name: '+3 Weapon', rarity: 'Very Rare', type: 'Weapon', attunement: false, effect: '+3 bonus to attack and damage rolls.' },
  { name: 'Flame Tongue', rarity: 'Rare', type: 'Weapon', attunement: true, effect: 'Command word ignites blade: +2d6 fire damage, sheds bright light 40 ft.' },
  { name: 'Vorpal Sword', rarity: 'Legendary', type: 'Weapon', attunement: true, effect: '+3, ignores resistance to slashing. Nat 20 severs head (if creature has one).' },
  { name: 'Holy Avenger', rarity: 'Legendary', type: 'Weapon', attunement: true, effect: '+3 for paladin; +2d10 radiant vs. fiends/undead; magic circle aura 10 ft.' },
  { name: '+1 Armor', rarity: 'Rare', type: 'Armor', attunement: false, effect: '+1 bonus to AC.' },
  { name: '+2 Armor', rarity: 'Very Rare', type: 'Armor', attunement: false, effect: '+2 bonus to AC.' },
  { name: 'Mithral Armor', rarity: 'Uncommon', type: 'Armor', attunement: false, effect: 'No stealth disadvantage; no min STR requirement.' },
  { name: 'Adamantine Armor', rarity: 'Uncommon', type: 'Armor', attunement: false, effect: 'Critical hits become normal hits against wearer.' },
  { name: 'Bag of Holding', rarity: 'Uncommon', type: 'Wondrous', attunement: false, effect: 'Extradimensional space: 500 lb / 64 cu ft; always weighs 15 lb.' },
  { name: 'Cloak of Protection', rarity: 'Uncommon', type: 'Wondrous', attunement: true, effect: '+1 AC and +1 to all saving throws.' },
  { name: 'Ring of Protection', rarity: 'Rare', type: 'Ring', attunement: true, effect: '+1 AC and +1 to all saving throws.' },
  { name: 'Boots of Speed', rarity: 'Rare', type: 'Wondrous', attunement: true, effect: 'Bonus action: double speed and opportunity attacks against you have disadvantage. 10 min/day.' },
  { name: 'Amulet of Health', rarity: 'Rare', type: 'Wondrous', attunement: true, effect: 'CON score set to 19 while worn.' },
  { name: 'Belt of Giant Strength (Hill)', rarity: 'Rare', type: 'Wondrous', attunement: true, effect: 'STR score set to 21 while worn.' },
  { name: 'Cloak of Invisibility', rarity: 'Legendary', type: 'Wondrous', attunement: true, effect: 'Invisible while wearing and hood is up. 2 hr/day.' },
  { name: 'Immovable Rod', rarity: 'Uncommon', type: 'Rod', attunement: false, effect: 'Button press: rod becomes fixed in space. Holds up to 8000 lb.' },
  { name: 'Rope of Climbing', rarity: 'Uncommon', type: 'Wondrous', attunement: false, effect: '60-ft animated rope. Command words: knot, unknot, fasten, unfasten, coil.' },
  { name: 'Sending Stones', rarity: 'Uncommon', type: 'Wondrous', attunement: false, effect: 'Paired stones: speak 25 words; recipient can reply once. 1/day.' },
  { name: 'Wand of Magic Missiles', rarity: 'Uncommon', type: 'Wand', attunement: false, effect: '7 charges: expend 1-3 to cast Magic Missile at level 1-3. Regains 1d6+1/day.' },
  { name: 'Staff of Healing', rarity: 'Rare', type: 'Staff', attunement: true, effect: '10 charges: Cure Wounds (2/charge), Lesser Restoration (2), Mass Cure Wounds (5).' },
  { name: 'Staff of the Magi', rarity: 'Legendary', type: 'Staff', attunement: true, effect: '50 charges; absorbs spells; casts many spells. Retributive strike on break: 16d6 force.' },
  { name: 'Helm of Telepathy', rarity: 'Uncommon', type: 'Wondrous', attunement: true, effect: 'Detect thoughts at will; send messages to targets within 30 ft.' },
  { name: 'Ring of Spell Storing', rarity: 'Rare', type: 'Ring', attunement: true, effect: 'Stores up to 5 levels of spells; wielder casts them using stored slots.' },
  { name: 'Decanter of Endless Water', rarity: 'Uncommon', type: 'Wondrous', attunement: false, effect: 'Command words produce stream, fountain, or geyser of water.' },
  { name: 'Broom of Flying', rarity: 'Uncommon', type: 'Wondrous', attunement: false, effect: 'Fly 50 ft speed. Carries up to 400 lb (halved speed over 200 lb).' },
  { name: 'Crystal Ball', rarity: 'Very Rare', type: 'Wondrous', attunement: true, effect: 'Scrying spell at will.' },
  { name: 'Dimensional Shackles', rarity: 'Rare', type: 'Wondrous', attunement: false, effect: 'Restrains creature; prevents planar travel, teleportation.' },
]

const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary']

const RARITY_COLORS: Record<string, string> = {
  Common: '#888',
  Uncommon: '#27ae60',
  Rare: '#2980b9',
  'Very Rare': '#8e44ad',
  Legendary: '#f39c12',
}

export default function MagicItems({ onClose }: Props) {
  const [search, setSearch] = useState('')
  const [rarityFilter, setRarityFilter] = useState('All')

  const filtered = MAGIC_ITEMS.filter(item => {
    const matchesSearch = !search.trim() ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.type.toLowerCase().includes(search.toLowerCase()) ||
      item.rarity.toLowerCase().includes(search.toLowerCase())
    const matchesRarity = rarityFilter === 'All' || item.rarity === rarityFilter
    return matchesSearch && matchesRarity
  })

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 500,
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-accent, #c4820a)',
      borderRadius: 8, padding: '1rem',
      width: 420, maxWidth: '95vw',
      maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ color: 'var(--color-accent, #c4820a)' }}>💎 Magic Items</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items..."
          style={{ flex: 1, padding: '0.3rem 0.5rem', background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)', borderRadius: 4, color: 'var(--color-text, #e0d6c8)', fontSize: '0.85rem' }}
        />
        <select
          value={rarityFilter}
          onChange={e => setRarityFilter(e.target.value)}
          style={{ padding: '0.3rem', background: 'var(--color-bg, #0d0d1a)', border: '1px solid var(--color-border, #333)', borderRadius: 4, color: 'var(--color-text, #e0d6c8)', fontSize: '0.8rem' }}
        >
          {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {filtered.map(item => (
          <div key={item.name} style={{
            padding: '0.5rem 0.6rem',
            background: 'var(--color-bg, #0d0d1a)',
            border: '1px solid var(--color-border, #333)',
            borderLeft: `3px solid ${RARITY_COLORS[item.rarity] ?? '#888'}`,
            borderRadius: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-text, #e0d6c8)' }}>{item.name}</strong>
              <span style={{ fontSize: '0.7rem', color: RARITY_COLORS[item.rarity] ?? '#888', fontStyle: 'italic' }}>{item.rarity}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-muted, #888)', marginLeft: 'auto' }}>{item.type}</span>
              {item.attunement && (
                <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', border: '1px solid var(--color-accent, #c4820a)', borderRadius: 3, color: 'var(--color-accent, #c4820a)' }}>Attune</span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #aaa)' }}>{item.effect}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '0.85rem', padding: '1rem' }}>No items found.</div>
        )}
      </div>
    </div>
  )
}
