import { useCallback, useRef, useState } from 'react'
import { api } from '../api/client'
import type { TTSProvider } from '../types'

/**
 * Provides text-to-speech playback across three backends.
 *
 * - `'browser'` — uses the Web Speech API (`SpeechSynthesis`), preferring a
 *   natural-sounding English voice when available.
 * - `'elevenlabs'` / `'openai'` — calls `POST /api/tts/synthesize`, receives an
 *   audio Blob, and plays it via an `<Audio>` element.
 * - `'none'` — does nothing (silent mode).
 *
 * Only one utterance plays at a time; calling `speak` cancels any in-progress audio.
 *
 * @returns An object with:
 * - `speak(text, provider, voiceId?)` — start speaking the given text.
 * - `stop()` — immediately cancel any in-progress speech.
 * - `speaking` — `true` while audio is playing.
 */
export function useTTS() {
  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    // Cancel browser speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    // Stop any playing blob audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    // Revoke object URL to free memory
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }

    setSpeaking(false)
  }, [])

  const speak = useCallback(
    async (text: string, provider: TTSProvider, voiceId?: string) => {
      // Stop any current speech first
      stop()

      if (!text.trim() || provider === 'none') return

      if (provider === 'browser') {
        if (!window.speechSynthesis) return

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 0.85
        utterance.volume = 1.0

        // Try to pick a decent English voice
        const voices = window.speechSynthesis.getVoices()
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.toLowerCase().includes('daniel') ||
              v.name.toLowerCase().includes('alex') ||
              v.name.toLowerCase().includes('google') ||
              v.name.toLowerCase().includes('natural'))
        )
        if (preferred) utterance.voice = preferred

        utterance.onstart = () => setSpeaking(true)
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)

        window.speechSynthesis.speak(utterance)
        setSpeaking(true)
      } else if (provider === 'elevenlabs' || provider === 'openai') {
        try {
          setSpeaking(true)
          const blob = await api.tts.synthesize(text, provider, voiceId)
          const url = URL.createObjectURL(blob)
          audioUrlRef.current = url

          const audio = new Audio(url)
          audioRef.current = audio

          audio.onended = () => {
            setSpeaking(false)
            if (audioUrlRef.current === url) {
              URL.revokeObjectURL(url)
              audioUrlRef.current = null
            }
            audioRef.current = null
          }

          audio.onerror = () => {
            setSpeaking(false)
            if (audioUrlRef.current === url) {
              URL.revokeObjectURL(url)
              audioUrlRef.current = null
            }
            audioRef.current = null
          }

          await audio.play()
        } catch (err) {
          console.error('TTS synthesis failed:', err)
          setSpeaking(false)
        }
      }
    },
    [stop]
  )

  return { speak, stop, speaking }
}
