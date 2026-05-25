# AI Dungeon Master

A full-stack web application that uses the Anthropic Claude API to act as an interactive Dungeons & Dragons Dungeon Master. Players describe actions in text or voice, and the AI narrates the story, rolls dice, tracks character stats, and adapts the world in real time.

---

## Features

| Feature | Details |
|---|---|
| **AI Dungeon Master** | Claude (`claude-sonnet-4-6`) narrates, adjudicates rules, and drives story via tool use |
| **Streaming narration** | DM responses stream token-by-token to all players simultaneously |
| **Voice input (STT)** | Optional microphone input via the Web Speech API |
| **Voice output (TTS)** | ElevenLabs, OpenAI TTS, or browser Web Speech API |
| **Dice camera** | Camera feed analysed by Claude Vision to detect physical dice rolls |
| **Multiplayer** | Solo, local co-op, or remote — all players share one session via WebSocket |
| **Character management** | Full character sheets with HP tracking, inventory, conditions, and stat modifiers |
| **Persistent campaigns** | Campaigns, sessions, characters, and world state saved to SQLite |
| **Rulesets** | D&D 5th Edition, Pathfinder 2e, or Freeform (DM judgment mode) |
| **Themes** | Fantasy, HUD (sci-fi), or Minimal — switchable at runtime |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Vite)                  │
│                                                          │
│  App → CampaignList / CampaignDetail / SessionView       │
│  Zustand store ──► useWebSocket hook ──► /ws/{sessionId} │
│  useTTS ──► ElevenLabs / OpenAI / SpeechSynthesis        │
│  useSpeechRecognition ──► Web Speech API                 │
│  DiceCamera ──► base64 frame ──► WS dice_image msg       │
└────────────────────────┬────────────────────────────────┘
                         │  WebSocket + REST (HTTP)
┌────────────────────────▼────────────────────────────────┐
│  FastAPI (Python 3.11+)                                  │
│                                                          │
│  REST  /api/campaigns, /api/characters, /api/tts         │
│  WS    /ws/{session_id}?player_id=&player_name=          │
│                                                          │
│  DungeonMaster ──► Anthropic SDK (streaming + tool use)  │
│  SessionHub ──► per-room WebSocket broadcast             │
│  GameStateManager ──► in-memory pending rolls            │
│  Async SQLAlchemy 2 + aiosqlite ──► SQLite               │
└─────────────────────────────────────────────────────────┘
```

### DM Tool Use

Claude has four tools it may invoke while generating a response:

| Tool | What it does |
|---|---|
| `roll_dice` | Server rolls dice (`NdX+M`) and broadcasts result to all players |
| `request_player_roll` | Suspends generation, asks a specific player to roll, awaits their result |
| `update_character` | Applies HP delta, adds/removes items or conditions, appends notes |
| `update_world_state` | Merges key-value facts into the campaign's persistent world state |

---

## Prerequisites

- **Python 3.11+** with `pip`
- **Node.js 18+** with `npm`
- **Anthropic API key** (required)
- **ElevenLabs API key** (optional — for premium TTS)
- **OpenAI API key** (optional — for OpenAI TTS)

---

## Quick Start

### 1 — Clone and install

```bash
git clone https://github.com/scwleung/ai_dungeon_master.git
cd ai_dungeon_master

# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY at minimum
```

See [Environment Variables](#environment-variables) for all options.

### 3 — Run

```bash
# Terminal 1 — backend
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | — | Key for the Claude API (DM brain + dice vision) |
| `ELEVENLABS_API_KEY` | No | — | Enables ElevenLabs TTS in the provider list |
| `OPENAI_API_KEY` | No | — | Enables OpenAI TTS in the provider list |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./dungeon_master.db` | SQLAlchemy async database URL |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed CORS origins |

---

## Project Structure

```
ai_dungeon_master/
├── backend/
│   ├── main.py                 # FastAPI app, WebSocket endpoint, tool callbacks
│   ├── database.py             # Async SQLAlchemy engine and session factory
│   ├── models/
│   │   ├── campaign.py         # Campaign + Session ORM models and Pydantic schemas
│   │   ├── character.py        # Character ORM model and Pydantic schemas
│   │   └── roll_result.py      # Dice rolling logic (NdX+M notation parser)
│   ├── routers/
│   │   ├── campaigns.py        # REST: campaign and session CRUD
│   │   ├── characters.py       # REST: character CRUD
│   │   └── tts.py              # REST: TTS synthesis and provider listing
│   ├── services/
│   │   ├── dm_brain.py         # DungeonMaster class — Claude streaming + tool use
│   │   ├── game_state.py       # In-memory session/player/pending-roll state
│   │   └── tts_service.py      # TTS provider abstraction (ElevenLabs / OpenAI)
│   └── ws/
│       └── session_hub.py      # WebSocket room manager and broadcaster
├── frontend/
│   └── src/
│       ├── api/client.ts       # Typed REST API client
│       ├── store/gameStore.ts  # Zustand global state (campaigns, session, characters)
│       ├── hooks/
│       │   ├── useWebSocket.ts         # WebSocket connection with exponential backoff
│       │   ├── useTTS.ts               # Text-to-speech (ElevenLabs / OpenAI / browser)
│       │   └── useSpeechRecognition.ts # Microphone STT via Web Speech API
│       ├── components/
│       │   ├── SessionView.tsx     # Main gameplay view (log + input + sidebar)
│       │   ├── NarrativeLog.tsx    # Scrolling DM/player message log with streaming
│       │   ├── PlayerInput.tsx     # Text/voice action input with send button
│       │   ├── CharacterSheet.tsx  # HP adjuster, inventory, conditions panel
│       │   ├── DiceCamera.tsx      # Camera capture + Claude Vision dice detection
│       │   ├── DMVoice.tsx         # TTS controls and speaking indicator
│       │   ├── MicButton.tsx       # Push-to-talk microphone button
│       │   ├── CampaignList.tsx    # Campaign browser with create/delete/continue
│       │   ├── CampaignSetup.tsx   # New-campaign form (name, ruleset, description)
│       │   ├── CampaignDetail.tsx  # Campaign overview (characters, sessions)
│       │   ├── CharacterForm.tsx   # New-character form with HP suggestion
│       │   ├── Header.tsx          # Top navigation bar with theme switcher
│       │   └── ThemeSwitcher.tsx   # Fantasy / HUD / Minimal theme toggle
│       └── types.ts            # Shared TypeScript interfaces and WebSocket message types
├── tests/                      # pytest backend tests
│   ├── conftest.py             # In-memory SQLite fixtures and httpx test client
│   ├── test_campaigns.py       # Campaign and session REST API tests
│   ├── test_characters.py      # Character REST API tests
│   ├── test_dm_brain.py        # DungeonMaster unit tests (mocked Anthropic SDK)
│   ├── test_game_state.py      # GameStateManager unit tests
│   ├── test_roll_result.py     # Dice notation parser tests
│   ├── test_session_hub.py     # SessionHub WebSocket broadcast tests
│   ├── test_tts_router.py      # TTS router integration tests
│   ├── test_tts_service.py     # TTS service unit tests
│   └── test_websocket.py       # WebSocket endpoint integration tests
├── requirements.txt
├── pytest.ini
└── .env.example
```

---

## REST API

All endpoints are prefixed with `/api`.

### Campaigns

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List all campaigns |
| `POST` | `/api/campaigns` | Create a campaign |
| `GET` | `/api/campaigns/{id}` | Get a single campaign |
| `PUT` | `/api/campaigns/{id}` | Update name/description |
| `DELETE` | `/api/campaigns/{id}` | Delete campaign and all related data |
| `GET` | `/api/campaigns/{id}/sessions` | List sessions for a campaign |
| `POST` | `/api/campaigns/{id}/sessions` | Start a new session |
| `PUT` | `/api/campaigns/sessions/{session_id}/end` | End an active session |

### Characters

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/{campaign_id}/characters` | List characters in a campaign |
| `POST` | `/api/{campaign_id}/characters` | Create a character |
| `GET` | `/api/characters/{id}` | Get a character |
| `PUT` | `/api/characters/{id}` | Update a character |
| `DELETE` | `/api/characters/{id}` | Delete a character |

### TTS

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tts/providers` | List available TTS providers |
| `POST` | `/api/tts/synthesize` | Synthesise speech; returns `audio/mpeg` blob |

---

## WebSocket Protocol

Connect to `ws://<host>/ws/{session_id}?player_id=<id>&player_name=<name>`.

### Client → Server

| `type` | Payload fields | Description |
|---|---|---|
| `join_session` | `player_name`, `character_id?` | Register in the session room |
| `player_action` | `text` | Submit a narrative action |
| `voice_transcript` | `text` | STT-derived action (treated identically to `player_action`) |
| `dice_image` | `image` (base64), `roll_request_id?` | Camera frame for Vision dice detection |
| `manual_roll` | `roll_request_id`, `total`, `values`, `modifier` | Manual dice entry |
| `dice_result` | `roll_request_id`, `total`, `values`, `modifier` | Physical dice result (camera-confirmed) |

### Server → Client

| `type` | Key fields | Description |
|---|---|---|
| `joined` | `session_id`, `player_id`, `player_name` | Confirms the player joined |
| `player_joined` | `player_id`, `player_name` | Broadcast to others when someone joins |
| `player_left` | `player_id`, `player_name` | Broadcast when a player disconnects |
| `dm_chunk` | `text` | Incremental streaming text from Claude |
| `dm_response_complete` | `text` | Full DM response once streaming finishes |
| `dice_request` | `roll_request_id`, `player_id`, `dice`, `skill`, `dc?` | DM requests a player roll |
| `dice_result` | `dice`, `values`, `modifier`, `total`, `roller`, `secret?` | A roll result (DM or player) |
| `state_update` | `character` | Live character stat update after a tool call |
| `error` | `message` | Error description |

---

## Running Tests

### Backend

```bash
# From the project root
pytest
```

198 tests covering REST endpoints, WebSocket integration, DM brain (mocked Claude), dice rolling, session hub, TTS service, and game state.

### Frontend

```bash
cd frontend
npm test          # watch mode
npm run test:run  # single pass (CI)
```

223 tests covering the Zustand store, all custom hooks, and components (CampaignList, CampaignSetup, CampaignDetail, CharacterForm, CharacterSheet, NarrativeLog, PlayerInput, ThemeSwitcher).

---

## Multiplayer Setup

All players connect to the same `session_id`. A session is created via the REST API (or the UI's "Start New Session" button) and then shared as a URL or room code.

- **Solo**: one browser tab, one player
- **Local co-op**: multiple browser tabs or devices on the same network pointing at the same backend
- **Remote**: expose the backend (e.g. via a tunnel or cloud deploy) and share the session URL

The WebSocket hub broadcasts all DM narration, dice results, and state updates to every connected player in the room.

---

## Themes

Three themes are available and can be toggled in the header without reloading the page:

| Theme | Description |
|---|---|
| **Fantasy** | Parchment tones, serif headings — classic tabletop feel |
| **HUD** | Dark background, cyan accents — sci-fi tactical display |
| **Minimal** | Clean whites and greys — distraction-free reading |

Themes are implemented via CSS custom properties on `document.body` and persisted in `localStorage`.

---

## Development Notes

- The frontend dev server proxies `/api` and `/ws` to `http://localhost:8000` via Vite's built-in proxy.
- The Anthropic API key is never exposed to the browser; all Claude calls happen server-side.
- `GameStateManager` holds in-memory session state (pending rolls, connected players) that is **not** persisted across server restarts. Persistent data (messages, character HP, world state) is always written to the database immediately.
- Dice rolls triggered by Claude tools are server-side only. Camera-detected and manual rolls come from the client and are trusted as submitted.
