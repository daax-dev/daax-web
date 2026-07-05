#!/bin/bash
# Daax Tailscale Setup Script
# Automatically configures .env with your Tailscale IP

set -e

echo "Daax Tailscale Setup"
echo "========================="
echo

# Check if tailscale is available
if ! command -v tailscale &> /dev/null; then
    echo "Error: tailscale CLI not found"
    echo "Install Tailscale: https://tailscale.com/download"
    exit 1
fi

# Get Tailscale IP
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

if [ -z "$TAILSCALE_IP" ]; then
    echo "Error: Could not get Tailscale IP"
    echo "Make sure Tailscale is connected: tailscale status"
    exit 1
fi

echo "Detected Tailscale IP: $TAILSCALE_IP"
echo

# Get workspace path
DEFAULT_WORKSPACE="$HOME/ps"
read -p "Workspace path [$DEFAULT_WORKSPACE]: " WORKSPACE
WORKSPACE=${WORKSPACE:-$DEFAULT_WORKSPACE}

# Expand ~ to $HOME
WORKSPACE="${WORKSPACE/#\~/$HOME}"

if [ ! -d "$WORKSPACE" ]; then
    echo "Warning: Workspace directory doesn't exist: $WORKSPACE"
    read -p "Create it? [y/N]: " CREATE_DIR
    if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
        mkdir -p "$WORKSPACE"
        echo "Created: $WORKSPACE"
    fi
fi

# Create .env file
ENV_FILE="$(dirname "$0")/../.env"

cat > "$ENV_FILE" << EOF
# Daax Configuration (auto-generated)
# Generated: $(date)

# Tailscale
TAILSCALE_IP=$TAILSCALE_IP
TERMINAL_WS_URL=ws://$TAILSCALE_IP:4201

# Workspace
DAAX_WORKSPACE=$WORKSPACE

# Container settings
# CLAUDE_CONTAINER_IMAGE is intentionally omitted: the default agent image is
# the digest-pinned ref in server/config/constants.ts (single source of truth,
# avoids digest drift, #195). Uncomment and set an explicit ref only to override.
# CLAUDE_CONTAINER_IMAGE=
CODE_SERVER_PORT=18080
EOF

echo
echo "Created .env file with:"
echo "  - Tailscale IP: $TAILSCALE_IP"
echo "  - Workspace: $WORKSPACE"
echo
echo "Next steps:"
echo "  1. Build: bun run docker:build"
echo "  2. Start: bun run docker:up"
echo "  3. Access: http://$TAILSCALE_IP:4200"
echo
