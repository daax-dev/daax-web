#!/bin/bash
# Agent-Browser UI Test Runner
#
# This script provides AI-accessible UI testing using agent-browser.
# AI agents (Claude Code, Cursor, etc.) can run these tests directly.
#
# Prerequisites:
#   npm install -g agent-browser
#   OR: brew install agent-browser  (macOS)
#
# Usage:
#   ./scripts/agent-tests/run-ui-tests.sh [test-name]
#   ./scripts/agent-tests/run-ui-tests.sh           # Run all tests
#   ./scripts/agent-tests/run-ui-tests.sh navigation  # Run navigation tests
#   ./scripts/agent-tests/run-ui-tests.sh terminal   # Run terminal tests

set -e

BASE_URL="${DAAX_BASE_URL:-http://localhost:4200}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if agent-browser is installed
if ! command -v agent-browser &> /dev/null; then
    echo "ERROR: agent-browser not found"
    echo "Install with: npm install -g agent-browser"
    exit 1
fi

# Test functions
test_navigation() {
    echo "=== Testing Navigation ==="

    # Test homepage
    echo "Testing: Homepage loads"
    agent-browser open "$BASE_URL"
    agent-browser snapshot -i
    agent-browser screenshot --path /tmp/daax-homepage.png

    # Test shell page
    echo "Testing: Shell page navigation"
    agent-browser open "$BASE_URL/shell"
    agent-browser wait 3000
    agent-browser snapshot -i

    # Test AI coding page
    echo "Testing: AI Coding page"
    agent-browser open "$BASE_URL/ai-coding"
    agent-browser wait 2000
    agent-browser snapshot -i

    # Test MCP page
    echo "Testing: MCP page"
    agent-browser open "$BASE_URL/mcp"
    agent-browser wait 2000
    agent-browser snapshot -i

    # Test settings
    echo "Testing: Settings page"
    agent-browser open "$BASE_URL/settings"
    agent-browser wait 2000
    agent-browser snapshot -i

    echo "=== Navigation tests complete ==="
}

test_terminal() {
    echo "=== Testing Terminal ==="

    agent-browser open "$BASE_URL/shell"
    agent-browser wait 5000

    echo "Testing: Terminal renders"
    agent-browser snapshot -i

    # Take screenshot for verification
    agent-browser screenshot --path /tmp/daax-terminal.png

    echo "=== Terminal tests complete ==="
}

test_api() {
    echo "=== Testing API Endpoints ==="

    # These are better tested with curl directly
    echo "Testing: /api/terminal-recordings"
    curl -s "$BASE_URL/api/terminal-recordings" | head -c 200
    echo ""

    echo "Testing: /api/ai/sessions"
    curl -s "$BASE_URL/api/ai/sessions" | head -c 200
    echo ""

    echo "Testing: /api/testcontainers"
    curl -s "$BASE_URL/api/testcontainers" | head -c 200
    echo ""

    echo "Testing: /api/mcp"
    curl -s "$BASE_URL/api/mcp" | head -c 200
    echo ""

    echo "=== API tests complete ==="
}

test_all() {
    test_navigation
    test_terminal
    test_api
}

# Main
TEST_NAME="${1:-all}"

case "$TEST_NAME" in
    navigation)
        test_navigation
        ;;
    terminal)
        test_terminal
        ;;
    api)
        test_api
        ;;
    all)
        test_all
        ;;
    *)
        echo "Unknown test: $TEST_NAME"
        echo "Available: navigation, terminal, api, all"
        exit 1
        ;;
esac

echo ""
echo "UI tests completed successfully!"
