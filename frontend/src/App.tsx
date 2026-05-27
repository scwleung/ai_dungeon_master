import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { Header } from './components/Header'
import { CampaignList } from './components/CampaignList'
import { CampaignDetail } from './components/CampaignDetail'
import { SessionView } from './components/SessionView'
import ErrorBoundary from './components/ErrorBoundary'
import ToastProvider from './components/ToastProvider'

import './themes/base.css'
import './themes/fantasy.css'
import './themes/hud.css'
import './themes/minimal.css'

export default function App() {
  const { view, settings, loadCampaigns, storeCampaignToken, setActiveCampaign, setView, joinAsSpectator } = useGameStore()

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

  // Handle invite URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const spectateId = params.get('spectate')
    if (spectateId) {
      joinAsSpectator(spectateId).catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    const campaignId = params.get('campaign')
    const code = params.get('code')
    if (campaignId && code) {
      storeCampaignToken(campaignId, code)
      loadCampaigns()
        .then(() => {
          const { campaigns } = useGameStore.getState()
          const campaign = campaigns.find((c) => c.id === campaignId)
          if (campaign) {
            setActiveCampaign(campaign)
            setView('campaign_detail')
          }
        })
        .catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('session') && code) {
      const sessionCode = code
      storeCampaignToken('', sessionCode)
      loadCampaigns().catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ErrorBoundary>
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

        <ToastProvider />

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
    </ErrorBoundary>
  )
}
