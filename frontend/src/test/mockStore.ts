import { useGameStore } from '../store/gameStore'

export function resetStore() {
  useGameStore.setState({
    view: 'campaigns',
    campaigns: [],
    activeCampaign: null,
    activeSession: null,
    messages: [],
    streamingText: '',
    characters: [],
    activePlayers: [],
    pendingRoll: null,
    sessions: [],
    settings: {
      ttsProvider: 'browser',
      ttsVoiceId: '',
      theme: 'fantasy',
      playerId: 'test-player-id',
      playerName: 'Test Player',
    },
  })
}
