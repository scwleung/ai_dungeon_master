import { create } from 'zustand'
import { api, setAccessCode } from '../api/client'
import type {
  AppView,
  Campaign,
  Character,
  Combatant,
  GameSettings,
  MapData,
  NarrativeMessage,
  NPC,
  RulesetName,
  Session,
  ThemeName,
  TTSProvider,
} from '../types'

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function loadCampaignTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem('campaign_tokens')
    if (raw) return JSON.parse(raw) as Record<string, string>
  } catch {
    // ignore
  }
  return {}
}

function saveCampaignTokens(tokens: Record<string, string>): void {
  try {
    localStorage.setItem('campaign_tokens', JSON.stringify(tokens))
  } catch {
    // ignore
  }
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

/** Describes a dice roll that the server has requested but not yet received a result for. */
export interface PendingRoll {
  /** Correlates this pending roll to the server's original `dice_request` message. */
  roll_request_id: string
  /** Dice notation string, e.g. `"2d6"`. */
  dice: string
  /** Skill or ability check that triggered the roll (e.g. `"Perception"`). */
  skill: string
  /** Difficulty class the result must meet or exceed; absent for open rolls. */
  dc?: number
}

/** A player who has joined the current session, as reported by the server. */
export interface ActivePlayer {
  /** The player's unique session identifier. */
  player_id: string
  /** The player's chosen display name. */
  player_name: string
}

/**
 * Complete Zustand store shape for the AI Dungeon Master frontend.
 *
 * State is split into logical sections: navigation, settings, campaigns,
 * sessions, characters, active players, and the pending dice roll.
 * Async actions call the REST API and update the store on success.
 */
export interface GameStore {
  // Navigation

  /** Current top-level view rendered by the app. */
  view: AppView
  /** Navigate to a different top-level view. */
  setView: (v: AppView) => void

  // Settings

  /** Persisted user preferences (TTS, theme, player identity). */
  settings: GameSettings
  /** Merge partial settings into the current settings and persist to localStorage. */
  updateSettings: (partial: Partial<GameSettings>) => void

  // Campaign

  /** All campaigns fetched from the server for the current user. */
  campaigns: Campaign[]
  /** The campaign currently open in the detail or session view; `null` when on the list view. */
  activeCampaign: Campaign | null
  /** Map of campaign ID → access code, persisted to localStorage. */
  campaignTokens: Record<string, string>
  /** Fetch all campaigns from the server and replace the `campaigns` list. */
  loadCampaigns: () => Promise<void>
  /** Create a new campaign via the API and append it to `campaigns`. */
  createCampaign: (data: {
    name: string
    ruleset: RulesetName
    description: string
  }) => Promise<Campaign>
  /** Delete a campaign by ID via the API and remove it from `campaigns`. */
  deleteCampaign: (id: string) => Promise<void>
  /** Set the active campaign without making a network request. */
  setActiveCampaign: (c: Campaign | null) => void

  // Session

  /** The currently running session; `null` when no session is active. */
  activeSession: Session | null
  /** Ordered list of narrative messages displayed in the log. */
  messages: NarrativeMessage[]
  /** Partially streamed DM text being assembled before `dm_response_complete`. */
  streamingText: string
  /** Set the active session and pre-populate `messages` from its history. */
  setActiveSession: (s: Session | null) => void
  /** Start a new session for the given campaign via the API. */
  startSession: (campaignId: string) => Promise<Session>
  /** End the active session via the API and clear session state. */
  endSession: () => Promise<void>
  /** Append a single message to the narrative log. */
  appendMessage: (msg: NarrativeMessage) => void
  /** Replace the current streaming text buffer (called on each `dm_chunk`). */
  setStreamingText: (text: string) => void

  // Characters

  /** Characters belonging to the active campaign. */
  characters: Character[]
  /** Fetch all characters for a campaign from the server. */
  loadCharacters: (campaignId: string) => Promise<void>
  /** Create a new character via the API and append it to `characters`. */
  createCharacter: (
    campaignId: string,
    data: Omit<Character, 'id' | 'campaign_id'>
  ) => Promise<Character>
  /**
   * Apply local updates to a character in the store and persist them to the
   * backend via a fire-and-forget PATCH call.
   */
  updateCharacter: (id: string, updates: Partial<Character>) => void

  // Players in session

  /** Players who have joined the active session, as reported by the server. */
  activePlayers: ActivePlayer[]
  /** Add a player to `activePlayers`; no-op if the player is already present. */
  addPlayer: (player_id: string, player_name: string) => void
  /** Remove a player from `activePlayers` by their ID. */
  removePlayer: (player_id: string) => void

  // Pending dice roll

  /** The roll request currently awaiting a camera-capture or manual response; `null` when idle. */
  pendingRoll: PendingRoll | null
  /** Set or clear the pending roll. */
  setPendingRoll: (r: PendingRoll | null) => void

  // Sessions history

  /** Historical sessions for the active campaign, loaded by `loadSessions`. */
  sessions: Session[]
  /** Fetch the session history for a campaign from the server. */
  loadSessions: (campaignId: string) => Promise<void>

  // Dungeon map

  /** Current campaign's dungeon map; `null` until loaded. */
  mapData: MapData | null
  /** Fetch (or auto-generate) the dungeon map for a campaign. */
  loadMap: (campaignId: string) => Promise<void>
  /** Force-regenerate the dungeon map for a campaign (requires access code). */
  generateMap: (campaignId: string) => Promise<void>
  /** Overwrite the local map state (used by the WebSocket map_update handler). */
  setMapData: (data: MapData | null) => void

  // Combat tracker

  /** Whether a combat encounter is currently active. */
  combatActive: boolean
  /** Current round number. */
  combatRound: number
  /** Index into combatants for whose turn it is. */
  combatTurnIndex: number
  /** Ordered list of combatants sorted by initiative descending. */
  combatants: Combatant[]
  /** Update combat state from a combat_update WebSocket message. */
  setCombatState: (active: boolean, round: number, turnIndex: number, combatants: Combatant[]) => void

  // NPC tracker

  /** NPCs for the active campaign. */
  npcs: NPC[]
  /** Fetch NPCs for a campaign from the server. */
  loadNpcs: (campaignId: string) => Promise<void>
  /** Replace the local NPC list (used by the WebSocket npc_update handler). */
  setNpcs: (npcs: NPC[]) => void

  // Scene illustration

  /** Current scene image; `null` when no image is displayed. */
  sceneImage: { url: string; description: string } | null
  /** Set or clear the scene image. */
  setSceneImage: (img: { url: string; description: string } | null) => void
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
  campaignTokens: loadCampaignTokens(),
  loadCampaigns: async () => {
    const res = await api.campaigns.list()
    set({ campaigns: res.data })
  },
  createCampaign: async (data) => {
    const res = await api.campaigns.create(data)
    const campaign = res.data
    // Persist the access code so the user can make authenticated requests later
    set((state) => {
      const tokens = { ...state.campaignTokens, [campaign.id]: campaign.access_code }
      saveCampaignTokens(tokens)
      return { campaigns: [...state.campaigns, campaign], campaignTokens: tokens }
    })
    setAccessCode(campaign.access_code)
    return campaign
  },
  deleteCampaign: async (id) => {
    await api.campaigns.delete(id)
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== id),
      activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
    }))
  },
  setActiveCampaign: (c) => {
    if (c) {
      const tokens = get().campaignTokens
      setAccessCode(tokens[c.id] ?? c.access_code ?? '')
    } else {
      setAccessCode('')
    }
    set({ activeCampaign: c })
  },

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

  // Dungeon map
  mapData: null,
  loadMap: async (campaignId) => {
    const res = await api.map.get(campaignId)
    set({ mapData: res.map_data })
  },
  generateMap: async (campaignId) => {
    const res = await api.map.generate(campaignId)
    set({ mapData: res.map_data })
  },
  setMapData: (data) => set({ mapData: data }),

  // Combat tracker
  combatActive: false,
  combatRound: 1,
  combatTurnIndex: 0,
  combatants: [],
  setCombatState: (active, round, turnIndex, combatants) =>
    set({ combatActive: active, combatRound: round, combatTurnIndex: turnIndex, combatants }),

  // NPC tracker
  npcs: [],
  loadNpcs: async (campaignId) => {
    const res = await api.npcs.list(campaignId)
    set({ npcs: res.npcs })
  },
  setNpcs: (npcs) => set({ npcs }),

  // Scene illustration
  sceneImage: null,
  setSceneImage: (img) => set({ sceneImage: img }),
}))
