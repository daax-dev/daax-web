#!/bin/bash
# Update Traefik configuration on all machines

set -e

MACHINES=("muckross-wg" "kinsale-wg" "galway-wg" "adare-wg")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Error handling helper for consistent messaging
handle_error() {
    local operation="$1"
    local machine="$2"
    echo "⚠️  $operation failed on $machine; skipping to next machine"
}

# Parse arguments
SKIP_PULL=false
for arg in "$@"; do
    case $arg in
        --skip-pull)
            SKIP_PULL=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-pull    Skip 'docker compose pull' to save bandwidth"
            echo "                 (use for config-only updates when image hasn't changed)"
            echo "  --help, -h     Show this help message"
            exit 0
            ;;
    esac
done

echo "=== Daax Traefik Configuration Update ==="
echo ""
echo "This script will:"
echo "  1. Copy updated traefik.yml to each machine"
echo "  2. Add CODE_SERVER_URL to .env"
echo "  3. Reload Traefik to apply changes"
if [ "$SKIP_PULL" = true ]; then
    echo "  4. Restart Daax containers (skipping image pull)"
else
    echo "  4. Pull latest images and restart Daax containers"
fi
echo ""

for machine in "${MACHINES[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Processing: $machine"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check if machine is reachable
    if ! ssh "$machine" 'exit 0' 2>/dev/null; then
        echo "⚠️  Skipping $machine (not reachable)"
        echo ""
        continue
    fi

    # Get hostname without -wg suffix
    HOSTNAME="${machine%-wg}"

    echo "📁 Updating Traefik configuration..."
    # Create temp file with hostname substitution and verify write succeeded
    if ! awk -v host="$HOSTNAME" '{gsub(/HOSTNAME_PLACEHOLDER/, host)}1' \
        "$PROJECT_ROOT/deploy/traefik.yml" | \
        ssh "$machine" 'sudo tee /etc/traefik/dynamic/daax.yml > /dev/null'; then
        handle_error "Traefik config update" "$machine"
        continue
    fi

    echo "⚙️  Updating .env file..."
    # Add CODE_SERVER_URL if not present (check directory and file exist first)
    if ! ssh "$machine" "if [ -d /opt/daax ]; then \
        cd /opt/daax && \
        if [ -f .env ] && grep -q CODE_SERVER_URL .env; then \
            echo '✓ CODE_SERVER_URL already in .env'; \
        else \
            echo 'CODE_SERVER_URL=https://daax-code.$HOSTNAME.poley.dev/?folder=/workspace' >> .env; \
            echo '✓ Added CODE_SERVER_URL to .env'; \
        fi; \
    else \
        echo '⚠️  /opt/daax does not exist on this machine'; \
        exit 1; \
    fi"; then
        handle_error ".env update" "$machine"
        continue
    fi

    echo "🔄 Reloading Traefik..."
    ssh "$machine" 'sudo systemctl reload traefik' || echo "⚠️  Traefik reload failed (may not be running)"

    echo "🐳 Restarting Daax..."
    if [ "$SKIP_PULL" = true ]; then
        if ! ssh "$machine" 'cd /opt/daax && sudo docker compose up -d'; then
            handle_error "Docker compose restart" "$machine"
            continue
        fi
    else
        if ! ssh "$machine" 'cd /opt/daax && sudo docker compose pull && sudo docker compose up -d'; then
            handle_error "Docker compose pull/restart" "$machine"
            continue
        fi
    fi

    echo "✅ $machine updated successfully"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All machines updated!"
echo ""
echo "Routing configuration:"
echo "  - daax.{hostname}.poley.dev      -> Daax Web UI"
echo "  - daax.{hostname}.poley.dev/ws   -> Terminal WebSocket (path-based)"
echo "  - daax-code.{hostname}.poley.dev -> Code-Server"
echo ""
echo "Test steps:"
echo "  1. Open https://daax.{hostname}.poley.dev"
echo "  2. Start a terminal session - verify WebSocket connects"
echo "  3. Start an AI coding session - verify container spawns"
echo "  4. Navigate to Code Server page - verify it opens"
echo "  5. Check Analytics > Recordings for terminal logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
