import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { resetStore } from '../../test/mockStore'

// Mock MicButton before importing PlayerInput
vi.mock('../../components/MicButton', () => ({
  MicButton: ({ onTranscript }: { onTranscript: (t: string) => void }) => (
    <button data-testid="mic-btn" onClick={() => onTranscript('hello mic')}>
      Mic
    </button>
  ),
}))

// Mock the api client so the store doesn't make real HTTP calls
vi.mock('../../api/client', () => ({
  api: {
    campaigns: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    sessions: { list: vi.fn(), start: vi.fn(), end: vi.fn() },
    characters: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    tts: { providers: vi.fn(), synthesize: vi.fn() },
  },
}))

// Import PlayerInput after mocks are in place
import { PlayerInput } from '../../components/PlayerInput'

// ─── Default props ─────────────────────────────────────────────────────────────

function defaultProps(overrides: Partial<Parameters<typeof PlayerInput>[0]> = {}) {
  return {
    onSendAction: vi.fn(),
    onSendVoiceTranscript: vi.fn(),
    onOpenDiceCamera: vi.fn(),
    connected: true,
    ...overrides,
  }
}

describe('PlayerInput', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the textarea', () => {
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByRole('textbox', { name: /player action input/i })).toBeInTheDocument()
    })

    it('renders the send button', () => {
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByRole('button', { name: /send action/i })).toBeInTheDocument()
    })

    it('renders the mic button', () => {
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByTestId('mic-btn')).toBeInTheDocument()
    })
  })

  // ── Sending text ─────────────────────────────────────────────────────────────

  describe('sending text', () => {
    it('calls onSendAction with typed text when send button is clicked', async () => {
      const user = userEvent.setup()
      const onSendAction = vi.fn()
      render(<PlayerInput {...defaultProps({ onSendAction })} />)
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      await user.type(textarea, 'I explore the cave')
      await user.click(screen.getByRole('button', { name: /send action/i }))
      expect(onSendAction).toHaveBeenCalledWith('I explore the cave')
    })

    it('clears the textarea after sending', async () => {
      const user = userEvent.setup()
      render(<PlayerInput {...defaultProps()} />)
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      await user.type(textarea, 'I look around')
      await user.click(screen.getByRole('button', { name: /send action/i }))
      expect(textarea).toHaveValue('')
    })

    it('calls onSendAction when Ctrl+Enter is pressed', async () => {
      const user = userEvent.setup()
      const onSendAction = vi.fn()
      render(<PlayerInput {...defaultProps({ onSendAction })} />)
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      await user.type(textarea, 'Sneak past the guard')
      await user.keyboard('{Control>}{Enter}{/Control}')
      expect(onSendAction).toHaveBeenCalledWith('Sneak past the guard')
    })

    it('does not call onSendAction when text is only whitespace', async () => {
      const user = userEvent.setup()
      const onSendAction = vi.fn()
      render(<PlayerInput {...defaultProps({ onSendAction })} />)
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      await user.type(textarea, '   ')
      await user.click(screen.getByRole('button', { name: /send action/i }))
      expect(onSendAction).not.toHaveBeenCalled()
    })
  })

  // ── Disconnected state ────────────────────────────────────────────────────

  describe('disconnected state', () => {
    it('shows "Reconnecting to server..." when connected=false', () => {
      render(<PlayerInput {...defaultProps({ connected: false })} />)
      expect(screen.getByText('Reconnecting to server...')).toBeInTheDocument()
    })

    it('disables the textarea when connected=false', () => {
      render(<PlayerInput {...defaultProps({ connected: false })} />)
      expect(screen.getByRole('textbox', { name: /player action input/i })).toBeDisabled()
    })

    it('does not show reconnecting message when connected=true', () => {
      render(<PlayerInput {...defaultProps({ connected: true })} />)
      expect(screen.queryByText('Reconnecting to server...')).not.toBeInTheDocument()
    })
  })

  // ── Streaming state ────────────────────────────────────────────────────────

  describe('streaming state', () => {
    it('disables the textarea when streamingText is non-empty', () => {
      useGameStore.setState({ streamingText: 'DM is speaking...' })
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByRole('textbox', { name: /player action input/i })).toBeDisabled()
    })

    it('enables the textarea when streamingText is empty', () => {
      useGameStore.setState({ streamingText: '' })
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByRole('textbox', { name: /player action input/i })).not.toBeDisabled()
    })
  })

  // ── Pending roll banner ────────────────────────────────────────────────────

  describe('pending roll banner', () => {
    const pendingRoll = {
      roll_request_id: 'r1',
      dice: '1d20',
      skill: 'Perception',
      dc: 15,
    }

    it('shows the pending roll banner when pendingRoll is set', () => {
      useGameStore.setState({ pendingRoll })
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByText('1d20')).toBeInTheDocument()
      expect(screen.getByText('Perception')).toBeInTheDocument()
    })

    it('shows DC when it is set on pendingRoll', () => {
      useGameStore.setState({ pendingRoll })
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.getByText('DC 15')).toBeInTheDocument()
    })

    it('does not show the pending roll banner when pendingRoll is null', () => {
      useGameStore.setState({ pendingRoll: null })
      render(<PlayerInput {...defaultProps()} />)
      expect(screen.queryByText('1d20')).not.toBeInTheDocument()
    })

    it('"📷 Camera" button in roll banner calls onOpenDiceCamera', async () => {
      const user = userEvent.setup()
      const onOpenDiceCamera = vi.fn()
      useGameStore.setState({ pendingRoll })
      render(<PlayerInput {...defaultProps({ onOpenDiceCamera })} />)
      await user.click(screen.getByText('📷 Camera'))
      expect(onOpenDiceCamera).toHaveBeenCalledTimes(1)
    })

    it('"✎ Manual" button in roll banner calls onOpenDiceCamera', async () => {
      const user = userEvent.setup()
      const onOpenDiceCamera = vi.fn()
      useGameStore.setState({ pendingRoll })
      render(<PlayerInput {...defaultProps({ onOpenDiceCamera })} />)
      await user.click(screen.getByText('✎ Manual'))
      expect(onOpenDiceCamera).toHaveBeenCalledTimes(1)
    })
  })

  // ── Mic button ────────────────────────────────────────────────────────────

  describe('mic button', () => {
    it('calls onSendVoiceTranscript with the transcript text when mic is clicked', async () => {
      const user = userEvent.setup()
      const onSendVoiceTranscript = vi.fn()
      render(<PlayerInput {...defaultProps({ onSendVoiceTranscript })} />)
      await user.click(screen.getByTestId('mic-btn'))
      expect(onSendVoiceTranscript).toHaveBeenCalledWith('hello mic')
    })

    it('populates the textarea with the mic transcript', async () => {
      const user = userEvent.setup()
      render(<PlayerInput {...defaultProps()} />)
      await user.click(screen.getByTestId('mic-btn'))
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      expect(textarea).toHaveValue('hello mic')
    })

    it('appends mic transcript to existing text with a space', async () => {
      const user = userEvent.setup()
      render(<PlayerInput {...defaultProps()} />)
      const textarea = screen.getByRole('textbox', { name: /player action input/i })
      await user.type(textarea, 'I go to the ')
      await user.click(screen.getByTestId('mic-btn'))
      expect(textarea).toHaveValue('I go to the  hello mic')
    })

    it('does not call onSendVoiceTranscript when connected=false', async () => {
      const user = userEvent.setup()
      const onSendVoiceTranscript = vi.fn()
      render(<PlayerInput {...defaultProps({ connected: false, onSendVoiceTranscript })} />)
      await user.click(screen.getByTestId('mic-btn'))
      expect(onSendVoiceTranscript).not.toHaveBeenCalled()
    })

    it('does not call onSendVoiceTranscript when streaming', async () => {
      const user = userEvent.setup()
      const onSendVoiceTranscript = vi.fn()
      useGameStore.setState({ streamingText: 'DM speaking...' })
      render(<PlayerInput {...defaultProps({ onSendVoiceTranscript })} />)
      await user.click(screen.getByTestId('mic-btn'))
      expect(onSendVoiceTranscript).not.toHaveBeenCalled()
    })
  })
})
