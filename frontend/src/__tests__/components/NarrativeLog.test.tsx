import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NarrativeLog } from '../../components/NarrativeLog'
import { useGameStore } from '../../store/gameStore'
import { resetStore } from '../../test/mockStore'
import type { NarrativeMessage } from '../../types'

// Mock the api client so the store doesn't make real HTTP calls
vi.mock('../../api/client', () => ({
  api: {
    campaigns: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    sessions: { list: vi.fn(), start: vi.fn(), end: vi.fn() },
    characters: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    tts: { providers: vi.fn(), synthesize: vi.fn() },
  },
}))

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<NarrativeMessage> = {}): NarrativeMessage {
  return {
    id: 'msg1',
    role: 'dm',
    text: 'You stand at the entrance of a dark dungeon.',
    timestamp: '2024-01-01T12:00:00Z',
    ...overrides,
  }
}

describe('NarrativeLog', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Accessibility attributes ──────────────────────────────────────────────

  describe('accessibility', () => {
    it('has aria-live="polite" attribute', () => {
      render(<NarrativeLog />)
      const log = screen.getByLabelText('Story log')
      expect(log).toHaveAttribute('aria-live', 'polite')
    })

    it('has aria-label="Story log"', () => {
      render(<NarrativeLog />)
      expect(screen.getByLabelText('Story log')).toBeInTheDocument()
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows the empty state message when messages and streamingText are both empty', () => {
      useGameStore.setState({ messages: [], streamingText: '' })
      render(<NarrativeLog />)
      expect(screen.getByText('Your adventure begins when you speak...')).toBeInTheDocument()
    })

    it('hides the empty state when there are messages', () => {
      useGameStore.setState({
        messages: [makeMessage()],
        streamingText: '',
      })
      render(<NarrativeLog />)
      expect(screen.queryByText('Your adventure begins when you speak...')).not.toBeInTheDocument()
    })

    it('hides the empty state when streamingText is non-empty', () => {
      useGameStore.setState({ messages: [], streamingText: 'The DM is speaking...' })
      render(<NarrativeLog />)
      expect(screen.queryByText('Your adventure begins when you speak...')).not.toBeInTheDocument()
    })
  })

  // ── DM messages ───────────────────────────────────────────────────────────

  describe('DM messages', () => {
    it('renders a DM message with class msg-dm', () => {
      const msg = makeMessage({ role: 'dm', text: 'The dragon awakens.' })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const msgEl = container.querySelector('.msg-dm')
      expect(msgEl).toBeInTheDocument()
      expect(msgEl).toHaveTextContent('The dragon awakens.')
    })

    it('does not show a player name prefix for DM messages', () => {
      const msg = makeMessage({ role: 'dm', player_name: 'DM', text: 'Welcome.' })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      expect(container.querySelector('.msg-player-name')).not.toBeInTheDocument()
    })
  })

  // ── Player messages ────────────────────────────────────────────────────────

  describe('Player messages', () => {
    it('renders a player message with class msg-player', () => {
      const msg = makeMessage({ id: 'p1', role: 'player', text: 'I attack the goblin.' })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const msgEl = container.querySelector('.msg-player')
      expect(msgEl).toBeInTheDocument()
      expect(msgEl).toHaveTextContent('I attack the goblin.')
    })

    it('shows the player name with a colon when player_name is set', () => {
      const msg = makeMessage({
        id: 'p2',
        role: 'player',
        player_name: 'Alice',
        text: 'I draw my sword.',
      })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const nameSpan = container.querySelector('.msg-player-name')
      expect(nameSpan).toBeInTheDocument()
      expect(nameSpan).toHaveTextContent('Alice:')
    })

    it('does not show a player name prefix when player_name is not set', () => {
      const msg = makeMessage({ id: 'p3', role: 'player', text: 'I sneak ahead.', player_name: undefined })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      expect(container.querySelector('.msg-player-name')).not.toBeInTheDocument()
    })
  })

  // ── System messages ────────────────────────────────────────────────────────

  describe('System messages', () => {
    it('renders a system message with class msg-system', () => {
      const msg = makeMessage({ id: 's1', role: 'system', text: 'Session started.' })
      useGameStore.setState({ messages: [msg], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const msgEl = container.querySelector('.msg-system')
      expect(msgEl).toBeInTheDocument()
      expect(msgEl).toHaveTextContent('Session started.')
    })
  })

  // ── Multiple messages ──────────────────────────────────────────────────────

  describe('multiple messages', () => {
    it('renders all messages in order', () => {
      const messages: NarrativeMessage[] = [
        makeMessage({ id: 'a', role: 'dm', text: 'First message.' }),
        makeMessage({ id: 'b', role: 'player', text: 'Second message.' }),
        makeMessage({ id: 'c', role: 'system', text: 'Third message.' }),
      ]
      useGameStore.setState({ messages, streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const items = container.querySelectorAll('.message-item')
      expect(items).toHaveLength(3)
      expect(items[0]).toHaveTextContent('First message.')
      expect(items[1]).toHaveTextContent('Second message.')
      expect(items[2]).toHaveTextContent('Third message.')
    })
  })

  // ── Streaming text ─────────────────────────────────────────────────────────

  describe('streaming text', () => {
    it('shows an element with class msg-streaming when streamingText is non-empty', () => {
      useGameStore.setState({ messages: [], streamingText: 'The DM is narrating...' })
      const { container } = render(<NarrativeLog />)
      const streamingEl = container.querySelector('.msg-streaming')
      expect(streamingEl).toBeInTheDocument()
      expect(streamingEl).toHaveTextContent('The DM is narrating...')
    })

    it('does not show a streaming element when streamingText is empty', () => {
      useGameStore.setState({ messages: [], streamingText: '' })
      const { container } = render(<NarrativeLog />)
      expect(container.querySelector('.msg-streaming')).not.toBeInTheDocument()
    })

    it('shows streaming text alongside existing messages', () => {
      useGameStore.setState({
        messages: [makeMessage({ id: 'existing', text: 'Existing message.' })],
        streamingText: 'Streaming in progress...',
      })
      const { container } = render(<NarrativeLog />)
      expect(container.querySelector('.msg-streaming')).toBeInTheDocument()
      expect(container.querySelector('.message-item.msg-dm')).toBeInTheDocument()
    })
  })

  // ── Message item classes ───────────────────────────────────────────────────

  describe('message-item class', () => {
    it('each message has the message-item base class', () => {
      const messages = [
        makeMessage({ id: 'x', role: 'dm' }),
        makeMessage({ id: 'y', role: 'player' }),
      ]
      useGameStore.setState({ messages, streamingText: '' })
      const { container } = render(<NarrativeLog />)
      const items = container.querySelectorAll('.message-item')
      expect(items).toHaveLength(2)
    })
  })
})
