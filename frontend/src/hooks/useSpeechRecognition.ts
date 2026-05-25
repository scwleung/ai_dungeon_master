import { useCallback, useEffect, useRef, useState } from 'react'

/** Minimal subset of the browser SpeechRecognitionEvent used internally. */
interface SpeechRecognitionEvent extends Event {
  /** List of recognition results accumulated so far in this session. */
  results: SpeechRecognitionResultList
  /** Index of the first new result in `results` since the last event. */
  resultIndex: number
}

/** Event fired by the browser SpeechRecognition API when an error occurs. */
interface SpeechRecognitionErrorEvent extends Event {
  /** Machine-readable error code (e.g. `'no-speech'`, `'not-allowed'`). */
  error: string
}

/** Minimal interface for a browser `SpeechRecognition` / `webkitSpeechRecognition` instance. */
interface SpeechRecognitionInstance extends EventTarget {
  /** When `true` recognition continues until explicitly stopped. */
  continuous: boolean
  /** When `true` the `onresult` handler fires for partial (interim) transcripts. */
  interimResults: boolean
  /** BCP 47 language tag for the recognition language (e.g. `'en-US'`). */
  lang: string
  /** Begin listening. */
  start: () => void
  /** Finish listening gracefully and return any pending result. */
  stop: () => void
  /** Discard any in-progress recognition immediately, without returning a result. */
  abort: () => void
  /** Called when new recognition results are available. */
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  /** Called when a recognition error occurs. */
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  /** Called when recognition ends (either naturally or via `stop()`). */
  onend: (() => void) | null
  /** Called when recognition starts successfully. */
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognitionInstance)
  | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/**
 * Wraps the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
 * in a React-friendly interface.
 *
 * Recognition is configured for single-utterance (`continuous: false`) English
 * input with interim results enabled so the UI can show live feedback.
 * The hook cleans up the recognition instance on unmount.
 *
 * @returns An object with:
 * - `supported` — `true` if the browser exposes a SpeechRecognition constructor.
 * - `listening` — `true` while the microphone is actively capturing audio.
 * - `transcript` — the most recent (interim or final) recognised text.
 * - `startListening()` — request microphone access and begin recognition.
 * - `stopListening()` — stop the current recognition session gracefully.
 * - `clearTranscript()` — reset `transcript` to an empty string.
 */
export function useSpeechRecognition() {
  const [supported] = useState(() => getSpeechRecognitionConstructor() !== null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.onstart = null
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    // Abort previous if any
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }

    const recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setListening(true)
      setTranscript('')
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      setTranscript(final || interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error)
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      console.error('Failed to start speech recognition:', err)
      setListening(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setListening(false)
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  return { supported, listening, transcript, startListening, stopListening, clearTranscript }
}
