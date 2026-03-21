# Daax Testing Guide

This document describes how to run tests for daax-web, including both Playwright E2E tests and agent-browser tests for AI-accessible testing.

## Rebuild & Test (Recommended)

**After making any changes, use the rebuild-test script:**

```bash
./rebuild-test.sh           # Rebuild + quick verify (12 curl checks)
./rebuild-test.sh --full    # Rebuild + full Playwright E2E (32 tests)
./rebuild-test.sh --all     # Rebuild + both test suites
```

Or via bun:

```bash
bun run rebuild-test        # Rebuild + quick verify
bun run rebuild-test:full   # Rebuild + full E2E
bun run rebuild-test:all    # Rebuild + all tests
```

## Quick Start (Tests Only)

```bash
# Run quick verification (curl-based, fast)
bun run test:verify

# Run all unit tests
bun test

# Run E2E tests with Playwright
bun run test:e2e

# Run everything
bun run test:all
```

## Test Types

### 1. Unit Tests (Vitest)

Located in `tests/` directory alongside the source code.

```bash
bun test              # Run all unit tests
bun run test:watch    # Watch mode
bun run test:ui       # UI mode (interactive)
```

### 2. E2E Tests (Playwright)

Located in `tests/e2e/` directory. These test the full application in a real browser.

```bash
# Run all E2E tests
bun run test:e2e

# Run with UI mode (see tests run in browser)
bun run test:e2e:ui

# Debug mode
bun run test:e2e:debug

# View last test report
bun run test:e2e:report
```

**Available test files:**
- `navigation.spec.ts` - Page navigation and loading
- `terminal.spec.ts` - Terminal functionality
- `ai-coding.spec.ts` - AI coding features
- `mcp.spec.ts` - MCP management
- `settings.spec.ts` - Settings page
- `api.spec.ts` - API endpoint tests

### 3. Quick Verification (Agent Tests)

Fast verification scripts for use after rebuilds/deploys.

```bash
# Quick verification (runs curl checks)
bun run test:verify

# Full agent-browser tests
bun run test:agent
```

## For AI Agents (Claude Code, Cursor, etc.)

AI agents can run the verification scripts directly:

```bash
# Quick check that app is working
./scripts/agent-tests/quick-verify.sh

# Full UI testing with agent-browser
./scripts/agent-tests/run-ui-tests.sh

# Run specific test suite
./scripts/agent-tests/run-ui-tests.sh navigation
./scripts/agent-tests/run-ui-tests.sh terminal
./scripts/agent-tests/run-ui-tests.sh api
```

### Prerequisites for agent-browser

```bash
# Install agent-browser globally
npm install -g agent-browser

# Or on macOS
brew install agent-browser
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DAAX_BASE_URL` | Base URL for tests | `http://localhost:4200` |
| `CI` | Set in CI environments | - |

## After Making Changes

Always run verification after changes:

```bash
# One command does it all:
./rebuild-test.sh

# Or for full E2E coverage:
./rebuild-test.sh --full
```

Manual steps (if needed):

```bash
# 1. Rebuild
./rebuild.sh

# 2. Verify
bun run test:verify

# 3. Run full E2E if needed
bun run test:e2e
```

## CI/CD Integration

The GitHub Actions workflow runs:
1. `bun test` - Unit tests
2. `bun run test:e2e` - E2E tests (with Playwright)
3. Build verification

## Troubleshooting

### E2E tests fail to connect
- Ensure daax is running: `docker ps | grep daax`
- Check logs: `docker logs daax`
- Verify port 4200 is accessible: `curl http://localhost:4200`

### Terminal tests timeout
- Terminal WebSocket runs on port 4201
- Check terminal server logs in container
- Increase timeout in test if needed

### Agent-browser not found
```bash
npm install -g agent-browser
```
