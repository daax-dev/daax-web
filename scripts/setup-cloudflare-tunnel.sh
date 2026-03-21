#!/bin/bash

# Cloudflare Tunnel Setup Script for Tetris
# This script installs cloudflared and sets up a tunnel for remote access

set -e

echo "🚀 Setting up Cloudflare Tunnel for Daax Tetris..."

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case $ARCH in
  x86_64)
    ARCH="amd64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ;;
  armv7l)
    ARCH="arm"
    ;;
esac

echo "Detected OS: $OS, Architecture: $ARCH"

# Check if cloudflared is already installed
if command -v cloudflared &> /dev/null; then
  echo "✅ cloudflared is already installed"
  cloudflared --version
else
  echo "📦 Installing cloudflared..."

  case $OS in
    linux)
      # Download and install for Linux
      DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${OS}-${ARCH}"

      curl -L "$DOWNLOAD_URL" -o cloudflared
      chmod +x cloudflared
      sudo mv cloudflared /usr/local/bin/

      echo "✅ cloudflared installed successfully"
      ;;

    darwin)
      # macOS installation via Homebrew
      if command -v brew &> /dev/null; then
        brew install cloudflared
      else
        echo "❌ Homebrew not found. Please install Homebrew first: https://brew.sh"
        exit 1
      fi
      ;;

    *)
      echo "❌ Unsupported OS: $OS"
      echo "Please install cloudflared manually from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
      exit 1
      ;;
  esac
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Start your Next.js development server:"
echo "   npm run dev  (or bun dev)"
echo ""
echo "2. In a separate terminal, start the Cloudflare tunnel:"
echo "   cloudflared tunnel --url http://localhost:4200"
echo ""
echo "3. Cloudflare will provide a public URL (e.g., https://xxx.trycloudflare.com)"
echo "4. Share that URL to access your Tetris game remotely!"
echo ""
echo "💡 For persistent tunnels, see: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/"
