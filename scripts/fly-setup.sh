#!/usr/bin/env bash
# fly-setup.sh — one-time Fly.io first-deploy setup for AI Dungeon Master
#
# Usage:
#   chmod +x scripts/fly-setup.sh
#   ./scripts/fly-setup.sh
#
# What this script does:
#   1. Checks that flyctl is installed and you are logged in
#   2. Creates the Fly.io app
#   3. Asks whether you want SQLite (simpler) or PostgreSQL (recommended)
#   4. Creates the database (volume or managed Postgres)
#   5. Sets required secrets on the app
#   6. Prints the GitHub Actions secret you need to add
#   7. Runs the first deploy
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${GREEN}▶${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }
heading() { echo -e "\n${BOLD}$*${NC}"; }
ask()     { echo -e "${YELLOW}?${NC}  $1"; read -rp "  → " "$2"; }
askpass() { echo -e "${YELLOW}?${NC}  $1"; read -rsp "  → " "$2"; echo; }

APP_NAME="ai-dungeon-master"
REGION="sin"

heading "AI Dungeon Master — Fly.io setup"
echo "This script will deploy the app to https://${APP_NAME}.fly.dev"
echo "It takes about 5 minutes."

# ── 1. Check prerequisites ─────────────────────────────────────────────────
heading "Step 1/7 — Checking prerequisites"

if ! command -v flyctl &>/dev/null; then
  error "flyctl is not installed.\nInstall it with: curl -L https://fly.io/install.sh | sh\nThen run: fly auth login"
fi
info "flyctl found: $(flyctl version 2>/dev/null | head -1)"

if ! flyctl auth whoami &>/dev/null; then
  warn "You are not logged in to Fly.io."
  info "Opening browser to log in..."
  flyctl auth login
fi
info "Logged in as: $(flyctl auth whoami)"

# ── 2. Create the app ─────────────────────────────────────────────────────
heading "Step 2/7 — Creating the Fly.io app"

if flyctl apps list 2>/dev/null | grep -q "^${APP_NAME}"; then
  info "App '${APP_NAME}' already exists — skipping creation."
else
  flyctl apps create "${APP_NAME}"
  info "App created."
fi

# ── 3. Database choice ────────────────────────────────────────────────────
heading "Step 3/7 — Database setup"
echo ""
echo "  A) SQLite on a persistent volume — simpler, zero extra cost"
echo "     Best for: hobby projects, single machine"
echo ""
echo "  B) Fly Managed PostgreSQL — daily backups, multi-machine ready"
echo "     Best for: production use, data you can't afford to lose"
echo ""
ask "Choose database option [A/B, default: A]:" DB_CHOICE
DB_CHOICE="${DB_CHOICE:-A}"
DB_CHOICE="${DB_CHOICE^^}"   # uppercase

if [[ "${DB_CHOICE}" == "A" ]]; then
  info "Setting up SQLite volume..."
  if flyctl volumes list --app "${APP_NAME}" 2>/dev/null | grep -q "dm_data"; then
    info "Volume 'dm_data' already exists — skipping."
  else
    flyctl volumes create dm_data \
      --region "${REGION}" \
      --size 1 \
      --app "${APP_NAME}"
    info "Volume created (1 GB, region ${REGION})."
  fi
  DB_URL="sqlite+aiosqlite:////data/dungeon_master.db"

elif [[ "${DB_CHOICE}" == "B" ]]; then
  PG_APP="${APP_NAME}-db"
  info "Setting up Fly Managed PostgreSQL..."
  if flyctl apps list 2>/dev/null | grep -q "^${PG_APP}"; then
    info "Postgres app '${PG_APP}' already exists — skipping creation."
  else
    flyctl postgres create \
      --name "${PG_APP}" \
      --region "${REGION}" \
      --initial-cluster-size 1 \
      --vm-size shared-cpu-1x \
      --volume-size 10
  fi
  info "Attaching Postgres to the app (sets DATABASE_URL automatically)..."
  if ! flyctl postgres attach "${PG_APP}" --app "${APP_NAME}" 2>&1 | tee /tmp/fly_attach.log; then
    if grep -qi "already" /tmp/fly_attach.log; then
      warn "Postgres already attached — skipping."
    else
      cat /tmp/fly_attach.log >&2
      error "Failed to attach Postgres. DATABASE_URL will not be set. Aborting."
    fi
  fi
  DB_URL=""   # set by attach
  info "PostgreSQL attached. DATABASE_URL will be set automatically."
else
  error "Invalid choice '${DB_CHOICE}'. Run the script again and type A or B."
fi

# ── 4. Collect secrets ────────────────────────────────────────────────────
heading "Step 4/7 — Collecting secrets"

askpass "Anthropic API key (required — get one at https://console.anthropic.com/):" ANTHROPIC_KEY
[[ -z "${ANTHROPIC_KEY}" ]] && error "ANTHROPIC_API_KEY cannot be empty."

ask "ElevenLabs API key (optional — press Enter to skip):" EL_KEY
ask "OpenAI API key (optional — enables DALL-E images + OpenAI TTS, press Enter to skip):" OAI_KEY
ask "Admin key for backup endpoint (optional — press Enter to leave disabled):" ADMIN_KEY_VAL

PROD_URL="https://${APP_NAME}.fly.dev"

# ── 5. Set secrets ────────────────────────────────────────────────────────
heading "Step 5/7 — Setting secrets on Fly.io"

SECRETS_CMD=(flyctl secrets set
  "ANTHROPIC_API_KEY=${ANTHROPIC_KEY}"
  "CORS_ORIGINS=${PROD_URL}"
  --app "${APP_NAME}"
)
[[ -n "${DB_URL}" ]]        && SECRETS_CMD+=("DATABASE_URL=${DB_URL}")
[[ -n "${EL_KEY}" ]]        && SECRETS_CMD+=("ELEVENLABS_API_KEY=${EL_KEY}")
[[ -n "${OAI_KEY}" ]]       && SECRETS_CMD+=("OPENAI_API_KEY=${OAI_KEY}")
[[ -n "${ADMIN_KEY_VAL}" ]] && SECRETS_CMD+=("ADMIN_KEY=${ADMIN_KEY_VAL}")

"${SECRETS_CMD[@]}"
info "Secrets set."

# ── 6. GitHub Actions token ────────────────────────────────────────────────
heading "Step 6/7 — GitHub Actions deploy token"

info "Creating a long-lived deploy token..."
echo ""
echo -e "${BOLD}  ╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}  ║  Copy the token printed below and add it to GitHub:         ║${NC}"
echo -e "${BOLD}  ║  Repo → Settings → Secrets → Actions → FLY_API_TOKEN       ║${NC}"
echo -e "${BOLD}  ╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
flyctl tokens create deploy -x 999999h --app "${APP_NAME}"
echo ""
warn "Do this now before continuing — you will not see the token again."
ask "Press Enter once you have saved the token to GitHub Secrets:" _CONFIRM

# ── 7. First deploy ────────────────────────────────────────────────────────
heading "Step 7/7 — First deploy"

ask "Run the first deploy now? [Y/n]:" DEPLOY_NOW
DEPLOY_NOW="${DEPLOY_NOW:-Y}"
if [[ "${DEPLOY_NOW^^}" == "Y" ]]; then
  info "Building and deploying (this takes a few minutes on first run)..."
  flyctl deploy --remote-only --app "${APP_NAME}"
  echo ""
  info "Deploy complete!"
  echo ""
  echo -e "  🌍  App URL:    ${BOLD}${PROD_URL}${NC}"
  echo -e "  ❤️   Health:    ${BOLD}${PROD_URL}/health${NC}"
  echo -e "  📋  Dashboard: ${BOLD}https://fly.io/apps/${APP_NAME}${NC}"
else
  info "Skipped. Future deploys happen automatically when you push to main."
fi

echo ""
heading "All done!"
echo "  • Every push to main triggers a deploy automatically via GitHub Actions."
echo "  • View logs:    flyctl logs --app ${APP_NAME}"
echo "  • Open app:     flyctl open --app ${APP_NAME}"
echo "  • SSH into app: flyctl ssh console --app ${APP_NAME}"
echo ""
