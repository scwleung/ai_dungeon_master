import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    campaigns: {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    sessions: {
      list: vi.fn(),
      start: vi.fn(),
      end: vi.fn(),
    },
    characters: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tts: {
      providers: vi.fn(),
      synthesize: vi.fn(),
    },
  },
  setAccessCode: vi.fn(),
  getAccessCode: vi.fn(() => ''),
}))

import { useGameStore } from '../../store/gameStore'
import { api } from '../../api/client'
import { resetStore } from '../../test/mockStore'
import type { Campaign, Session, NarrativeMessage, Character } from '../../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'camp1',
  name: 'Test Campaign',
  ruleset: 'dnd5e',
  description: 'A test campaign',
  created_at: '2024-01-01T00:00:00Z',
  world_state: {},
  session_count: 0,
  access_code: 'test-code',
  ...overrides,
})

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess1',
  campaign_id: 'camp1',
  started_at: '2024-01-01T00:00:00Z',
  messages: [],
  ...overrides,
})

const makeMessage = (overrides: Partial<NarrativeMessage> = {}): NarrativeMessage => ({
  id: 'msg1',
  role: 'dm',
  text: 'Hello adventurer',
  timestamp: '2024-01-01T00:00:00Z',
  ...overrides,
})

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: 'char1',
  campaign_id: 'camp1',
  player_name: 'Alice',
  name: 'Thorin',
  race: 'Dwarf',
  class_name: 'Fighter',
  level: 5,
  hp_current: 30,
  hp_max: 40,
  stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 10 },
  inventory: ['Battleaxe'],
  conditions: [],
  notes: '',
  ...overrides,
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('gameStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Navigation ──────────────────────────────────────────────────────────────

  describe('setView', () => {
    it('updates the view', () => {
      const store = useGameStore.getState()
      store.setView('session')
      expect(useGameStore.getState().view).toBe('session')
    })

    it('can set every valid view value', () => {
      const views = ['campaigns', 'campaign_detail', 'character_setup', 'session'] as const
      for (const v of views) {
        useGameStore.getState().setView(v)
        expect(useGameStore.getState().view).toBe(v)
      }
    })
  })

  // ── Settings ─────────────────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('updates a single setting while keeping others', () => {
      const store = useGameStore.getState()
      const original = store.settings
      store.updateSettings({ playerName: 'Bob' })
      const updated = useGameStore.getState().settings
      expect(updated.playerName).toBe('Bob')
      expect(updated.ttsProvider).toBe(original.ttsProvider)
      expect(updated.theme).toBe(original.theme)
      expect(updated.playerId).toBe(original.playerId)
    })

    it('persists settings to localStorage', () => {
      useGameStore.getState().updateSettings({ playerName: 'Gandalf' })
      const raw = window.localStorage.getItem('dm_settings')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.playerName).toBe('Gandalf')
    })

    it('persists theme change to localStorage', () => {
      useGameStore.getState().updateSettings({ theme: 'hud' })
      const raw = window.localStorage.getItem('dm_settings')
      const parsed = JSON.parse(raw!)
      expect(parsed.theme).toBe('hud')
    })
  })

  // ── Campaigns ─────────────────────────────────────────────────────────────────

  describe('setActiveCampaign', () => {
    it('sets the active campaign', () => {
      const campaign = makeCampaign()
      useGameStore.getState().setActiveCampaign(campaign)
      expect(useGameStore.getState().activeCampaign).toEqual(campaign)
    })

    it('can set activeCampaign to null', () => {
      useGameStore.setState({ activeCampaign: makeCampaign() })
      useGameStore.getState().setActiveCampaign(null)
      expect(useGameStore.getState().activeCampaign).toBeNull()
    })
  })

  describe('loadCampaigns', () => {
    it('populates campaigns from API', async () => {
      const campaign = makeCampaign()
      vi.mocked(api.campaigns.list).mockResolvedValue({ data: [campaign] })
      await useGameStore.getState().loadCampaigns()
      expect(useGameStore.getState().campaigns).toHaveLength(1)
      expect(useGameStore.getState().campaigns[0]).toEqual(campaign)
    })

    it('calls api.campaigns.list once', async () => {
      vi.mocked(api.campaigns.list).mockResolvedValue({ data: [] })
      await useGameStore.getState().loadCampaigns()
      expect(api.campaigns.list).toHaveBeenCalledTimes(1)
    })
  })

  describe('createCampaign', () => {
    it('appends new campaign to campaigns and returns it', async () => {
      const newCampaign = makeCampaign({ id: 'new-camp', name: 'New World' })
      vi.mocked(api.campaigns.create).mockResolvedValue({ data: newCampaign })
      const result = await useGameStore.getState().createCampaign({
        name: 'New World',
        ruleset: 'dnd5e',
        description: '',
      })
      expect(result).toEqual(newCampaign)
      expect(useGameStore.getState().campaigns).toContainEqual(newCampaign)
    })

    it('appends without overwriting existing campaigns', async () => {
      const existing = makeCampaign({ id: 'existing' })
      useGameStore.setState({ campaigns: [existing] })
      const newCampaign = makeCampaign({ id: 'new-camp' })
      vi.mocked(api.campaigns.create).mockResolvedValue({ data: newCampaign })
      await useGameStore.getState().createCampaign({
        name: 'new-camp',
        ruleset: 'freeform',
        description: '',
      })
      expect(useGameStore.getState().campaigns).toHaveLength(2)
    })
  })

  describe('deleteCampaign', () => {
    it('removes the campaign from the list', async () => {
      const camp = makeCampaign({ id: 'to-delete' })
      useGameStore.setState({ campaigns: [camp] })
      vi.mocked(api.campaigns.delete).mockResolvedValue(undefined)
      await useGameStore.getState().deleteCampaign('to-delete')
      expect(useGameStore.getState().campaigns).toHaveLength(0)
    })

    it('sets activeCampaign to null when the deleted campaign was active', async () => {
      const camp = makeCampaign({ id: 'to-delete' })
      useGameStore.setState({ campaigns: [camp], activeCampaign: camp })
      vi.mocked(api.campaigns.delete).mockResolvedValue(undefined)
      await useGameStore.getState().deleteCampaign('to-delete')
      expect(useGameStore.getState().activeCampaign).toBeNull()
    })

    it('leaves activeCampaign unchanged when a different campaign is deleted', async () => {
      const active = makeCampaign({ id: 'active' })
      const other = makeCampaign({ id: 'other' })
      useGameStore.setState({ campaigns: [active, other], activeCampaign: active })
      vi.mocked(api.campaigns.delete).mockResolvedValue(undefined)
      await useGameStore.getState().deleteCampaign('other')
      expect(useGameStore.getState().activeCampaign).toEqual(active)
    })

    it('calls api.campaigns.delete with the correct id', async () => {
      const camp = makeCampaign({ id: 'camp-xyz' })
      useGameStore.setState({ campaigns: [camp] })
      vi.mocked(api.campaigns.delete).mockResolvedValue(undefined)
      await useGameStore.getState().deleteCampaign('camp-xyz')
      expect(api.campaigns.delete).toHaveBeenCalledWith('camp-xyz')
    })
  })

  // ── Messages / Streaming ───────────────────────────────────────────────────

  describe('appendMessage', () => {
    it('appends a message to the messages array', () => {
      const msg = makeMessage()
      useGameStore.getState().appendMessage(msg)
      expect(useGameStore.getState().messages).toHaveLength(1)
      expect(useGameStore.getState().messages[0]).toEqual(msg)
    })

    it('preserves existing messages', () => {
      const msg1 = makeMessage({ id: 'a' })
      const msg2 = makeMessage({ id: 'b' })
      useGameStore.getState().appendMessage(msg1)
      useGameStore.getState().appendMessage(msg2)
      expect(useGameStore.getState().messages).toHaveLength(2)
    })
  })

  describe('setStreamingText', () => {
    it('sets streaming text', () => {
      useGameStore.getState().setStreamingText('hello world')
      expect(useGameStore.getState().streamingText).toBe('hello world')
    })

    it('can clear streaming text', () => {
      useGameStore.setState({ streamingText: 'some text' })
      useGameStore.getState().setStreamingText('')
      expect(useGameStore.getState().streamingText).toBe('')
    })
  })

  // ── Sessions ─────────────────────────────────────────────────────────────────

  describe('setActiveSession', () => {
    it('sets the active session and loads its messages', () => {
      const messages = [makeMessage()]
      const session = makeSession({ messages })
      useGameStore.getState().setActiveSession(session)
      expect(useGameStore.getState().activeSession).toEqual(session)
      expect(useGameStore.getState().messages).toEqual(messages)
    })

    it('sets activeSession to null and clears messages', () => {
      useGameStore.setState({
        activeSession: makeSession(),
        messages: [makeMessage()],
      })
      useGameStore.getState().setActiveSession(null)
      expect(useGameStore.getState().activeSession).toBeNull()
      expect(useGameStore.getState().messages).toEqual([])
    })

    it('uses empty array for messages when session has no messages', () => {
      const session = makeSession({ messages: [] })
      useGameStore.getState().setActiveSession(session)
      expect(useGameStore.getState().messages).toEqual([])
    })
  })

  describe('startSession', () => {
    it('calls api.sessions.start and sets activeSession', async () => {
      const session = makeSession()
      vi.mocked(api.sessions.start).mockResolvedValue({ data: session })
      const result = await useGameStore.getState().startSession('camp1')
      expect(api.sessions.start).toHaveBeenCalledWith('camp1')
      expect(useGameStore.getState().activeSession).toEqual(session)
      expect(result).toEqual(session)
    })

    it('loads messages from the started session', async () => {
      const messages = [makeMessage()]
      const session = makeSession({ messages })
      vi.mocked(api.sessions.start).mockResolvedValue({ data: session })
      await useGameStore.getState().startSession('camp1')
      expect(useGameStore.getState().messages).toEqual(messages)
    })
  })

  describe('endSession', () => {
    it('calls api.sessions.end and clears state', async () => {
      const session = makeSession({ id: 'sess-end' })
      useGameStore.setState({
        activeSession: session,
        messages: [makeMessage()],
        streamingText: 'streaming...',
        activePlayers: [{ player_id: 'p1', player_name: 'Alice' }],
      })
      vi.mocked(api.sessions.end).mockResolvedValue(undefined as unknown as { data: Session })
      await useGameStore.getState().endSession()
      expect(api.sessions.end).toHaveBeenCalledWith('sess-end')
      expect(useGameStore.getState().activeSession).toBeNull()
      expect(useGameStore.getState().messages).toEqual([])
      expect(useGameStore.getState().streamingText).toBe('')
      expect(useGameStore.getState().activePlayers).toEqual([])
    })

    it('does not call api when there is no active session', async () => {
      useGameStore.setState({ activeSession: null })
      await useGameStore.getState().endSession()
      expect(api.sessions.end).not.toHaveBeenCalled()
    })
  })

  // ── Players ───────────────────────────────────────────────────────────────────

  describe('addPlayer', () => {
    it('adds a player to the activePlayers list', () => {
      useGameStore.getState().addPlayer('p1', 'Alice')
      expect(useGameStore.getState().activePlayers).toHaveLength(1)
      expect(useGameStore.getState().activePlayers[0]).toEqual({
        player_id: 'p1',
        player_name: 'Alice',
      })
    })

    it('deduplicates players with the same id', () => {
      useGameStore.getState().addPlayer('p1', 'Alice')
      useGameStore.getState().addPlayer('p1', 'Alice')
      expect(useGameStore.getState().activePlayers).toHaveLength(1)
    })

    it('allows different players', () => {
      useGameStore.getState().addPlayer('p1', 'Alice')
      useGameStore.getState().addPlayer('p2', 'Bob')
      expect(useGameStore.getState().activePlayers).toHaveLength(2)
    })
  })

  describe('removePlayer', () => {
    it('removes a player from activePlayers', () => {
      useGameStore.setState({
        activePlayers: [{ player_id: 'p1', player_name: 'Alice' }],
      })
      useGameStore.getState().removePlayer('p1')
      expect(useGameStore.getState().activePlayers).toHaveLength(0)
    })

    it('does nothing when removing a nonexistent player', () => {
      useGameStore.setState({
        activePlayers: [{ player_id: 'p1', player_name: 'Alice' }],
      })
      useGameStore.getState().removePlayer('unknown')
      expect(useGameStore.getState().activePlayers).toHaveLength(1)
    })

    it('does not error when activePlayers is empty', () => {
      expect(() => useGameStore.getState().removePlayer('p99')).not.toThrow()
    })
  })

  // ── Pending Roll ──────────────────────────────────────────────────────────────

  describe('setPendingRoll', () => {
    it('sets a pending roll', () => {
      const roll = { roll_request_id: 'r1', dice: '1d20', skill: 'Perception', dc: 15 }
      useGameStore.getState().setPendingRoll(roll)
      expect(useGameStore.getState().pendingRoll).toEqual(roll)
    })

    it('can clear pending roll to null', () => {
      useGameStore.setState({
        pendingRoll: { roll_request_id: 'r1', dice: '1d20', skill: 'Perception' },
      })
      useGameStore.getState().setPendingRoll(null)
      expect(useGameStore.getState().pendingRoll).toBeNull()
    })
  })

  // ── Characters ────────────────────────────────────────────────────────────────

  describe('updateCharacter', () => {
    it('optimistically updates a character in the store', () => {
      const char = makeCharacter({ id: 'c1', hp_current: 30 })
      useGameStore.setState({ characters: [char] })
      // updateCharacter also calls api.characters.update — mock it to avoid errors
      vi.mocked(api.characters.update).mockResolvedValue({
        data: { ...char, hp_current: 5 },
      })
      useGameStore.getState().updateCharacter('c1', { hp_current: 5 })
      const updated = useGameStore.getState().characters.find((c) => c.id === 'c1')
      expect(updated?.hp_current).toBe(5)
    })

    it('leaves other characters untouched', () => {
      const char1 = makeCharacter({ id: 'c1' })
      const char2 = makeCharacter({ id: 'c2', name: 'Legolas' })
      useGameStore.setState({ characters: [char1, char2] })
      vi.mocked(api.characters.update).mockResolvedValue({ data: char1 })
      useGameStore.getState().updateCharacter('c1', { hp_current: 1 })
      const untouched = useGameStore.getState().characters.find((c) => c.id === 'c2')
      expect(untouched?.name).toBe('Legolas')
    })
  })

  describe('loadCharacters', () => {
    it('populates characters from API', async () => {
      const char = makeCharacter()
      vi.mocked(api.characters.list).mockResolvedValue({ data: [char] })
      await useGameStore.getState().loadCharacters('camp1')
      expect(api.characters.list).toHaveBeenCalledWith('camp1')
      expect(useGameStore.getState().characters).toHaveLength(1)
      expect(useGameStore.getState().characters[0]).toEqual(char)
    })
  })

  // ── Sessions history ──────────────────────────────────────────────────────────

  describe('loadSessions', () => {
    it('populates sessions list from API', async () => {
      const session = makeSession()
      vi.mocked(api.sessions.list).mockResolvedValue({ data: [session] })
      await useGameStore.getState().loadSessions('camp1')
      expect(api.sessions.list).toHaveBeenCalledWith('camp1')
      expect(useGameStore.getState().sessions).toHaveLength(1)
    })
  })
})
