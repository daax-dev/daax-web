# MCP Inspector Plugin

Test and debug MCP (Model Context Protocol) servers using the official MCP Inspector tool.

## Features

- Launch MCP Inspector for any MCP in the catalog
- Support for stdio, SSE, and HTTP transports
- Configure environment variables for MCP servers
- Manage multiple running inspector instances
- Auto-opens inspector in new browser tab

## Usage

1. Navigate to **MCP Catalog** → **Inspector** tab
2. Select an MCP from the dropdown or configure manually
3. Choose transport type (stdio for local, SSE/HTTP for remote)
4. Add any required environment variables
5. Click **Launch Inspector**

## API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/mcp-inspector` | List running inspectors |
| POST | `/api/plugins/mcp-inspector` | Launch new inspector |
| DELETE | `/api/plugins/mcp-inspector?mcpId=...` | Stop inspector |

### Launch Request

```typescript
POST /api/plugins/mcp-inspector
{
  "mcpId": "my-mcp",           // Required: identifier
  "command": "node",           // For stdio transport
  "args": ["server.js"],       // Command arguments
  "env": { "API_KEY": "..." }, // Environment variables
  "transport": "stdio",        // stdio | sse | http
  "serverUrl": "http://..."    // For SSE/HTTP transport
}
```

### Response

```typescript
{
  "status": "started",
  "mcpId": "my-mcp",
  "port": 6274,
  "url": "http://localhost:6274",
  "pid": 12345
}
```

## Configuration

The plugin uses no persistent configuration. Inspector instances are managed in memory and stop when the server restarts.

## Dependencies

- `@modelcontextprotocol/inspector` (installed via npx on demand)

## Technical Notes

- Inspector runs on ports starting from 6274
- Multiple inspectors can run simultaneously
- Each inspector gets a unique port
- Processes are tracked and cleaned up on stop
