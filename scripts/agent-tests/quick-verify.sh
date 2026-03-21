#!/bin/bash
# Quick Verification Script for Daax
#
# Runs essential checks to verify daax is working after changes.
# Use this after rebuilding/deploying to catch regressions quickly.
#
# Usage:
#   ./scripts/agent-tests/quick-verify.sh
#   DAAX_BASE_URL=http://custom-host:4200 ./scripts/agent-tests/quick-verify.sh

# Don't exit on first failure - we want to run all checks
# set -e

BASE_URL="${DAAX_BASE_URL:-http://localhost:4200}"
PASS=0
FAIL=0

echo "================================"
echo "Daax Quick Verification"
echo "Base URL: $BASE_URL"
echo "================================"
echo ""

check_status() {
    local name="$1"
    local path="$2"
    local expected="$3"

    echo -n "Checking: $name... "

    result=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}${path}" 2>/dev/null) || result="ERROR"

    if [[ "$result" == *"$expected"* ]]; then
        echo "PASS"
        PASS=$((PASS + 1))
    else
        echo "FAIL (expected '$expected', got: ${result:0:50}...)"
        FAIL=$((FAIL + 1))
    fi
}

check_body() {
    local name="$1"
    local path="$2"
    local expected="$3"

    echo -n "Checking: $name... "

    result=$(curl -s "${BASE_URL}${path}" 2>/dev/null) || result="ERROR"

    if [[ "$result" == *"$expected"* ]]; then
        echo "PASS"
        PASS=$((PASS + 1))
    else
        echo "FAIL (expected '$expected', got: ${result:0:50}...)"
        FAIL=$((FAIL + 1))
    fi
}

check_raw() {
    local name="$1"
    local url="$2"
    local expected="$3"

    echo -n "Checking: $name... "

    result=$(curl -s "$url" 2>&1) || result="ERROR"

    if [[ "$result" == *"$expected"* ]]; then
        echo "PASS"
        PASS=$((PASS + 1))
    else
        echo "FAIL (expected '$expected', got: ${result:0:50}...)"
        FAIL=$((FAIL + 1))
    fi
}

# Page load tests
check_status "Homepage loads" "/" "200"
check_status "Shell page loads" "/shell" "200"
check_status "AI Coding page loads" "/ai-coding" "200"
check_status "MCP page loads" "/mcp" "200"
check_status "Settings page loads" "/settings" "200"
check_status "Analytics page loads" "/analytics" "200"

# API endpoint tests
check_body "Terminal recordings API" "/api/terminal-recordings" "recordings"
check_body "AI sessions API" "/api/ai/sessions" "sessions"
check_body "Testcontainers API" "/api/testcontainers" "containers"
check_body "Backlog status API" "/api/backlog/status" "running"

# Protected endpoint should require auth
check_status "Secrets API requires auth" "/api/secrets" "401"

# WebSocket endpoint check (should return upgrade required)
# Derive terminal server host from BASE_URL (port 4201 on same host)
TERMINAL_HOST=$(echo "$BASE_URL" | sed -E 's|https?://([^:/]+).*|\1|')
check_raw "Terminal WebSocket endpoint" "http://${TERMINAL_HOST}:4201/" "Upgrade"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [ $FAIL -gt 0 ]; then
    echo "VERIFICATION FAILED"
    exit 1
else
    echo "ALL CHECKS PASSED"
    exit 0
fi
