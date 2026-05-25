import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { Header } from './components/Header'
import { CampaignList } from './components/CampaignList'
import { CampaignDetail } from './components/CampaignDetail'
import { SessionView } from './components/SessionView'

import './themes/base.css'
import './themes/fantasy.css'
import './themes/hud.css'
import './themes/minimal.css'

export default function App() {
  const { view, settings, loadCampaigns } = useGameStore()

  // Apply the saved theme on mount and whenever settings.theme changes
  useEffect(() => {
    document.body.classList.remove('theme-fantasy', 'theme-hud', 'theme-minimal')
    document.body.classList.add(`theme-${settings.theme}`)
  }, [settings.theme])

  // Load campaigns on startup
  useEffect(() => {
    loadCampaigns().catch((err) => {
      console.error('Failed to load campaigns:', err)
    })
  }, [loadCampaigns])

  return (
    <div className="app-root">
      {view !== 'session' && <Header />}

      {view === 'session' && (
        <div className="session-header-row">
          <Header />
        </div>
      )}

      <main className="app-main">
        {view === 'campaigns' && <CampaignList />}
        {view === 'campaign_detail' && <CampaignDetail />}
        {view === 'session' && <SessionView />}
      </main>

      <style>{`
        .app-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .app-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* In session view, the session fills the height so give it full space */
        .app-root:has(.session-view) .app-main {
          height: calc(100vh - var(--header-height));
        }

        /* For browsers that don't support :has() */
        .session-header-row {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
