import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'

// ─── Mock SpeechRecognition instance ─────────────────────────────────────────

function makeMockRecognition() {
  return {
    continuous: false,
    interimResults: false,
    lang: '',
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onresult: null as ((e: any) => void) | null,
    onerror: null as ((e: any) => void) | null,
    onend: null as (() => void) | null,
    onstart: null as (() => void) | null,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResultEvent(transcript: string, isFinal: boolean, resultIndex = 0) {
  const result = {
    isFinal,
    0: { transcript },
    length: 1,
  }
  const results = {
    length: resultIndex + 1,
    [resultIndex]: result,
  } as unknown as SpeechRecognitionResultList
  return {
    results,
    resultIndex,
  }
}

describe('useSpeechRecognition', () => {
  let mockRecognition: ReturnType<typeof makeMockRecognition>
  let MockSpeechRecognition: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset window speech recognition to undefined before each test
    window.SpeechRecognition = undefined as unknown as typeof window.SpeechRecognition
    window.webkitSpeechRecognition = undefined as unknown as typeof window.webkitSpeechRecognition
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.SpeechRecognition = undefined as unknown as typeof window.SpeechRecognition
    window.webkitSpeechRecognition = undefined as unknown as typeof window.webkitSpeechRecognition
  })

  // ── Support detection ────────────────────────────────────────────────────────

  describe('supported detection', () => {
    it('returns supported=false when neither SpeechRecognition nor webkitSpeechRecognition exist', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      expect(result.current.supported).toBe(false)
    })

    it('returns supported=true when window.SpeechRecognition is defined', () => {
      mockRecognition = makeMockRecognition()
      MockSpeechRecognition = vi.fn(() => mockRecognition)
      window.SpeechRecognition = MockSpeechRecognition as unknown as typeof window.SpeechRecognition
      const { result } = renderHook(() => useSpeechRecognition())
      expect(result.current.supported).toBe(true)
    })

    it('returns supported=true when window.webkitSpeechRecognition is defined', () => {
      mockRecognition = makeMockRecognition()
      MockSpeechRecognition = vi.fn(() => mockRecognition)
      window.webkitSpeechRecognition = MockSpeechRecognition as unknown as typeof window.webkitSpeechRecognition
      const { result } = renderHook(() => useSpeechRecognition())
      expect(result.current.supported).toBe(true)
    })
  })

  // ── startListening when not supported ─────────────────────────────────────

  describe('startListening when not supported', () => {
    it('does not throw and listening stays false', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      expect(result.current.supported).toBe(false)
      act(() => {
        result.current.startListening()
      })
      expect(result.current.listening).toBe(false)
    })
  })

  // ── With mock SpeechRecognition ────────────────────────────────────────────

  describe('with mock SpeechRecognition', () => {
    beforeEach(() => {
      mockRecognition = makeMockRecognition()
      MockSpeechRecognition = vi.fn(() => mockRecognition)
      window.SpeechRecognition = MockSpeechRecognition as unknown as typeof window.SpeechRecognition
    })

    it('startListening instantiates SpeechRecognition and calls start()', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      expect(MockSpeechRecognition).toHaveBeenCalledTimes(1)
      expect(mockRecognition.start).toHaveBeenCalledTimes(1)
    })

    it('sets listening=true and transcript="" after onstart fires', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      expect(result.current.listening).toBe(true)
      expect(result.current.transcript).toBe('')
    })

    it('sets listening=false after onend fires', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      act(() => {
        mockRecognition.onend!()
      })
      expect(result.current.listening).toBe(false)
    })

    it('sets listening=false after onerror fires', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      act(() => {
        mockRecognition.onerror!({ error: 'network' })
      })
      expect(result.current.listening).toBe(false)
    })

    it('updates transcript with final result text', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      act(() => {
        mockRecognition.onresult!(buildResultEvent('Hello world', true) as any)
      })
      expect(result.current.transcript).toBe('Hello world')
    })

    it('updates transcript with interim result text', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      act(() => {
        mockRecognition.onresult!(buildResultEvent('interim text', false) as any)
      })
      expect(result.current.transcript).toBe('interim text')
    })

    it('prefers final result over interim result when both exist', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      // Simulate: index 0 is final, index 1 is interim
      const results = {
        length: 2,
        0: { isFinal: true, 0: { transcript: 'final part' }, length: 1 },
        1: { isFinal: false, 0: { transcript: ' interim part' }, length: 1 },
      } as unknown as SpeechRecognitionResultList
      act(() => {
        mockRecognition.onresult!({ results, resultIndex: 0 } as any)
      })
      // final is non-empty so transcript = final
      expect(result.current.transcript).toBe('final part')
    })

    it('stopListening calls recognition.stop() and sets listening=false', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onstart!()
      })
      expect(result.current.listening).toBe(true)
      act(() => {
        result.current.stopListening()
      })
      expect(mockRecognition.stop).toHaveBeenCalledTimes(1)
      expect(result.current.listening).toBe(false)
    })

    it('clearTranscript sets transcript to empty string', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      act(() => {
        mockRecognition.onresult!(buildResultEvent('some text', true) as any)
      })
      expect(result.current.transcript).toBe('some text')
      act(() => {
        result.current.clearTranscript()
      })
      expect(result.current.transcript).toBe('')
    })

    it('calls abort() on recognition when the hook unmounts', () => {
      const { result, unmount } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      unmount()
      expect(mockRecognition.abort).toHaveBeenCalledTimes(1)
    })

    it('sets interimResults=true on the recognition instance', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      expect(mockRecognition.interimResults).toBe(true)
    })

    it('sets lang to en-US on the recognition instance', () => {
      const { result } = renderHook(() => useSpeechRecognition())
      act(() => {
        result.current.startListening()
      })
      expect(mockRecognition.lang).toBe('en-US')
    })
  })
})
