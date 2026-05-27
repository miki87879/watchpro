# ══════════════════════════════════════════════════════════════
#  Stage 1 — Build React frontend
# ══════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline

COPY frontend/ ./

# In production the API is on the same domain → empty base URL
ENV VITE_API_URL=
RUN npm run build

# ══════════════════════════════════════════════════════════════
#  Stage 2 — Python backend + bundled frontend
# ══════════════════════════════════════════════════════════════
FROM python:3.11-slim

# System deps for fpdf2 Hebrew fonts (none extra needed — fonts are embedded)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend into backend/static (served by FastAPI SPA fallback)
COPY --from=frontend-builder /app/frontend/dist ./static

# Persistent data directory (mount a Railway volume here)
# SQLite DB + uploads will live under /data
ENV DATA_DIR=/data

# Copy and enable startup script (creates /data symlinks + starts server)
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 8000

CMD ["/startup.sh"]
