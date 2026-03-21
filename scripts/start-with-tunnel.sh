#!/bin/bash

# Start Daax with Cloudflare Tunnel
# This script starts the Next.js dev server and creates a Cloudflare tunnel

set -e

PORT=${PORT:-4200}
DEV_URL="http://localhost:$PORT"

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
  echo "❌ cloudflared is not installed"
  echo "Run: ./scripts/setup-cloudflare-tunnel.sh"
  exit 1
fi

echo "🚀 Starting Daax with Cloudflare Tunnel..."
echo ""

# Function to cleanup background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $DEV_PID 2>/dev/null || true
  kill $TUNNEL_PID 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

# Start Next.js dev server in background
echo "📦 Starting Next.js development server on port $PORT..."
npm run dev &
DEV_PID=$!

# Wait for dev server to be ready
echo "⏳ Waiting for dev server to start..."
sleep 5

# Start Cloudflare tunnel
echo ""
echo "🌐 Starting Cloudflare Tunnel..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cloudflared tunnel --url "$DEV_URL" &
TUNNEL_PID=$!

# Keep script running
echo ""
echo "✅ Services running:"
echo "   • Next.js dev server: $DEV_URL"
echo "   • Cloudflare tunnel: (URL shown above)"
echo ""
echo "🎮 Access Tetris at: /tetris"
echo ""
echo "Press Ctrl+C to stop all services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
