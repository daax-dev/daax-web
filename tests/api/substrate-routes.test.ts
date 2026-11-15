/**
 * /api/substrate/* route guards (dx#113): auth first, 404 when the flag is
 * off (galway/muckross unchanged), 503 when misconfigured or without Postgres.
 * Lifecycle/ownership logic is covered in tests/lib/substrate/service.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { identity } = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAuthIdentity: identity,
  resolveAccess: vi.fn(async () => ({
    authenticated: true,
    isAdmin: false,
    permissions: [],
  })),
}));
vi.mock("@/lib/db/pg", () => ({ query: vi.fn() }));

import { GET as getConfig } from "@/app/api/substrate/config/route";
import {
  GET as list,
  POST as create,
} from "@/app/api/substrate/sessions/route";
import {
  GET as getOne,
  DELETE as del,
} from "@/app/api/substrate/sessions/[id]/route";
import { POST as attach } from "@/app/api/substrate/sessions/[id]/attach/route";
import { POST as suspend } from "@/app/api/substrate/sessions/[id]/suspend/route";
import { POST as resume } from "@/app/api/substrate/sessions/[id]/resume/route";
import { POST as end } from "@/app/api/substrate/sessions/[id]/end/route";

const params = { params: Promise.resolve({ id: "x" }) };
const req = () =>
  new Request("http://localhost/api", { method: "POST", body: "{}" }) as never;

const calls: Array<[string, () => Promise<Response>]> = [
  ["config", () => getConfig()],
  ["list", () => list()],
  ["create", () => create(req())],
  ["get", () => getOne(req(), params)],
  ["delete", () => del(req(), params)],
  ["attach", () => attach(req(), params)],
  ["suspend", () => suspend(req(), params)],
  ["resume", () => resume(req(), params)],
  ["end", () => end(req(), params)],
];

const saved = { ...process.env };
beforeEach(() => {
  identity.mockResolvedValue({
    authenticated: true,
    operator: false,
    subject: "alice",
    user: {},
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
});

describe("substrate routes", () => {
  it.each(calls)("%s: 401 when unauthenticated", async (_n, call) => {
    identity.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });
    expect((await call()).status).toBe(401);
  });

  it.each(calls)(
    "%s: 404 substrate-disabled when the flag is off",
    async (_n, call) => {
      delete process.env.DAAX_SUBSTRATE_ENABLED;
      const res = await call();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("substrate-disabled");
    },
  );

  it.each(calls)("%s: 503 when enabled but misconfigured", async (_n, call) => {
    process.env.DAAX_SUBSTRATE_ENABLED = "1";
    delete process.env.DAAX_SUBSTRATE_ATESPACE;
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("substrate-misconfigured");
  });

  it("503 db-unconfigured when Postgres is not configured", async () => {
    Object.assign(process.env, {
      DAAX_SUBSTRATE_ENABLED: "1",
      DAAX_SUBSTRATE_ATESPACE: "kinsale",
      DAAX_SUBSTRATE_KUBECONFIG: "/k/config",
      DAAX_SUBSTRATE_LLM_HOST: "llm.ns.svc.cluster.local",
    });
    delete process.env.DATABASE_URL;
    delete process.env.PGHOST;
    delete process.env.PGDATABASE;
    delete process.env.PGUSER;
    const res = await list();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("db-unconfigured");
  });
});
