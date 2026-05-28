import type { Campaign, Character, CharacterUpdate, Handout, MapAnnotation, MapData, NPC, Quest, Session, TimelineEntry, WorldTime } from '../types'

const BASE = ''

/** Module-level access code for the currently active campaign. */
let _accessCode = ''

/** Set the active campaign access code used by all subsequent requests. */
export function setAccessCode(code: string): void {
  _accessCode = code
}

/** Return the currently active campaign access code. */
export function getAccessCode(): string {
  return _accessCode
}

/**
 * Shared HTTP helper that wraps `fetch` with JSON serialisation, error extraction,
 * and a special case for 204 No Content responses.
 *
 * @template T - The expected JSON response type.
 * @param method - HTTP verb (e.g. `'GET'`, `'POST'`).
 * @param path - Absolute path relative to the app origin (e.g. `'/api/campaigns'`).
 * @param body - Optional request payload; will be JSON-serialised and the
 *               `Content-Type: application/json` header will be set automatically.
 * @returns Parsed JSON response cast to `T`.
 * @throws {Error} When the server returns a non-ok status; the message is extracted
 *                 from `detail` or `message` fields in the JSON body when available.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (_accessCode) headers['X-Access-Code'] = _accessCode

  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, init)

  if (res.status === 204) {
    return undefined as T
  }

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status} ${res.statusText}`
    try {
      const errBody = await res.json()
      if (errBody?.detail) errorMsg = errBody.detail
      else if (errBody?.message) errorMsg = errBody.message
    } catch {
      // ignore
    }
    throw new Error(errorMsg)
  }

  return res.json() as Promise<T>
}

/**
 * Typed API client organised by resource.
 *
 * All methods return Promises and throw on HTTP errors.
 * The `tts.synthesize` method returns a raw `Blob` instead of JSON because
 * the server streams audio binary data.
 */
export const api = {
  /** Campaign CRUD operations. */
  campaigns: {
    /** Fetch all campaigns for the authenticated user. */
    list: () => request<{ data: Campaign[] }>('GET', '/api/campaigns'),
    /** Create a new campaign and return the persisted record. */
    create: (data: { name: string; ruleset: string; description: string }) =>
      request<{ data: Campaign }>('POST', '/api/campaigns', data),
    /** Permanently delete a campaign by ID. */
    delete: (id: string) => request<void>('DELETE', `/api/campaigns/${id}`),
    /** Export a full campaign bundle as JSON (requires access code). */
    export: (id: string) => request<unknown>('GET', `/api/campaigns/${id}/export`),
    /** Import a campaign bundle, creating a new campaign with a fresh access code. */
    import: (payload: unknown) => request<{ id: string; name: string; ruleset: string; description: string; access_code: string; created_at: string }>('POST', '/api/campaigns/import', payload),
    /** Generate a new access code for the campaign (requires access code). */
    rotateAccessCode: (id: string) => request<{ campaign_id: string; access_code: string }>('POST', `/api/campaigns/${id}/rotate-access-code`),
    getWorldTime: (id: string) =>
      request<{ campaign_id: string; world_time: WorldTime }>('GET', `/api/campaigns/${id}/world-time`),
    updateWorldTime: (id: string, data: Partial<WorldTime>) =>
      request<{ campaign_id: string; world_time: WorldTime }>('PUT', `/api/campaigns/${id}/world-time`, data),
    getHandouts: (id: string) =>
      request<{ campaign_id: string; handouts: Handout[] }>('GET', `/api/campaigns/${id}/handouts`),
    createHandout: (id: string, data: { title: string; content: string; type?: string }) =>
      request<{ campaign_id: string; handout: Handout }>('POST', `/api/campaigns/${id}/handouts`, data),
    deleteHandout: (campaignId: string, handoutId: string) =>
      request<void>('DELETE', `/api/campaigns/${campaignId}/handouts/${handoutId}`),
    getTimeline: (id: string) =>
      request<{ campaign_id: string; timeline: TimelineEntry[] }>('GET', `/api/campaigns/${id}/timeline`),
    addTimelineEntry: (id: string, data: { description: string; session_tag?: string }) =>
      request<{ campaign_id: string; entry: TimelineEntry }>('POST', `/api/campaigns/${id}/timeline`, data),
    deleteTimelineEntry: (campaignId: string, entryId: string) =>
      request<void>('DELETE', `/api/campaigns/${campaignId}/timeline/${entryId}`),
    generateLoot: (id: string, data: { cr: number; environment: string; count?: number }) =>
      request<{ campaign_id: string; items: string[] }>('POST', `/api/campaigns/${id}/loot`, data),
    getDMNotes: (sessionId: string) =>
      request<{ session_id: string; dm_notes: string }>('GET', `/api/campaigns/sessions/${sessionId}/dm-notes`),
    saveDMNotes: (sessionId: string, dm_notes: string) =>
      request<{ session_id: string; dm_notes: string }>('PUT', `/api/campaigns/sessions/${sessionId}/dm-notes`, { dm_notes }),
    getReadalouds: (campaignId: string) =>
      request<{ campaign_id: string; readalouds: Array<{ id: string; title: string; content: string; created_at: string }> }>('GET', `/api/campaigns/${campaignId}/readalouds`),
    createReadaloud: (campaignId: string, data: { title: string; content: string }) =>
      request<{ campaign_id: string; readaloud: { id: string; title: string; content: string; created_at: string } }>('POST', `/api/campaigns/${campaignId}/readalouds`, data),
    deleteReadaloud: (campaignId: string, id: string) =>
      request<void>('DELETE', `/api/campaigns/${campaignId}/readalouds/${id}`),
    generateNames: (campaignId: string, data: { race: string; count?: number }) =>
      request<{ campaign_id: string; names: string[] }>('POST', `/api/campaigns/${campaignId}/generate-names`, data),
    getTables: (campaignId: number) =>
      request<unknown>('GET', `/campaigns/${campaignId}/tables`),
    createTable: (campaignId: number, table: { name: string; dice: string; entries: string[] }) =>
      request<unknown>('POST', `/campaigns/${campaignId}/tables`, table),
    rollTable: (campaignId: number, tableId: string) =>
      request<unknown>('POST', `/campaigns/${campaignId}/tables/${tableId}/roll`),
    deleteTable: (campaignId: number, tableId: string) =>
      request<unknown>('DELETE', `/campaigns/${campaignId}/tables/${tableId}`),
  },

  /** Session lifecycle operations scoped to a campaign. */
  sessions: {
    /** List all sessions for a given campaign, ordered by the server. */
    list: (campaignId: string) =>
      request<{ data: Session[] }>('GET', `/api/campaigns/${campaignId}/sessions`),
    /** Start a new session for the campaign; returns the created session. */
    start: (campaignId: string) =>
      request<{ data: Session }>('POST', `/api/campaigns/${campaignId}/sessions`),
    /** Mark a session as ended and return the updated record. */
    end: (sessionId: string) =>
      request<{ data: Session }>('PUT', `/api/campaigns/sessions/${sessionId}/end`),
    /** Fetch the collaborative notes for a session. */
    getNotes: (sessionId: string) =>
      fetch(`/api/campaigns/sessions/${sessionId}/notes`).then((r) => r.json()) as Promise<{ session_id: string; notes: string }>,
    /** Persist updated collaborative notes for a session. */
    updateNotes: (sessionId: string, notes: string) =>
      fetch(`/api/campaigns/sessions/${sessionId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      }).then((r) => r.json()) as Promise<{ session_id: string; notes: string }>,
    /** Generate a recap for a session. */
    generateRecap: (sessionId: number) =>
      request<unknown>('POST', `/sessions/${sessionId}/recap`),
  },

  /** Character CRUD operations scoped to a campaign. */
  characters: {
    /** Fetch all characters belonging to a campaign. */
    list: (campaignId: string) =>
      request<{ data: Character[] }>('GET', `/api/${campaignId}/characters`),
    /** Create a new character in the campaign. */
    create: (campaignId: string, data: Omit<Character, 'id' | 'campaign_id'>) =>
      request<{ data: Character }>('POST', `/api/${campaignId}/characters`, data),
    /** Apply a partial update to an existing character. */
    update: (id: string, data: CharacterUpdate) =>
      request<{ data: Character }>('PUT', `/api/characters/${id}`, data),
    /** Permanently delete a character by ID. */
    delete: (id: string) => request<void>('DELETE', `/api/characters/${id}`),
    getAuditLog: (characterId: string) =>
      request<{ character_id: string; audit_log: Array<{ timestamp: string; change: string }> }>('GET', `/api/characters/${characterId}/audit-log`),
    exportCharacter: (id: string) =>
      request<Character>('GET', `/api/characters/${id}`),
  },

  /** Dungeon map operations. */
  map: {
    /** Fetch the campaign's dungeon map; auto-generates one if none exists yet. */
    get: (campaignId: string) =>
      request<{ campaign_id: string; map_data: MapData }>('GET', `/api/campaigns/${campaignId}/map`),
    /** Force-regenerate the dungeon map (requires access code). */
    generate: (campaignId: string) =>
      request<{ campaign_id: string; map_data: MapData }>('POST', `/api/campaigns/${campaignId}/map/generate`),
    getAnnotations: (campaignId: string) =>
      request<{ campaign_id: string; annotations: MapAnnotation[] }>('GET', `/api/campaigns/${campaignId}/map/annotations`),
    updateAnnotations: (campaignId: string, annotations: MapAnnotation[]) =>
      request<{ campaign_id: string; annotations: MapAnnotation[] }>('PUT', `/api/campaigns/${campaignId}/map/annotations`, { annotations }),
  },

  /** NPC registry operations. */
  npcs: {
    /** Fetch all NPCs for a campaign. */
    list: (campaignId: string) =>
      request<{ campaign_id: string; npcs: NPC[] }>('GET', `/api/campaigns/${campaignId}/npcs`),
  },

  /** Quest log operations. */
  quests: {
    /** Fetch all quests for a campaign. */
    list: (campaignId: string) =>
      request<{ campaign_id: string; quests: Quest[] }>('GET', `/api/campaigns/${campaignId}/quests`),
  },

  /** Party state (shared gold + items). */
  party: {
    get: (campaignId: string) =>
      request<{ campaign_id: string; gold: number; items: string[] }>('GET', `/api/campaigns/${campaignId}/party`),
    update: (campaignId: string, state: { gold: number; items: string[] }, accessCode: string) =>
      fetch(`/api/campaigns/${campaignId}/party`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Access-Code': accessCode },
        body: JSON.stringify(state),
      }).then((r) => r.json()) as Promise<{ campaign_id: string; gold: number; items: string[] }>,
  },

  /** Session pin operations. */
  pins: {
    get: (sessionId: string) =>
      request<{ session_id: string; pins: Array<{ id: string; text: string }> }>('GET', `/api/campaigns/sessions/${sessionId}/pins`),
    update: (sessionId: string, pins: Array<{ id: string; text: string }>) =>
      request<{ session_id: string; pins: Array<{ id: string; text: string }> }>('PUT', `/api/campaigns/sessions/${sessionId}/pins`, { pins }),
  },

  /** Combat tracker REST controls. */
  combat: {
    /** Advance the initiative order to the next combatant. */
    nextTurn: (sessionId: string) =>
      request<void>('POST', `/api/sessions/${sessionId}/combat/next-turn`),
    /** End the current combat encounter. */
    endCombat: (sessionId: string) =>
      request<void>('POST', `/api/sessions/${sessionId}/combat/end`),
    /** Add a combatant to the active encounter. */
    addCombatant: (sessionId: string, data: {
      name: string; initiative: number; hp_current: number; hp_max: number;
      is_player?: boolean; character_id?: string | null
    }) => request<void>('POST', `/api/sessions/${sessionId}/combat/combatants`, data),
    /** Remove a combatant from the active encounter by name. */
    removeCombatant: (sessionId: string, name: string) =>
      request<void>('DELETE', `/api/sessions/${sessionId}/combat/combatants/${encodeURIComponent(name)}`),
    rollInitiative: (sessionId: string) =>
      request<void>('POST', `/api/sessions/${sessionId}/combat/roll-initiative`),
    updateCombatantHP: (sessionId: string, combatantName: string, delta: number) =>
      request<void>('PATCH', `/api/sessions/${sessionId}/combat/combatants/${encodeURIComponent(combatantName)}/hp`, { delta }),
  },

  /** Text-to-speech operations. */
  tts: {
    /** Return the list of TTS provider names available on the server. */
    providers: () => request<{ data: string[] }>('GET', '/api/tts/providers'),
    /**
     * Synthesise speech and return the audio as a `Blob`.
     *
     * @param text - The text to convert to speech.
     * @param provider - Backend provider identifier (e.g. `'elevenlabs'`, `'openai'`).
     * @param voice_id - Optional provider-specific voice identifier.
     * @returns A Blob containing the audio data (typically `audio/mpeg`).
     */
    synthesize: (text: string, provider: string, voice_id?: string): Promise<Blob> =>
      fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, provider, voice_id }),
      }).then((r) => {
        if (!r.ok) throw new Error(`TTS failed: ${r.status}`)
        return r.blob()
      }),
  },
}
