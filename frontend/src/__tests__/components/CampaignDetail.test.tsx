import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Campaign, Character, Session } from '../../types'

// ─── Mock store ───────────────────────────────────────────────────────────────

let mockActiveCampaign: Campaign | null = null
let mockCharacters: Character[] = []
let mockSessions: Session[] = []
const mockStartSession = vi.fn()
const mockSetActiveSession = vi.fn()
const mockSetView = vi.fn()
const mockLoadSessions = vi.fn()

vi.mock('../../store/gameStore', () => ({
  useGameStore: () => ({
    activeCampaign: mockActiveCampaign,
    characters: mockCharacters,
    sessions: mockSessions,
    startSession: mockStartSession,
    setActiveSession: mockSetActiveSession,
    setView: mockSetView,
    loadSessions: mockLoadSessions,
  }),
}))

// Stub CharacterForm so its internals don't interfere
vi.mock('../../components/CharacterForm', () => ({
  CharacterForm: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="character-form-stub">
      <button onClick={onClose}>Close Form</button>
    </div>
  ),
}))

import { CampaignDetail } from '../../components/CampaignDetail'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    name: 'The Lost Temple',
    ruleset: 'dnd5e',
    description: 'Ancient ruins await.',
    created_at: '2024-01-15T10:00:00Z',
    world_state: {},
    session_count: 2,
    ...overrides,
  }
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    campaign_id: 'camp-1',
    player_name: 'Alice',
    name: 'Thorin',
    race: 'Dwarf',
    class_name: 'Fighter',
    level: 5,
    hp_current: 30,
    hp_max: 40,
    stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    inventory: [],
    conditions: [],
    notes: '',
    ...overrides,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    campaign_id: 'camp-1',
    started_at: '2024-02-01T18:00:00Z',
    ended_at: '2024-02-01T20:00:00Z',
    messages: [],
    ...overrides,
  }
}

describe('CampaignDetail', () => {
  beforeEach(() => {
    mockActiveCampaign = makeCampaign()
    mockCharacters = []
    mockSessions = []
    mockStartSession.mockReset()
    mockSetActiveSession.mockReset()
    mockSetView.mockReset()
    mockLoadSessions.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Null guard ──────────────────────────────────────────────────────────────

  describe('null guard', () => {
    it('renders nothing when activeCampaign is null', () => {
      mockActiveCampaign = null
      const { container } = render(<CampaignDetail />)
      expect(container.firstChild).toBeNull()
    })
  })

  // ── Campaign header ─────────────────────────────────────────────────────────

  describe('campaign header', () => {
    it('renders the campaign name', () => {
      mockActiveCampaign = makeCampaign({ name: 'Dragon Mountain' })
      render(<CampaignDetail />)
      expect(screen.getByText('Dragon Mountain')).toBeInTheDocument()
    })

    it('renders the D&D 5e ruleset label', () => {
      mockActiveCampaign = makeCampaign({ ruleset: 'dnd5e' })
      render(<CampaignDetail />)
      expect(screen.getByText('D&D 5th Edition')).toBeInTheDocument()
    })

    it('renders the Pathfinder 2e ruleset label', () => {
      mockActiveCampaign = makeCampaign({ ruleset: 'pathfinder2e' })
      render(<CampaignDetail />)
      expect(screen.getByText('Pathfinder 2e')).toBeInTheDocument()
    })

    it('renders the description when present', () => {
      mockActiveCampaign = makeCampaign({ description: 'Ancient ruins await.' })
      render(<CampaignDetail />)
      expect(screen.getByText('Ancient ruins await.')).toBeInTheDocument()
    })

    it('renders the "Start New Session" button', () => {
      render(<CampaignDetail />)
      expect(screen.getByRole('button', { name: /start new session/i })).toBeInTheDocument()
    })
  })

  // ── Characters section ──────────────────────────────────────────────────────

  describe('characters section', () => {
    it('shows empty-state message when no characters exist', () => {
      mockCharacters = []
      render(<CampaignDetail />)
      expect(
        screen.getByText(/no characters yet/i)
      ).toBeInTheDocument()
    })

    it('renders a character name when characters exist', () => {
      mockCharacters = [makeCharacter({ name: 'Gandalf' })]
      render(<CampaignDetail />)
      expect(screen.getByText('Gandalf')).toBeInTheDocument()
    })

    it('renders multiple characters', () => {
      mockCharacters = [
        makeCharacter({ id: 'c1', name: 'Frodo' }),
        makeCharacter({ id: 'c2', name: 'Samwise' }),
      ]
      render(<CampaignDetail />)
      expect(screen.getByText('Frodo')).toBeInTheDocument()
      expect(screen.getByText('Samwise')).toBeInTheDocument()
    })

    it('renders the character HP as current/max', () => {
      mockCharacters = [makeCharacter({ hp_current: 25, hp_max: 40 })]
      render(<CampaignDetail />)
      expect(screen.getByText('25/40')).toBeInTheDocument()
    })

    it('renders the player name beside the character', () => {
      mockCharacters = [makeCharacter({ player_name: 'Alice' })]
      render(<CampaignDetail />)
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })

  // ── Add Character ───────────────────────────────────────────────────────────

  describe('"Add Character" button', () => {
    it('opens the CharacterForm modal', async () => {
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /\+ add character/i }))
      expect(screen.getByTestId('character-form-stub')).toBeInTheDocument()
    })

    it('closes the CharacterForm when onClose is called', async () => {
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /\+ add character/i }))
      await user.click(screen.getByRole('button', { name: /close form/i }))
      expect(screen.queryByTestId('character-form-stub')).not.toBeInTheDocument()
    })
  })

  // ── Sessions section ────────────────────────────────────────────────────────

  describe('sessions section', () => {
    it('shows empty-state message when no sessions exist', () => {
      mockSessions = []
      render(<CampaignDetail />)
      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
    })

    it('renders a session date when sessions exist', () => {
      mockSessions = [makeSession({ started_at: '2024-06-01T18:00:00Z' })]
      render(<CampaignDetail />)
      // The date is formatted via Intl — just check the year is present
      expect(screen.getByText(/jun/i)).toBeInTheDocument()
    })

    it('renders an "Active" badge for sessions without ended_at', () => {
      mockSessions = [makeSession({ ended_at: undefined })]
      render(<CampaignDetail />)
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('does not show "Active" badge for ended sessions', () => {
      mockSessions = [makeSession({ ended_at: '2024-06-01T20:00:00Z' })]
      render(<CampaignDetail />)
      expect(screen.queryByText('Active')).not.toBeInTheDocument()
    })

    it('renders the message count for a session', () => {
      mockSessions = [makeSession({ messages: [{} as any, {} as any, {} as any] })]
      render(<CampaignDetail />)
      expect(screen.getByText(/3 messages/i)).toBeInTheDocument()
    })
  })

  // ── Start New Session ───────────────────────────────────────────────────────

  describe('"Start New Session" flow', () => {
    it('calls startSession with the campaign id', async () => {
      const session = makeSession({ id: 'new-sess' })
      mockStartSession.mockResolvedValue(session)
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /start new session/i }))
      await waitFor(() => expect(mockStartSession).toHaveBeenCalledWith('camp-1'))
    })

    it('calls setActiveSession with the returned session', async () => {
      const session = makeSession({ id: 'new-sess' })
      mockStartSession.mockResolvedValue(session)
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /start new session/i }))
      await waitFor(() => expect(mockSetActiveSession).toHaveBeenCalledWith(session))
    })

    it('calls setView("session") after starting', async () => {
      mockStartSession.mockResolvedValue(makeSession())
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /start new session/i }))
      await waitFor(() => expect(mockSetView).toHaveBeenCalledWith('session'))
    })

    it('shows an error banner when startSession rejects', async () => {
      mockStartSession.mockRejectedValue(new Error('Server unavailable'))
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /start new session/i }))
      expect(await screen.findByText('Server unavailable')).toBeInTheDocument()
    })

    it('shows "Starting..." and disables the button while the session is being created', async () => {
      let resolve!: (s: Session) => void
      mockStartSession.mockReturnValue(new Promise<Session>((r) => { resolve = r }))
      const user = userEvent.setup()
      render(<CampaignDetail />)
      await user.click(screen.getByRole('button', { name: /start new session/i }))
      const btn = await screen.findByRole('button', { name: /starting/i })
      expect(btn).toBeDisabled()
      resolve(makeSession())
    })
  })
})
