#!/bin/bash
# Rebuild and Test Script for Daax
#
# Rebuilds the container and runs verification tests.
# Use this after making changes to ensure nothing is broken.
#
# Usage:
#   ./rebuild-test.sh           # Rebuild and run quick verification
#   ./rebuild-test.sh --full    # Rebuild and run full E2E tests
#   ./rebuild-test.sh --all     # Rebuild and run all tests

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================"
echo "Daax Rebuild & Test"
echo "================================"
echo ""

# Step 1: Rebuild
echo ">>> Step 1: Rebuilding container..."
./rebuild.sh

# Wait for container to be ready
echo ""
echo ">>> Waiting for container to be healthy..."
sleep 5

# Check container health
for i in {1..30}; do
    if curl -s http://localhost:4200/ > /dev/null 2>&1; then
        echo "Container is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

echo ""

# Step 2: Run tests based on arguments
case "${1:-quick}" in
    --full|--e2e)
        echo ">>> Step 2: Running full E2E tests..."
        DAAX_BASE_URL=http://localhost:4200 npx playwright test --reporter=list
        ;;
    --all)
        echo ">>> Step 2: Running all tests..."
        echo ""
        echo "--- Quick Verification ---"
        ./scripts/agent-tests/quick-verify.sh
        echo ""
        echo "--- Playwright E2E Tests ---"
        DAAX_BASE_URL=http://localhost:4200 npx playwright test --reporter=list
        ;;
    *)
        echo ">>> Step 2: Running quick verification..."
        ./scripts/agent-tests/quick-verify.sh
        ;;
esac

echo ""
echo "================================"
echo "Rebuild & Test Complete!"
echo "================================"
