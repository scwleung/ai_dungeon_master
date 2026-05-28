import { useState } from 'react'
import { api } from '../api/client'

interface TrapGeneratorProps {
  campaignId: number
}

type TabId = 'trap' | 'puzzle' | 'shop'

interface TrapResult {
  name?: string
  trigger?: string
  effect?: string
  save_type?: string
  damage?: string
  dc?: number
  disarm_dc?: number
  [key: string]: unknown
}

interface PuzzleResult {
  name?: string
  description?: string
  clues?: string[]
  solution?: string
  reward?: string
  [key: string]: unknown
}

interface ShopItem {
  name?: string
  price?: string
  description?: string
  [key: string]: unknown
}

interface ShopResult {
  items?: ShopItem[]
  [key: string]: unknown
}

/**
 * DM-only panel for generating traps, puzzles, and shops via the API.
 * Three tabs: Trap / Puzzle / Shop.
 */
export function TrapGenerator({ campaignId }: TrapGeneratorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trap')

  // Trap state
  const [trapCR, setTrapCR] = useState<string>('1')
  const [trapLocation, setTrapLocation] = useState('')
  const [trapLoading, setTrapLoading] = useState(false)
  const [trapError, setTrapError] = useState<string | null>(null)
  const [trapResult, setTrapResult] = useState<TrapResult | null>(null)

  // Puzzle state
  const [puzzleDifficulty, setPuzzleDifficulty] = useState<string>('medium')
  const [puzzleTheme, setPuzzleTheme] = useState('')
  const [puzzleLoading, setPuzzleLoading] = useState(false)
  const [puzzleError, setPuzzleError] = useState<string | null>(null)
  const [puzzleResult, setPuzzleResult] = useState<PuzzleResult | null>(null)
  const [showSolution, setShowSolution] = useState(false)

  // Shop state
  const [shopSize, setShopSize] = useState<string>('town')
  const [shopType, setShopType] = useState('')
  const [shopLoading, setShopLoading] = useState(false)
  const [shopError, setShopError] = useState<string | null>(null)
  const [shopResult, setShopResult] = useState<ShopResult | null>(null)

  async function handleGenerateTrap(e: React.FormEvent) {
    e.preventDefault()
    const cr = parseFloat(trapCR)
    if (isNaN(cr)) return
    setTrapLoading(true)
    setTrapError(null)
    setTrapResult(null)
    try {
      const result = await api.campaigns.generateTrap(campaignId, { cr, location: trapLocation })
      setTrapResult(result as TrapResult)
    } catch (err) {
      setTrapError(err instanceof Error ? err.message : 'Failed to generate trap.')
    } finally {
      setTrapLoading(false)
    }
  }

  async function handleGeneratePuzzle(e: React.FormEvent) {
    e.preventDefault()
    setPuzzleLoading(true)
    setPuzzleError(null)
    setPuzzleResult(null)
    setShowSolution(false)
    try {
      const result = await api.campaigns.generatePuzzle(campaignId, { difficulty: puzzleDifficulty, theme: puzzleTheme })
      setPuzzleResult(result as PuzzleResult)
    } catch (err) {
      setPuzzleError(err instanceof Error ? err.message : 'Failed to generate puzzle.')
    } finally {
      setPuzzleLoading(false)
    }
  }

  async function handleGenerateShop(e: React.FormEvent) {
    e.preventDefault()
    setShopLoading(true)
    setShopError(null)
    setShopResult(null)
    try {
      const result = await api.campaigns.generateShop(campaignId, { settlement_size: shopSize, shop_type: shopType })
      setShopResult(result as ShopResult)
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Failed to generate shop.')
    } finally {
      setShopLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.3rem 0.5rem',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius, 4px)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
    marginBottom: '0.2rem',
    display: 'block',
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  }

  const resultBoxStyle: React.CSSProperties = {
    marginTop: '0.75rem',
    padding: '0.6rem 0.75rem',
    background: 'rgba(196,130,10,0.06)',
    border: '1px solid rgba(196,130,10,0.3)',
    borderRadius: 'var(--radius, 4px)',
    fontSize: '0.82rem',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.5rem',
    padding: '0.2rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div
      className="trap-generator"
      role="region"
      aria-label="Trap, Puzzle & Shop Generator"
      style={{
        background: 'var(--bg-panel, var(--bg-secondary))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 6px)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        fontSize: '0.8rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-primary)',
        flexShrink: 0,
      }}>
        🪤 Generator
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['trap', 'puzzle', 'shop'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            role="tab"
            style={{
              flex: 1,
              padding: '0.4rem',
              background: activeTab === tab ? 'rgba(196,130,10,0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
              textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'trap' ? '🪤 Trap' : tab === 'puzzle' ? '🧩 Puzzle' : '🏪 Shop'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {/* ---- TRAP TAB ---- */}
        {activeTab === 'trap' && (
          <form onSubmit={handleGenerateTrap} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={fieldStyle}>
              <label htmlFor="trap-cr" style={labelStyle}>Challenge Rating</label>
              <input
                id="trap-cr"
                type="number"
                min={0.25}
                max={20}
                step={0.25}
                value={trapCR}
                onChange={e => setTrapCR(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="trap-location" style={labelStyle}>Location</label>
              <input
                id="trap-location"
                type="text"
                placeholder="e.g. dungeon corridor"
                value={trapLocation}
                onChange={e => setTrapLocation(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={trapLoading}
              style={{ width: '100%' }}
            >
              {trapLoading ? 'Generating…' : 'Generate Trap'}
            </button>

            {trapError && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', marginTop: '0.25rem' }}>
                {trapError}
              </div>
            )}

            {trapResult && (
              <div style={resultBoxStyle}>
                {trapResult.name && <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>{trapResult.name}</div>}
                {([
                  ['Trigger', trapResult.trigger],
                  ['Effect', trapResult.effect],
                  ['Save', trapResult.save_type],
                  ['Damage', trapResult.damage],
                  ['DC', trapResult.dc !== undefined ? String(trapResult.dc) : undefined],
                  ['Disarm DC', trapResult.disarm_dc !== undefined ? String(trapResult.disarm_dc) : undefined],
                ] as [string, string | undefined][]).map(([label, val]) =>
                  val != null ? (
                    <div key={label} style={rowStyle}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, minWidth: 72 }}>{label}</span>
                      <span style={{ color: 'var(--text-primary)', textAlign: 'right', flex: 1 }}>{val}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </form>
        )}

        {/* ---- PUZZLE TAB ---- */}
        {activeTab === 'puzzle' && (
          <form onSubmit={handleGeneratePuzzle} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={fieldStyle}>
              <label htmlFor="puzzle-difficulty" style={labelStyle}>Difficulty</label>
              <select
                id="puzzle-difficulty"
                value={puzzleDifficulty}
                onChange={e => setPuzzleDifficulty(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label htmlFor="puzzle-theme" style={labelStyle}>Theme</label>
              <input
                id="puzzle-theme"
                type="text"
                placeholder="e.g. arcane"
                value={puzzleTheme}
                onChange={e => setPuzzleTheme(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={puzzleLoading}
              style={{ width: '100%' }}
            >
              {puzzleLoading ? 'Generating…' : 'Generate Puzzle'}
            </button>

            {puzzleError && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', marginTop: '0.25rem' }}>
                {puzzleError}
              </div>
            )}

            {puzzleResult && (
              <div style={resultBoxStyle}>
                {puzzleResult.name && <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>{puzzleResult.name}</div>}
                {puzzleResult.description && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem', lineHeight: 1.55 }}>{puzzleResult.description}</p>
                )}
                {puzzleResult.clues && puzzleResult.clues.length > 0 && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CLUES</div>
                    <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {puzzleResult.clues.map((clue, i) => (
                        <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{clue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {puzzleResult.reward && (
                  <div style={rowStyle}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>Reward</span>
                    <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{puzzleResult.reward}</span>
                  </div>
                )}
                {puzzleResult.solution && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowSolution((v) => !v)}
                      style={{
                        fontSize: '0.72rem', padding: '0.15rem 0.5rem',
                        background: 'none', border: '1px solid var(--border)',
                        borderRadius: 3, cursor: 'pointer', color: 'var(--text-muted)',
                      }}
                      aria-expanded={showSolution}
                    >
                      {showSolution ? '🙈 Hide Solution' : '👁 Reveal Solution'}
                    </button>
                    {showSolution && (
                      <div style={{ marginTop: '0.4rem', padding: '0.4rem', background: 'rgba(0,0,0,0.3)', borderRadius: 3, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        {puzzleResult.solution}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {/* ---- SHOP TAB ---- */}
        {activeTab === 'shop' && (
          <form onSubmit={handleGenerateShop} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={fieldStyle}>
              <label htmlFor="shop-size" style={labelStyle}>Settlement Size</label>
              <select
                id="shop-size"
                value={shopSize}
                onChange={e => setShopSize(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="village">Village</option>
                <option value="town">Town</option>
                <option value="city">City</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label htmlFor="shop-type" style={labelStyle}>Shop Type</label>
              <input
                id="shop-type"
                type="text"
                placeholder="e.g. blacksmith"
                value={shopType}
                onChange={e => setShopType(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={shopLoading}
              style={{ width: '100%' }}
            >
              {shopLoading ? 'Generating…' : 'Generate Shop'}
            </button>

            {shopError && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', marginTop: '0.25rem' }}>
                {shopError}
              </div>
            )}

            {shopResult && shopResult.items && shopResult.items.length > 0 && (
              <div style={{ ...resultBoxStyle, padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }} aria-label="Shop inventory">
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Item</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Price</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopResult.items.map((item, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>{item.name ?? '—'}</td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{item.price ?? '—'}</td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--text-secondary)' }}>{item.description ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
