# Bot Feature Setup

The Bot feature embeds the Clawd AI Gateway in an iframe within daax, providing chat functionality with AI agents.

## Prerequisites

- daax built from `main` branch (Bot code merged as of commit `0b538dc`)
- Access to a running Clawd Gateway instance
- Gateway authentication token

## Setup Steps

### 1. Set Environment Variables

The Bot page requires two environment variables:

| Variable | Description |
|----------|-------------|
| `CLAWD_GATEWAY_URL` | URL to your Clawd Gateway instance |
| `CLAWD_GATEWAY_TOKEN` | Authentication token for the gateway |

#### Host Mode (Development)

```bash
CLAWD_GATEWAY_URL=https://your-gateway-url CLAWD_GATEWAY_TOKEN=your-token bun dev
```

Or create a `.env.local` file:

```bash
# .env.local
CLAWD_GATEWAY_URL=https://your-gateway-url
CLAWD_GATEWAY_TOKEN=your-token
```

#### Container Mode (Docker)

```bash
docker run -d \
  --name daax \
  -p 4200:4200 \
  -p 4201:4201 \
  -e CLAWD_GATEWAY_URL=https://your-gateway-url \
  -e CLAWD_GATEWAY_TOKEN=your-token \
  daax
```

Or in `docker-compose.yml`:

```yaml
services:
  daax:
    image: daax
    environment:
      - CLAWD_GATEWAY_URL=https://your-gateway-url
      - CLAWD_GATEWAY_TOKEN=your-token
```

### 2. Enable the Plugin in UI

The Bot plugin is **disabled by default** in the navigation. To enable it:

1. Open daax in your browser
2. Navigate to **Settings** (gear icon in sidebar)
3. Scroll to **Plugins & Features** section
4. Find **Bot** in the list
5. Click the **eye icon** (👁) to toggle visibility ON (turns green)

The Bot menu item will now appear in the left navigation.

### 3. Access the Bot

Click **Bot** in the navigation sidebar. The page will:
1. Fetch credentials from `/api/clawd/token`
2. Load the Clawd Gateway in an iframe with authentication

## Troubleshooting

### Bot shows "CLAWD_GATEWAY_URL not configured"

Environment variable not set. Verify with:

```bash
# Host mode
echo $CLAWD_GATEWAY_URL

# Container mode
docker exec daax printenv | grep CLAWD
```

### Bot shows "CLAWD_GATEWAY_TOKEN not configured"

Token environment variable not set. Check the same way as above.

### Bot not appearing in navigation

1. Check Settings → Plugins & Features
2. Ensure Bot has the eye icon showing (visible)
3. If hidden, click the eye icon to enable

### Settings not persisting

Plugin visibility is stored in browser localStorage. Different browsers or incognito mode will have separate settings.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Browser                                             │
│  ┌───────────────────────────────────────────────┐  │
│  │ daax UI                                       │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ /bot page                               │  │  │
│  │  │  ┌───────────────────────────────────┐  │  │  │
│  │  │  │ iframe: Clawd Gateway + token     │  │  │  │
│  │  │  └───────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │
         │ GET /api/clawd/token
         ▼
┌─────────────────────┐
│ daax server         │
│ (reads env vars)    │
│ CLAWD_GATEWAY_URL   │
│ CLAWD_GATEWAY_TOKEN │
└─────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `app/bot/page.tsx` | Bot page component (iframe wrapper) |
| `app/api/clawd/token/route.ts` | API endpoint returning gateway config |
| `plugins/clawd-bot/index.ts` | Plugin definition (navigation entry) |
| `lib/settings.ts` | DEFAULT_PLUGINS includes Bot |

## Security Notes

- Token is fetched server-side and passed to iframe via query param
- API endpoint has no-cache headers to prevent credential caching
- Designed for private network deployment (Tailscale)
- For public deployment, add authentication middleware to the API route
