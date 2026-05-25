import { create } from 'zustand'
import { api } from '../api/client'
import type {
  AppView,
  Campaign,
  Character,
  GameSettings,
  NarrativeMessage,
  RulesetName,
  Session,
  ThemeName,
  TTSProvider,
} from '../types'

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('dm_settings')
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>
      return {
        ttsProvider: (parsed.ttsProvider as TTSProvider) ?? 'browser',
        ttsVoiceId: parsed.ttsVoiceId ?? '',
        theme: (parsed.theme as ThemeName) ?? 'fantasy',
        playerId: parsed.playerId ?? generateId(),
        playerName: parsed.playerName ?? 'Adventurer',
      }
    }
  } catch {
    // ignore
  }
  return {
    ttsProvider: 'browser',
    ttsVoiceId: '',
    theme: 'fantasy',
    playerId: generateId(),
    playerName: 'Adventurer',
  }
}

function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem('dm_settings', JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export interface PendingRoll {
  roll_request_id: string
  dice: string
  skill: string
  dc?: number
}

export interface ActivePlayer {
  player_id: string
  player_name: string
}

export interface GameStore {
  // Navigation
  view: AppView
  setView: (v: AppView) => void

  // Settings
  settings: GameSettings
  updateSettings: (partial: Partial<GameSettings>) => void

  // Campaign
  campaigns: Campaign[]
  activeCampaign: Campaign | null
  loadCampaigns: () => Promise<void>
  createCampaign: (data: {
    name: string
    ruleset: RulesetName
    description: string
  }) => Promise<Campaign>
  deleteCampaign: (id: string) => Promise<void>
  setActiveCampaign: (c: Campaign | null) => void

  // Session
  activeSession: Session | null
  messages: NarrativeMessage[]
  streamingText: string
  setActiveSession: (s: Session | null) => void
  startSession: (campaignId: string) => Promise<Session>
  endSession: () => Promise<void>
  appendMessage: (msg: NarrativeMessage) => void
  setStreamingText: (text: string) => void

  // Characters
  characters: Character[]
  loadCharacters: (campaignId: string) => Promise<void>
  createCharacter: (
    campaignId: string,
    data: Omit<Character, 'id' | 'campaign_id'>
  ) => Promise<Character>
  updateCharacter: (id: string, updates: Partial<Character>) => void

  // Players in session
  activePlayers: ActivePlayer[]
  addPlayer: (player_id: string, player_name: string) => void
  removePlayer: (player_id: string) => void

  // Pending dice roll
  pendingRoll: PendingRoll | null
  setPendingRoll: (r: PendingRoll | null) => void

  // Sessions history
  sessions: Session[]
  loadSessions: (campaignId: string) => Promise<void>
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Navigation
  view: 'campaigns',
  setView: (v) => set({ view: v }),

  // Settings
  settings: loadSettings(),
  updateSettings: (partial) => {
    const next = { ...get().settings, ...partial }
    saveSettings(next)
    set({ settings: next })
  },

  // Campaign
  campaigns: [],
  activeCampaign: null,
  loadCampaigns: async () => {
    const res = await api.campaigns.list()
    set({ campaigns: res.data })
  },
  createCampaign: async (data) => {
    const res = await api.campaigns.create(data)
    set((state) => ({ campaigns: [...state.campaigns, res.data] }))
    return res.data
  },
  deleteCampaign: async (id) => {
    await api.campaigns.delete(id)
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== id),
      activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
    }))
  },
  setActiveCampaign: (c) => set({ activeCampaign: c }),

  // Session
  activeSession: null,
  messages: [],
  streamingText: '',
  setActiveSession: (s) => set({ activeSession: s, messages: s?.messages ?? [] }),
  startSession: async (campaignId) => {
    const res = await api.sessions.start(campaignId)
    set({ activeSession: res.data, messages: res.data.messages ?? [] })
    return res.data
  },
  endSession: async () => {
    const { activeSession } = get()
    if (!activeSession) return
    await api.sessions.end(activeSession.id)
    set({ activeSession: null, messages: [], streamingText: '', activePlayers: [] })
  },
  appendMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setStreamingText: (text) => set({ streamingText: text }),

  // Characters
  characters: [],
  loadCharacters: async (campaignId) => {
    const res = await api.characters.list(campaignId)
    set({ characters: res.data })
  },
  createCharacter: async (campaignId, data) => {
    const res = await api.characters.create(campaignId, data)
    set((state) => ({ characters: [...state.characters, res.data] }))
    return res.data
  },
  updateCharacter: (id, updates) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
    // Also persist to backend
    api.characters.update(id, updates).catch(console.error)
  },

  // Players in session
  activePlayers: [],
  addPlayer: (player_id, player_name) =>
    set((state) => {
      const exists = state.activePlayers.some((p) => p.player_id === player_id)
      if (exists) return state
      return { activePlayers: [...state.activePlayers, { player_id, player_name }] }
    }),
  removePlayer: (player_id) =>
    set((state) => ({
      activePlayers: state.activePlayers.filter((p) => p.player_id !== player_id),
    })),

  // Pending dice roll
  pendingRoll: null,
  setPendingRoll: (r) => set({ pendingRoll: r }),

  // Sessions history
  sessions: [],
  loadSessions: async (campaignId) => {
    const res = await api.sessions.list(campaignId)
    set({ sessions: res.data })
  },
}))
