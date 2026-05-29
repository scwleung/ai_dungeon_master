import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore'

interface Props {
  onSendDiceImage: (rollRequestId: string, frameB64: string) => void
  onSendManualRoll: (rollRequestId: string, values: number[], total: number) => void
  onClose: () => void
}

type Mode = 'camera' | 'manual'

function parseDiceNotation(dice: string): { count: number; sides: number } {
  const match = dice.toLowerCase().match(/^(\d+)?d(\d+)$/)
  if (!match) return { count: 1, sides: 20 }
  return {
    count: match[1] ? parseInt(match[1], 10) : 1,
    sides: parseInt(match[2], 10),
  }
}

function rollRandom(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
}

/**
 * Modal overlay for resolving a pending dice roll.
 *
 * Offers two modes selectable via tabs:
 * - **Camera** — accesses the device camera (preferring the rear lens), lets the
 *   user frame their physical dice, captures a JPEG frame, and sends it as a
 *   base64 string to the server for Claude Vision analysis.
 * - **Manual** — renders one numeric input per die, accepts individual face values,
 *   and optionally lets the app roll randomly on the player's behalf.
 *
 * Renders nothing when there is no `pendingRoll` in the store.
 *
 * @param onSendDiceImage - Called with `(rollRequestId, base64Jpeg)` after capture.
 * @param onSendManualRoll - Called with `(rollRequestId, values[], total)` on submit.
 * @param onClose - Called when the user dismisses the overlay without submitting.
 */
export function DiceCamera({ onSendDiceImage, onSendManualRoll, onClose }: Props) {
  const { pendingRoll, setPendingRoll } = useGameStore(useShallow(s => ({ pendingRoll: s.pendingRoll, setPendingRoll: s.setPendingRoll })))
  const [mode, setMode] = useState<Mode>('camera')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [manualValues, setManualValues] = useState<number[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  if (!pendingRoll) return null

  const { count, sides } = parseDiceNotation(pendingRoll.dice)

  // Initialize manual values when count changes
  useEffect(() => {
    setManualValues(Array(count).fill('' as unknown as number))
  }, [count])

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera unavailable'
      setCameraError(msg)
      setMode('manual')
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mode === 'camera') {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [mode, startCamera, stopCamera])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !pendingRoll) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    const base64 = dataUrl.split(',')[1]

    setProcessing(true)
    setCaptured(true)
    stopCamera()
    onSendDiceImage(pendingRoll.roll_request_id, base64)

    // The result will come back via WebSocket and clear pendingRoll
    // Show loading until then (or timeout)
    setTimeout(() => {
      if (processing) {
        setProcessing(false)
      }
    }, 15000)
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingRoll) return
    const values = manualValues.map((v) => {
      const n = typeof v === 'string' ? parseInt(v as string, 10) : v
      return isNaN(n) ? Math.floor(Math.random() * sides) + 1 : Math.min(sides, Math.max(1, n))
    })
    const total = values.reduce((a, b) => a + b, 0)
    onSendManualRoll(pendingRoll.roll_request_id, values, total)
    setPendingRoll(null)
    onClose()
  }

  function handleRandomRoll() {
    if (!pendingRoll) return
    const values = rollRandom(count, sides)
    const total = values.reduce((a, b) => a + b, 0)
    onSendManualRoll(pendingRoll.roll_request_id, values, total)
    setPendingRoll(null)
    onClose()
  }

  function handleClose() {
    stopCamera()
    onClose()
  }

  return (
    <div className="modal-overlay dice-camera-overlay" onClick={handleClose}>
      <div className="modal-box dice-camera-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="dc-title">
            <span className="dc-dice-icon">🎲</span>
            <div>
              <h2>Roll {pendingRoll.dice}</h2>
              <p className="dc-subtitle">
                {pendingRoll.skill}
                {pendingRoll.dc !== undefined && ` — DC ${pendingRoll.dc}`}
              </p>
            </div>
          </div>
          <button className="btn-ghost btn-icon" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="dc-tabs">
          <button
            className={`dc-tab ${mode === 'camera' ? 'active' : ''}`}
            onClick={() => setMode('camera')}
          >
            📷 Camera
          </button>
          <button
            className={`dc-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            ✎ Enter Manually
          </button>
        </div>

        {/* Camera Mode */}
        {mode === 'camera' && (
          <div className="dc-camera-view">
            {cameraError && (
              <div className="error-banner">
                Camera error: {cameraError}
                <button className="btn-ghost btn-sm" onClick={() => setMode('manual')}>
                  Use manual input
                </button>
              </div>
            )}

            {!cameraError && !captured && (
              <>
                <div className="camera-frame">
                  <video
                    ref={videoRef}
                    className="camera-video"
                    playsInline
                    muted
                    autoPlay
                  />
                  <div className="camera-overlay-guide">
                    <div className="guide-corner tl" />
                    <div className="guide-corner tr" />
                    <div className="guide-corner bl" />
                    <div className="guide-corner br" />
                    <p className="guide-text">Position dice in frame</p>
                  </div>
                </div>
                <button className="btn-primary btn-lg capture-btn" onClick={handleCapture}>
                  📷 Capture Roll
                </button>
              </>
            )}

            {captured && processing && (
              <div className="loading-center dc-processing">
                <div className="spinner" />
                <span>Analyzing dice...</span>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          </div>
        )}

        {/* Manual Mode */}
        {mode === 'manual' && (
          <form className="dc-manual-view" onSubmit={handleManualSubmit}>
            <p className="dc-manual-desc">
              Roll {count}d{sides} and enter the result{count > 1 ? 's' : ''}:
            </p>
            <div className="manual-inputs">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="manual-die-input">
                  <label htmlFor={`die-${i}`} className="die-label">
                    Die {count > 1 ? i + 1 : ''}
                  </label>
                  <input
                    id={`die-${i}`}
                    type="number"
                    min={1}
                    max={sides}
                    value={manualValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...manualValues]
                      next[i] = parseInt(e.target.value, 10) || ('' as unknown as number)
                      setManualValues(next)
                    }}
                    className="die-input"
                    placeholder={`1–${sides}`}
                    autoFocus={i === 0}
                  />
                </div>
              ))}
            </div>

            {count > 1 && manualValues.every((v) => typeof v === 'number' && !isNaN(v) && v >= 1) && (
              <div className="manual-total">
                Total: <strong>{manualValues.reduce((a, b) => a + (b || 0), 0)}</strong>
              </div>
            )}

            <div className="dc-manual-actions">
              <button type="button" className="btn-ghost" onClick={handleRandomRoll}>
                🎲 Roll for me
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!manualValues.every((v) => {
                  const n = typeof v === 'string' ? parseInt(v as string, 10) : v
                  return !isNaN(n) && n >= 1 && n <= sides
                })}
              >
                Submit Roll
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .dice-camera-overlay {
          align-items: center;
        }

        .dice-camera-modal {
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .dc-title {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
        }

        .dc-dice-icon {
          font-size: 2rem;
          line-height: 1;
          margin-top: 2px;
        }

        .dc-subtitle {
          font-size: var(--font-size-sm);
          color: var(--text-muted);
          margin-bottom: 0;
          font-style: italic;
        }

        .dc-tabs {
          display: flex;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          margin-bottom: var(--space-4);
        }

        .dc-tab {
          flex: 1;
          background: var(--bg-secondary);
          border: none;
          color: var(--text-muted);
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          font-size: var(--font-size-sm);
          border-radius: 0;
          text-transform: none;
          letter-spacing: 0;
          transition: all var(--transition);
        }

        .dc-tab:hover {
          background: var(--bg-card);
          color: var(--text-secondary);
        }

        .dc-tab.active {
          background: var(--bg-card);
          color: var(--accent);
          border-bottom: 2px solid var(--accent);
        }

        .dc-tab + .dc-tab {
          border-left: 1px solid var(--border);
        }

        /* Camera */
        .dc-camera-view {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          align-items: center;
        }

        .camera-frame {
          position: relative;
          width: 100%;
          max-width: 400px;
          aspect-ratio: 4/3;
          background: #000;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .camera-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .camera-overlay-guide {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .guide-corner {
          position: absolute;
          width: 24px;
          height: 24px;
          border-color: rgba(255, 255, 255, 0.7);
          border-style: solid;
        }

        .guide-corner.tl { top: 20px; left: 20px; border-width: 2px 0 0 2px; }
        .guide-corner.tr { top: 20px; right: 20px; border-width: 2px 2px 0 0; }
        .guide-corner.bl { bottom: 20px; left: 20px; border-width: 0 0 2px 2px; }
        .guide-corner.br { bottom: 20px; right: 20px; border-width: 0 2px 2px 0; }

        .guide-text {
          color: rgba(255, 255, 255, 0.7);
          font-size: var(--font-size-sm);
          text-align: center;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          margin-bottom: 0;
          align-self: flex-end;
          padding-bottom: 12px;
        }

        .capture-btn {
          width: 100%;
          max-width: 200px;
        }

        .dc-processing {
          padding: var(--space-8);
        }

        .hidden-canvas {
          display: none;
        }

        /* Manual */
        .dc-manual-view {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .dc-manual-desc {
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          font-style: italic;
          margin-bottom: 0;
        }

        .manual-inputs {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          justify-content: center;
        }

        .manual-die-input {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
        }

        .die-label {
          font-size: var(--font-size-xs);
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 0;
          text-transform: none;
          letter-spacing: 0;
        }

        .die-input {
          width: 72px;
          text-align: center;
          font-size: var(--font-size-xl);
          font-weight: 700;
          font-family: var(--font-mono);
          padding: var(--space-2);
        }

        .manual-total {
          text-align: center;
          font-size: var(--font-size-xl);
          color: var(--text-primary);
          padding: var(--space-2);
          background: var(--bg-secondary);
          border-radius: var(--radius);
          border: 1px solid var(--border);
        }

        .manual-total strong {
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: var(--font-size-2xl);
        }

        .dc-manual-actions {
          display: flex;
          justify-content: space-between;
          gap: var(--space-3);
        }
      `}</style>
    </div>
  )
}
