# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Daax-Web** is a web-based development workbench with integrated terminal, AI coding tools, and code editor. Built on Next.js 16 with React 19, it provides a browser-based interface for managing development sessions. Designed for Tailscale network deployment.

## Deployment Modes

Daax-Web supports TWO deployment modes. **Always maintain both options.**

### 1. Host Mode (Development)

Run directly on the host machine:

```bash
bun install        # Install dependencies
bun dev            # Start dev server (port 4200 + terminal server 4201)
```

Access at: `http://localhost:4200`

### 2. Container Mode (Production/Tailscale)

Run inside a Docker container:

```bash
docker build -t daax-web .
docker run -d -p 4200:4200 -p 4201:4201 daax-web
```

Access at: `http://localhost:4200` or `http://<tailscale-ip>:4200`

## Commands

```bash
# Development
bun install          # Install dependencies
bun dev              # Development server (port 4200)
bun run build        # Production build
bun start            # Run production build

# Quality
bun run lint         # Run ESLint
bun run lint:fix     # Fix lint issues
bun run typecheck    # TypeScript type checking
bun run format:write # Format code with Prettier
bun run format:check # Check formatting

# Components
bunx shadcn@latest add <component-name>  # Add shadcn/ui component
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16+ with App Router |
| Language | TypeScript |
| Styling | Tailwind CSS v4+ with CSS variables |
| UI Components | shadcn/ui (Radix UI primitives) |
| Terminal | xterm.js |
| Recording | asciinema v2 format |
| Session Replay | rrweb |
| Package Manager | bun (preferred) |

## Architecture

```
daax-web/
├── app/                   # Next.js App Router pages
│   ├── layout.tsx        # Root layout with providers
│   ├── page.tsx          # Homepage
│   └── globals.css       # Global styles
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Layout components (Titlebar, etc.)
│   └── terminal/         # Terminal components
├── hooks/                # React hooks
├── lib/                  # Utilities and helpers
├── plugins/              # Plugin system for extensibility
├── server/
│   └── terminal-server.ts # WebSocket terminal server (port 4201)
├── scripts/              # Build and deployment scripts
├── tests/                # Test files
├── types/                # TypeScript definitions
├── data/                 # Static data files
├── examples/             # Usage examples
└── packages/             # Internal packages
```

## Key Pages

| Route | Purpose |
|-------|---------|
| `/` | Homepage with feature cards |
| `/shell` | Interactive terminal |
| `/ai-coding` | AI coding agents (Claude, Aider) |
| `/code-server` | VS Code in browser |
| `/mcp` | MCP catalog and management |
| `/analytics` | System stats and analytics |
| `/settings` | App settings |

> **`/code-server` image:** `daax-code-server:latest` is not on a public
> registry, but daax-web is self-contained — `rebuild.sh` /
> `deploy-local.sh` build it automatically from the vendored
> `deploy/code-server/Dockerfile` via `scripts/build-code-server.sh`
> (works on any machine, no sibling repos). For other start methods, run
> `./scripts/build-code-server.sh`, or set `CODE_SERVER_IMAGE` to supply
> your own. The API still pre-flights `docker image inspect` and returns
> `IMAGE_NOT_FOUND` (surfaced in the UI) as a fallback.

## Code Style Guidelines

### Colors and Theming
- **Never hardcode colors** like `text-blue-500`
- Use CSS variables: `text-foreground`, `bg-background`, `text-muted-foreground`
- Theme colors defined in `globals.css` using HSL variables

### Components
- Extract sub-components for repetitive code
- Single-statement arrow functions: `() => expression` (no brackets)
- Prefer `motion` library for animations over CSS transitions

### TypeScript
- Strict mode enabled
- Define shared types in `types/` directory

## Integration Points

- **Terminal Server (port 4201)**: WebSocket connections for terminal I/O
- **daax-cli**: Registers sessions for recording
- **hawkeye**: API integration for job submission and status
- **watchtower**: Session monitoring display

## Adding Components

```bash
# Add shadcn/ui components
bunx shadcn@latest add button card dialog tabs scroll-area
```

Components installed to `components/ui/`.

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_workflow_overview()` tool to load the tool-oriented overview.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
