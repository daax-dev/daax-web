# Daax Traefik Dynamic Configuration
# Copy to: /etc/traefik/dynamic/daax.yml
#
# Routes for daax.HOSTNAME_PLACEHOLDER.poley.dev
#
# Prerequisites:
#   - Pocket ID running on port 1411 (for ForwardAuth)
#   - Daax container on ports 4200 (web) + 4201 (ws)
#   - Code-server container on port 18080
#   - Clawdbot gateway on port 18789 (optional)

http:
  serversTransports:
    h1-only:
      disableHTTP2: true
      forwardingTimeouts:
        dialTimeout: 30s

  middlewares:
    # Defense-in-depth: strip auth identity headers from incoming requests
    # so only Pocket ID ForwardAuth can populate them (prevents client spoofing)
    strip-forwarded-headers:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""
          X-Forwarded-Email: ""
          X-Forwarded-Username: ""
          X-Forwarded-Name: ""
          X-Forwarded-Groups: ""
          X-Forwarded-Admin: ""

    # Pocket ID ForwardAuth middleware
    pocket-id-auth:
      forwardAuth:
        address: "http://127.0.0.1:1411/api/forward-auth/verify"
        trustForwardHeader: true
        authResponseHeaders:
          - X-Forwarded-User
          - X-Forwarded-Email
          - X-Forwarded-Username
          - X-Forwarded-Name
          - X-Forwarded-Groups
          - X-Forwarded-Admin

  routers:
    # WebSocket endpoint - higher priority to match before main route
    daax-ws:
      rule: Host(`daax.HOSTNAME_PLACEHOLDER.poley.dev`) && PathPrefix(`/ws`)
      service: daax-ws
      priority: 100
      middlewares:
        - strip-forwarded-headers
        - pocket-id-auth
      tls:
        certResolver: cloudflare
      entryPoints:
        - websecure

    # Main web UI
    daax:
      rule: Host(`daax.HOSTNAME_PLACEHOLDER.poley.dev`)
      service: daax
      middlewares:
        - strip-forwarded-headers
        - pocket-id-auth
      tls:
        certResolver: cloudflare
      entryPoints:
        - websecure

    # Code-Server (VS Code in browser)
    daax-code:
      rule: Host(`daax-code.HOSTNAME_PLACEHOLDER.poley.dev`)
      service: daax-code
      middlewares:
        - strip-forwarded-headers
        - pocket-id-auth
      tls:
        certResolver: cloudflare
      entryPoints:
        - websecure

    # Clawdbot Gateway (no auth - has its own token auth)
    clawd:
      rule: Host(`clawd.HOSTNAME_PLACEHOLDER.poley.dev`)
      service: clawd
      tls:
        certResolver: cloudflare
      entryPoints:
        - websecure

  services:
    daax:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:4200"

    daax-ws:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:4201"

    daax-code:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:18080"

    clawd:
      loadBalancer:
        serversTransport: h1-only
        servers:
          - url: "http://127.0.0.1:18789"
