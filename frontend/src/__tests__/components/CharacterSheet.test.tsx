import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Character } from '../../types'

// Mock the store — CharacterSheet calls both onUpdate prop AND updateCharacter from store
const mockUpdateCharacter = vi.fn()
vi.mock('../../store/gameStore', () => ({
  useGameStore: () => ({ updateCharacter: mockUpdateCharacter }),
}))

import { CharacterSheet } from '../../components/CharacterSheet'

// ─── Sample character fixtures ─────────────────────────────────────────────────

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char1',
    campaign_id: 'camp1',
    player_name: 'Alice',
    name: 'Thorin',
    race: 'Dwarf',
    class_name: 'Fighter',
    level: 5,
    hp_current: 25,
    hp_max: 40,
    stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    inventory: ['Battleaxe', 'Shield'],
    conditions: ['Poisoned'],
    notes: 'A grizzled warrior',
    ...overrides,
  }
}

describe('CharacterSheet', () => {
  let onUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onUpdate = vi.fn()
    mockUpdateCharacter.mockClear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Header info ────────────────────────────────────────────────────────────

  describe('header information', () => {
    it('shows the character name', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(screen.getByText('Thorin')).toBeInTheDocument()
    })

    it('shows the character name in .cs-char-name', () => {
      const { container } = render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(container.querySelector('.cs-char-name')).toHaveTextContent('Thorin')
    })

    it('shows the level badge as "Lv 5"', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(screen.getByText('Lv 5')).toBeInTheDocument()
    })

    it('shows the level in .cs-level-badge', () => {
      const { container } = render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(container.querySelector('.cs-level-badge')).toHaveTextContent('Lv 5')
    })
  })

  // ── HP bar classes ─────────────────────────────────────────────────────────

  describe('HP bar fill class', () => {
    it('has class "high" when HP is above 50% (25/40 = 62.5%)', () => {
      // 25/40 = 62.5% → hpPct > 50 → "high"
      const { container } = render(
        <CharacterSheet character={makeCharacter({ hp_current: 25, hp_max: 40 })} onUpdate={onUpdate} />
      )
      expect(container.querySelector('.hp-bar-fill')).toHaveClass('high')
    })

    it('has class "mid" when HP is between 25% and 50% (15/40 = 37.5%)', () => {
      // 15/40 = 37.5% → 25 < hpPct ≤ 50 → "mid"
      const { container } = render(
        <CharacterSheet character={makeCharacter({ hp_current: 15, hp_max: 40 })} onUpdate={onUpdate} />
      )
      expect(container.querySelector('.hp-bar-fill')).toHaveClass('mid')
    })

    it('has class "low" when HP is at or below 25% (10/40 = 25%)', () => {
      // 10/40 = 25% → hpPct ≤ 25 → "low"
      const { container } = render(
        <CharacterSheet character={makeCharacter({ hp_current: 10, hp_max: 40 })} onUpdate={onUpdate} />
      )
      expect(container.querySelector('.hp-bar-fill')).toHaveClass('low')
    })

    it('has class "low" when HP is 0', () => {
      const { container } = render(
        <CharacterSheet character={makeCharacter({ hp_current: 0, hp_max: 40 })} onUpdate={onUpdate} />
      )
      expect(container.querySelector('.hp-bar-fill')).toHaveClass('low')
    })
  })

  // ── Ability score modifiers ────────────────────────────────────────────────

  describe('ability score modifiers', () => {
    it('shows +3 for STR 16 (floor((16-10)/2) = +3)', () => {
      render(<CharacterSheet character={makeCharacter({ stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 10 } })} onUpdate={onUpdate} />)
      // Multiple +3s could exist — just check one is there
      const modElements = screen.getAllByText('+3')
      expect(modElements.length).toBeGreaterThan(0)
    })

    it('shows +0 for DEX 10 (floor((10-10)/2) = 0)', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      const zeroMods = screen.getAllByText('+0')
      expect(zeroMods.length).toBeGreaterThan(0)
    })

    it('shows +2 for CON 14 (floor((14-10)/2) = +2)', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      const modElements = screen.getAllByText('+2')
      expect(modElements.length).toBeGreaterThan(0)
    })

    it('shows -1 for INT 8 (floor((8-10)/2) = -1)', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(screen.getByText('-1')).toBeInTheDocument()
    })

    it('shows +1 for WIS 12 (floor((12-10)/2) = +1)', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      const modElements = screen.getAllByText('+1')
      expect(modElements.length).toBeGreaterThan(0)
    })
  })

  // ── Inventory ──────────────────────────────────────────────────────────────

  describe('inventory', () => {
    it('shows inventory items', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      // Inventory section is collapsed by default — open it
      const inventoryHeader = screen.getByText('Inventory')
      fireEvent.click(inventoryHeader)
      expect(screen.getByText('Battleaxe')).toBeInTheDocument()
      expect(screen.getByText('Shield')).toBeInTheDocument()
    })

    it('calls onUpdate with new inventory when an item is added', async () => {
      const user = userEvent.setup()
      const character = makeCharacter({ inventory: ['Battleaxe'] })
      render(<CharacterSheet character={character} onUpdate={onUpdate} />)
      // Open inventory section
      fireEvent.click(screen.getByText('Inventory'))
      const addInput = screen.getByPlaceholderText('Add item...')
      await user.type(addInput, 'Health Potion')
      await user.keyboard('{Enter}')
      expect(onUpdate).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ inventory: ['Battleaxe', 'Health Potion'] })
      )
    })

    it('calls onUpdate with item removed when remove button is clicked', async () => {
      const user = userEvent.setup()
      const character = makeCharacter({ inventory: ['Battleaxe', 'Shield'] })
      render(<CharacterSheet character={character} onUpdate={onUpdate} />)
      // Open inventory section
      fireEvent.click(screen.getByText('Inventory'))
      const removeBtn = screen.getByRole('button', { name: /remove Battleaxe/i })
      await user.click(removeBtn)
      expect(onUpdate).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ inventory: ['Shield'] })
      )
    })
  })

  // ── Conditions ─────────────────────────────────────────────────────────────

  describe('conditions', () => {
    it('shows existing condition badges', () => {
      render(<CharacterSheet character={makeCharacter({ conditions: ['Poisoned'] })} onUpdate={onUpdate} />)
      expect(screen.getByText('Poisoned')).toBeInTheDocument()
    })

    it('calls onUpdate with new condition when condition is added', async () => {
      const user = userEvent.setup()
      const character = makeCharacter({ conditions: [] })
      render(<CharacterSheet character={character} onUpdate={onUpdate} />)
      const addInput = screen.getByPlaceholderText('Add condition...')
      await user.type(addInput, 'Blinded')
      await user.keyboard('{Enter}')
      expect(onUpdate).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ conditions: ['Blinded'] })
      )
    })

    it('calls onUpdate with condition removed when remove button is clicked', async () => {
      const user = userEvent.setup()
      const character = makeCharacter({ conditions: ['Poisoned', 'Blinded'] })
      render(<CharacterSheet character={character} onUpdate={onUpdate} />)
      const removeBtn = screen.getByRole('button', { name: /remove condition Poisoned/i })
      await user.click(removeBtn)
      expect(onUpdate).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ conditions: ['Blinded'] })
      )
    })
  })

  // ── Notes ──────────────────────────────────────────────────────────────────

  describe('notes', () => {
    it('shows the character notes when the notes section is opened', () => {
      render(<CharacterSheet character={makeCharacter({ notes: 'A grizzled warrior' })} onUpdate={onUpdate} />)
      // Open notes section
      fireEvent.click(screen.getByText('Notes'))
      expect(screen.getByText('A grizzled warrior')).toBeInTheDocument()
    })

    it('shows a placeholder when notes are empty', () => {
      render(<CharacterSheet character={makeCharacter({ notes: '' })} onUpdate={onUpdate} />)
      fireEvent.click(screen.getByText('Notes'))
      expect(screen.getByText('Click to add notes...')).toBeInTheDocument()
    })
  })

  // ── Ability Scores section ─────────────────────────────────────────────────

  describe('ability scores section', () => {
    it('shows all six stat labels', () => {
      render(<CharacterSheet character={makeCharacter()} onUpdate={onUpdate} />)
      expect(screen.getByText('STR')).toBeInTheDocument()
      expect(screen.getByText('DEX')).toBeInTheDocument()
      expect(screen.getByText('CON')).toBeInTheDocument()
      expect(screen.getByText('INT')).toBeInTheDocument()
      expect(screen.getByText('WIS')).toBeInTheDocument()
      expect(screen.getByText('CHA')).toBeInTheDocument()
    })
  })
})
