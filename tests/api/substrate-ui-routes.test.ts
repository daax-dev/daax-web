/**
 * Route guards for the dx#123 additions: egress update + validate, and the
 * admin provider-key and audit routes (admin only: 404 to anyone else).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { identity, access, query } = vi.hoisted(() => ({
  identity: vi.fn(),
  access: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireAuthIdentity: identity,
  resolveAccess: access,
}));
vi.mock("@/lib/db/pg", () => ({ query }));

import { PUT as putEgress } from "@/app/api/substrate/sessions/[id]/egress/route";
import { POST as validate } from "@/app/api/substrate/egress/validate/route";
import { GET as getKeys } from "@/app/api/substrate/admin/provider-keys/route";
import {
  PUT as putKey,
  DELETE as delKey,
} from "@/app/api/substrate/admin/provider-keys/[provider]/route";
import { GET as getAudit } from "@/app/api/substrate/admin/audit/route";
import { GatewayKeys } from "@/lib/substrate/provider-keys";

const SECRET_VALUE = "sk-test-NEVER-ECHO-1234567890";
const idParams = { params: Promise.resolve({ id: "x" }) };
const prov = (p: string) => ({ params: Promise.resolve({ provider: p }) });
const req = (body: unknown = {}, url = "http://localhost/api") =>
  Object.assign(
    new Request(url, { method: "POST", body: JSON.stringify(body) }),
    { nextUrl: new URL(url) },
  ) as never;

const ENABLED = {
  DAAX_SUBSTRATE_ENABLED: "1",
  DAAX_SUBSTRATE_ATESPACE: "kinsale",
  DAAX_SUBSTRATE_KUBECONFIG: "/k/config",
  DAAX_SUBSTRATE_LLM_HOST: "llm.ns.svc.cluster.local",
  DATABASE_URL: "postgres://u@127.0.0.1:1/x",
};

const calls: Array<[string, () => Promise<Response>]> = [
  ["egress", () => putEgress(req(), idParams)],
  ["validate", () => validate(req())],
  ["keys", () => getKeys()],
  ["putKey", () => putKey(req({ value: SECRET_VALUE }), prov("openai"))],
  ["delKey", () => delKey(req(), prov("openai"))],
  ["audit", () => getAudit(req())],
];
const adminCalls = calls.filter(([n]) =>
  ["keys", "putKey", "delKey", "audit"].includes(n),
);

const saved = { ...process.env };
beforeEach(() => {
  identity.mockResolvedValue({
    authenticated: true,
    operator: false,
    subject: "alice",
    user: {},
  });
  access.mockResolvedValue({
    authenticated: true,
    isAdmin: false,
    permissions: [],
  });
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("dx#123 substrate routes", () => {
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
    "%s: 404 substrate-disabled when the flag is off (admin)",
    async (_n, call) => {
      delete process.env.DAAX_SUBSTRATE_ENABLED;
      access.mockResolvedValue({
        authenticated: true,
        isAdmin: true,
        permissions: [],
      });
      const res = await call();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("substrate-disabled");
    },
  );

  it.each(adminCalls)(
    "%s: a non-admin gets 404 not-found before any backend state is revealed (Codex r1)",
    async (_n, call) => {
      Object.assign(process.env, ENABLED);
      delete process.env.DAAX_SUBSTRATE_ATESPACE; // misconfigured: would be 503
      const res = await call();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("not-found");
    },
  );

  it.each(adminCalls)(
    "%s: 404 (never 403) for a non-admin",
    async (_n, call) => {
      Object.assign(process.env, ENABLED);
      const write = vi.spyOn(GatewayKeys.prototype, "write");
      const res = await call();
      expect(res.status).toBe(404);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it("provider keys: 503 gateway-unconfigured without a gateway namespace", async () => {
    Object.assign(process.env, ENABLED);
    delete process.env.DAAX_SUBSTRATE_GATEWAY_NAMESPACE;
    access.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      permissions: [],
    });
    const res = await getKeys();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("gateway-unconfigured");
  });

  it("PUT key (admin): writes once, answers set only, never echoes or audits the value", async () => {
    Object.assign(process.env, ENABLED, {
      DAAX_SUBSTRATE_GATEWAY_NAMESPACE: "kinsale-harness",
    });
    access.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      permissions: [],
    });
    const write = vi.spyOn(GatewayKeys.prototype, "write").mockResolvedValue();
    const res = await putKey(req({ value: SECRET_VALUE }), prov("openai"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ id: "openai", set: true });
    expect(text).not.toContain(SECRET_VALUE);
    expect(write).toHaveBeenCalledWith("openai", SECRET_VALUE);
    const audit = query.mock.calls.find(([sql]) =>
      /auth_audit/.test(String(sql)),
    );
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(audit)).toContain("substrate.provider-key");
  });

  it("PUT key (admin): a failed write does not leak kubectl output", async () => {
    Object.assign(process.env, ENABLED, {
      DAAX_SUBSTRATE_GATEWAY_NAMESPACE: "kinsale-harness",
    });
    access.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      permissions: [],
    });
    vi.spyOn(GatewayKeys.prototype, "write").mockRejectedValue(
      new Error(`kubectl said ${SECRET_VALUE}`),
    );
    const res = await putKey(req({ value: SECRET_VALUE }), prov("openai"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(SECRET_VALUE);
  });

  it("PUT key: 400 for an unknown provider or a blank key; nothing written", async () => {
    Object.assign(process.env, ENABLED, {
      DAAX_SUBSTRATE_GATEWAY_NAMESPACE: "ns",
    });
    access.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      permissions: [],
    });
    const write = vi.spyOn(GatewayKeys.prototype, "write").mockResolvedValue();
    expect((await putKey(req({ value: "x" }), prov("kiro"))).status).toBe(400);
    expect((await putKey(req({ value: "  " }), prov("openai"))).status).toBe(
      400,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("DELETE key (admin): writes the unset placeholder", async () => {
    Object.assign(process.env, ENABLED, {
      DAAX_SUBSTRATE_GATEWAY_NAMESPACE: "ns",
    });
    access.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      permissions: [],
    });
    const write = vi.spyOn(GatewayKeys.prototype, "write").mockResolvedValue();
    const res = await delKey(req(), prov("gemini"));
    expect(await res.json()).toEqual({ id: "gemini", set: false });
    expect(write).toHaveBeenCalledWith("gemini", null);
  });

  it("egress PUT: 400 for a non-object body", async () => {
    Object.assign(process.env, ENABLED);
    const res = await putEgress(req([1, 2]), idParams);
    expect(res.status).toBe(400);
  });
});
