import type { Campaign, Character, CharacterUpdate, Session } from '../types'

const BASE = ''

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
  const init: RequestInit = {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  }
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
