# Deployment Guide

This guide covers running the app locally with Docker Compose and deploying it to [Fly.io](https://fly.io).

---

## Table of Contents

1. [Run locally with Docker Compose](#1-run-locally-with-docker-compose)
2. [Deploy to Fly.io (automated script)](#2-deploy-to-flyio-automated-script)
3. [Deploy to Fly.io (manual steps)](#3-deploy-to-flyio-manual-steps)
4. [How automated deploys work](#4-how-automated-deploys-work)
5. [Environment variables reference](#5-environment-variables-reference)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Run locally with Docker Compose

The fastest way to run the full stack locally (no Python or Node install needed).

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Clone the repo
git clone https://github.com/scwleung/ai_dungeon_master.git
cd ai_dungeon_master

# 2. Create your local config
cp .env.example .env
# Open .env and set ANTHROPIC_API_KEY to your key from https://console.anthropic.com/

# 3. Start the app
docker compose up --build

# 4. Open http://localhost:8000 in your browser
```

To stop: `Ctrl+C`, then `docker compose down`.

> **SQLite data** is stored in a Docker named volume (`db_data`) and survives container restarts.

---

## 2. Deploy to Fly.io (automated script)

An interactive script handles everything: creating the app, the database, setting secrets, and running the first deploy.

**Prerequisites:**
- A [Fly.io account](https://fly.io) (free tier is enough)
- `flyctl` CLI installed: `curl -L https://fly.io/install.sh | sh`
- An [Anthropic API key](https://console.anthropic.com/)

```bash
chmod +x scripts/fly-setup.sh
./scripts/fly-setup.sh
```

The script will:
1. Log you in to Fly.io if needed
2. Create the app `ai-dungeon-master`
3. Ask you to choose SQLite or PostgreSQL (see [database options](#database-options))
4. Prompt for your API keys
5. Set all secrets on the app
6. Generate a deploy token — **paste it into GitHub** when prompted (Settings → Secrets → Actions → `FLY_API_TOKEN`)
7. Run the first deploy

After that, every push to `main` deploys automatically.

---

## 3. Deploy to Fly.io (manual steps)

If you prefer to run each command yourself:

### Prerequisites

Install flyctl and log in:
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### Create the app

```bash
fly apps create ai-dungeon-master
```

### Database options

#### Option A — SQLite on a persistent volume (simpler)

```bash
fly volumes create dm_data --region sin --size 1 --app ai-dungeon-master

fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  DATABASE_URL="sqlite+aiosqlite:////data/dungeon_master.db" \
  CORS_ORIGINS="https://ai-dungeon-master.fly.dev" \
  --app ai-dungeon-master
```

Best for hobby projects. The volume holds the SQLite file across deploys. Limited to one machine at a time.

#### Option B — Fly Managed PostgreSQL (recommended for production)

```bash
fly postgres create \
  --name ai-dungeon-master-db \
  --region sin \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 10

# Attaches Postgres and sets DATABASE_URL automatically
fly postgres attach ai-dungeon-master-db --app ai-dungeon-master

fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  CORS_ORIGINS="https://ai-dungeon-master.fly.dev" \
  --app ai-dungeon-master
```

Includes daily automated backups and supports multiple machines. No code changes needed — the app auto-detects PostgreSQL.

### Optional secrets

```bash
fly secrets set \
  ELEVENLABS_API_KEY="..." \   # ElevenLabs TTS
  OPENAI_API_KEY="..." \       # DALL-E images + OpenAI TTS
  ADMIN_KEY="..." \            # Protect the /api/admin/backup endpoint
  --app ai-dungeon-master
```

### Set up the GitHub Actions deploy token

```bash
fly tokens create deploy -x 999999h --app ai-dungeon-master
```

Copy the printed token, then in GitHub go to **Settings → Secrets and variables → Actions → New repository secret**:
- Name: `FLY_API_TOKEN`
- Value: *(paste the token)*

### First deploy

```bash
flyctl deploy --remote-only
```

Fly builds the Docker image on its own servers — no local Docker needed for deploys.

---

## 4. How automated deploys work

Once `FLY_API_TOKEN` is set in GitHub Secrets, the pipeline is:

```
Push to main
  └─► CI runs (backend tests + frontend build + ruff lint)
        └─► All pass → Deploy workflow triggers
              └─► flyctl deploy --remote-only
                    └─► Live at https://ai-dungeon-master.fly.dev
```

Deploys only happen when **all CI checks pass**. A failing test blocks the deploy.

---

## 5. Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | — | Powers the AI Dungeon Master. Get one at [console.anthropic.com](https://console.anthropic.com/). |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./dungeon_master.db` | Database connection string. Supports SQLite and PostgreSQL. |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins. Set to your production URL in prod. |
| `ELEVENLABS_API_KEY` | No | *(disabled)* | Enables ElevenLabs high-quality TTS. |
| `OPENAI_API_KEY` | No | *(disabled)* | Enables DALL-E scene images and OpenAI TTS. |
| `ADMIN_KEY` | No | *(disabled)* | Secret for the `/api/admin/backup` endpoint. |

See `.env.example` for a ready-to-copy template.

---

## 6. Troubleshooting

**App won't start / `ANTHROPIC_API_KEY` error**
```bash
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." --app ai-dungeon-master
```

**Health check failing**
```bash
fly logs --app ai-dungeon-master          # view live logs
curl https://ai-dungeon-master.fly.dev/health
```

**Database errors after deploy**
Check that `DATABASE_URL` is set correctly:
```bash
fly secrets list --app ai-dungeon-master  # lists secret names (not values)
fly ssh console --app ai-dungeon-master   # SSH in and inspect
```

**WebSocket disconnects**
Fly's proxy handles WebSocket upgrades natively. If sessions drop, check that the app machine hasn't been stopped (`min_machines_running = 0` in `fly.toml` means the machine sleeps when idle). Set `min_machines_running = 1` in `fly.toml` to keep it always on.

**GitHub Actions deploy not triggering**
- Check that `FLY_API_TOKEN` is set in repo Settings → Secrets → Actions
- The deploy workflow only triggers when the `CI` workflow **passes** on `main`
- Check the Actions tab in GitHub for workflow run details

**View logs**
```bash
fly logs --app ai-dungeon-master          # tail live logs
fly logs --app ai-dungeon-master -n 100   # last 100 lines
```
