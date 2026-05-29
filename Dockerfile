# ── Stage 1: build the React frontend ─────────────────────────────────────────
FROM --platform=linux/amd64 node:22-alpine AS frontend-build

WORKDIR /app/frontend

# Install dependencies first (cached layer)
COPY frontend/package*.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY frontend/ ./
RUN npm run build


# ── Stage 2: production Python image ──────────────────────────────────────────
FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app

# Install Python deps (cached layer)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy the compiled frontend into the location the backend serves it from
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# SQLite database lives on a named volume; create the mount point
RUN mkdir -p /data

# Expose the single application port
EXPOSE 8080

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
