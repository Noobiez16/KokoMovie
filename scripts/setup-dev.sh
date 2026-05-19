#!/usr/bin/env bash
set -euo pipefail

echo "KokoMovie PC — Dev Setup"

# Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "-> Add your TMDB API key: https://www.themoviedb.org/settings/api"
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Start Docker infrastructure
echo "Starting infrastructure (PostgreSQL, Redis, DynamoDB Local)..."
docker compose up -d db redis dynamodb-local

# Wait for DB
echo "Waiting for PostgreSQL..."
until docker compose exec -T db pg_isready -U kokomovie 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL ready."

# Run DB migrations
echo "Running migrations..."
npm run migrate --workspace=services/auth 2>/dev/null || true
npm run migrate --workspace=services/user 2>/dev/null || true
npm run migrate --workspace=services/catalog 2>/dev/null || true

# Generate RSA keys for Auth service
echo "Generating JWT signing keys..."
mkdir -p services/auth/keys
node scripts/generate-keys.mjs

echo ""
echo "Setup complete. Run 'npm run dev' to start."
echo ""
echo "  Auth:           http://localhost:3001"
echo "  Catalog:        http://localhost:3002"
echo "  Playback:       http://localhost:3003"
echo "  User:           http://localhost:3004"
echo "  Recommendation: http://localhost:3005"
echo ""
echo "IMPORTANT: Set your TMDB API key in .env before starting:"
echo "  TMDB_API_KEY=your_key_here"
