/** A campaign created by a user, grouping sessions and characters under a shared world. */
export interface Campaign {
  /** Unique identifier for the campaign. */
  id: string
  /** Display name of the campaign. */
  name: string
  /** The rule system used to adjudicate actions and rolls. */
  ruleset: 'dnd5e' | 'pathfinder2e' | 'freeform'
  /** Optional premise or world description provided at creation time. */
  description: string
  /** ISO 8601 timestamp of when the campaign was created. */
  created_at: string
  /** Arbitrary key-value pairs describing evolving world facts (e.g. weather, faction standings). */
  world_state: Record<string, string>
  /** Total number of sessions that have been started for this campaign. */
  session_count: number
  /** Access code required for write operations; returned at creation time and stored client-side. */
  access_code: string
}

/** A single play session within a campaign, capturing the message history. */
export interface Session {
  /** Unique identifier for the session. */
  id: string
  /** The campaign this session belongs to. */
  campaign_id: string
  /** ISO 8601 timestamp when the session was started. */
  started_at: string
  /** ISO 8601 timestamp when the session ended; absent if still active. */
  ended_at?: string
  /** Ordered list of narrative messages exchanged during this session. */
  messages: NarrativeMessage[]
}

/** A single narrative entry in the session log, authored by the DM, a player, or the system. */
export interface NarrativeMessage {
  /** Unique identifier for this message. */
  id: string
  /** Author category — 'dm' for AI narrator, 'player' for a human action, 'system' for automated notices. */
  role: 'dm' | 'player' | 'system'
  /** Display name of the player who authored the message; only present when role is 'player'. */
  player_name?: string
  /** The textual content of the message. */
  text: string
  /** ISO 8601 timestamp when the message was created. */
  timestamp: string
}

/** Full character record belonging to a player in a campaign. */
export interface Character {
  /** Unique identifier for the character. */
  id: string
  /** The campaign this character belongs to. */
  campaign_id: string
  /** Name of the human player controlling this character. */
  player_name: string
  /** In-world name of the character. */
  name: string
  /** Character's species or racial origin (e.g. "Elf", "Dwarf"). */
  race: string
  /** Character's class or profession (e.g. "Fighter", "Wizard"). */
  class_name: string
  /** Current character level (1–20). */
  level: number
  /** Current hit points; may be lower than hp_max due to damage. */
  hp_current: number
  /** Maximum hit points at full health. */
  hp_max: number
  /** The six core ability scores. */
  stats: {
    STR: number
    DEX: number
    CON: number
    INT: number
    WIS: number
    CHA: number
  }
  /** List of items the character is carrying. */
  inventory: string[]
  /** Active status effects or conditions (e.g. "Poisoned", "Prone"). */
  conditions: string[]
  /** Free-form notes about backstory, personality, or special abilities. */
  notes: string
}

/** Shape required to create a new character (id and campaign_id are assigned by the server). */
export type CharacterCreate = Omit<Character, 'id' | 'campaign_id'>

/** Partial character fields accepted for a PATCH-style update. */
export type CharacterUpdate = Partial<Omit<Character, 'id' | 'campaign_id'>>

/** Visual theme applied via CSS custom properties on `document.body`. */
export type ThemeName = 'fantasy' | 'hud' | 'minimal'

/** Rule system identifier used when creating or filtering campaigns. */
export type RulesetName = 'dnd5e' | 'pathfinder2e' | 'freeform'

/** Top-level navigation view shown to the user. */
export type AppView = 'campaigns' | 'campaign_detail' | 'character_setup' | 'session'

/**
 * Text-to-speech backend to use for DM narration.
 * - `'elevenlabs'` / `'openai'` — server-synthesised audio streamed as a Blob.
 * - `'browser'` — Web Speech API SpeechSynthesis (no server call).
 * - `'none'` — narration is silent.
 */
export type TTSProvider = 'elevenlabs' | 'openai' | 'browser' | 'none'

/** Persisted user preferences stored in localStorage under the key `dm_settings`. */
export interface GameSettings {
  /** TTS provider to use for DM narration. */
  ttsProvider: TTSProvider
  /** Provider-specific voice identifier (ElevenLabs voice ID or OpenAI voice name). Empty string uses the server default. */
  ttsVoiceId: string
  /** Active UI theme. */
  theme: ThemeName
  /** Randomly generated UUID-like string that identifies this browser as a player. */
  playerId: string
  /** Human-readable display name shown to other players in the session. */
  playerName: string
}

// WebSocket message types — Client → Server

/** Client message sent when a player describes an action to the DM. */
export interface WsPlayerAction {
  type: 'player_action'
  /** The player's unique session identifier. */
  player_id: string
  /** Free-form action text typed or spoken by the player. */
  text: string
}

/** Client message delivering a speech-recognition transcript as a player action. */
export interface WsVoiceTranscript {
  type: 'voice_transcript'
  /** The player's unique session identifier. */
  player_id: string
  /** Text produced by the STT engine. */
  transcript: string
}

/** Client message containing a camera frame for Claude Vision dice detection. */
export interface WsDiceImage {
  type: 'dice_image'
  /** Correlates this frame to the pending roll request. */
  roll_request_id: string
  /** JPEG image encoded as a base64 string (no data-URI prefix). */
  frame_b64: string
}

/** Client message carrying a manually-entered dice roll result. */
export interface WsManualRoll {
  type: 'manual_roll'
  /** Correlates this result to the pending roll request. */
  roll_request_id: string
  /** Individual die face values (one per die). */
  values: number[]
  /** Pre-computed sum of all values. */
  total: number
}

/** Client message sent immediately after the WebSocket connects to register the player. */
export interface WsJoinSession {
  type: 'join_session'
  /** The player's unique session identifier. */
  player_id: string
  /** The player's display name. */
  player_name: string
  /** Optional character to associate with this player for the session. */
  character_id?: string
}

/** Union of all messages the client may send to the server over the WebSocket. */
export type WsClientMessage =
  | WsPlayerAction
  | WsVoiceTranscript
  | WsDiceImage
  | WsManualRoll
  | WsJoinSession

// WebSocket message types — Server → Client

/** Streaming text chunk delivered incrementally as the DM narrates. */
export interface WsDmChunk {
  type: 'dm_chunk'
  /** Partial text to append to the current streaming buffer. */
  text: string
  /** `true` on the final chunk; the full response follows in `dm_response_complete`. */
  done: boolean
  /** Identifies which DM response this chunk belongs to. */
  message_id: string
}

/** Signals that the DM's full response is ready and streaming is complete. */
export interface WsDmResponseComplete {
  type: 'dm_response_complete'
  /** Matches the `message_id` from the preceding `dm_chunk` stream. */
  message_id: string
  /** The complete, assembled DM narration text. */
  full_text: string
}

/** Provides a URL to the server-synthesised TTS audio for a DM response. */
export interface WsDmAudio {
  type: 'dm_audio'
  /** URL of the audio file to play (typically a presigned or local server URL). */
  audio_url: string
  /** Matches the DM message this audio corresponds to. */
  message_id: string
}

/** Server-resolved result of a dice roll, sent after camera or manual input. */
export interface WsDiceResult {
  type: 'dice_result'
  /** Correlates this result to the originating roll request. */
  roll_request_id: string
  /** Individual die face values. */
  values: number[]
  /** Sum of all values. */
  total: number
  /** Dice notation string, e.g. `"2d6"`. */
  dice: string
  /** When `true` the result should not be shown publicly in the narrative log. */
  secret?: boolean
}

/** Server-initiated prompt asking the player to roll specific dice. */
export interface WsDiceRequest {
  type: 'dice_request'
  /** Unique ID used to correlate the subsequent roll response. */
  roll_request_id: string
  /** The player who must roll. */
  player_id: string
  /** Dice notation string, e.g. `"1d20"`. */
  dice: string
  /** Skill or ability check name (e.g. `"Perception"`). */
  skill: string
  /** Difficulty class the roll must meet or exceed; omitted for open rolls. */
  dc?: number
}

/** Partial state sync pushed from the server after world or character changes. */
export interface WsStateUpdate {
  type: 'state_update'
  /** Updated character records; only fields that changed may be present. */
  characters?: Character[]
  /** Merged updates to the campaign's world_state key-value map. */
  world_state?: Record<string, string>
}

/** Broadcast notification that a new player has joined the session. */
export interface WsPlayerJoined {
  type: 'player_joined'
  /** The joining player's unique session identifier. */
  player_id: string
  /** The joining player's display name. */
  player_name: string
}

/** Broadcast notification that a player has left the session. */
export interface WsPlayerLeft {
  type: 'player_left'
  /** The departing player's unique session identifier. */
  player_id: string
}

/** Server-reported error, typically surfaced as a system message in the narrative log. */
export interface WsError {
  type: 'error'
  /** Human-readable description of the error condition. */
  message: string
}

/** Generic system notice from the server (e.g. session lifecycle events). */
export interface WsSystem {
  type: 'system'
  /** The system message text to display in the narrative log. */
  text: string
}

/** A single room in the procedurally generated dungeon map. */
export interface MapRoom {
  /** Unique identifier used in `explored_rooms` and the `reveal_area` DM tool. */
  id: string
  /** Human-readable room name (e.g. "The Treasury"). */
  name: string
  /** Room archetype that determines its colour on the map canvas. */
  type: 'entrance' | 'boss' | 'treasure' | 'generic'
  /** Left-most tile column of the room. */
  x: number
  /** Top-most tile row of the room. */
  y: number
  /** Room width in tiles. */
  w: number
  /** Room height in tiles. */
  h: number
}

/** Full dungeon map state stored on the campaign and rendered by DungeonMap. */
export interface MapData {
  /** RNG seed used to generate this map (for reproducibility). */
  seed: number
  /** Grid width in tiles. */
  width: number
  /** Grid height in tiles. */
  height: number
  /**
   * 2-D tile array indexed [row][col].
   * Values: 0=wall, 1=floor, 2=corridor.
   */
  grid: number[][]
  /** All rooms in the dungeon. */
  rooms: MapRoom[]
  /** IDs of rooms that have been revealed to the players (fog of war). */
  explored_rooms: string[]
}

/** Server push when the DM reveals a new dungeon area via the `reveal_area` tool. */
export interface WsMapUpdate {
  type: 'map_update'
  /** Full updated list of revealed room IDs. */
  explored_rooms: string[]
}

/** Union of all messages the server may push to the client over the WebSocket. */
export type WsServerMessage =
  | WsDmChunk
  | WsDmResponseComplete
  | WsDmAudio
  | WsDiceResult
  | WsDiceRequest
  | WsStateUpdate
  | WsPlayerJoined
  | WsPlayerLeft
  | WsError
  | WsSystem
  | WsMapUpdate
