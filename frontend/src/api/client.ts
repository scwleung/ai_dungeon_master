import type { Campaign, Character, CharacterUpdate, Session } from '../types'

const BASE = ''

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

export const api = {
  campaigns: {
    list: () => request<{ data: Campaign[] }>('GET', '/api/campaigns'),
    create: (data: { name: string; ruleset: string; description: string }) =>
      request<{ data: Campaign }>('POST', '/api/campaigns', data),
    delete: (id: string) => request<void>('DELETE', `/api/campaigns/${id}`),
  },

  sessions: {
    list: (campaignId: string) =>
      request<{ data: Session[] }>('GET', `/api/campaigns/${campaignId}/sessions`),
    start: (campaignId: string) =>
      request<{ data: Session }>('POST', `/api/campaigns/${campaignId}/sessions`),
    end: (sessionId: string) =>
      request<{ data: Session }>('PUT', `/api/campaigns/sessions/${sessionId}/end`),
  },

  characters: {
    list: (campaignId: string) =>
      request<{ data: Character[] }>('GET', `/api/${campaignId}/characters`),
    create: (campaignId: string, data: Omit<Character, 'id' | 'campaign_id'>) =>
      request<{ data: Character }>('POST', `/api/${campaignId}/characters`, data),
    update: (id: string, data: CharacterUpdate) =>
      request<{ data: Character }>('PUT', `/api/characters/${id}`, data),
    delete: (id: string) => request<void>('DELETE', `/api/characters/${id}`),
  },

  tts: {
    providers: () => request<{ data: string[] }>('GET', '/api/tts/providers'),
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
