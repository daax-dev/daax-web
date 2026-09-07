#!/usr/bin/env bash
# Records the Agent View e2e fixtures from a dist-agent daemon.
#
# Point it at the SYNTHETIC daemon that dist-agent's own e2e suite launches,
# never at the operator's 7717 daemon — that one serves a person's real
# history, and a fixture cut from it would carry real prompts and paths into
# this repository. From a dist-agent checkout:
#
#   DIST_AGENT_E2E_PORT=7794 node e2e/fixtures/daemon.mjs &
#   until curl -sf http://127.0.0.1:7794/api/v1/healthz >/dev/null; do sleep 1; done
#   scripts/record-agentview-fixtures.sh http://127.0.0.1:7794
#
# Even the synthetic daemon runs its HOST collectors (process, network, git)
# against the machine it is started on, so its answers mix the seeded
# transcripts with whatever real agents and checkouts are on that host. The
# scrub step below keeps only what the seed produced: agents whose cwd is the
# fixture's `/repo/...`, adapter-derived events for those agents, and nothing
# from the host collectors. Projects and worktrees are derived from real
# checkouts, so after scrubbing they are the honest empty list rather than a
# renamed copy of somebody's repositories.
set -euo pipefail

url="${1:-http://127.0.0.1:7794}"
url="${url%/}"

case "$url" in
  *:7717|*:7717/*)
    echo "refusing to record from $url: 7717 is the operator's own daemon and their real history" >&2
    exit 1
    ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/../tests/e2e/fixtures/agentview"
mkdir -p "$out"

fetch() {
  curl -sfS -H 'Accept: application/json' "$url/api/v1/$1"
}

# scrub <kind>: reads the daemon's JSON on stdin, writes the synthetic subset.
scrub() {
  node -e '
    const kind = process.argv[1];
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const doc = JSON.parse(raw);
      const synthetic = (a) => typeof a.cwd === "string" && a.cwd.startsWith("/repo/");
      const ADAPTERS = new Set(["claude", "codex", "gemini", "node"]);
      let out = doc;
      if (kind === "agents") {
        out = { agents: doc.agents.filter(synthetic) };
      } else if (kind === "events") {
        const keep = (e) =>
          ADAPTERS.has(e.collector) &&
          !JSON.stringify(e).includes("/Users/") &&
          !JSON.stringify(e).includes("/home/");
        out = { events: doc.events.filter(keep), last_sequence: doc.last_sequence };
      } else if (kind === "projects") {
        out = { projects: [] };
      } else if (kind === "worktrees") {
        out = { worktrees: [] };
      }
      process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    });
  ' "$1"
}

record() {
  local name="$1" kind="$2" path="$3"
  echo "  $name  <-  $path  (scrub: $kind)"
  fetch "$path" | scrub "$kind" >"$out/$name.json"
}

echo "recording from $url into $out"
record healthz    healthz  "healthz"
record node       node     "node"
record agents     agents   "agents"
record agents-all agents   "agents?include_finished=true"
record events     events   "events?limit=500"
record projects   projects "projects"
record worktrees  worktrees "worktrees"

# The scrub is only as good as its predicate, so count rather than trust it.
if grep -l '/Users/\|/home/' "$out"/*.json 2>/dev/null | grep -v healthz.json; then
  echo "a real home path survived scrubbing; refusing to keep these fixtures" >&2
  exit 1
fi
echo "done"
