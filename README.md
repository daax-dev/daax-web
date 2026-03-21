# Daax-Web

**Web-based development workbench** with integrated terminal, AI coding tools, and code editor.

## Overview

Daax-Web provides a browser-based interface for managing development sessions. Built on Next.js 16 with React 19, it features xterm.js terminal emulation, asciinema v2 recording, and rrweb session replay. Designed for Tailscale network deployment.

## Features

- **Integrated Terminal**: xterm.js with WebSocket backend (port 4201)
- **AI Coding Tools**: Claude Code, Aider integration
- **Session Recording**: asciinema v2 format terminal recording
- **Session Replay**: rrweb-based replay capability
- **Plugin Architecture**: Extensible feature system
- **Dark/Light Themes**: CSS variable-based theming

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Access at http://localhost:4200
```

## Deployment Modes

### Host Mode (Development)

```bash
bun install
bun dev
```

### Container Mode (Production)

```bash
docker build -t daax-web .
docker run -d -p 4200:4200 -p 4201:4201 daax-web
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage with feature cards |
| `/shell` | Interactive terminal |
| `/ai-coding` | AI coding agents |
| `/code-server` | VS Code in browser |
| `/mcp` | MCP catalog |
| `/analytics` | System stats |
| `/settings` | App settings |

## Tech Stack

- **Framework**: Next.js 16+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4+
- **Components**: shadcn/ui (Radix primitives)
- **Terminal**: xterm.js
- **Recording**: asciinema v2
- **Replay**: rrweb
- **Package Manager**: bun

## Commands

```bash
# Development
bun dev              # Start dev server (ports 4200, 4201)
bun run build        # Production build
bun start            # Run production

# Quality
bun run lint         # ESLint
bun run typecheck    # TypeScript checking
bun run format:write # Prettier formatting

# Components
bunx shadcn@latest add <name>  # Add UI component
```

## Architecture

```
daax-web/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   ├── layout/      # Layout components
│   └── terminal/    # Terminal components
├── hooks/           # React hooks
├── lib/             # Utilities and helpers
├── plugins/         # Plugin system
├── server/          # Backend services
│   └── terminal-server.ts  # WebSocket server
├── scripts/         # Build/deploy scripts
├── tests/           # Test files
├── types/           # TypeScript types
├── data/            # Static data files
├── examples/        # Usage examples
└── packages/        # Internal packages
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_TERMINAL_WS_URL=ws://localhost:4201
NEXT_PUBLIC_API_URL=http://localhost:4200/api
```

## Integration

- **Terminal Server**: WebSocket on port 4201
- **daax-cli**: Session registration
- **hawkeye**: Job API integration
- **watchtower**: Session monitoring display

## Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant guidance
- [Plugin Development](./docs/plugins.md) - Plugin guide

## License

See LICENSE file.
