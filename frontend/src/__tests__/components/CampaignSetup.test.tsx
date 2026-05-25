import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Campaign } from '../../types'

// ─── Mock store functions ─────────────────────────────────────────────────────

const mockCreateCampaign = vi.fn()
const mockSetActiveCampaign = vi.fn()
const mockSetView = vi.fn()
const mockLoadCharacters = vi.fn()

vi.mock('../../store/gameStore', () => ({
  useGameStore: () => ({
    createCampaign: mockCreateCampaign,
    setActiveCampaign: mockSetActiveCampaign,
    setView: mockSetView,
    loadCharacters: mockLoadCharacters,
  }),
}))

import { CampaignSetup } from '../../components/CampaignSetup'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'new-camp',
    name: 'The Lost Temple',
    ruleset: 'dnd5e',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    world_state: {},
    session_count: 0,
    ...overrides,
  }
}

describe('CampaignSetup', () => {
  let onClose: ReturnType<typeof vi.fn>
  let onCreated: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    onCreated = vi.fn()
    mockCreateCampaign.mockReset()
    mockSetActiveCampaign.mockReset()
    mockSetView.mockReset()
    mockLoadCharacters.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the campaign name input', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    })

    it('renders three ruleset radio buttons', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByRole('radio', { name: /d&d 5th edition/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /pathfinder 2e/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /freeform/i })).toBeInTheDocument()
    })

    it('selects dnd5e radio button by default', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByRole('radio', { name: /d&d 5th edition/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /pathfinder 2e/i })).not.toBeChecked()
      expect(screen.getByRole('radio', { name: /freeform/i })).not.toBeChecked()
    })

    it('renders the description textarea', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByLabelText(/premise \/ description/i)).toBeInTheDocument()
    })

    it('renders the submit button', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByRole('button', { name: /begin campaign/i })).toBeInTheDocument()
    })
  })

  // ── Validation ────────────────────────────────────────────────────────────

  describe('form validation', () => {
    it('shows "Campaign name is required." when submitting with an empty name', async () => {
      const { container } = render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      // The submit button is disabled when name is empty, so submit the form directly
      fireEvent.submit(container.querySelector('form')!)
      expect(await screen.findByText('Campaign name is required.')).toBeInTheDocument()
    })

    it('does NOT call createCampaign when name is empty', async () => {
      const { container } = render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      fireEvent.submit(container.querySelector('form')!)
      expect(mockCreateCampaign).not.toHaveBeenCalled()
    })

    it('submit button is disabled when name input is empty', () => {
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      expect(screen.getByRole('button', { name: /begin campaign/i })).toBeDisabled()
    })

    it('submit button becomes enabled when a name is typed', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      expect(screen.getByRole('button', { name: /begin campaign/i })).not.toBeDisabled()
    })
  })

  // ── Successful submission ─────────────────────────────────────────────────

  describe('successful submission', () => {
    beforeEach(() => {
      mockCreateCampaign.mockResolvedValue(makeCampaign())
      mockLoadCharacters.mockResolvedValue(undefined)
    })

    it('calls createCampaign with the correct data', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockCreateCampaign).toHaveBeenCalled())
      expect(mockCreateCampaign).toHaveBeenCalledWith({
        name: 'The Lost Temple',
        ruleset: 'dnd5e',
        description: '',
      })
    })

    it('passes the description to createCampaign', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign')
      await user.type(screen.getByLabelText(/premise \/ description/i), 'An epic tale')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockCreateCampaign).toHaveBeenCalled())
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'An epic tale' })
      )
    })

    it('calls onClose after successful submission', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('calls onCreated after successful submission', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(onCreated).toHaveBeenCalled())
    })

    it('calls setView("campaign_detail") after successful submission', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockSetView).toHaveBeenCalledWith('campaign_detail'))
    })

    it('calls setActiveCampaign with the returned campaign', async () => {
      const user = userEvent.setup()
      const newCampaign = makeCampaign({ id: 'created-id' })
      mockCreateCampaign.mockResolvedValue(newCampaign)
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockSetActiveCampaign).toHaveBeenCalledWith(newCampaign))
    })

    it('calls loadCharacters with the campaign id', async () => {
      const user = userEvent.setup()
      const newCampaign = makeCampaign({ id: 'camp-xyz' })
      mockCreateCampaign.mockResolvedValue(newCampaign)
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'The Lost Temple')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockLoadCharacters).toHaveBeenCalledWith('camp-xyz'))
    })
  })

  // ── Ruleset selection ─────────────────────────────────────────────────────

  describe('ruleset selection', () => {
    beforeEach(() => {
      mockCreateCampaign.mockResolvedValue(makeCampaign())
      mockLoadCharacters.mockResolvedValue(undefined)
    })

    it('submits with pathfinder2e when Pathfinder 2e is selected', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'Pathfinder Campaign')
      await user.click(screen.getByRole('radio', { name: /pathfinder 2e/i }))
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockCreateCampaign).toHaveBeenCalled())
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ ruleset: 'pathfinder2e' })
      )
    })

    it('submits with freeform when Freeform is selected', async () => {
      const user = userEvent.setup()
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'Freeform Campaign')
      await user.click(screen.getByRole('radio', { name: /freeform/i }))
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await waitFor(() => expect(mockCreateCampaign).toHaveBeenCalled())
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ ruleset: 'freeform' })
      )
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows an error message when createCampaign throws', async () => {
      const user = userEvent.setup()
      mockCreateCampaign.mockRejectedValue(new Error('Server error'))
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      expect(await screen.findByText('Server error')).toBeInTheDocument()
    })

    it('does not call onClose when createCampaign throws', async () => {
      const user = userEvent.setup()
      mockCreateCampaign.mockRejectedValue(new Error('Server error'))
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      await screen.findByText('Server error')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('shows a generic error message when createCampaign throws a non-Error', async () => {
      const user = userEvent.setup()
      mockCreateCampaign.mockRejectedValue('unknown error')
      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))
      expect(await screen.findByText('Failed to create campaign.')).toBeInTheDocument()
    })
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows "Creating..." and disables the submit button while submitting', async () => {
      const user = userEvent.setup()
      // Use a promise that we control to keep the loading state visible
      let resolveCreate!: (value: Campaign) => void
      const createPromise = new Promise<Campaign>((resolve) => {
        resolveCreate = resolve
      })
      mockCreateCampaign.mockReturnValue(createPromise)
      mockLoadCharacters.mockResolvedValue(undefined)

      render(<CampaignSetup onClose={onClose} onCreated={onCreated} />)
      await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign')
      await user.click(screen.getByRole('button', { name: /begin campaign/i }))

      // While the promise is pending, "Creating..." should be shown
      expect(screen.getByText('Creating...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()

      // Resolve and clean up
      resolveCreate(makeCampaign())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
  })
})
