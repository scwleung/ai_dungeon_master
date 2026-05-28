import { create } from 'zustand'
import { api, setAccessCode } from '../api/client'
import type {
  AmbientSound,
  AppView,
  Campaign,
  Character,
  Combatant,
  DiceLogEntry,
  GameSettings,
  Handout,
  MapAnnotation,
  MapData,
  NarrativeMessage,
  NPC,
  OOCEntry,
  Quest,
  RulesetName,
  Session,
  ThemeName,
  TimelineEntry,
  Toast,
  TTSProvider,
  WorldTime,
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
        muteSFX: parsed.muteSFX ?? false,
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
    muteSFX: false,
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
  advantage?: boolean
  disadvantage?: boolean
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
  /** Store a campaign access token and activate it. */
  storeCampaignToken: (campaignId: string, code: string) => void

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

  // Quest tracker

  /** Quests for the active campaign. */
  quests: Quest[]
  /** Fetch quests for a campaign from the server. */
  loadQuests: (campaignId: string) => Promise<void>
  /** Replace the local quest list (used by the WebSocket quest_update handler). */
  setQuests: (quests: Quest[]) => void

  // Scene illustration

  /** Current scene image; `null` when no image is displayed. */
  sceneImage: { url: string; description: string } | null
  /** Set or clear the scene image. */
  setSceneImage: (img: { url: string; description: string } | null) => void

  // Dice log

  /** Ordered list of dice roll log entries, newest first (max 100). */
  diceLog: DiceLogEntry[]
  /** Prepend a new entry to the dice log; keeps last 100 entries. */
  addDiceLogEntry: (entry: DiceLogEntry) => void

  // Session notes

  /** Collaborative session notes text. */
  sessionNotes: string
  /** Set notes in store without persisting. */
  setSessionNotes: (notes: string) => void
  /** Fetch notes from the server and update the store. */
  loadSessionNotes: (sessionId: string) => Promise<void>
  /** Persist updated notes to the server. */
  saveSessionNotes: (sessionId: string, notes: string) => Promise<void>

  // Spectator mode

  /** Whether the current connection is a read-only spectator. */
  isSpectator: boolean
  /** Set the spectator flag. */
  setIsSpectator: (val: boolean) => void
  /** Join as a spectator for a session (no access code required). */
  joinAsSpectator: (sessionId: string) => Promise<void>

  // Party state
  partyState: { gold: number; items: string[] }
  loadPartyState: (campaignId: string) => Promise<void>
  setPartyState: (state: { gold: number; items: string[] }) => void
  savePartyState: (campaignId: string, state: { gold: number; items: string[] }) => Promise<void>

  // Pinned notes
  pinnedNotes: Array<{ id: string; text: string }>
  loadPinnedNotes: (sessionId: string) => Promise<void>
  setPinnedNotes: (pins: Array<{ id: string; text: string }>) => void
  savePinnedNotes: (sessionId: string, pins: Array<{ id: string; text: string }>) => Promise<void>

  // Map annotations
  mapAnnotations: MapAnnotation[]
  setMapAnnotations: (annotations: MapAnnotation[]) => void
  loadMapAnnotations: (campaignId: string) => Promise<void>
  saveMapAnnotations: (campaignId: string, annotations: MapAnnotation[]) => Promise<void>

  // Ambient sound
  currentAmbient: AmbientSound
  setCurrentAmbient: (sound: AmbientSound) => void

  // Recording players
  recordingPlayers: Set<string>
  setPlayerRecording: (playerId: string, active: boolean) => void

  // Dice macros
  diceMacros: Array<{ id: string; name: string; notation: string }>
  setDiceMacros: (macros: Array<{ id: string; name: string; notation: string }>) => void

  // World time
  worldTime: WorldTime | null
  setWorldTime: (t: WorldTime) => void
  loadWorldTime: (campaignId: string) => Promise<void>
  saveWorldTime: (campaignId: string, data: Partial<WorldTime>) => Promise<void>

  // Handouts
  handouts: Handout[]
  activeHandout: Handout | null
  setHandouts: (h: Handout[]) => void
  addHandout: (h: Handout) => void
  setActiveHandout: (h: Handout | null) => void
  loadHandouts: (campaignId: string) => Promise<void>

  // Timeline
  timeline: TimelineEntry[]
  setTimeline: (t: TimelineEntry[]) => void
  loadTimeline: (campaignId: string) => Promise<void>

  // OOC Chat
  oocMessages: OOCEntry[]
  addOOCMessage: (entry: OOCEntry) => void
  clearOOCMessages: () => void

  // Ready state
  readyState: Record<string, boolean>
  setReadyResponse: (playerId: string, ready: boolean) => void
  clearReadyState: () => void

  // Toasts
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type'], duration?: number) => void
  removeToast: (id: string) => void

  // Secret rolls
  secretRolls: Array<{ id: string; dice: string; values: number[]; total: number; reason: string; timestamp: string }>
  addSecretRoll: (roll: { dice: string; values: number[]; total: number; reason: string }) => void
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
  storeCampaignToken: (campaignId, code) => {
    set((state) => {
      const tokens = { ...state.campaignTokens, [campaignId]: code }
      saveCampaignTokens(tokens)
      return { campaignTokens: tokens }
    })
    setAccessCode(code)
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

  // Quest tracker
  quests: [],
  loadQuests: async (campaignId) => {
    const res = await api.quests.list(campaignId)
    set({ quests: res.quests })
  },
  setQuests: (quests) => set({ quests }),

  // Scene illustration
  sceneImage: null,
  setSceneImage: (img) => set({ sceneImage: img }),

  // Dice log
  diceLog: (() => {
    try {
      return JSON.parse(localStorage.getItem('diceLog') ?? '[]').slice(-50) as DiceLogEntry[]
    } catch {
      return []
    }
  })(),
  addDiceLogEntry: (entry) =>
    set((state) => {
      const updated = [entry, ...state.diceLog].slice(0, 100)
      try {
        localStorage.setItem('diceLog', JSON.stringify(updated.slice(0, 50)))
      } catch { /* ignore */ }
      return { diceLog: updated }
    }),

  // Session notes
  sessionNotes: '',
  setSessionNotes: (notes) => set({ sessionNotes: notes }),
  loadSessionNotes: async (sessionId) => {
    const res = await api.sessions.getNotes(sessionId)
    set({ sessionNotes: res.notes ?? '' })
  },
  saveSessionNotes: async (sessionId, notes) => {
    await api.sessions.updateNotes(sessionId, notes)
  },

  // Spectator mode
  isSpectator: false,
  setIsSpectator: (val) => set({ isSpectator: val }),
  joinAsSpectator: async (sessionId) => {
    set({
      isSpectator: true,
      activeSession: { id: sessionId, campaign_id: '', started_at: '', messages: [] },
      view: 'session',
    })
  },

  // Party state
  partyState: { gold: 0, items: [] },
  loadPartyState: async (campaignId) => {
    try {
      const res = await api.party.get(campaignId)
      set({ partyState: { gold: res.gold, items: res.items } })
    } catch {
      // ignore — party state may not exist yet
    }
  },
  setPartyState: (state) => set({ partyState: state }),
  savePartyState: async (campaignId, state) => {
    const tokens = get().campaignTokens
    const accessCode = tokens[campaignId] ?? ''
    set({ partyState: state })
    await api.party.update(campaignId, state, accessCode)
  },

  // Pinned notes
  pinnedNotes: [],
  loadPinnedNotes: async (sessionId) => {
    try {
      const res = await api.pins.get(sessionId)
      set({ pinnedNotes: res.pins })
    } catch {
      // ignore — pins may not exist yet
    }
  },
  setPinnedNotes: (pins) => set({ pinnedNotes: pins }),
  savePinnedNotes: async (sessionId, pins) => {
    set({ pinnedNotes: pins })
    await api.pins.update(sessionId, pins)
  },

  // Map annotations
  mapAnnotations: [],
  setMapAnnotations: (annotations) => set({ mapAnnotations: annotations }),
  loadMapAnnotations: async (campaignId) => {
    try {
      const res = await api.map.getAnnotations(campaignId)
      set({ mapAnnotations: res.annotations })
    } catch {
      // ignore — annotations may not exist yet
    }
  },
  saveMapAnnotations: async (campaignId, annotations) => {
    set({ mapAnnotations: annotations })
    try {
      await api.map.updateAnnotations(campaignId, annotations)
    } catch {
      // ignore
    }
  },

  // Ambient sound
  currentAmbient: 'none',
  setCurrentAmbient: (sound) => set({ currentAmbient: sound }),

  // Recording players
  recordingPlayers: new Set(),
  setPlayerRecording: (playerId, active) => set(state => {
    const next = new Set(state.recordingPlayers)
    if (active) next.add(playerId)
    else next.delete(playerId)
    return { recordingPlayers: next }
  }),

  // Dice macros
  diceMacros: (() => {
    try {
      const raw = localStorage.getItem('dm_dice_macros')
      if (raw) return JSON.parse(raw) as Array<{ id: string; name: string; notation: string }>
    } catch { /* ignore */ }
    return []
  })(),
  setDiceMacros: (macros) => {
    set({ diceMacros: macros })
    try {
      localStorage.setItem('dm_dice_macros', JSON.stringify(macros))
    } catch { /* ignore */ }
  },

  // World time
  worldTime: null,
  setWorldTime: (t) => set({ worldTime: t }),
  loadWorldTime: async (campaignId) => {
    try {
      const res = await api.campaigns.getWorldTime(campaignId)
      set({ worldTime: res.world_time })
    } catch {
      // ignore — world time may not exist yet
    }
  },
  saveWorldTime: async (campaignId, data) => {
    const res = await api.campaigns.updateWorldTime(campaignId, data)
    set({ worldTime: res.world_time })
  },

  // Handouts
  handouts: [],
  activeHandout: null,
  setHandouts: (h) => set({ handouts: h }),
  addHandout: (h) => set((state) => ({ handouts: [...state.handouts, h] })),
  setActiveHandout: (h) => set({ activeHandout: h }),
  loadHandouts: async (campaignId) => {
    try {
      const res = await api.campaigns.getHandouts(campaignId)
      set({ handouts: res.handouts })
    } catch {
      // ignore — handouts may not exist yet
    }
  },

  // Timeline
  timeline: [],
  setTimeline: (t) => set({ timeline: t }),
  loadTimeline: async (campaignId) => {
    try {
      const res = await api.campaigns.getTimeline(campaignId)
      set({ timeline: res.timeline })
    } catch {
      // ignore — timeline may not exist yet
    }
  },

  // OOC Chat
  oocMessages: [],
  addOOCMessage: (entry) => set((state) => ({ oocMessages: [...state.oocMessages, entry] })),
  clearOOCMessages: () => set({ oocMessages: [] }),

  // Ready state
  readyState: {},
  setReadyResponse: (playerId, ready) => set((state) => ({ readyState: { ...state.readyState, [playerId]: ready } })),
  clearReadyState: () => set({ readyState: {} }),

  // Toasts
  toasts: [],
  addToast: (message, type = 'info', duration = 3000) => {
    const id = crypto.randomUUID()
    set(state => ({ toasts: [...state.toasts, { id, message, type, duration }] }))
    setTimeout(() => get().removeToast(id), duration)
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  // Secret rolls
  secretRolls: [],
  addSecretRoll: (roll) => set(state => ({
    secretRolls: [{ ...roll, id: crypto.randomUUID(), timestamp: new Date().toISOString() }, ...state.secretRolls].slice(0, 50)
  })),
}))
