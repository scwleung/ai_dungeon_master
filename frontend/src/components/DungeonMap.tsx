import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { MapData, MapRoom } from '../types'

// ---------------------------------------------------------------------------
// Tile constants (must match backend/services/map_generator.py)
// ---------------------------------------------------------------------------

const WALL = 0
const FLOOR = 1
const CORRIDOR = 2

const TILE_PX = 12 // pixels per tile at zoom 1.0

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const COLORS = {
  wall: '#1a1a2e',
  fog: '#0d0d0d',
  corridor: '#a08860',
  entrance: '#4a9fd4',
  boss: '#c0392b',
  treasure: '#f1c40f',
  generic: '#c8a87a',
  roomLabel: '#fffbe6',
  gridLine: 'rgba(255,255,255,0.03)',
}

// ---------------------------------------------------------------------------
// Visibility computation (BFS from explored room floors through corridors)
// ---------------------------------------------------------------------------

function computeVisible(map: MapData): Set<string> {
  const explored = new Set(map.explored_rooms)
  const visible = new Set<string>()
  const queue: [number, number][] = []

  for (const room of map.rooms) {
    if (!explored.has(room.id)) continue
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const key = `${x},${y}`
        if (!visible.has(key)) {
          visible.add(key)
          queue.push([x, y])
        }
      }
    }
  }

  // BFS through corridor tiles only — stops at unexplored room floors
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]
  let head = 0
  while (head < queue.length) {
    const [cx, cy] = queue[head++]
    for (const [dx, dy] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      const key = `${nx},${ny}`
      if (!visible.has(key) && map.grid[ny]?.[nx] === CORRIDOR) {
        visible.add(key)
        queue.push([nx, ny])
      }
    }
  }

  return visible
}

// ---------------------------------------------------------------------------
// Room floor colour by type
// ---------------------------------------------------------------------------

function roomColor(type: MapRoom['type']): string {
  switch (type) {
    case 'entrance':
      return COLORS.entrance
    case 'boss':
      return COLORS.boss
    case 'treasure':
      return COLORS.treasure
    default:
      return COLORS.generic
  }
}

// ---------------------------------------------------------------------------
// Canvas renderer
// ---------------------------------------------------------------------------

function renderMap(
  canvas: HTMLCanvasElement,
  map: MapData,
  visible: Set<string>,
  offsetX: number,
  offsetY: number,
  zoom: number
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const tw = TILE_PX * zoom // tile width in canvas pixels

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Build a quick room-lookup for floor tile colouring
  const tileRoomColor = new Map<string, string>()
  for (const room of map.rooms) {
    const color = roomColor(room.type)
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        tileRoomColor.set(`${rx},${ry}`, color)
      }
    }
  }

  // Draw tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x]
      const key = `${x},${y}`
      const isVisible = visible.has(key)

      const px = offsetX + x * tw
      const py = offsetY + y * tw

      if (px + tw < 0 || py + tw < 0 || px > canvas.width / dpr || py > canvas.height / dpr) {
        continue // skip off-screen tiles
      }

      let color: string
      if (!isVisible) {
        color = COLORS.fog
      } else if (tile === FLOOR) {
        color = tileRoomColor.get(key) ?? COLORS.generic
      } else if (tile === CORRIDOR) {
        color = COLORS.corridor
      } else if (tile === WALL) {
        color = COLORS.wall
      } else {
        color = COLORS.wall
      }

      ctx.fillStyle = color
      ctx.fillRect(px * dpr, py * dpr, tw * dpr, tw * dpr)
    }
  }

  // Draw room labels for explored rooms
  const explored = new Set(map.explored_rooms)
  for (const room of map.rooms) {
    if (!explored.has(room.id)) continue

    const cx = offsetX + (room.x + room.w / 2) * tw
    const cy = offsetY + (room.y + room.h / 2) * tw

    const fontSize = Math.max(8, Math.min(11, tw * 0.9))
    ctx.font = `bold ${fontSize * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Background pill
    const label = room.name
    const metrics = ctx.measureText(label)
    const labelW = metrics.width + 6 * dpr
    const labelH = fontSize * dpr + 4 * dpr
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(
      cx * dpr - labelW / 2,
      cy * dpr - labelH / 2,
      labelW,
      labelH
    )

    ctx.fillStyle = COLORS.roomLabel
    ctx.fillText(label, cx * dpr, cy * dpr)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DungeonMapProps {
  onClose: () => void
}

export function DungeonMap({ onClose }: DungeonMapProps) {
  const { mapData, activeCampaign, loadMap, generateMap } = useGameStore()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pan/zoom state
  const [zoom, setZoom] = useState(1.0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load map on mount if not already loaded
  useEffect(() => {
    if (!mapData && activeCampaign) {
      setLoading(true)
      loadMap(activeCampaign.id)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load map'))
        .finally(() => setLoading(false))
    }
  }, [activeCampaign, mapData, loadMap])

  // Compute visible tiles whenever map or explored rooms change
  const visible = useMemo(() => (mapData ? computeVisible(mapData) : new Set<string>()), [mapData])

  // Fit map to canvas on load or zoom reset
  const fitToCanvas = useCallback(() => {
    if (!mapData || !containerRef.current) return
    const { clientWidth, clientHeight } = containerRef.current
    const scaleX = clientWidth / (mapData.width * TILE_PX)
    const scaleY = clientHeight / (mapData.height * TILE_PX)
    const newZoom = Math.min(scaleX, scaleY) * 0.9
    setZoom(newZoom)
    const mapW = mapData.width * TILE_PX * newZoom
    const mapH = mapData.height * TILE_PX * newZoom
    setOffset({ x: (clientWidth - mapW) / 2, y: (clientHeight - mapH) / 2 })
  }, [mapData])

  // Fit when map first loads
  useEffect(() => {
    fitToCanvas()
  }, [fitToCanvas])

  // Render on every state change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapData) return

    const dpr = window.devicePixelRatio || 1
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    renderMap(canvas, mapData, visible, offset.x, offset.y, zoom)
  }, [mapData, visible, offset, zoom])

  // Handle window resize
  useEffect(() => {
    const observer = new ResizeObserver(fitToCanvas)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fitToCanvas])

  // ---- Pan handlers ----
  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }

  function onMouseUp() {
    isDragging.current = false
  }

  // ---- Scroll / pinch to zoom ----
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => Math.max(0.2, Math.min(6, z * factor)))
  }

  async function handleRegenerate() {
    if (!activeCampaign) return
    setLoading(true)
    setError(null)
    try {
      await generateMap(activeCampaign.id)
      fitToCanvas()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate map')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dungeon-map-panel">
      {/* Toolbar */}
      <div className="map-toolbar">
        <span className="map-title">Dungeon Map</span>
        <div className="map-actions">
          <button className="btn-ghost btn-xs" onClick={fitToCanvas} title="Fit to view">
            ⊡ Fit
          </button>
          <button
            className="btn-ghost btn-xs"
            onClick={handleRegenerate}
            disabled={loading}
            title="Regenerate map"
          >
            ↺ New
          </button>
          <button className="btn-ghost btn-xs" onClick={onClose} title="Close map">
            ✕
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="map-canvas-container"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {loading && (
          <div className="map-overlay">
            <div className="spinner" />
            <span>Loading map…</span>
          </div>
        )}
        {error && !loading && (
          <div className="map-overlay map-error">
            <span>⚠ {error}</span>
          </div>
        )}
        {!mapData && !loading && !error && (
          <div className="map-overlay">
            <span>No map available</span>
          </div>
        )}
        <canvas ref={canvasRef} className="map-canvas" />
      </div>

      {/* Legend */}
      {mapData && (
        <div className="map-legend">
          {(
            [
              ['entrance', 'Entrance'],
              ['generic', 'Chamber'],
              ['treasure', 'Treasure'],
              ['boss', 'Boss'],
            ] as [MapRoom['type'], string][]
          ).map(([type, label]) => (
            <span key={type} className="legend-item">
              <span
                className="legend-swatch"
                style={{ background: roomColor(type) }}
              />
              {label}
            </span>
          ))}
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: COLORS.fog }} />
            Unexplored
          </span>
        </div>
      )}

      <style>{`
        .dungeon-map-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border);
          min-width: 0;
        }

        .map-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          gap: var(--space-2);
        }

        .map-title {
          font-size: var(--font-size-xs);
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .map-actions {
          display: flex;
          gap: var(--space-1);
        }

        .btn-xs {
          padding: 2px 8px;
          font-size: var(--font-size-xs);
        }

        .map-canvas-container {
          flex: 1;
          position: relative;
          overflow: hidden;
          cursor: grab;
          background: #0d0d0d;
        }

        .map-canvas-container:active {
          cursor: grabbing;
        }

        .map-canvas {
          display: block;
          image-rendering: pixelated;
        }

        .map-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          color: var(--text-muted);
          font-size: var(--font-size-sm);
          background: rgba(13, 13, 13, 0.7);
          z-index: 10;
        }

        .map-error {
          color: var(--accent-danger);
        }

        .map-legend {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-3);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
