# AI Dungeon Master

A full-stack web application that uses the Anthropic Claude API to act as an interactive Dungeons & Dragons Dungeon Master. Players describe actions in text or voice, and the AI narrates the story, rolls dice, tracks character stats, reveals a procedurally generated dungeon map, and adapts the world in real time.

---

## Features

| Feature | Details |
|---|---|
| **AI Dungeon Master** | Claude (`claude-sonnet-4-6`) narrates, adjudicates rules, and drives story via tool use |
| **Streaming narration** | DM responses stream token-by-token to all players simultaneously |
| **Voice input (STT)** | Optional microphone input via the Web Speech API |
| **Voice output (TTS)** | ElevenLabs, OpenAI TTS, or browser Web Speech API |
| **Dice camera** | Camera feed analysed by Claude Vision to detect physical dice rolls |
| **Dungeon map** | Procedurally generated BSP dungeon with fog of war; the DM reveals rooms as players explore |
| **Multiplayer** | Solo, local co-op, or remote — all players share one session via WebSocket |
| **Character management** | Full character sheets with HP tracking, inventory, conditions, and stat modifiers |
| **Persistent campaigns** | Campaigns, sessions, characters, world state, and dungeon maps saved to SQLite |
| **Session continuity** | Rolling-window summarisation keeps long sessions within the Claude context window; summaries carry forward into new sessions |
| **Campaign auth** | Each campaign has an access code that gates write operations |
| **Rulesets** | D&D 5th Edition, Pathfinder 2e, or Freeform (DM judgment mode) |
| **Themes** | Fantasy, HUD (sci-fi), or Minimal — switchable at runtime |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Vite)                      │
│                                                              │
│  App → CampaignList / CampaignDetail / SessionView           │
│  Zustand store ──► useWebSocket hook ──► /ws/{sessionId}     │
│  DungeonMap (Canvas) ──► fog-of-war BFS renderer             │
│  useTTS ──► ElevenLabs / OpenAI / SpeechSynthesis            │
│  useSpeechRecognition ──► Web Speech API                     │
│  DiceCamera ──► base64 frame ──► WS dice_image msg           │
└────────────────────────┬────────────────────────────────────┘
                         │  WebSocket + REST (HTTP)
┌────────────────────────▼────────────────────────────────────┐
│  FastAPI (Python 3.11+)                                      │
│                                                              │
│  REST  /api/campaigns, /api/characters, /api/tts             │
│  WS    /ws/{session_id}?player_id=&player_name=&access_code= │
│                                                              │
│  DungeonMaster ──► Anthropic SDK (streaming + tool use)      │
│  DungeonGenerator ──► BSP map + Kruskal MST corridors        │
│  SessionHub ──► per-room WebSocket broadcast                 │
│  GameStateManager ──► in-memory pending rolls                │
│  Async SQLAlchemy 2 + aiosqlite ──► SQLite                   │
└─────────────────────────────────────────────────────────────┘
```

### DM Tool Use

Claude has five tools it may invoke while generating a response:

| Tool | What it does |
|---|---|
| `roll_dice` | Server rolls dice (`NdX+M`) and broadcasts result to all players |
| `request_player_roll` | Suspends generation, asks a specific player to roll, awaits their result |
| `update_character` | Applies HP delta, adds/removes items or conditions, appends notes |
| `update_world_state` | Merges key-value facts into the campaign's persistent world state |
| `reveal_area` | Marks a dungeon room as explored and broadcasts a `map_update` to lift fog of war |

### Context Management

Sessions use a rolling-window strategy to stay within the Claude context limit:

- When a session accumulates more than **30 messages**, the oldest messages are condensed into a `session_summary` (using `claude-haiku` for efficiency) and dropped from the active window. The most recent **20 messages** are always kept verbatim.
- When a new session starts, the previous session's summary is automatically inherited so the DM has full story continuity across play nights.

### Dungeon Map

The map is generated once per campaign using a Binary Space Partitioning (BSP) algorithm and stored as a JSON grid in the database:

- The grid holds 3 tile types: `0` = wall, `1` = floor, `2` = corridor.
- Rooms are connected by L-shaped corridors using Kruskal's Minimum Spanning Tree algorithm so every room is reachable with no redundant paths.
- Four room archetypes — **entrance**, **boss**, **treasure**, and **generic** — are assigned deterministically from curated name pools.
- **Fog of war**: only rooms listed in `explored_rooms` (and corridors reachable from them) are visible. The DM calls `reveal_area` to update the list; clients receive a `map_update` WebSocket push and re-render immediately.

### Campaign Authentication

Each campaign has a randomly generated access code returned at creation time. Clients must include it as the `X-Access-Code` request header on all write operations (create session, update campaign, delete campaign, manage characters) and as the `access_code` WebSocket query parameter. The code is stored in `localStorage` and applied automatically by the frontend API client.

---

## Prerequisites

- **Python 3.11+** with `pip`
- **Node.js 18+** with `npm`
- **Anthropic API key** (required)
- **ElevenLabs API key** (optional — for premium TTS)
- **OpenAI API key** (optional — for OpenAI TTS)

---

## Quick Start

### Docker (recommended for production)

```bash
cp .env.example .env
# Set ANTHROPIC_API_KEY (and optionally ELEVENLABS_API_KEY / OPENAI_API_KEY)

docker compose up --build
```

Open **http://localhost:8000** — the backend serves the compiled frontend directly.
The SQLite database is persisted in a Docker named volume (`db_data`).

### Local development

```bash
git clone https://github.com/scwleung/ai_dungeon_master.git
cd ai_dungeon_master

# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

Configure environment:

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY at minimum
```

Run:

```bash
# Terminal 1 — backend (hot-reload)
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend dev server (Vite proxy → backend)
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | — | Key for the Claude API (DM brain, dice vision, summarisation) |
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
│   ├── auth.py                 # Access-code dependency functions (require_*_access)
│   ├── database.py             # Async SQLAlchemy engine and session factory
│   ├── models/
│   │   ├── campaign.py         # Campaign + Session ORM models and Pydantic schemas
│   │   ├── character.py        # Character ORM model and Pydantic schemas
│   │   └── roll_result.py      # Dice rolling logic (NdX+M notation parser)
│   ├── routers/
│   │   ├── campaigns.py        # REST: campaign/session CRUD + dungeon map endpoints
│   │   ├── characters.py       # REST: character CRUD
│   │   └── tts.py              # REST: TTS synthesis and provider listing
│   ├── services/
│   │   ├── dm_brain.py         # DungeonMaster class — Claude streaming + tool use
│   │   ├── map_generator.py    # BSP dungeon generator with Kruskal MST corridors
│   │   ├── game_state.py       # In-memory session/player/pending-roll state
│   │   └── tts_service.py      # TTS provider abstraction (ElevenLabs / OpenAI)
│   └── ws/
│       └── session_hub.py      # WebSocket room manager and broadcaster
├── frontend/
│   └── src/
│       ├── api/client.ts       # Typed REST API client (campaigns, sessions, characters, map)
│       ├── store/gameStore.ts  # Zustand global state (campaigns, session, characters, map)
│       ├── hooks/
│       │   ├── useWebSocket.ts         # WebSocket connection with exponential backoff
│       │   ├── useTTS.ts               # Text-to-speech (ElevenLabs / OpenAI / browser)
│       │   └── useSpeechRecognition.ts # Microphone STT via Web Speech API
│       ├── components/
│       │   ├── SessionView.tsx     # Main gameplay view (log + input + sidebars)
│       │   ├── NarrativeLog.tsx    # Scrolling DM/player message log with streaming
│       │   ├── PlayerInput.tsx     # Text/voice action input with send button
│       │   ├── CharacterSheet.tsx  # HP adjuster, inventory, conditions panel
│       │   ├── DungeonMap.tsx      # Canvas dungeon map with fog-of-war and pan/zoom
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
│   ├── test_context_management.py  # Rolling-window summarisation + cross-session continuity
│   ├── test_dm_brain.py        # DungeonMaster unit tests (mocked Anthropic SDK)
│   ├── test_game_state.py      # GameStateManager unit tests
│   ├── test_map_generator.py   # BSP dungeon generator unit tests
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

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/campaigns` | — | List all campaigns |
| `POST` | `/api/campaigns` | — | Create a campaign |
| `GET` | `/api/campaigns/{id}` | — | Get a single campaign |
| `PUT` | `/api/campaigns/{id}` | ✓ | Update name/description |
| `DELETE` | `/api/campaigns/{id}` | ✓ | Delete campaign and all related data |
| `GET` | `/api/campaigns/{id}/sessions` | — | List sessions for a campaign |
| `POST` | `/api/campaigns/{id}/sessions` | ✓ | Start a new session |
| `PUT` | `/api/campaigns/sessions/{session_id}/end` | ✓ | End an active session |
| `GET` | `/api/campaigns/{id}/map` | — | Get dungeon map (auto-generates on first call) |
| `POST` | `/api/campaigns/{id}/map/generate` | ✓ | Regenerate the dungeon map |

### Characters

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/{campaign_id}/characters` | — | List characters in a campaign |
| `POST` | `/api/{campaign_id}/characters` | ✓ | Create a character |
| `GET` | `/api/characters/{id}` | — | Get a character |
| `PUT` | `/api/characters/{id}` | ✓ | Update a character |
| `DELETE` | `/api/characters/{id}` | ✓ | Delete a character |

### TTS

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tts/providers` | List available TTS providers |
| `POST` | `/api/tts/synthesize` | Synthesise speech; returns `audio/mpeg` blob |

**Auth** (✓): include the campaign's access code in the `X-Access-Code` request header.

---

## WebSocket Protocol

Connect to `ws://<host>/ws/{session_id}?player_id=<id>&player_name=<name>&access_code=<code>`.

The `access_code` query parameter is required; the connection is closed with code 4403 if it does not match the session's campaign.

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
| `player_left` | `player_id` | Broadcast when a player disconnects |
| `dm_chunk` | `text`, `done`, `message_id` | Incremental streaming text from Claude |
| `dm_response_complete` | `message_id`, `full_text` | Full DM response once streaming finishes |
| `dice_request` | `roll_request_id`, `player_id`, `dice`, `skill`, `dc?` | DM requests a player roll |
| `dice_result` | `dice`, `values`, `modifier`, `total`, `roller`, `secret?` | A roll result (DM or player) |
| `state_update` | `character?`, `world_state?` | Live character or world state update after a tool call |
| `map_update` | `explored_rooms` | Updated list of explored room IDs after `reveal_area` |
| `error` | `message` | Error description |

---

## Running Tests

### Backend

```bash
# From the project root
pytest
```

269 tests covering REST endpoints, WebSocket integration, DM brain (mocked Claude), dice rolling, session hub, TTS service, game state, context management, and the dungeon map generator.

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

The WebSocket hub broadcasts all DM narration, dice results, map reveals, and state updates to every connected player in the room simultaneously.

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
- `GameStateManager` holds in-memory session state (pending rolls, connected players) that is **not** persisted across server restarts. Persistent data (messages, character HP, world state, dungeon maps) is always written to the database immediately.
- Dice rolls triggered by Claude tools are server-side only. Camera-detected and manual rolls come from the client and are trusted as submitted.
- The dungeon map is generated once per campaign and stored in `campaign.map_data`. Use `POST /api/campaigns/{id}/map/generate` (with access code) to regenerate it; note that this resets `explored_rooms` too.
- Context summarisation uses `claude-haiku-4-5-20251001` for cost efficiency. The rolling threshold and keep-recent window are configurable via `SUMMARY_THRESHOLD` and `SUMMARY_KEEP_RECENT` in `backend/main.py`.
