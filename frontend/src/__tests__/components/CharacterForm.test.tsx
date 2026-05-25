import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Character } from '../../types'

// ─── Mock store ───────────────────────────────────────────────────────────────

const mockCreateCharacter = vi.fn()

vi.mock('../../store/gameStore', () => ({
  useGameStore: () => ({
    createCharacter: mockCreateCharacter,
    settings: {
      playerId: 'test-player',
      playerName: 'Test Player',
      ttsProvider: 'browser',
      ttsVoiceId: '',
      theme: 'fantasy',
    },
  }),
}))

import { CharacterForm } from '../../components/CharacterForm'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-new',
    campaign_id: 'camp-1',
    player_name: 'Test Player',
    name: 'Thorin',
    race: 'Human',
    class_name: 'Adventurer',
    level: 1,
    hp_current: 8,
    hp_max: 8,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    inventory: [],
    conditions: [],
    notes: '',
    ...overrides,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderForm(props: { onClose?: () => void; onCreated?: (c: Character) => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onCreated = props.onCreated ?? vi.fn()
  render(<CharacterForm campaignId="camp-1" onClose={onClose} onCreated={onCreated} />)
  return { onClose, onCreated }
}

describe('CharacterForm', () => {
  beforeEach(() => {
    mockCreateCharacter.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ───────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the Player Name input', () => {
      renderForm()
      expect(screen.getByLabelText(/player name/i)).toBeInTheDocument()
    })

    it('renders the Character Name input', () => {
      renderForm()
      expect(screen.getByLabelText(/character name/i)).toBeInTheDocument()
    })

    it('pre-fills the Player Name with the store settings.playerName', () => {
      renderForm()
      expect(screen.getByLabelText(/player name/i)).toHaveValue('Test Player')
    })

    it('renders the Race input', () => {
      renderForm()
      expect(screen.getByLabelText(/^race$/i)).toBeInTheDocument()
    })

    it('renders the Class input', () => {
      renderForm()
      expect(screen.getByLabelText(/^class$/i)).toBeInTheDocument()
    })

    it('renders the Level input', () => {
      renderForm()
      expect(screen.getByLabelText(/^level$/i)).toBeInTheDocument()
    })

    it('renders the Max Hit Points input', () => {
      renderForm()
      expect(screen.getByLabelText(/max hit points/i)).toBeInTheDocument()
    })

    it('renders the Create Character submit button', () => {
      renderForm()
      expect(screen.getByRole('button', { name: /create character/i })).toBeInTheDocument()
    })

    it('renders a stat input for each ability score', () => {
      renderForm()
      expect(screen.getByTitle('Strength')).toBeInTheDocument()
      expect(screen.getByTitle('Dexterity')).toBeInTheDocument()
      expect(screen.getByTitle('Constitution')).toBeInTheDocument()
      expect(screen.getByTitle('Intelligence')).toBeInTheDocument()
      expect(screen.getByTitle('Wisdom')).toBeInTheDocument()
      expect(screen.getByTitle('Charisma')).toBeInTheDocument()
    })
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  describe('form validation', () => {
    it('submit button is disabled when Character Name is empty', () => {
      renderForm()
      expect(screen.getByRole('button', { name: /create character/i })).toBeDisabled()
    })

    it('submit button is enabled when both names are filled', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      expect(screen.getByRole('button', { name: /create character/i })).not.toBeDisabled()
    })

    it('shows "Character name is required." when form is submitted with empty character name', async () => {
      const { container } = render(
        <CharacterForm campaignId="camp-1" onClose={vi.fn()} onCreated={vi.fn()} />
      )
      fireEvent.submit(container.querySelector('form')!)
      expect(await screen.findByText('Character name is required.')).toBeInTheDocument()
    })

    it('does not call createCharacter when character name is empty', async () => {
      const { container } = render(
        <CharacterForm campaignId="camp-1" onClose={vi.fn()} onCreated={vi.fn()} />
      )
      fireEvent.submit(container.querySelector('form')!)
      await screen.findByText('Character name is required.')
      expect(mockCreateCharacter).not.toHaveBeenCalled()
    })

    it('shows "Player name is required." when player name is cleared', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <CharacterForm campaignId="camp-1" onClose={vi.fn()} onCreated={vi.fn()} />
      )
      // Must fill char name first — otherwise char-name validation fires before player-name check
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.clear(screen.getByLabelText(/player name/i))
      fireEvent.submit(container.querySelector('form')!)
      expect(await screen.findByText('Player name is required.')).toBeInTheDocument()
    })
  })

  // ── Successful submission ───────────────────────────────────────────────────

  describe('successful submission', () => {
    beforeEach(() => {
      mockCreateCharacter.mockResolvedValue(makeCharacter())
    })

    it('calls createCharacter with the correct campaign id', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalled())
      expect(mockCreateCharacter).toHaveBeenCalledWith('camp-1', expect.any(Object))
    })

    it('passes the character name to createCharacter', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Gandalf')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalled())
      expect(mockCreateCharacter).toHaveBeenCalledWith(
        'camp-1',
        expect.objectContaining({ name: 'Gandalf' })
      )
    })

    it('passes the player name to createCharacter', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalled())
      expect(mockCreateCharacter).toHaveBeenCalledWith(
        'camp-1',
        expect.objectContaining({ player_name: 'Test Player' })
      )
    })

    it('passes inventory as an array split on commas', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Bilbo')
      await user.type(screen.getByLabelText(/starting inventory/i), 'Ring, Sword, Lembas')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalled())
      expect(mockCreateCharacter).toHaveBeenCalledWith(
        'camp-1',
        expect.objectContaining({ inventory: ['Ring', 'Sword', 'Lembas'] })
      )
    })

    it('calls onClose after successful submission', async () => {
      const user = userEvent.setup()
      const { onClose } = renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('calls onCreated with the returned character', async () => {
      const created = makeCharacter({ id: 'char-created' })
      mockCreateCharacter.mockResolvedValue(created)
      const user = userEvent.setup()
      const { onCreated } = renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    })
  })

  // ── Error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows an error message when createCharacter throws', async () => {
      mockCreateCharacter.mockRejectedValue(new Error('DB error'))
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      expect(await screen.findByText('DB error')).toBeInTheDocument()
    })

    it('shows a generic message for non-Error rejections', async () => {
      mockCreateCharacter.mockRejectedValue('unknown')
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      expect(await screen.findByText('Failed to create character.')).toBeInTheDocument()
    })

    it('does not call onClose when createCharacter throws', async () => {
      mockCreateCharacter.mockRejectedValue(new Error('fail'))
      const user = userEvent.setup()
      const { onClose } = renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      await screen.findByText('fail')
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ── Loading state ───────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows "Creating..." and disables the button while submitting', async () => {
      let resolve!: (c: Character) => void
      mockCreateCharacter.mockReturnValue(new Promise<Character>((r) => { resolve = r }))
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText(/character name/i), 'Thorin')
      await user.click(screen.getByRole('button', { name: /create character/i }))
      expect(screen.getByText('Creating...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
      resolve(makeCharacter())
    })
  })

  // ── HP suggestion ───────────────────────────────────────────────────────────

  describe('HP suggestion', () => {
    it('shows HP 8 by default (CON 10, level 1)', () => {
      renderForm()
      expect(screen.getByLabelText(/max hit points/i)).toHaveValue(8)
    })

    it('updates suggested HP when CON score changes', () => {
      renderForm()
      // CON 14 → mod +2, level 1 → HP = 8 + 2 = 10
      fireEvent.change(screen.getByTitle('Constitution'), { target: { value: '14' } })
      expect(screen.getByLabelText(/max hit points/i)).toHaveValue(10)
    })

    it('stops auto-updating HP once the user manually edits the field', () => {
      renderForm()
      // Manually set HP to 99 — this sets hpMaxManual=true
      fireEvent.change(screen.getByLabelText(/max hit points/i), { target: { value: '99' } })
      // Change CON — HP should NOT update because manual flag is set
      fireEvent.change(screen.getByTitle('Constitution'), { target: { value: '14' } })
      expect(screen.getByLabelText(/max hit points/i)).toHaveValue(99)
    })
  })

  // ── Stat clamping ───────────────────────────────────────────────────────────

  describe('ability score clamping', () => {
    it('clamps a stat value above 30 down to 30', () => {
      renderForm()
      fireEvent.change(screen.getByTitle('Strength'), { target: { value: '99' } })
      expect(screen.getByTitle('Strength')).toHaveValue(30)
    })

    it('clamps a stat value below 1 up to 1', () => {
      renderForm()
      fireEvent.change(screen.getByTitle('Strength'), { target: { value: '0' } })
      expect(screen.getByTitle('Strength')).toHaveValue(1)
    })
  })

  // ── Cancel button ───────────────────────────────────────────────────────────

  describe('cancel button', () => {
    it('calls onClose when the Cancel button is clicked', async () => {
      const user = userEvent.setup()
      const { onClose } = renderForm()
      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
