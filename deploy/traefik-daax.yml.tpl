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
    # so only Pocket ID ForwardAuth can populate them (prevents client spoofing).
    # X-Daax-Proxy-Secret is stripped here too so a client cannot forge it; the
    # real value is injected by inject-proxy-secret below (F1a, issue #94).
    strip-forwarded-headers:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""
          X-Forwarded-Email: ""
          X-Forwarded-Username: ""
          X-Forwarded-Name: ""
          X-Forwarded-Groups: ""
          X-Forwarded-Admin: ""
          X-Daax-Proxy-Secret: ""

    # Proxy-secret trust boundary (F1a, issue #94): inject the shared secret so
    # the app can prove a forwarded identity traversed this proxy. The value is
    # substituted at render time from $DAAX_PROXY_SECRET (deploy-local.sh) — it
    # is NEVER committed. Applied to the HTTP main router only; the WS route
    # forwards identity and is authenticated separately (F1b).
    inject-proxy-secret:
      headers:
        customRequestHeaders:
          X-Daax-Proxy-Secret: "DAAX_PROXY_SECRET_PLACEHOLDER"

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
        - inject-proxy-secret
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

    # Clawdbot Gateway
    #
    # pocket-id-auth (Pocket ID passkey ForwardAuth) is INTENTIONALLY EXCLUDED
    # from this router — unlike daax / daax-ws / daax-code above (issue #202,
    # Fable Review Finding L5).
    #
    # Why excluded:
    #   - Clawdbot is an AI agent orchestrator / bot gateway. It is reached by
    #     NON-BROWSER clients (webhooks, API callers, service-to-service) in
    #     addition to the daax /bot iframe. Those clients cannot perform an
    #     interactive passkey login, so Pocket ID forward-auth would break them.
    #   - The gateway is DESIGNED to authenticate every request with its OWN
    #     bearer token (CLAWD_GATEWAY_TOKEN); actual enforcement lives in the
    #     gateway service and is the operator's responsibility to verify (see
    #     below). daax's /bot page fetches that token from /api/clawd/token
    #     (itself gated by requireAuth, #188) and hands it to the embedded
    #     gateway iframe. Token auth — not a passkey session — is the design's
    #     authentication primitive for this host.
    #
    # Compensating control (the application-level authentication for this
    # router; network-level trust boundaries such as the tailnet still apply):
    #   The Clawdbot gateway's own bearer-token auth. Its strength depends
    #   on that token being enforced as mandatory (no bypass) and a strong,
    #   non-default secret.
    #
    # OPERATOR RESPONSIBILITY (out-of-band — cannot be verified from this repo;
    # the gateway is a separate project — the clawdbot repo): confirm that gateway
    # rejects requests with no/invalid token and that CLAWD_GATEWAY_TOKEN is a
    # strong, non-default secret (#202 AC#2).
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
