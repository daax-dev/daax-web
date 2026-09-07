/**
 * The Agent View fixture daemon (tests/e2e/fixtures/agentview-daemon.mjs),
 * started in-process on an ephemeral port. Every expectation below is about
 * the daemon-shaped surface the e2e suite relies on: the recorded bodies, the
 * query filters, the real daemon's 404 shape, and `--refuse` mode.
 *
 * Runs over a real socket, so fetch is the real one — nothing here is mocked.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vitest resolves the .mjs relative to this file; the module has no types.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain ESM fixture without a declaration file
import { start, OPERATOR_PORT } from "../e2e/fixtures/agentview-daemon.mjs";

interface Handle {
  port: number;
  close: () => Promise<void>;
}

const FIXTURES = path.resolve(__dirname, "../e2e/fixtures/agentview");
const realFetch = globalThis.fetch;

function readFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"),
  );
}

describe("agentview fixture daemon", () => {
  let daemon: Handle;
  let base: string;

  beforeAll(async () => {
    daemon = (await start({ port: 0 })) as Handle;
    base = `http://127.0.0.1:${daemon.port}/api/v1`;
  });

  afterAll(async () => {
    await daemon.close();
  });

  it("answers healthz with the recorded body", async () => {
    const res = await realFetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual(readFixture("healthz"));
  });

  it("answers agents with the recorded list, and include_finished with the -all variant", async () => {
    const res = await realFetch(`${base}/agents`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: Array<{ agent_id: string }> };
    expect(body).toEqual(readFixture("agents"));
    expect(body.agents.length).toBeGreaterThan(0);

    const all = await realFetch(`${base}/agents?include_finished=true`);
    expect(await all.json()).toEqual(readFixture("agents-all"));
  });

  it("looks up one agent by its percent-encoded id", async () => {
    const { agents } = readFixture("agents") as {
      agents: Array<{ agent_id: string }>;
    };
    const id = agents[0].agent_id;
    expect(id).toContain("/");

    const res = await realFetch(`${base}/agents/${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(agents[0]);

    // Unencoded, the id is three segments and matches no route — as on agentd.
    const raw = await realFetch(`${base}/agents/${id}`);
    expect(raw.status).toBe(404);
    expect(((await raw.json()) as { error: string }).error).toContain(
      "must be percent-encoded",
    );
  });

  it("filters events by agent_id and honours limit and descending", async () => {
    const { events } = readFixture("events") as {
      events: Array<{ agent_id?: string; sequence: string }>;
    };
    const withAgent = events.filter((e) => e.agent_id);
    const agentId = withAgent[0].agent_id as string;
    const expected = events.filter((e) => e.agent_id === agentId);
    expect(expected.length).toBeGreaterThan(1);

    const res = await realFetch(
      `${base}/events?agent_id=${encodeURIComponent(agentId)}`,
    );
    const body = (await res.json()) as {
      events: Array<{ agent_id?: string; sequence: string }>;
      last_sequence: string;
    };
    expect(body.events).toEqual(expected);
    expect(body.events.every((e) => e.agent_id === agentId)).toBe(true);
    expect(body.last_sequence).toBe(
      (readFixture("events") as { last_sequence: string }).last_sequence,
    );

    const desc = await realFetch(
      `${base}/events?agent_id=${encodeURIComponent(agentId)}&descending=true&limit=1`,
    );
    const top = (await desc.json()) as { events: Array<{ sequence: string }> };
    expect(top.events).toHaveLength(1);
    expect(top.events[0].sequence).toBe(expected[expected.length - 1].sequence);
  });

  it("answers /api/v1/prompts with the daemon's own 404 shape", async () => {
    const res = await realFetch(`${base}/prompts`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({
      error:
        "no such API route: /api/v1/prompts (path parameters containing / must be percent-encoded)",
    });
  });

  it("opens the stream with replay_complete first", async () => {
    const controller = new AbortController();
    const res = await realFetch(`${base}/stream`, {
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toMatch(
      /^event: replay_complete\ndata: \{"last_sequence":\d+\}\n\n/,
    );
    controller.abort();
  });

  it("resumes the stream above from_sequence, the cursor name agentd uses", async () => {
    const controller = new AbortController();
    const res = await realFetch(`${base}/stream?from_sequence=900000`, {
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    let text = "";
    // The first frame is replay_complete; the next is the first synthetic event.
    while (!/id: \d+\nevent: event\n/.test(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    controller.abort();
    const id = Number(/id: (\d+)\nevent: event\n/.exec(text)![1]);
    expect(id).toBeGreaterThan(900000);
    expect(text).toMatch(/"sequence":"900001"/);
  }, 10_000);

  it("refuses to listen on the operator's port", async () => {
    await expect(start({ port: OPERATOR_PORT })).rejects.toThrow(
      /refusing to listen on 7717/,
    );
  });
});

describe("agentview fixture daemon --refuse", () => {
  let daemon: Handle;
  let base: string;

  beforeAll(async () => {
    daemon = (await start({ port: 0, refuse: true })) as Handle;
    base = `http://127.0.0.1:${daemon.port}/api/v1`;
  });

  afterAll(async () => {
    await daemon.close();
  });

  it("still answers healthz", async () => {
    const res = await realFetch(`${base}/healthz`);
    expect(res.status).toBe(200);
  });

  it("answers every other route with 401 { error: 'no session' }", async () => {
    for (const p of ["node", "agents", "events", "projects", "stream"]) {
      const res = await realFetch(`${base}/${p}`);
      expect(res.status, p).toBe(401);
      expect(await res.json(), p).toEqual({ error: "no session" });
    }
  });
});
