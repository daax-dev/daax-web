#!/bin/bash

# Camp Half-Blood Tetris - Cloudflare Tunnel Launcher
# This script starts the Daax server and exposes it via Cloudflare Tunnel

set -e

echo "🏛️  Camp Half-Blood Tetris - Starting Cloudflare Tunnel"
echo "=================================================="
echo ""

# Check if cloudflared exists
if [ ! -f "./cloudflared" ]; then
    echo "📥 Downloading cloudflared..."
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" -o cloudflared
    chmod +x cloudflared
fi

echo "✓ Cloudflared ready"
echo ""

# Check if development server is running
if ! curl -s http://localhost:4200 > /dev/null 2>&1; then
    echo "⚠️  Development server not detected on port 4200"
    echo ""
    echo "Please start the Daax server in another terminal:"
    echo "  npm run dev"
    echo ""
    echo "Or use port 3000 if you have Next.js running there:"
    echo "  ./start-tetris-tunnel.sh 3000"
    echo ""
    exit 1
fi

PORT=${1:-4200}
echo "🚀 Starting Cloudflare Tunnel on port $PORT..."
echo ""
echo "Your game will be accessible at a public URL (shown below)"
echo "Press Ctrl+C to stop the tunnel"
echo ""
echo "=================================================="
echo ""

./cloudflared tunnel --url http://localhost:$PORT
