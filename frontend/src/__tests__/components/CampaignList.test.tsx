import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Campaign } from '../../types'

// ─── Mock store ───────────────────────────────────────────────────────────────

let mockCampaigns: Campaign[] = []
const mockDeleteCampaign = vi.fn()
const mockSetActiveCampaign = vi.fn()
const mockSetView = vi.fn()
const mockLoadCharacters = vi.fn()
const mockLoadSessions = vi.fn()

vi.mock('../../store/gameStore', () => ({
  useGameStore: () => ({
    campaigns: mockCampaigns,
    deleteCampaign: mockDeleteCampaign,
    setActiveCampaign: mockSetActiveCampaign,
    setView: mockSetView,
    loadCharacters: mockLoadCharacters,
    loadSessions: mockLoadSessions,
  }),
}))

// Stub CampaignSetup so its internals don't interfere
vi.mock('../../components/CampaignSetup', () => ({
  CampaignSetup: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="campaign-setup-stub">
      <button onClick={onClose}>Close Setup</button>
    </div>
  ),
}))

import { CampaignList } from '../../components/CampaignList'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    name: 'The Lost Temple',
    ruleset: 'dnd5e',
    description: 'A classic adventure.',
    created_at: '2024-03-15T10:00:00Z',
    world_state: {},
    session_count: 3,
    ...overrides,
  }
}

describe('CampaignList', () => {
  beforeEach(() => {
    mockCampaigns = []
    mockDeleteCampaign.mockReset()
    mockSetActiveCampaign.mockReset()
    mockSetView.mockReset()
    mockLoadCharacters.mockReset()
    mockLoadSessions.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Empty state ─────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows "No Campaigns Yet" when there are no campaigns', () => {
      mockCampaigns = []
      render(<CampaignList />)
      expect(screen.getByText('No Campaigns Yet')).toBeInTheDocument()
    })

    it('shows the "Create First Campaign" button when there are no campaigns', () => {
      mockCampaigns = []
      render(<CampaignList />)
      expect(screen.getByRole('button', { name: /create first campaign/i })).toBeInTheDocument()
    })

    it('does NOT show "No Campaigns Yet" when campaigns exist', () => {
      mockCampaigns = [makeCampaign()]
      render(<CampaignList />)
      expect(screen.queryByText('No Campaigns Yet')).not.toBeInTheDocument()
    })
  })

  // ── Campaign cards ──────────────────────────────────────────────────────────

  describe('campaign cards', () => {
    it('renders the campaign name', () => {
      mockCampaigns = [makeCampaign({ name: 'Dragon Keep' })]
      render(<CampaignList />)
      expect(screen.getByText('Dragon Keep')).toBeInTheDocument()
    })

    it('renders a D&D 5e ruleset badge', () => {
      mockCampaigns = [makeCampaign({ ruleset: 'dnd5e' })]
      render(<CampaignList />)
      expect(screen.getByText('D&D 5e')).toBeInTheDocument()
    })

    it('renders a Pathfinder 2e ruleset badge', () => {
      mockCampaigns = [makeCampaign({ ruleset: 'pathfinder2e' })]
      render(<CampaignList />)
      expect(screen.getByText('PF2e')).toBeInTheDocument()
    })

    it('renders a Freeform ruleset badge', () => {
      mockCampaigns = [makeCampaign({ ruleset: 'freeform' })]
      render(<CampaignList />)
      expect(screen.getByText('Freeform')).toBeInTheDocument()
    })

    it('renders the description when present', () => {
      mockCampaigns = [makeCampaign({ description: 'An epic tale of adventure.' })]
      render(<CampaignList />)
      expect(screen.getByText('An epic tale of adventure.')).toBeInTheDocument()
    })

    it('does not render a description element when description is empty', () => {
      mockCampaigns = [makeCampaign({ description: '' })]
      render(<CampaignList />)
      expect(screen.queryByText(/epic tale/i)).not.toBeInTheDocument()
    })

    it('renders all campaigns when multiple exist', () => {
      mockCampaigns = [
        makeCampaign({ id: 'a', name: 'Campaign Alpha' }),
        makeCampaign({ id: 'b', name: 'Campaign Beta' }),
        makeCampaign({ id: 'c', name: 'Campaign Gamma' }),
      ]
      render(<CampaignList />)
      expect(screen.getByText('Campaign Alpha')).toBeInTheDocument()
      expect(screen.getByText('Campaign Beta')).toBeInTheDocument()
      expect(screen.getByText('Campaign Gamma')).toBeInTheDocument()
    })

    it('renders the session count', () => {
      mockCampaigns = [makeCampaign({ session_count: 5 })]
      render(<CampaignList />)
      expect(screen.getByText(/5 sessions/i)).toBeInTheDocument()
    })
  })

  // ── New campaign button ─────────────────────────────────────────────────────

  describe('"+ New Campaign" button', () => {
    it('opens the CampaignSetup modal', async () => {
      mockCampaigns = []
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /\+ new campaign/i }))
      expect(screen.getByTestId('campaign-setup-stub')).toBeInTheDocument()
    })

    it('closes the CampaignSetup modal when onClose is called', async () => {
      mockCampaigns = []
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /\+ new campaign/i }))
      await user.click(screen.getByRole('button', { name: /close setup/i }))
      expect(screen.queryByTestId('campaign-setup-stub')).not.toBeInTheDocument()
    })
  })

  // ── Continue button ─────────────────────────────────────────────────────────

  describe('"Continue →" button', () => {
    beforeEach(() => {
      mockLoadCharacters.mockResolvedValue(undefined)
      mockLoadSessions.mockResolvedValue(undefined)
    })

    it('calls setActiveCampaign with the campaign', async () => {
      const campaign = makeCampaign()
      mockCampaigns = [campaign]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      expect(mockSetActiveCampaign).toHaveBeenCalledWith(campaign)
    })

    it('calls setView("campaign_detail") after navigating', async () => {
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      await waitFor(() => expect(mockSetView).toHaveBeenCalledWith('campaign_detail'))
    })

    it('calls loadCharacters with the campaign id', async () => {
      mockCampaigns = [makeCampaign({ id: 'camp-xyz' })]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      await waitFor(() => expect(mockLoadCharacters).toHaveBeenCalledWith('camp-xyz'))
    })

    it('calls loadSessions with the campaign id', async () => {
      mockCampaigns = [makeCampaign({ id: 'camp-xyz' })]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      await waitFor(() => expect(mockLoadSessions).toHaveBeenCalledWith('camp-xyz'))
    })
  })

  // ── Confirm-delete flow ─────────────────────────────────────────────────────

  describe('confirm-delete flow', () => {
    it('shows "Delete?" prompt after clicking the trash button', async () => {
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      expect(screen.getByText('Delete?')).toBeInTheDocument()
    })

    it('shows Yes and No buttons after clicking trash', async () => {
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      expect(screen.getByRole('button', { name: /^yes$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^no$/i })).toBeInTheDocument()
    })

    it('dismisses the confirm prompt when "No" is clicked', async () => {
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      await user.click(screen.getByRole('button', { name: /^no$/i }))
      expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
    })

    it('calls deleteCampaign with the campaign id when "Yes" is confirmed', async () => {
      mockDeleteCampaign.mockResolvedValue(undefined)
      mockCampaigns = [makeCampaign({ id: 'camp-to-delete' })]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      await user.click(screen.getByRole('button', { name: /^yes$/i }))
      await waitFor(() => expect(mockDeleteCampaign).toHaveBeenCalledWith('camp-to-delete'))
    })

    it('does NOT call deleteCampaign when "No" is clicked', async () => {
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      await user.click(screen.getByRole('button', { name: /^no$/i }))
      expect(mockDeleteCampaign).not.toHaveBeenCalled()
    })

    it('shows an error banner when deleteCampaign rejects', async () => {
      mockDeleteCampaign.mockRejectedValue(new Error('Network failure'))
      mockCampaigns = [makeCampaign()]
      const user = userEvent.setup()
      render(<CampaignList />)
      await user.click(screen.getByTitle(/delete campaign/i))
      await user.click(screen.getByRole('button', { name: /^yes$/i }))
      expect(await screen.findByText('Network failure')).toBeInTheDocument()
    })
  })
})
