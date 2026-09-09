// A stand-in for the dist-agent daemon (`agentd`) for the Agent View e2e suite.
//
// It replays the recorded JSON under tests/e2e/fixtures/agentview/ — answers
// cut from the SYNTHETIC daemon dist-agent's own e2e suite launches, never
// from an operator's 7717 — over the same routes, query parameters and error
// shapes the real daemon uses, so the tab under test cannot tell the two
// apart on the surface it reads. It is plain `node:http` with no dependencies.
//
//   node tests/e2e/fixtures/agentview-daemon.mjs [--refuse]
//     AGENTVIEW_E2E_DAEMON_PORT   port to listen on (default 7793)
//     --refuse                    answer every /api/v1 route but healthz with
//                                 401 { "error": "no session" }, the shape the
//                                 real daemon uses off loopback without a
//                                 session, so the UI's refusal state can be driven
//
// Programmatic use: `start({ port, refuse })` resolves to `{ port, close }`.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "agentview");

export const DEFAULT_PORT = 7793;

/** The daemon an operator runs over their own history. Never that one. */
export const OPERATOR_PORT = 7717;

function readFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"),
  );
}

function hasFixture(name) {
  return fs.existsSync(path.join(FIXTURES, `${name}.json`));
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

/** The real daemon's answer for a path under /api/ it does not route. */
function notFound(res, pathname) {
  json(res, 404, {
    error:
      `no such API route: ${pathname}` +
      " (path parameters containing / must be percent-encoded)",
  });
}

function refused(res) {
  json(res, 401, { error: "no session" });
}

const AGENT_ROUTE = /^\/api\/v1\/agents\/([^/]+)$/;

// Control mode supplies the process/control fields absent from the recorded
// transcript-only daemon. It models a live Claude process; it never signals an
// operating-system process or fabricates an interrupt observation.
function controlAgents(name, control, refuseControl) {
  const doc = readFixture(name);
  if (!control) return doc;
  for (const agent of doc.agents) {
    if (agent.state !== "AGENT_STATE_ACTIVE") continue;
    agent.process_alive = true;
    agent.agent_pid = 424242;
    agent.agent_process_started_at = "2026-09-07T22:00:00Z";
    agent.capabilities.signals.control = refuseControl
      ? {
          level: "CAPABILITY_LEVEL_UNAVAILABLE",
          detail:
            "fixture control is unavailable: no authenticated signal target",
        }
      : {
          level: "CAPABILITY_LEVEL_LIMITED",
          detail: "process signal; effect learned on the next poll",
        };
  }
  return doc;
}

function handle(req, res, { refuse, control, refuseControl, signals }) {
  const url = new URL(req.url, "http://127.0.0.1");
  const p = url.pathname;

  if (control && p === "/__signals" && req.method === "GET")
    return json(res, 200, { signals });
  const signal = /^\/api\/v1\/agents\/([^/]+)\/signal$/.exec(p);
  if (control && signal && req.method === "POST") {
    if (
      req.headers["x-dist-agent-proxy"] !== "fixture-daemon-proof" ||
      req.headers["x-auth-request-user"] !==
        "a8e78e55-bcde-4789-9210-981476abc123" ||
      !req.headers["x-forwarded-for"]
    )
      return refused(res);
    if (
      req.headers["content-type"] !== "application/json" ||
      req.headers.origin
    )
      return json(res, 403, { error: "invalid browser write" });
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { error: "invalid JSON" });
      }
      const id = decodeURIComponent(signal[1]);
      if (id === "galway/claude/session" && parsed.signal === "interrupt") {
        signals.push({ agent_id: id, body: parsed, headers: req.headers });
        return json(res, 421, {
          agent_id: id,
          signal: parsed.signal,
          outcome: "refused",
          recorded: true,
          note: "refusal recorded",
          event_id: `fixture-signal-${signals.length}`,
          error:
            'no agent "galway/claude/session" is in this node\'s registry; its prefix names node galway, and control is not federated: node galway has its own control surface at https://agent.galway.example (ADR 0026 §3); this daemon can only signal processes it can see',
        });
      }
      const target = controlAgents(
        "agents",
        control,
        refuseControl,
      ).agents.find((agent) => agent.agent_id === id);
      if (!target || parsed.signal !== "interrupt")
        return json(res, 400, {
          error: "invalid fixture signal target or verb",
        });
      signals.push({ agent_id: id, body: parsed, headers: req.headers });
      return json(res, refuseControl ? 409 : 200, {
        agent_id: id,
        signal: parsed.signal,
        outcome: refuseControl ? "refused" : "sent",
        recorded: true,
        note: "the effect is learned on the next process poll",
        event_id: `fixture-signal-${signals.length}`,
        ...(refuseControl
          ? {
              error:
                "fixture control is unavailable: no authenticated signal target",
            }
          : {}),
      });
    });
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  if (p === "/api/v1/healthz") {
    json(res, 200, readFixture("healthz"));
    return;
  }

  if (!p.startsWith("/api/v1/")) {
    notFound(res, p);
    return;
  }

  if (refuse) {
    refused(res);
    return;
  }

  if (p === "/api/v1/node") return json(res, 200, readFixture("node"));
  if (p === "/api/v1/projects") return json(res, 200, readFixture("projects"));
  if (p === "/api/v1/worktrees")
    return json(res, 200, readFixture("worktrees"));

  if (p === "/api/v1/agents") {
    const all =
      url.searchParams.get("include_finished") === "true" &&
      hasFixture("agents-all");
    return json(
      res,
      200,
      controlAgents(all ? "agents-all" : "agents", control, refuseControl),
    );
  }

  const agent = AGENT_ROUTE.exec(p);
  if (agent) {
    // The id arrives percent-encoded as one segment, exactly as the real mux
    // requires; an unencoded `node/type/session` never matches this pattern
    // and falls to the 404 below, as it does on the daemon.
    const id = decodeURIComponent(agent[1]);
    const found = controlAgents("agents", control, refuseControl).agents.find(
      (a) => a.agent_id === id,
    );
    if (!found) return json(res, 404, { error: `no such agent: ${id}` });
    return json(res, 200, found);
  }

  if (p === "/api/v1/events") return json(res, 200, events(url.searchParams));

  if (p === "/api/v1/stream") return stream(req, res, url.searchParams);

  notFound(res, p);
}

/** Filters the recorded list the way the daemon's query parameters would. */
function events(params) {
  const doc = readFixture("events");
  let rows = doc.events.slice();

  const agentId = params.get("agent_id");
  if (agentId) rows = rows.filter((e) => e.agent_id === agentId);
  const sessionId = params.get("session_id");
  if (sessionId) rows = rows.filter((e) => e.session_id === sessionId);
  const types = params.getAll("event_type");
  if (types.length) rows = rows.filter((e) => types.includes(e.event_type));
  const after = Number(params.get("after_sequence") ?? 0);
  if (after > 0) rows = rows.filter((e) => Number(e.sequence) > after);

  if (params.get("descending") === "true") rows.reverse();

  const limit = Number(params.get("limit") ?? 0);
  if (limit > 0) rows = rows.slice(0, limit);

  return { events: rows, last_sequence: doc.last_sequence };
}

/**
 * The SSE stream: `replay_complete` first, then one recorded event per second
 * with a fresh, increasing sequence — the shape of a live daemon, without
 * pretending anything new is happening on this machine.
 *
 * The cursor is `from_sequence`, as on agentd (the events list spells its own
 * `after_sequence`); the synthetic sequences continue above whichever of the
 * recorded tail and the cursor is higher, so a resumed client never sees a
 * sequence it already has.
 */
function stream(req, res, params) {
  const doc = readFixture("events");
  const recorded = doc.events;
  const from = Number(params.get("from_sequence") ?? 0);
  let sequence = Math.max(Number(doc.last_sequence ?? recorded.length), from);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(`event: replay_complete\ndata: {"last_sequence":${sequence}}\n\n`);

  let i = 0;
  const timer = setInterval(() => {
    if (recorded.length === 0) return;
    sequence += 1;
    const event = {
      ...recorded[i % recorded.length],
      sequence: String(sequence),
    };
    i += 1;
    const data = JSON.stringify({ stream_id: "all", event });
    res.write(`id: ${sequence}\nevent: event\ndata: ${data}\n\n`);
  }, 1000);

  const stop = () => clearInterval(timer);
  req.on("close", stop);
  res.on("close", stop);
}

/**
 * Starts the fixture daemon. `port: 0` picks an ephemeral port, which is what
 * the in-process test uses; the resolved `port` is reported back.
 */
export function start({
  port = DEFAULT_PORT,
  refuse = false,
  control = false,
  refuseControl = false,
} = {}) {
  if (port === OPERATOR_PORT) {
    return Promise.reject(
      new Error(
        `refusing to listen on ${OPERATOR_PORT}: that is the operator's own daemon ` +
          "and their real history. Set AGENTVIEW_E2E_DAEMON_PORT to something else.",
      ),
    );
  }
  const signals = [];
  const server = http.createServer((req, res) =>
    handle(req, res, {
      refuse,
      control: control || refuseControl,
      refuseControl,
      signals,
    }),
  );
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const bound = server.address().port;
      resolve({
        port: bound,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.AGENTVIEW_E2E_DAEMON_PORT || DEFAULT_PORT);
  const refuse = process.argv.includes("--refuse");
  start({
    port,
    refuse,
    control: process.argv.includes("--control"),
    refuseControl: process.argv.includes("--refuse-control"),
  })
    .then(({ port: bound }) => {
      console.log(
        `agentview fixture daemon listening on http://127.0.0.1:${bound}` +
          (refuse ? " (--refuse: every route but healthz answers 401)" : ""),
      );
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
