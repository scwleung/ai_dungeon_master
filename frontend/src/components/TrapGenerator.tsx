import { useState } from 'react'
import { api } from '../api/client'

interface TrapGeneratorProps { campaignId: string | number }
type TabId = 'trap' | 'puzzle' | 'shop'
type Result = Record<string, unknown>

export function TrapGenerator({ campaignId }: TrapGeneratorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trap')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [trapCR, setTrapCR] = useState('1')
  const [trapLocation, setTrapLocation] = useState('')
  const [puzzleDifficulty, setPuzzleDifficulty] = useState('medium')
  const [puzzleTheme, setPuzzleTheme] = useState('')
  const [shopSize, setShopSize] = useState('town')
  const [shopType, setShopType] = useState('')

  async function generate(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null); setResult(null)
    try {
      const id = String(campaignId)
      let response: unknown
      if (activeTab === 'trap') response = await api.campaigns.generateTrap(id, { cr: parseFloat(trapCR), location: trapLocation })
      else if (activeTab === 'puzzle') response = await api.campaigns.generatePuzzle(id, { difficulty: puzzleDifficulty, theme: puzzleTheme })
      else response = await api.campaigns.generateShop(id, { settlement_size: shopSize, shop_type: shopType })
      setResult(response as Result)
    } catch (err) { setError(err instanceof Error ? err.message : `Failed to generate ${activeTab}.`) }
    finally { setLoading(false) }
  }

  const input: React.CSSProperties = { width:'100%', padding:'0.3rem 0.5rem', background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-primary)' }
  return <div role="region" aria-label="Trap, Puzzle & Shop Generator" style={{height:'100%',overflow:'auto',padding:'0.75rem',background:'var(--bg-panel)'}}>
    <div style={{fontWeight:700,marginBottom:'0.6rem'}}>🪤 Generator</div>
    <div role="tablist" style={{display:'flex',gap:'0.35rem',marginBottom:'0.75rem'}}>{(['trap','puzzle','shop'] as TabId[]).map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab===tab} onClick={()=>{setActiveTab(tab);setResult(null);setError(null)}} className={activeTab===tab?'btn-primary btn-sm':'btn-secondary btn-sm'}>{tab}</button>)}</div>
    <form onSubmit={generate} style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
      {activeTab==='trap' && <><label>Challenge Rating<input type="number" min={0.25} max={20} step={0.25} value={trapCR} onChange={e=>setTrapCR(e.target.value)} required style={input}/></label><label>Location<input value={trapLocation} onChange={e=>setTrapLocation(e.target.value)} required style={input}/></label></>}
      {activeTab==='puzzle' && <><label>Difficulty<select value={puzzleDifficulty} onChange={e=>setPuzzleDifficulty(e.target.value)} style={input}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Theme<input value={puzzleTheme} onChange={e=>setPuzzleTheme(e.target.value)} required style={input}/></label></>}
      {activeTab==='shop' && <><label>Settlement Size<select value={shopSize} onChange={e=>setShopSize(e.target.value)} style={input}><option value="village">Village</option><option value="town">Town</option><option value="city">City</option></select></label><label>Shop Type<input value={shopType} onChange={e=>setShopType(e.target.value)} required style={input}/></label></>}
      <button type="submit" className="btn-primary btn-sm" disabled={loading}>{loading?'Generating…':`Generate ${activeTab}`}</button>
    </form>
    {error && <div style={{marginTop:'0.75rem',color:'var(--accent-danger)'}}>{error}</div>}
    {result && <pre style={{marginTop:'0.75rem',whiteSpace:'pre-wrap'}}>{JSON.stringify(result,null,2)}</pre>}
  </div>
}
