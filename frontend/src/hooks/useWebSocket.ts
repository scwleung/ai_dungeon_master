import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessCode } from '../api/client'
import { useGameStore } from '../store/gameStore'
import type { WsClientMessage, WsServerMessage } from '../types'

const BASE_RECONNECT_MS = 1000
const MAX_RECONNECT_MS = 30000

/**
 * Manages a WebSocket connection to the FastAPI backend at `/ws/{sessionId}`.
 *
 * Automatically connects when `sessionId` is non-null, sends a `join_session`
 * message on open, and applies exponential back-off reconnection on close.
 * Incoming server messages are dispatched directly into the Zustand store.
 *
 * @param sessionId - The active session ID to connect to, or `null` to stay disconnected.
 * @returns An object with:
 * - `connected` — whether the socket is currently open.
 * - `sendAction` — send a player's free-text action to the DM.
 * - `sendVoiceTranscript` — send an STT transcript as a player action.
 * - `sendDiceImage` — send a base64 JPEG frame for Claude Vision dice detection.
 * - `sendManualRoll` — send a manually entered dice roll result.
 */
export function useWebSocket(sessionId: string | null) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const unmountedRef = useRef(false)

  const store = useGameStore()
  const storeRef = useRef(store)
  storeRef.current = store

  const clearReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }

  const connect = useCallback(() => {
    if (!sessionId) return
    if (unmountedRef.current) return

    const { settings } = storeRef.current
    const params = new URLSearchParams({
      player_id: settings.playerId,
      player_name: settings.playerName,
      access_code: getAccessCode(),
    })

    // Use relative path so vite proxy handles it
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const url = `${protocol}://${host}/ws/${sessionId}?${params.toString()}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close()
        return
      }
      reconnectAttemptRef.current = 0
      setConnected(true)

      // Send join_session
      const joinMsg: WsClientMessage = {
        type: 'join_session',
        player_id: storeRef.current.settings.playerId,
        player_name: storeRef.current.settings.playerName,
      }

      // Find the character for this player in the active campaign
      const myChar = storeRef.current.characters.find(
        (c) => c.player_name === storeRef.current.settings.playerName
      )
      if (myChar) {
        ;(joinMsg as typeof joinMsg & { character_id?: string }).character_id = myChar.id
      }

      ws.send(JSON.stringify(joinMsg))
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      setConnected(false)
      wsRef.current = null

      // Exponential backoff reconnect
      const delay = Math.min(
        BASE_RECONNECT_MS * 2 ** reconnectAttemptRef.current,
        MAX_RECONNECT_MS
      )
      reconnectAttemptRef.current += 1
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!unmountedRef.current && sessionId) {
          connect()
        }
      }, delay)
    }

    ws.onerror = () => {
      // onclose will fire after onerror
    }

    ws.onmessage = (event: MessageEvent) => {
      let msg: WsServerMessage
      try {
        msg = JSON.parse(event.data as string) as WsServerMessage
      } catch {
        console.error('Failed to parse WS message', event.data)
        return
      }

      const s = storeRef.current

      switch (msg.type) {
        case 'dm_chunk': {
          if (msg.done) {
            // Will be finalized by dm_response_complete
          } else {
            s.setStreamingText(s.streamingText + msg.text)
          }
          break
        }

        case 'dm_response_complete': {
          s.setStreamingText('')
          s.appendMessage({
            id: msg.message_id,
            role: 'dm',
            text: msg.full_text,
            timestamp: new Date().toISOString(),
          })
          break
        }

        case 'dm_audio': {
          // Audio handled by DMVoice component via messages watch
          break
        }

        case 'dice_request': {
          s.setPendingRoll({
            roll_request_id: msg.roll_request_id,
            dice: msg.dice,
            skill: msg.skill,
            dc: msg.dc,
          })
          s.appendMessage({
            id: `dice_req_${msg.roll_request_id}`,
            role: 'system',
            text: `🎲 Roll requested: ${msg.dice} for ${msg.skill}${msg.dc ? ` (DC ${msg.dc})` : ''}`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        case 'dice_result': {
          if (!msg.secret) {
            s.appendMessage({
              id: `dice_res_${msg.roll_request_id}`,
              role: 'system',
              text: `🎲 ${msg.dice} roll: [${msg.values.join(', ')}] = ${msg.total}`,
              timestamp: new Date().toISOString(),
            })
          }
          s.setPendingRoll(null)
          break
        }

        case 'state_update': {
          if (msg.characters) {
            msg.characters.forEach((char) => {
              const existing = s.characters.find((c) => c.id === char.id)
              if (existing) {
                // Update in store without re-persisting (came from server)
                useGameStore.setState((state) => ({
                  characters: state.characters.map((c) =>
                    c.id === char.id ? char : c
                  ),
                }))
              }
            })
          }
          if (msg.world_state && s.activeCampaign) {
            useGameStore.setState((state) => ({
              activeCampaign: state.activeCampaign
                ? {
                    ...state.activeCampaign,
                    world_state: {
                      ...state.activeCampaign.world_state,
                      ...msg.world_state,
                    },
                  }
                : null,
            }))
          }
          break
        }

        case 'player_joined': {
          s.addPlayer(msg.player_id, msg.player_name)
          s.appendMessage({
            id: `join_${msg.player_id}_${Date.now()}`,
            role: 'system',
            text: `${msg.player_name} joined the session`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        case 'player_left': {
          const leavingPlayer = s.activePlayers.find((p) => p.player_id === msg.player_id)
          s.removePlayer(msg.player_id)
          s.appendMessage({
            id: `leave_${msg.player_id}_${Date.now()}`,
            role: 'system',
            text: `${leavingPlayer?.player_name ?? msg.player_id} left the session`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        case 'system': {
          s.appendMessage({
            id: `sys_${Date.now()}_${Math.random()}`,
            role: 'system',
            text: msg.text,
            timestamp: new Date().toISOString(),
          })
          break
        }

        case 'error': {
          s.appendMessage({
            id: `err_${Date.now()}_${Math.random()}`,
            role: 'system',
            text: `⚠ Error: ${msg.message}`,
            timestamp: new Date().toISOString(),
          })
          break
        }
      }
    }
  }, [sessionId])

  useEffect(() => {
    unmountedRef.current = false
    if (sessionId) {
      connect()
    }

    return () => {
      unmountedRef.current = true
      clearReconnect()
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      setConnected(false)
    }
  }, [sessionId, connect])

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    } else {
      console.warn('WebSocket not connected, cannot send:', msg)
    }
  }, [])

  const sendAction = useCallback(
    (text: string) => {
      const { settings } = storeRef.current
      send({ type: 'player_action', player_id: settings.playerId, text })
    },
    [send]
  )

  const sendVoiceTranscript = useCallback(
    (transcript: string) => {
      const { settings } = storeRef.current
      send({ type: 'voice_transcript', player_id: settings.playerId, transcript })
    },
    [send]
  )

  const sendDiceImage = useCallback(
    (roll_request_id: string, frame_b64: string) => {
      send({ type: 'dice_image', roll_request_id, frame_b64 })
    },
    [send]
  )

  const sendManualRoll = useCallback(
    (roll_request_id: string, values: number[], total: number) => {
      send({ type: 'manual_roll', roll_request_id, values, total })
    },
    [send]
  )

  return { connected, sendAction, sendVoiceTranscript, sendDiceImage, sendManualRoll }
}
