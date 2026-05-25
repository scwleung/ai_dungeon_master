export interface Campaign {
  id: string
  name: string
  ruleset: 'dnd5e' | 'pathfinder2e' | 'freeform'
  description: string
  created_at: string
  world_state: Record<string, string>
  session_count: number
}

export interface Session {
  id: string
  campaign_id: string
  started_at: string
  ended_at?: string
  messages: NarrativeMessage[]
}

export interface NarrativeMessage {
  id: string
  role: 'dm' | 'player' | 'system'
  player_name?: string
  text: string
  timestamp: string
}

export interface Character {
  id: string
  campaign_id: string
  player_name: string
  name: string
  race: string
  class_name: string
  level: number
  hp_current: number
  hp_max: number
  stats: {
    STR: number
    DEX: number
    CON: number
    INT: number
    WIS: number
    CHA: number
  }
  inventory: string[]
  conditions: string[]
  notes: string
}

export type CharacterCreate = Omit<Character, 'id' | 'campaign_id'>
export type CharacterUpdate = Partial<Omit<Character, 'id' | 'campaign_id'>>

export type ThemeName = 'fantasy' | 'hud' | 'minimal'
export type RulesetName = 'dnd5e' | 'pathfinder2e' | 'freeform'
export type AppView = 'campaigns' | 'campaign_detail' | 'character_setup' | 'session'
export type TTSProvider = 'elevenlabs' | 'openai' | 'browser' | 'none'

export interface GameSettings {
  ttsProvider: TTSProvider
  ttsVoiceId: string
  theme: ThemeName
  playerId: string
  playerName: string
}

// WebSocket message types — Client → Server
export interface WsPlayerAction {
  type: 'player_action'
  player_id: string
  text: string
}

export interface WsVoiceTranscript {
  type: 'voice_transcript'
  player_id: string
  transcript: string
}

export interface WsDiceImage {
  type: 'dice_image'
  roll_request_id: string
  frame_b64: string
}

export interface WsManualRoll {
  type: 'manual_roll'
  roll_request_id: string
  values: number[]
  total: number
}

export interface WsJoinSession {
  type: 'join_session'
  player_id: string
  player_name: string
  character_id?: string
}

export type WsClientMessage =
  | WsPlayerAction
  | WsVoiceTranscript
  | WsDiceImage
  | WsManualRoll
  | WsJoinSession

// WebSocket message types — Server → Client
export interface WsDmChunk {
  type: 'dm_chunk'
  text: string
  done: boolean
  message_id: string
}

export interface WsDmResponseComplete {
  type: 'dm_response_complete'
  message_id: string
  full_text: string
}

export interface WsDmAudio {
  type: 'dm_audio'
  audio_url: string
  message_id: string
}

export interface WsDiceResult {
  type: 'dice_result'
  roll_request_id: string
  values: number[]
  total: number
  dice: string
  secret?: boolean
}

export interface WsDiceRequest {
  type: 'dice_request'
  roll_request_id: string
  player_id: string
  dice: string
  skill: string
  dc?: number
}

export interface WsStateUpdate {
  type: 'state_update'
  characters?: Character[]
  world_state?: Record<string, string>
}

export interface WsPlayerJoined {
  type: 'player_joined'
  player_id: string
  player_name: string
}

export interface WsPlayerLeft {
  type: 'player_left'
  player_id: string
}

export interface WsError {
  type: 'error'
  message: string
}

export interface WsSystem {
  type: 'system'
  text: string
}

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
