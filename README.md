# AI Dungeon Master

![CI](https://github.com/scwleung/ai_dungeon_master/actions/workflows/ci.yml/badge.svg)

A full-stack web application that uses the Anthropic Claude API to act as an interactive Dungeons & Dragons Dungeon Master. Players describe actions in text or voice, and the AI narrates the story, rolls dice, tracks character stats, reveals a procedurally generated dungeon map, and adapts the world in real time.

---

## Features

### AI & Narration

| Feature | Details |
|---|---|
| **Claude DM brain** | `claude-sonnet-4-6` narrates, adjudicates rules, and drives story via streaming tool use |
| **Claude Haiku helpers** | Summarisation, loot generation, NPC name generation, and session recap use `claude-haiku-4-5-20251001` for efficiency |
| **Streaming narration** | DM responses stream token-by-token to all players simultaneously |
| **Secret DM rolls** | `dm_secret_roll` WS message triggers a server-side dice roll; result sent only to the requesting socket, never broadcast |
| **Scene markers** | DM inserts styled narrative dividers (`scene_marker`) broadcast to all players |
| **Read-aloud library** | Canned dramatic text snippets stored per campaign and pushed to players |
| **Spell reference** | 34 spells searchable in-session |
| **Bestiary** | 30 monsters searchable in-session |
| **Magic items reference** | 36 items, filterable by rarity |
| **Equipment database** | 46 items, searchable by category |

### Character Management

| Feature | Details |
|---|---|
| **Full character sheets** | HP, ability scores, inventory, and conditions |
| **Derived stats** | Saving throws, proficiency bonus, and Passive Perception auto-calculated |
| **Hit dice tracking** | Remaining hit dice with "Roll HD" short-rest button |
| **Exhaustion tracker** | Levels 1–6 with per-level mechanic tooltips |
| **Death saves tracker** | Successes / failures pips |
| **Concentration tracking** | Active spell name; auto-prompt on HP damage |
| **Inspiration tracking** | DM can award, player can spend |
| **XP tracker** | Running total with level-up detection |
| **Individual currency** | GP / SP / CP / EP / PP tracked per character |
| **Spellbook** | Prepared / unprepared toggle per spell |
| **Spell slots** | Per-level tracking (levels 1–9) |
| **Feature / trait tracker** | Short / long rest abilities with pip-based use tracking |
| **Character backstory** | Bonds, Ideals, Flaws, and Personality Traits fields |
| **Languages & proficiencies** | Languages and tool proficiencies lists |
| **Character audit log** | Timestamped change history, viewable by player |
| **Level-up wizard** | HP roll + ASI selection flow |

### Combat

| Feature | Details |
|---|---|
| **Real-time initiative tracker** | HP bars and condition badges pushed via WebSocket |
| **Auto-roll initiative** | DM button triggers `POST /combat/roll-initiative`; server rolls `1d20+DEX` for all combatants |
| **Inline HP editing** | Click any combatant HP to adjust via `PATCH /combat/combatants/{name}/hp` |
| **Advantage / disadvantage** | 2d20 keep-high or keep-low |
| **Legendary actions counter** | Per-combatant ◆◆◆ pips with reset button; toggled via `combat_legendary_action` WS message |
| **Reaction tracker** | ⚡ badge per combatant dims when used; DM resets via `combat_reset_reactions` WS message |
| **Monster stat block pop-up** | Quick reference for 10 common monsters |
| **Condition reference panel** | All 15 D&D 5e conditions with descriptions |
| **Encounter builder** | CR→XP difficulty calculator with XP split per PC |
| **Turn timer** | Configurable per-combatant countdown |
| **Concentration check prompt** | Auto-surfaces when a concentrating character takes damage |

### DM Tools

| Feature | Details |
|---|---|
| **Private DM notes** | Per-session notes visible only to the DM; auto-saved via `GET/PUT /sessions/{id}/dm-notes` |
| **World clock / weather** | Day, hour, minute, weather, temperature, and time-of-day; mechanical hints for rain / storm / snow / fog |
| **Player handouts** | Push images or text to all players via `POST /campaigns/{id}/handouts`; received as `handout_push` WS event |
| **Random table roller** | Custom d4–d100 tables stored per campaign; `POST /tables/{id}/roll` returns a random entry |
| **Loot generator** | CR + environment → AI-generated treasure list via `POST /campaigns/{id}/loot` |
| **NPC name generator** | AI-generated culturally-themed names via `POST /campaigns/{id}/generate-names` |
| **Campaign timeline** | Ordered event log; entries added via `POST /campaigns/{id}/timeline` |
| **Scene illustration** | DALL-E 3 generates atmospheric images; displayed as a full-width dismissable banner |
| **Dungeon map** | BSP procedural generation with fog of war; DM calls `reveal_area` to expose rooms |
| **Map annotations** | Freeform DM pins on the map; persisted via `GET/PUT /campaigns/{id}/map/annotations` |

### Session Tools

| Feature | Details |
|---|---|
| **Session notes** | Collaborative, debounced auto-save via `GET/PUT /sessions/{id}/notes` |
| **Session recap generator** | Claude Haiku writes a "Previously on..." summary from session notes; `POST /sessions/{id}/recap` |
| **Session export** | Download full narrative as a `.txt` file |
| **Session journal** | Reverse-chronological past session summaries in Campaign Detail |
| **Ready check** | DM polls players; responses tracked in real time via `ready_check` / `ready_response` WS messages |
| **Pinned notes** | Important reminders pinned above the chat log; synced via `pinned_update` broadcast |

### Communication

| Feature | Details |
|---|---|
| **OOC chat** | Out-of-character channel separate from the narrative log (`ooc_message` / `ooc_broadcast`) |
| **Push-to-talk indicator** | `voice_recording` WS message relays recording state to all players |
| **Spectator mode** | Read-only connection — no action input; granted by connecting without an access code |
| **Invite links** | `?campaign=<id>&code=<token>` URL auto-authenticates and navigates the recipient |

### Dice

| Feature | Details |
|---|---|
| **Virtual dice roller** | d4–d100, `crypto.getRandomValues`, auto-selects die for pending rolls |
| **Dice camera** | Claude Vision detects face values of physical dice from a camera frame |
| **Dice log** | Full session roll history |
| **Dice macros** | Saved roll configurations |
| **Dice SFX** | Web Audio API sound effects on roll |
| **Skill check shortcuts** | Pre-configured ability / skill roll buttons |

### Player Experience

| Feature | Details |
|---|---|
| **Party panel** | Shared gold + items, passive perception badges per player |
| **Spellbook panel** | Prepared / unprepared toggle |
| **Character audit log viewer** | Timestamped change history accessible by players |
| **Toast notifications** | Slide-in success / error / info / warning toasts |
| **Error boundary** | "Try Again" reset on unhandled React errors |
| **Loading skeletons** | Shimmer animation while data is fetching |
| **Keyboard shortcuts** | `?` opens help modal; `n` focuses narrative; `d` opens dice roller; `Escape` closes panels |
| **PWA** | Installable; service-worker cache-first strategy registered in `main.tsx` |
| **Virtual scrolling** | 150-message cap with "Show older" pagination |

### Infrastructure

| Feature | Details |
|---|---|
| **WS keepalive** | Server sends `{"type":"ping"}` every 30 s; client replies `{"type":"pong"}` |
| **WS reconnect** | Exponential backoff with jitter |
| **Request deduplication** | `useRef` guard on `sendAction` prevents double-sends |
| **Rate limiting** | Sliding-window 60 req / min / IP via `collections.defaultdict(deque)` + `time.monotonic()`; loopback IPs exempt |
| **Health endpoint** | `GET /health` performs a `SELECT 1` DB liveness check |
| **PostgreSQL support** | `DATABASE_URL` auto-normalises `postgres://` → `postgresql+asyncpg://` |
| **Voice input (STT)** | Optional microphone input via the Web Speech API |
| **Voice output (TTS)** | ElevenLabs, OpenAI TTS, or browser Web Speech API |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Vite)                          │
│                                                                  │
│  App → CampaignList / CampaignDetail / SessionView               │
│  Zustand store ──► useWebSocket hook ──► /ws/{sessionId}         │
│  DungeonMap (Canvas) ──► fog-of-war BFS renderer                 │
│  useTTS ──► ElevenLabs / OpenAI / SpeechSynthesis                │
│  useSpeechRecognition ──► Web Speech API                         │
│  DiceCamera ──► base64 frame ──► WS dice_image msg               │
│  PWA: manifest.json + sw.js (cache-first service worker)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │  WebSocket + REST (HTTP)
┌──────────────────────────▼──────────────────────────────────────┐
│  FastAPI (Python 3.11+)                                          │
│                                                                  │
│  REST  /api/campaigns, /api/characters, /api/tts, /api/sessions  │
│  WS    /ws/{session_id}?player_id=&player_name=&access_code=     │
│                                                                  │
│  DungeonMaster ──► Anthropic SDK (streaming + tool use)          │
│  DungeonGenerator ──► BSP map + Kruskal MST corridors            │
│  ImageService ──► OpenAI DALL-E 3 (scene illustrations)          │
│  SessionHub ──► per-room broadcast + send_to_socket              │
│  GameStateManager ──► in-memory rolls + CombatState              │
│  Rate limiter ──► sliding-window 60 req/min/IP (in-memory)       │
│  Async SQLAlchemy 2 + aiosqlite ──► SQLite (or PostgreSQL)       │
└─────────────────────────────────────────────────────────────────┘
```

### DM Tool Use

Claude has thirteen tools it may invoke while generating a response:

| Tool | Category | What it does |
|---|---|---|
| `roll_dice` | Dice | Server rolls dice (`NdX+M`) and broadcasts result to all players; supports `secret` flag |
| `request_player_roll` | Dice | Suspends generation, asks a specific player to roll, awaits their result; supports `advantage`/`disadvantage` |
| `update_character` | State | Applies HP delta, adds/removes items or conditions, updates XP, spell slots, resources, currency, hit dice, exhaustion, death saves, concentration, inspiration, backstory fields, features, and appends audit log entries |
| `update_world_state` | State | Merges key-value facts into the campaign's persistent world state |
| `reveal_area` | Map | Marks a dungeon room as explored and broadcasts a `map_update` to lift fog of war |
| `start_combat` | Combat | Begins a new encounter with a list of combatants and their initiatives; broadcasts `combat_update` |
| `next_turn` | Combat | Advances initiative order to the next combatant; increments round at end of rotation; broadcasts `combat_update` |
| `end_combat` | Combat | Clears the active encounter; broadcasts a `combat_update` with `active: false` |
| `upsert_npc` | NPCs | Adds or updates an NPC (name, faction, attitude, location, notes) in the campaign registry; broadcasts `npc_update` |
| `upsert_quest` | Quests | Adds or updates a quest (name, status, description) in the campaign quest log; broadcasts `quest_update` |
| `update_party_state` | Party | Updates party shared gold and inventory; broadcasts `party_update` |
| `generate_scene_image` | Illustration | Calls DALL-E 3 to generate an atmospheric scene image; broadcasts `scene_image` |
| `generate_loot` | Loot | Generates CR-appropriate treasure via Claude Haiku; returns an item list |

### Context Management

Sessions use a rolling-window strategy to stay within the Claude context limit:

- When a session accumulates more than **30 messages**, the oldest messages are condensed into a `session_summary` (using `claude-haiku-4-5-20251001` for efficiency) and dropped from the active window. The most recent **20 messages** are always kept verbatim.
- When a new session starts, the previous session's summary is automatically inherited so the DM has full story continuity across play nights.

### Dungeon Map

The map is generated once per campaign using a Binary Space Partitioning (BSP) algorithm and stored as a JSON grid in the database:

- The grid holds 3 tile types: `0` = wall, `1` = floor, `2` = corridor.
- Rooms are connected by L-shaped corridors using Kruskal's Minimum Spanning Tree algorithm so every room is reachable with no redundant paths.
- Four room archetypes — **entrance**, **boss**, **treasure**, and **generic** — are assigned deterministically from curated name pools.
- **Fog of war**: only rooms listed in `explored_rooms` (and corridors reachable from them) are visible. The DM calls `reveal_area` to update the list; clients receive a `map_update` WebSocket push and re-render immediately.
- **Map annotations**: the DM can place freeform pins on the map; they are persisted per-campaign and broadcast as `map_annotation_update` to active sessions.

### Combat Tracker

Combat state is managed in memory by `GameStateManager.CombatState` (not persisted). When the DM calls `start_combat` the server:

1. Sorts combatants by initiative descending.
2. Broadcasts a `combat_update` WebSocket message to all players.
3. The frontend auto-opens the Combat Tracker sidebar panel.

Subsequent `next_turn` calls advance the tracker (and increment the round at the end of each rotation); `end_combat` clears it.

Each `Combatant` tracks: `name`, `initiative`, `hp_current`, `hp_max`, `is_player`, `character_id`, `conditions`, `legendary_actions_remaining`, `legendary_actions_max`, and `reaction_used`.

### NPC Tracker

NPCs are stored as a JSON array in the `campaign.npcs` column. The DM calls `upsert_npc` to add or update an entry; existing records are matched by `id` (a snake_case slug). The full registry is broadcast as `npc_update` after every change and displayed in the NPC Tracker sidebar panel grouped by attitude (friendly / neutral / hostile / unknown).

### Quest Tracker

Quests are stored as a JSON array in the `campaign.quests` column. The DM calls `upsert_quest` to add or update entries; existing records are matched by `id` (a snake_case slug). The full list is broadcast as `quest_update` after every change and displayed in the Quest Tracker sidebar panel grouped by status:

- **Active** — shown in gold, with full name and description
- **Completed** — shown in green
- **Failed** — shown in red

In the DM's system prompt only active quests are expanded in full; completed and failed quests appear as a summary count to keep context bounded as campaigns progress.

### Virtual Dice Roller

The `DiceRoller` component provides in-browser rolling when a physical camera or external dice are not available:

- Supports d4, d6, d8, d10, d12, d20, and d100.
- Count (1–10) and modifier (+/− any integer) are adjustable before rolling.
- Rolls use `crypto.getRandomValues` for cryptographically uniform results.
- When a `pendingRoll` is active (DM called `request_player_roll`) the roller auto-selects the correct die type parsed from the `NdX` notation, displays the skill name and DC, and exposes a **Submit Roll** button that sends a `manual_roll` WebSocket message.
- For freeform rolls a **Send to Chat** button broadcasts the result as a player action so all participants see it.
- The last six rolls are kept in a history list.

### Scene Illustration

When the DM calls `generate_scene_image` the server sends a description string to DALL-E 3 (via the OpenAI REST API) with a fantasy art style prefix, then broadcasts the resulting image URL as a `scene_image` WebSocket message. The frontend shows the image as a full-width dismissable hero banner above the narrative log. Scene generation requires `OPENAI_API_KEY` to be set; if the key is absent the tool raises an error which the DM can narrate around.

### Campaign Authentication

Each campaign has a randomly generated access code returned at creation time. Clients must include it as the `X-Access-Code` request header on all write operations (create session, update campaign, delete campaign, manage characters) and as the `access_code` WebSocket query parameter. The code is stored in `localStorage` and applied automatically by the frontend API client.

Connecting to WebSocket **without** an access code grants read-only spectator access; connecting with an **incorrect** non-empty code is rejected with close code 4403.

---

## Prerequisites

- **Python 3.11+** with `pip`
- **Node.js 18+** with `npm`
- **Anthropic API key** (required)
- **ElevenLabs API key** (optional — for premium TTS)
- **OpenAI API key** (optional — for OpenAI TTS and DALL-E 3 scene illustration)

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
| `OPENAI_API_KEY` | No | — | Enables OpenAI TTS and DALL-E 3 scene illustration |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./dungeon_master.db` | SQLAlchemy async database URL; `postgres://` is auto-normalised to `postgresql+asyncpg://` |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed CORS origins |

---

## Project Structure

```
ai_dungeon_master/
├── backend/
│   ├── main.py                 # FastAPI app, WebSocket endpoint, tool callbacks, rate limiter, keepalive
│   ├── auth.py                 # Access-code dependency functions (require_*_access)
│   ├── database.py             # Async SQLAlchemy engine and session factory
│   ├── models/
│   │   ├── campaign.py         # Campaign + Session ORM models and Pydantic schemas
│   │   ├── character.py        # Character ORM model and Pydantic schemas
│   │   └── roll_result.py      # Dice rolling logic (NdX+M notation parser)
│   ├── routers/
│   │   ├── campaigns.py        # REST: campaign/session CRUD, map, annotations, world-time,
│   │   │                       #       handouts, timeline, loot, names, tables, DM notes, recap
│   │   ├── characters.py       # REST: character CRUD + audit log
│   │   ├── combat.py           # REST: combat tracker (next-turn, end, add/remove combatant,
│   │   │                       #       roll-initiative, HP patch)
│   │   └── tts.py              # REST: TTS synthesis and provider listing
│   ├── services/
│   │   ├── dm_brain.py         # DungeonMaster class — Claude streaming + tool use (13 tools)
│   │   ├── map_generator.py    # BSP dungeon generator with Kruskal MST corridors
│   │   ├── game_state.py       # In-memory rolls, CombatState (with legendary actions + reactions),
│   │   │                       #       and player tracking
│   │   ├── image_service.py    # DALL-E 3 scene illustration via OpenAI REST API
│   │   └── tts_service.py      # TTS provider abstraction (ElevenLabs / OpenAI)
│   └── ws/
│       └── session_hub.py      # WebSocket room manager: broadcast, send_to_socket,
│                               #       send_to_player, mark_spectator, is_spectator
├── frontend/
│   └── src/
│       ├── api/client.ts       # Typed REST API client (campaigns, sessions, characters, map,
│       │                       #       NPCs, quests, combat, party, pins, TTS)
│       ├── store/gameStore.ts  # Zustand global state
│       ├── hooks/
│       │   ├── useWebSocket.ts         # WebSocket connection with exponential backoff + jitter
│       │   ├── useTTS.ts               # Text-to-speech (ElevenLabs / OpenAI / browser)
│       │   └── useSpeechRecognition.ts # Microphone STT via Web Speech API
│       ├── components/
│       │   ├── AmbientSound.tsx        # Background ambient audio controls
│       │   ├── Bestiary.tsx            # 30-monster searchable bestiary panel
│       │   ├── CampaignDetail.tsx      # Campaign overview + Journal + DM invite link
│       │   ├── CampaignList.tsx        # Campaign browser with create/delete/continue
│       │   ├── CampaignSetup.tsx       # New-campaign form (name, ruleset, description)
│       │   ├── CharacterForm.tsx       # New-character form with HP suggestion
│       │   ├── CharacterSheet.tsx      # Full character sheet (HP, stats, spells, conditions, features)
│       │   ├── CombatTracker.tsx       # Initiative order, HP bars, conditions, legendary actions, reactions
│       │   ├── ConditionReference.tsx  # 15 D&D 5e conditions reference panel
│       │   ├── DMNotes.tsx             # Private DM notes (auto-saved, session-scoped)
│       │   ├── DMVoice.tsx             # TTS controls and speaking indicator
│       │   ├── DiceCamera.tsx          # Camera capture + Claude Vision dice detection
│       │   ├── DiceLog.tsx             # Session roll history log
│       │   ├── DiceMacros.tsx          # Saved dice roll configurations
│       │   ├── DiceRoller.tsx          # Virtual dice roller (d4–d100, crypto-random, pending-roll support)
│       │   ├── DungeonMap.tsx          # Canvas dungeon map with fog-of-war, pan/zoom, annotations
│       │   ├── EncounterBuilder.tsx    # CR→XP difficulty calculator + encounter builder
│       │   ├── Equipment.tsx           # 46-item equipment database, searchable by category
│       │   ├── ErrorBoundary.tsx       # React error boundary with "Try Again" reset
│       │   ├── FeatureTracker.tsx      # Class feature / trait uses with pip-based tracking
│       │   ├── Handouts.tsx            # Player handout management and display
│       │   ├── Header.tsx              # Top navigation bar with theme switcher
│       │   ├── KeyboardShortcuts.tsx   # ? help modal listing keyboard shortcuts
│       │   ├── LevelUpWizard.tsx       # HP roll + ASI selection level-up flow
│       │   ├── MagicItems.tsx          # 36-item magic items reference, filterable by rarity
│       │   ├── MicButton.tsx           # Push-to-talk microphone button
│       │   ├── NPCTracker.tsx          # NPC registry panel grouped by attitude
│       │   ├── NarrativeLog.tsx        # Scrolling DM/player message log with streaming + virtual scroll
│       │   ├── OOCChat.tsx             # Out-of-character chat channel
│       │   ├── PartyPanel.tsx          # Shared gold + items, passive perception badges
│       │   ├── PlayerInput.tsx         # Text/voice action input with send button
│       │   ├── QuestTracker.tsx        # Quest log panel grouped by status
│       │   ├── RandomTables.tsx        # Custom d4–d100 random table roller
│       │   ├── ReadAloud.tsx           # Read-aloud text library panel
│       │   ├── SessionJournal.tsx      # Collapsible past-session summaries in Campaign Detail
│       │   ├── SessionNotes.tsx        # Collaborative session notes with debounced auto-save
│       │   ├── SessionRecap.tsx        # AI "Previously on..." recap generator
│       │   ├── SessionView.tsx         # Main gameplay view (log + input + sidebars)
│       │   ├── SpellReference.tsx      # 34-spell searchable reference panel
│       │   ├── ThemeSwitcher.tsx       # Fantasy / HUD / Minimal theme toggle
│       │   ├── Timeline.tsx            # Campaign event timeline log
│       │   ├── ToastProvider.tsx       # Slide-in toast notifications (success/error/info/warning)
│       │   └── WorldClock.tsx          # World clock / weather tracker with mechanical hints
│       ├── themes/
│       │   ├── base.css            # Design tokens, global reset, mobile touch-target overrides
│       │   ├── fantasy.css         # Parchment / serif theme
│       │   ├── hud.css             # Dark / cyan sci-fi theme
│       │   └── minimal.css         # Clean light theme
│       ├── public/
│       │   ├── manifest.json       # PWA manifest (name, icons, display: standalone)
│       │   └── sw.js               # Cache-first service worker
│       └── types.ts            # Shared TypeScript interfaces and WebSocket message types
├── tests/                      # pytest backend tests
│   ├── conftest.py             # In-memory SQLite fixtures and httpx test client
│   ├── test_campaigns.py       # Campaign and session REST API tests
│   ├── test_characters.py      # Character REST API tests
│   ├── test_combat_tracker.py  # CombatState / GameStateManager combat unit tests
│   ├── test_context_management.py  # Rolling-window summarisation + cross-session continuity
│   ├── test_dm_brain.py        # DungeonMaster unit tests (mocked Anthropic SDK)
│   ├── test_game_state.py      # GameStateManager unit tests
│   ├── test_map_generator.py   # BSP dungeon generator unit tests
│   ├── test_npc_router.py      # NPC REST endpoint integration tests
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
| `PUT` | `/api/campaigns/{id}` | ✓ | Update name / description |
| `DELETE` | `/api/campaigns/{id}` | ✓ | Delete campaign and all related data |
| `GET` | `/api/campaigns/{id}/export` | ✓ | Download a full campaign bundle as JSON |
| `POST` | `/api/campaigns/import` | — | Create a campaign from an exported bundle |
| `POST` | `/api/campaigns/{id}/rotate-access-code` | ✓ | Generate a new access code (old code immediately invalid) |
| `GET` | `/api/campaigns/{id}/sessions` | — | List sessions for a campaign |
| `POST` | `/api/campaigns/{id}/sessions` | ✓ | Start a new session |
| `PUT` | `/api/campaigns/sessions/{session_id}/end` | ✓ | End an active session |
| `GET` | `/api/campaigns/sessions/{session_id}/notes` | — | Get collaborative session notes |
| `PUT` | `/api/campaigns/sessions/{session_id}/notes` | — | Replace collaborative session notes |
| `GET` | `/api/campaigns/sessions/{session_id}/pins` | — | Get pinned notes for a session |
| `PUT` | `/api/campaigns/sessions/{session_id}/pins` | — | Replace pinned notes (broadcasts `pinned_update`) |
| `GET` | `/api/campaigns/sessions/{session_id}/dm-notes` | ✓ | Get private DM notes for a session |
| `PUT` | `/api/campaigns/sessions/{session_id}/dm-notes` | ✓ | Replace private DM notes |
| `POST` | `/api/campaigns/sessions/{session_id}/recap` | — | Generate AI session recap (Claude Haiku) |
| `GET` | `/api/campaigns/{id}/map` | — | Get dungeon map (auto-generates on first call) |
| `POST` | `/api/campaigns/{id}/map/generate` | ✓ | Regenerate the dungeon map |
| `GET` | `/api/campaigns/{id}/map/annotations` | — | Get DM map annotation pins |
| `PUT` | `/api/campaigns/{id}/map/annotations` | ✓ | Replace map annotations (broadcasts `map_annotation_update`) |
| `GET` | `/api/campaigns/{id}/world-time` | — | Get world clock / weather state |
| `PUT` | `/api/campaigns/{id}/world-time` | ✓ | Update world clock / weather (broadcasts `time_update`) |
| `GET` | `/api/campaigns/{id}/npcs` | — | List all NPCs for a campaign |
| `GET` | `/api/campaigns/{id}/quests` | — | List all quests for a campaign |
| `GET` | `/api/campaigns/{id}/party` | — | Get party shared gold + items |
| `PUT` | `/api/campaigns/{id}/party` | ✓ | Update party shared gold + items |
| `GET` | `/api/campaigns/{id}/handouts` | — | List player handouts |
| `POST` | `/api/campaigns/{id}/handouts` | ✓ | Create a handout (broadcasts `handout_push`) |
| `DELETE` | `/api/campaigns/{id}/handouts/{handout_id}` | ✓ | Delete a handout |
| `GET` | `/api/campaigns/{id}/timeline` | — | Get campaign timeline events |
| `POST` | `/api/campaigns/{id}/timeline` | ✓ | Add a timeline event |
| `DELETE` | `/api/campaigns/{id}/timeline/{entry_id}` | ✓ | Delete a timeline event |
| `GET` | `/api/campaigns/{id}/readalouds` | — | List read-aloud library entries |
| `POST` | `/api/campaigns/{id}/readalouds` | ✓ | Create a read-aloud entry |
| `DELETE` | `/api/campaigns/{id}/readalouds/{readaloud_id}` | ✓ | Delete a read-aloud entry |
| `POST` | `/api/campaigns/{id}/loot` | — | Generate AI loot (CR + environment) |
| `POST` | `/api/campaigns/{id}/generate-names` | — | Generate AI NPC names (race + count) |
| `GET` | `/api/campaigns/{id}/tables` | — | List random tables |
| `POST` | `/api/campaigns/{id}/tables` | — | Create a random table |
| `POST` | `/api/campaigns/{id}/tables/{table_id}/roll` | — | Roll on a random table |
| `DELETE` | `/api/campaigns/{id}/tables/{table_id}` | — | Delete a random table |

### Combat

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sessions/{session_id}/combat/next-turn` | ✓ | Advance initiative to the next combatant |
| `POST` | `/api/sessions/{session_id}/combat/end` | ✓ | End the active combat encounter |
| `POST` | `/api/sessions/{session_id}/combat/combatants` | ✓ | Add a combatant to the active encounter |
| `DELETE` | `/api/sessions/{session_id}/combat/combatants/{name}` | ✓ | Remove a combatant by name |
| `POST` | `/api/sessions/{session_id}/combat/roll-initiative` | ✓ | Auto-roll 1d20+DEX for all combatants |
| `PATCH` | `/api/sessions/{session_id}/combat/combatants/{name}/hp` | ✓ | Apply HP delta to a combatant |

### Characters

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/{campaign_id}/characters` | — | List characters in a campaign |
| `POST` | `/api/{campaign_id}/characters` | ✓ | Create a character |
| `GET` | `/api/characters/{id}` | — | Get a character |
| `PUT` | `/api/characters/{id}` | ✓ | Update a character (PATCH semantics) |
| `DELETE` | `/api/characters/{id}` | ✓ | Delete a character |
| `GET` | `/api/characters/{id}/audit-log` | — | Get the character's timestamped change history |

### TTS

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tts/providers` | List available TTS providers |
| `POST` | `/api/tts/synthesize` | Synthesise speech; returns `audio/mpeg` blob |

### Meta

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | DB liveness probe; returns `{"status":"ok","db":"ok"}` or `{"status":"degraded","db":"error"}` |

**Auth** (✓): include the campaign's access code in the `X-Access-Code` request header.

---

## WebSocket Protocol

Connect to `ws://<host>/ws/{session_id}?player_id=<id>&player_name=<name>&access_code=<code>`.

- Omitting `access_code` grants read-only **spectator** access.
- A wrong non-empty `access_code` is rejected with close code **4403**.

### Client → Server

| `type` | Payload fields | Description |
|---|---|---|
| `join_session` | `player_name`, `character_id?` | Register in the session room |
| `player_action` | `text` | Submit a narrative action |
| `voice_transcript` | `text` | STT-derived action (treated identically to `player_action`) |
| `dice_image` | `image` (base64), `roll_request_id?` | Camera frame for Vision dice detection |
| `manual_roll` | `roll_request_id`, `total`, `values`, `modifier` | Manual dice entry for a pending roll request |
| `dice_result` | `roll_request_id`, `total`, `values`, `modifier` | Physical dice result (camera-confirmed) |
| `pong` | — | Keepalive reply to server `ping`; no response sent |
| `ooc_message` | `player_id`, `player_name`, `text` | Out-of-character chat message |
| `ambient_update` | `sound` | DM broadcasts ambient audio selection to all clients |
| `ready_check` | `message` | DM polls all players with a ready-check prompt |
| `ready_response` | `player_id`, `player_name`, `ready` | Player responds to a ready check |
| `dm_secret_roll` | `dice`, `reason` | DM rolls dice server-side; result sent only to this socket |
| `scene_marker` | `title` | DM inserts a named scene break into the narrative log |
| `voice_recording` | `player_id`, `active` | Relay push-to-talk state to other players |
| `combat_use_reaction` | `name` | Mark a combatant's reaction as used |
| `combat_reset_reactions` | — | Reset all combatant reactions in the current encounter |
| `combat_legendary_action` | `name`, `delta` | Adjust a combatant's legendary action counter |

### Server → Client

| `type` | Key fields | Description |
|---|---|---|
| `joined` | `session_id`, `player_id`, `player_name`, `is_spectator` | Confirms the player joined |
| `player_joined` | `player_id`, `player_name` | Broadcast to others when someone joins |
| `player_left` | `player_id`, `player_name` | Broadcast when a player disconnects |
| `ping` | — | Keepalive heartbeat sent every 30 s |
| `dm_chunk` | `text` | Incremental streaming text from Claude |
| `dm_response_complete` | `text` | Full DM response once streaming finishes |
| `dice_request` | `roll_request_id`, `player_id`, `dice`, `skill`, `dc?`, `advantage?`, `disadvantage?` | DM requests a player roll |
| `dice_result` | `dice?`, `values`, `modifier`, `total`, `roller`, `player_id?`, `roll_request_id?`, `secret?`, `manual?` | A roll result (DM or player) |
| `state_update` | `character` | Live character stat update after a tool call |
| `map_update` | `explored_rooms` | Updated list of explored room IDs after `reveal_area` |
| `map_annotation_update` | `annotations` | DM map pins updated via REST |
| `combat_update` | `active`, `round`, `turn_index`, `combatants` | Full combat tracker state |
| `npc_update` | `npcs` | Full NPC registry after `upsert_npc` |
| `quest_update` | `quests` | Full quest list after `upsert_quest` |
| `party_update` | `gold`, `items` | Shared party state after `update_party_state` |
| `pinned_update` | `pins` | Pinned session notes updated via REST |
| `time_update` | `world_time` | World clock / weather updated via REST |
| `handout_push` | `handout` | New handout pushed to players |
| `ambient_update` | `sound` | Ambient audio selection broadcast |
| `ooc_broadcast` | `player_id`, `player_name`, `text`, `timestamp` | Out-of-character chat message broadcast |
| `ready_check` | `message`, `from_player_id` | Ready-check poll broadcast |
| `ready_response` | `player_id`, `player_name`, `ready` | Player ready-check response broadcast |
| `scene_marker` | `title` | Scene break broadcast to all players |
| `voice_recording` | `player_id`, `active` | Push-to-talk state relayed to all other players |
| `secret_roll_result` | `dice`, `values`, `total`, `modifier`, `reason` | Secret roll result sent only to the requesting socket |
| `scene_image` | `url`, `description` | AI-generated scene illustration |
| `system` | `text` | Generic server notice (session lifecycle, prior-session recap) |
| `error` | `message` | Error description |

---

## Running Tests

### Backend

```bash
# From the project root
pytest
```

### Frontend

```bash
cd frontend
npm test          # watch mode
npm run test:run  # single pass (CI)
```

### E2E (Playwright)

```bash
cd frontend
npm run build    # or: npm run dev in a separate terminal
npm run e2e      # runs all tests in frontend/e2e/
```

Tests mock all API responses, so no running backend is required.

---

## Multiplayer Setup

All players connect to the same `session_id`. A session is created via the REST API (or the UI's "Start New Session" button) and then shared as a URL or room code.

- **Solo**: one browser tab, one player
- **Local co-op**: multiple browser tabs or devices on the same network pointing at the same backend
- **Remote**: expose the backend (e.g. via a tunnel or cloud deploy) and share the session URL

The WebSocket hub broadcasts all DM narration, dice results, map reveals, and state updates to every connected player in the room simultaneously.

### Invite Links

The player who created the campaign holds its access code and is considered the DM. To invite others:

1. In the Campaign Detail view or the session top-bar, click **Invite** (DM-only button).
2. A URL is copied to the clipboard: `https://<host>/?campaign=<id>&code=<token>`.
3. Recipients open the link — the app reads the params on startup, stores the token, and navigates directly to the campaign.

The access code grants write access (start sessions, update characters) but does **not** grant DM UI controls; those are reserved for the client that holds the token in `localStorage` from the original campaign creation.

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

## Developer Setup

Install dev dependencies and pre-commit hooks:

```bash
pip install -r requirements-dev.txt
pre-commit install
```

Pre-commit runs ruff (Python linting) and standard file checks on every commit.
Run the full CI suite locally:
```bash
# Backend
python -m pytest tests/ -x -q

# Frontend
cd frontend && npm run build
```

---

## Development Notes

- The frontend dev server proxies `/api` and `/ws` to `http://localhost:8000` via Vite's built-in proxy.
- The Anthropic API key is never exposed to the browser; all Claude calls happen server-side.
- `GameStateManager` holds in-memory session state (pending rolls, combat tracker, connected players) that is **not** persisted across server restarts. Persistent data (messages, character HP, world state, dungeon maps, NPC registry) is always written to the database immediately.
- **WS keepalive**: the server sends `{"type":"ping"}` every 30 seconds from the `_ws_keepalive` async task; the client must reply with `{"type":"pong"}`. The keepalive task is cancelled in the WebSocket handler's `finally` block.
- **Secret rolls**: the `dm_secret_roll` WS message triggers a server-side dice roll whose result is sent only to the requesting socket via `send_to_socket`, never broadcast to other players.
- **Rate limiting**: sliding-window (60 req/min/IP) implemented in-memory using `collections.defaultdict(deque)` and `time.monotonic()`. Loopback IPs (`127.0.0.1`, `::1`, `localhost`) and the test client are exempt.
- **PWA**: `frontend/public/manifest.json` + `frontend/public/sw.js` cache-first service worker registered in `main.tsx`. The app is installable on desktop and mobile.
- **Character features**: the `features` JSON column stores `[{id, name, description, uses_remaining, uses_max, recharge}]` objects. The `feature_use` field in `CharacterUpdate` (and the equivalent WS payload) accepts `{feature_id, delta}` to atomically adjust `uses_remaining`.
- **Session recap**: `POST /api/campaigns/sessions/{id}/recap` calls Claude Haiku with session notes and pinned notes as context; returns `{"recap": "...text..."}`.
- Dice rolls triggered by Claude tools are server-side only. Camera-detected and manual rolls come from the client and are trusted as submitted.
- The dungeon map is generated once per campaign and stored in `campaign.map_data`. Use `POST /api/campaigns/{id}/map/generate` (with access code) to regenerate it; note that this resets `explored_rooms` too.
- Combat state lives only in memory. If the server restarts mid-combat the tracker will be empty on reconnect, though character HP already updated by `update_character` tool calls is persisted normally.
- Scene illustration requires `OPENAI_API_KEY`. If the key is absent, `generate_scene_image` raises a `RuntimeError` which surfaces as a system error message in the narrative log; the session continues normally.
- NPC records are stored in the `campaign.npcs` JSON column. The DM's `upsert_npc` tool matches existing NPCs by `id` (a snake_case slug) so repeat calls update rather than duplicate.
- Quest records are stored in the `campaign.quests` JSON column. Only active quests are expanded in the DM system prompt — completed and failed quests appear as a count to keep token usage bounded.
- `isDM` is derived entirely on the frontend from whether a campaign access token exists in `campaignTokens` (Zustand / `localStorage`). There is no separate backend role concept; the access code is the sole credential.
- The virtual dice roller uses `crypto.getRandomValues` for cryptographically uniform results — not `Math.random()`. When a `pendingRoll` is active the roller pre-selects the requested die type from the `NdX` notation and its Submit button sends the result to the server as a `manual_roll` WebSocket message.
- Context summarisation uses `claude-haiku-4-5-20251001` for cost efficiency. The rolling threshold and keep-recent window are configurable via `SUMMARY_THRESHOLD` and `SUMMARY_KEEP_RECENT` in `backend/main.py`.
