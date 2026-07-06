# shellcheck shell=bash
# deploy-lib.sh — pure-ish, unit-testable helpers for the phased deploy model
# (brain2daax F9, issue #104). SOURCED by scripts/deploy.sh and by the test
# suite (tests/deploy/deploy-phased.test.ts). It defines functions only; it
# never runs anything on its own, so sourcing it is side-effect free.
#
# Every external effect routes through an OVERRIDABLE command variable so tests
# can substitute a fake without a real Docker/Postgres/cluster:
#   DOCKER_BIN  (default: docker)   — docker CLI + `docker compose`
#   CURL_BIN    (default: curl)     — post-deploy F7 health probe
#   TCP_CHECK   (default: internal) — Postgres reachability (bash /dev/tcp)
#
# Guardrail: no `set -e` here — callers own their error strategy. Functions
# return non-zero on failure so the orchestrator can gate/rollback on it.

DOCKER_BIN="${DOCKER_BIN:-docker}"
CURL_BIN="${CURL_BIN:-curl}"

# --- structured logging --------------------------------------------------------

# deploy_log <logfile> <env> <phase> <status> <msg>
# Appends one JSON object per call to the .logs/*.jsonl deploy log (F9 AC2).
# Best-effort: a log write must never itself fail the deploy.
deploy_log() {
  local logfile="$1" env="$2" phase="$3" status="$4" msg="$5"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Escape the free-text message for JSON. A JSON string cannot contain any
  # unescaped control character (< 0x20), so escaping only backslash/quote and
  # newlines would still emit invalid JSONL when msg holds a literal TAB or
  # other C0 control. Order matters: escape backslash FIRST so the `\t` we
  # produce below is not double-escaped.
  local esc="${msg//\\/\\\\}"
  esc="${esc//\"/\\\"}"
  esc="${esc//$'\n'/ }"      # newline  -> space
  esc="${esc//$'\r'/ }"      # carriage return -> space
  esc="${esc//$'\t'/\\t}"    # tab -> \t (valid JSON escape)
  # Strip any remaining C0 controls (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F) and DEL
  # (0x7F). CR/LF/TAB are already handled above; this is a POSIX `tr` byte pass.
  esc="$(printf '%s' "$esc" | LC_ALL=C tr -d '\000-\010\013\014\016-\037\177')"
  local dir
  dir="$(dirname -- "$logfile")"
  mkdir -p "$dir" 2>/dev/null || true
  printf '{"ts":"%s","env":"%s","phase":"%s","status":"%s","msg":"%s"}\n' \
    "$ts" "$env" "$phase" "$status" "$esc" >>"$logfile" 2>/dev/null || true
}

# --- env-file loading ----------------------------------------------------------

# resolve_env_file <dir> <name> — echo the path to deploy/env/<name>.env,
# rejecting a name with path separators or traversal (config, not arbitrary
# file inclusion). Returns non-zero if the name is unsafe or the file is absent.
resolve_env_file() {
  local dir="$1" name="$2"
  # Enforce the documented character set explicitly: only letters, digits, and
  # `. _ -`. The `*[!A-Za-z0-9._-]*` glob rejects path separators (`/`, `\`) and
  # every other character, so nothing outside the allowlist reaches a file path
  # or the log output. The `..` guard blocks traversal (`.` is otherwise allowed).
  if [[ -z "$name" || "$name" == *..* || "$name" == *[!A-Za-z0-9._-]* ]]; then
    echo "invalid target name: '$name' (letters, digits, dot, hyphen, underscore only)" >&2
    return 1
  fi
  local path="$dir/$name.env"
  if [[ ! -f "$path" ]]; then
    echo "no env file for target '$name' at $path" >&2
    return 1
  fi
  printf '%s\n' "$path"
}

# --- fail-closed preflight gates ----------------------------------------------

# assert_required_secrets — every NAME listed in DAAX_REQUIRED_SECRETS must be
# present AND non-empty in the environment. Fails closed (F9 AC2): a missing OR
# present-but-empty secret aborts. Secrets are NEVER read from the env file —
# only their names are declared there; values come from the process environment
# (a secret store / `source ~/.secrets`). See deploy/env/README.md.
assert_required_secrets() {
  local names="${DAAX_REQUIRED_SECRETS:-}"
  local missing=() name val
  for name in $names; do
    # Indirect expansion; treat unset and empty identically (fail-closed).
    val="${!name-}"
    # Strip ALL whitespace (spaces, tabs, newlines): a tab/newline-only value is
    # not a real secret and must fail this fail-closed gate.
    if [[ -z "${val//[[:space:]]/}" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]} > 0)); then
    echo "required secret(s) missing or empty: ${missing[*]}" >&2
    echo "  set them in the environment (secret store / 'source ~/.secrets'); they are NOT read from the env file." >&2
    return 1
  fi
  return 0
}

# assert_code_server_image — reuse rebuild.sh's code-server preflight intent:
# the /code-server proxy needs a local daax-code-server:latest image. If absent,
# build it via scripts/build-code-server.sh (idempotent, layer-cached); if the
# build also fails, fail closed. CODE_SERVER_IMAGE overrides the default tag.
# Args: <builder-script-path>. Honors DOCKER_BIN for the image inspect.
assert_code_server_image() {
  local builder="$1"
  local image="${CODE_SERVER_IMAGE:-daax-code-server:latest}"
  if "$DOCKER_BIN" image inspect "$image" >/dev/null 2>&1; then
    return 0
  fi
  echo "code-server image '$image' absent — building via $builder ..." >&2
  if [[ -x "$builder" ]] && "$builder" >&2; then
    "$DOCKER_BIN" image inspect "$image" >/dev/null 2>&1 && return 0
  fi
  echo "code-server image '$image' unavailable and build failed; run $builder manually." >&2
  return 1
}

# parse_pg_host_port <DATABASE_URL> — echo "host port" parsed from a
# postgres://user:pw@host:port/db URL. Defaults port 5432 when omitted.
# Returns non-zero if no host can be parsed.
parse_pg_host_port() {
  local url="$1"
  # Strip scheme, optional credentials, then path/query.
  local authority="${url#*://}"
  authority="${authority##*@}"
  authority="${authority%%/*}"
  authority="${authority%%\?*}"
  local host="${authority%%:*}"
  local port="${authority##*:}"
  [[ "$port" == "$authority" || -z "$port" ]] && port=5432
  if [[ -z "$host" ]]; then
    echo "cannot parse host from DATABASE_URL" >&2
    return 1
  fi
  printf '%s %s\n' "$host" "$port"
}

# tcp_reachable <host> <port> [timeout_s] — true if a TCP connect succeeds.
# Uses bash /dev/tcp by default; override the whole check via TCP_CHECK (a
# command receiving host port) for hermetic tests.
tcp_reachable() {
  local host="$1" port="$2" timeout="${3:-5}"
  if [[ -n "${TCP_CHECK:-}" ]]; then
    "$TCP_CHECK" "$host" "$port"
    return $?
  fi
  timeout "$timeout" bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
}

# assert_postgres_reachable — for a MANAGED (external) Postgres, fail closed if
# it is unreachable (F9 AC2). For compose-local Postgres this is deferred to the
# DB phase (deploy.sh brings the container up, then gates on its health) since
# preflight cannot ping a DB the same deploy is responsible for starting.
# Reads DAAX_PG_MANAGED + DATABASE_URL.
assert_postgres_reachable() {
  if [[ "${DAAX_PG_MANAGED:-0}" != "1" ]]; then
    return 0 # compose-local: gated later, not here
  fi
  local url="${DATABASE_URL:-}"
  if [[ -z "$url" ]]; then
    echo "DAAX_PG_MANAGED=1 but DATABASE_URL is unset (managed Postgres needs a connection string)" >&2
    return 1
  fi
  local hp host port
  if ! hp="$(parse_pg_host_port "$url")"; then
    return 1
  fi
  host="${hp% *}"
  port="${hp#* }"
  if ! tcp_reachable "$host" "$port" "${DAAX_PG_CONNECT_TIMEOUT:-5}"; then
    echo "managed Postgres unreachable at $host:$port" >&2
    return 1
  fi
  return 0
}

# --- rollback state capture / restore -----------------------------------------
#
# The rollback baseline is the IMAGE each app container is currently running.
# capture_rollback_state records those image IDs and re-tags them to a stable
# :rollback tag so a subsequent `build`/`pull` of :latest cannot orphan them.
# restore_rollback_state re-points :latest back at the captured images and is
# the app-plane half of a mid-flight rollback (deploy.sh then force-recreates).
#
# State is written as `service<TAB>image-id` lines to the given state file.

# rollback_tag_for <image-ref> — derive the stable ":rollback" pin for an image
# ref, handling BOTH a plain "repo:tag" and a digest ref. A digest ref carries
# its own ":" (e.g. "repo@sha256:deadbeef" or "repo:tag@sha256:deadbeef"), so a
# naive "${ref%:*}" would truncate the digest and produce an invalid tag like
# "repo@sha256:rollback". Strip any "@sha256:..." digest suffix first, then a
# trailing ":tag" if present, then append ":rollback".
rollback_tag_for() {
  local repo="${1%@*}"   # drop @sha256:... digest suffix if present
  repo="${repo%:*}"      # drop :tag if present (leaving the bare repo)
  printf '%s:rollback' "$repo"
}

# capture_rollback_state <statefile> <service:image-tag>...
# Each arg is "container_name=image_tag" (e.g. "daax=daax:latest").
capture_rollback_state() {
  local statefile="$1"; shift
  : >"$statefile"
  local pair name tag imgid
  for pair in "$@"; do
    name="${pair%%=*}"
    tag="${pair#*=}"
    imgid="$("$DOCKER_BIN" inspect --format '{{.Image}}' "$name" 2>/dev/null || true)"
    if [[ -n "$imgid" ]]; then
      # Pin the running image under a stable rollback tag so a rebuild of `tag`
      # does not garbage away the bytes we may need to restore.
      "$DOCKER_BIN" tag "$imgid" "$(rollback_tag_for "$tag")" >/dev/null 2>&1 || true
      printf '%s\t%s\t%s\n' "$name" "$tag" "$imgid" >>"$statefile"
    else
      # No prior container → nothing to restore for this service (fresh deploy).
      printf '%s\t%s\t%s\n' "$name" "$tag" "-" >>"$statefile"
    fi
  done
}

# had_prior_state <statefile> — true if ANY captured service had a running image
# (i.e. this was an upgrade, not a fresh deploy). Drives restore-vs-teardown.
had_prior_state() {
  local statefile="$1"
  [[ -f "$statefile" ]] || return 1
  awk -F'\t' '$3 != "-" {found=1} END {exit found?0:1}' "$statefile"
}

# restore_rollback_state <statefile> — re-tag each captured :latest back to the
# prior running image id. Returns 0 even if some services had no prior image
# (fresh-deploy services are simply left for the caller to `compose down`).
restore_rollback_state() {
  local statefile="$1"
  [[ -f "$statefile" ]] || return 0
  local name tag imgid
  while IFS=$'\t' read -r name tag imgid; do
    [[ "$imgid" == "-" || -z "$imgid" ]] && continue
    "$DOCKER_BIN" tag "$imgid" "$tag" >/dev/null 2>&1 || true
  done <"$statefile"
  return 0
}

# --- post-deploy health (F7) ---------------------------------------------------

# http_status <url> — echo the HTTP status code for a GET, or 000 on failure.
http_status() {
  local url="$1"
  "$CURL_BIN" -fsS -o /dev/null -w '%{http_code}' --max-time "${DAAX_HEALTH_TIMEOUT:-5}" \
    "$url" 2>/dev/null || echo 000
}

# wait_for_health <url> [retries] [sleep_s] — poll /api/health until it returns
# 200 (F7). Returns non-zero if it never becomes healthy.
wait_for_health() {
  local url="$1" retries="${2:-12}" nap="${3:-5}"
  local i code
  for ((i = 1; i <= retries; i++)); do
    code="$(http_status "$url")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep "$nap"
  done
  echo "health check never returned 200 (last: ${code:-none}) at $url" >&2
  return 1
}
