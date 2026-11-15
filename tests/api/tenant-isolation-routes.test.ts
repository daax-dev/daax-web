/**
 * Cross-tenant access on every owner-scoped HTTP route (dx#119).
 *
 * Three callers — user A, user B, an admin — plus a user whose roles grant
 * nothing. Each resource kind is seeded with one resource owned by A, one by
 * B and one legacy resource with no owner. The contract under test:
 *   - a user sees and acts only on their own resources;
 *   - another tenant's resource (and a legacy one) is a 404, never a 403, and
 *     the mutation never reaches the docker/fs/git layer;
 *   - an admin sees and acts on everything;
 *   - a missing permission is refused by the gate before any lookup.
 *
 * `requirePrincipal` is stood in by a switchable principal (its own RBAC
 * resolution is covered in tests/lib/auth-require-principal.test.ts); the
 * route handlers, `lib/tenancy/*` and the owner lookups run for real against
 * mocked docker / fs / git layers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { join } from "path";
import { homedir } from "os";

import type { Principal } from "@/lib/tenancy/ownership";
import { permissionsForRoles } from "@/lib/rbac/permissions";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ADMIN = "cccccccc-0000-4000-8000-00000000000c";

const USER_PERMS = permissionsForRoles(["user"]);
const principals: Record<string, Principal> = {
  A: { subject: A, operator: false, admin: false, permissions: USER_PERMS },
  B: { subject: B, operator: false, admin: false, permissions: USER_PERMS },
  ADMIN: {
    subject: ADMIN,
    operator: false,
    admin: true,
    permissions: permissionsForRoles(["admin"]),
  },
  NOPERM: { subject: A, operator: false, admin: false, permissions: [] },
};

const h = vi.hoisted(() => ({
  current: null as null | {
    subject: string | null;
    admin: boolean;
    permissions: readonly string[];
  },
  files: new Map<string, string>(),
  containers: new Map<string, Record<string, string>>(),
  dockerOps: [] as string[],
  execCalls: [] as string[][],
  testcontainers: new Map<string, Record<string, string>>(),
  tcOps: [] as string[],
  compose: new Map<string, { id: string; owner?: string }>(),
  worktrees: new Map<string, { owner: string | null; main: boolean }>(),
  gitOps: [] as string[],
  effective: { settings: {}, locked: [] as string[] },
  savedSettings: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async (perm?: string) => {
    const p = h.current;
    if (!p) {
      return {
        authorized: false,
        response: new Response(null, { status: 401 }),
      };
    }
    if (perm && !p.permissions.includes(perm)) {
      return {
        authorized: false,
        response: new Response(null, { status: 403 }),
      };
    }
    return { authorized: true, user: {}, subject: p.subject, principal: p };
  },
}));

// ---- in-memory fs for recordings -----------------------------------------
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const existsSync = (p: string) =>
    h.files.has(String(p)) ||
    [...h.files.keys()].some((k) => k.startsWith(String(p) + "/"));
  const readFileSync = (p: string) => {
    const v = h.files.get(String(p));
    if (v === undefined) throw new Error("ENOENT");
    return v;
  };
  const readdirSync = (dir: string) =>
    [...h.files.keys()]
      .filter((k) => k.startsWith(String(dir) + "/"))
      .map((k) => k.slice(String(dir).length + 1));
  const unlinkSync = (p: string) => {
    h.files.delete(String(p));
  };
  // Writes stay in memory too, so a regression that lets a handler past the
  // ownership gate (publish/export) can never write into the real checkout.
  const writeFileSync = (p: string, data: string) => {
    h.files.set(String(p), String(data));
  };
  const mkdirSync = () => undefined;
  const mod = {
    ...actual,
    existsSync,
    readFileSync,
    readdirSync,
    unlinkSync,
    writeFileSync,
    mkdirSync,
  };
  return { ...mod, default: mod };
});

// No GitHub token, ever: create-pr must never reach the network from a test.
vi.mock("@/lib/github-app", () => ({ getGitHubToken: async () => null }));

// ---- dockerode for /api/containers ---------------------------------------
vi.mock("dockerode", () => {
  class MockDocker {
    ping = async () => "OK";
    listContainers = async () =>
      [...h.containers.entries()].map(([id, labels]) => ({
        Id: `${id}000000000000`,
        Names: [`/${id}`],
        Image: "img",
        State: "running",
        Status: "Up",
        Ports: [],
        Labels: labels,
      }));
    getContainer(id: string) {
      const labels = h.containers.get(id);
      const op = (name: string) => async () => {
        if (!labels) throw new Error("no such container");
        h.dockerOps.push(`${name}:${id}`);
        return Buffer.from("");
      };
      return {
        inspect: async () => {
          if (!labels) throw new Error("no such container");
          return {
            Id: `${id}000000000000`,
            Name: `/${id}`,
            Config: { Labels: labels, Image: "img", Cmd: [] },
            State: { Status: "running", Running: true },
            HostConfig: {},
            NetworkSettings: {},
            Mounts: [],
          };
        },
        start: op("start"),
        stop: op("stop"),
        restart: op("restart"),
        remove: op("remove"),
        logs: op("logs"),
      };
    }
  }
  return { default: MockDocker };
});

// ---- docker CLI seam for /api/ai/active-sessions -------------------------
vi.mock("@/lib/docker-exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docker-exec")>();
  const labelsOf = (name: string) => h.containers.get(name);
  const exec = async (args: string[]) => {
    h.execCalls.push(args);
    if (args[0] === "ps") {
      const rows = [...h.containers.entries()].filter(([n]) =>
        /^daax-[0-9a-f]{8}$/.test(n),
      );
      const fmt = args[args.length - 1];
      if (fmt === "{{json .}}") {
        return {
          stdout: rows
            .map(([n, l]) =>
              JSON.stringify({
                ID: n,
                Names: n,
                Image: "img",
                Command: "c",
                Status: "Up",
                State: "exited",
                CreatedAt: "",
                Labels: Object.entries(l)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(","),
              }),
            )
            .join("\n"),
          stderr: "",
        };
      }
      return {
        stdout: rows
          .map(([n, l]) => `${n}\t${l["daax.owner"] ?? ""}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "inspect") {
      const name = args[args.length - 1];
      const l = labelsOf(name);
      if (!l) throw new Error("No such container");
      if (args.includes("{{json .Config.Labels}}"))
        return { stdout: JSON.stringify(l), stderr: "" };
      return {
        stdout: "2026-01-01T00:00:00Z|2026-01-01T00:00:00Z",
        stderr: "",
      };
    }
    if (args[0] === "rm") {
      h.dockerOps.push(`rm:${args[args.length - 1]}`);
      return { stdout: "", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { ...actual, defaultDockerExec: exec };
});

// ---- testcontainers plugin -----------------------------------------------
const tcApi = vi.hoisted(() => {
  const tc = (id: string) => {
    const labels = h.testcontainers.get(id);
    return labels
      ? { id, name: id, image: "img", status: "running", labels, createdAt: "" }
      : null;
  };
  const op = (name: string) => async (id: string) => {
    h.tcOps.push(`${name}:${id}`);
    return { success: true, message: name };
  };
  return {
    checkDockerStatus: async () => ({ connected: true }),
    listContainers: async () => ({
      containers: [...h.testcontainers.keys()].map(tc),
      total: h.testcontainers.size,
      page: 1,
      pageSize: 50,
    }),
    getContainer: async (id: string) => tc(id),
    createContainer: async (req: { labels?: Record<string, string> }) => {
      h.tcOps.push(`create:${JSON.stringify(req.labels ?? {})}`);
      return { container: { id: "new" }, message: "ok" };
    },
    startContainer: op("start"),
    stopContainer: op("stop"),
    restartContainer: op("restart"),
    removeContainer: op("remove"),
    getContainerLogs: async (id: string) => {
      h.tcOps.push(`logs:${id}`);
      return "";
    },
    getContainerStats: async (id: string) => {
      h.tcOps.push(`stats:${id}`);
      return {};
    },
    listComposeProjects: async () => ({
      projects: [...h.compose.values()],
      total: h.compose.size,
    }),
    getComposeProject: async (id: string) => h.compose.get(id) ?? null,
    createComposeProject: async (req: { owner?: string }) => {
      h.tcOps.push(`compose-create:${req.owner}`);
      return { project: { id: "p-new", owner: req.owner }, message: "ok" };
    },
    startComposeProject: op("compose-start"),
    stopComposeProject: op("compose-stop"),
    removeComposeProject: op("compose-remove"),
  };
});
vi.mock("@/plugins/testcontainers/api", () => tcApi);
vi.mock("@/plugins/testcontainers/api/compose", () => tcApi);

// ---- worktrees -------------------------------------------------------------
vi.mock("@/lib/worktree-manager", () => ({
  resolveWorkspaceRoot: () => "/workspace",
  // Containment on a separator boundary (the real one also canonicalizes).
  isValidPath: (p: string, base: string) =>
    p === base || p.startsWith(base.replace(/\/+$/, "") + "/"),
  isValidBranchName: () => true,
  isGitRepo: async () => true,
  listBranches: async () => [],
  listWorktrees: async (projectPath: string) =>
    [...h.worktrees.entries()].map(([path, w]) => ({
      path,
      branch: path.split("/").pop(),
      commit: "c",
      projectPath,
      owner: w.owner,
      main: w.main,
    })),
  getWorktreeOwner: async (p: string) => h.worktrees.get(p) ?? null,
  forgetWorktreeOwner: () => {},
  createWorktree: async (opts: { owner?: string }) => {
    h.gitOps.push(`create:${opts.owner}`);
    return { path: "/workspace/repo/.worktrees/new", owner: opts.owner };
  },
  cleanupWorktree: async (_p: string, wt: string) => {
    h.gitOps.push(`cleanup:${wt}`);
    return { success: true };
  },
}));

// ---- settings store ----------------------------------------------------------
vi.mock("@/lib/tenancy/settings-store", () => ({
  getEffectiveSettings: async () => h.effective,
  getUserSettings: async () => ({ settings: {}, adminOverrides: {} }),
  setUserSettings: async (sub: string, s: unknown) => {
    h.savedSettings.push({ sub, s });
  },
  getPolicy: async () => ({ defaults: {}, locks: [] }),
  setPolicy: async () => {},
  setUserOverrides: async () => {},
}));

// Routes (imported after the mocks).
import { GET as listRecordings } from "@/app/api/terminal-recordings/route";
import {
  GET as getRecording,
  DELETE as deleteRecording,
} from "@/app/api/terminal-recordings/[id]/route";
import { GET as exportRecording } from "@/app/api/terminal-recordings/[id]/export/route";
import { POST as publishRecording } from "@/app/api/terminal-recordings/[id]/publish/route";
import { POST as createPrRecording } from "@/app/api/terminal-recordings/[id]/create-pr/route";
import { GET as listContainers } from "@/app/api/containers/route";
import {
  GET as inspectContainer,
  DELETE as removeContainer,
} from "@/app/api/containers/[id]/route";
import { GET as containerLogs } from "@/app/api/containers/[id]/logs/route";
import { POST as startContainer } from "@/app/api/containers/[id]/start/route";
import { POST as stopContainer } from "@/app/api/containers/[id]/stop/route";
import { POST as restartContainer } from "@/app/api/containers/[id]/restart/route";
import { GET as listActive } from "@/app/api/ai/active-sessions/route";
import { DELETE as killActive } from "@/app/api/ai/active-sessions/[name]/route";
import { POST as reapActive } from "@/app/api/ai/active-sessions/reap/route";
import {
  GET as listAiSessions,
  POST as createAiSession,
} from "@/app/api/ai/sessions/route";
import {
  GET as getAiSession,
  DELETE as stopAiSession,
} from "@/app/api/ai/sessions/[id]/route";
import {
  GET as listTc,
  POST as createTc,
} from "@/app/api/testcontainers/route";
import {
  GET as getTc,
  DELETE as removeTc,
} from "@/app/api/testcontainers/[id]/route";
import { GET as tcLogs } from "@/app/api/testcontainers/[id]/logs/route";
import { GET as tcStats } from "@/app/api/testcontainers/[id]/stats/route";
import { POST as tcStart } from "@/app/api/testcontainers/[id]/start/route";
import { POST as tcStop } from "@/app/api/testcontainers/[id]/stop/route";
import { POST as tcRestart } from "@/app/api/testcontainers/[id]/restart/route";
import { POST as tcCleanup } from "@/app/api/testcontainers/cleanup/route";
import {
  GET as listCompose,
  POST as createCompose,
} from "@/app/api/testcontainers/compose/route";
import {
  GET as getCompose,
  DELETE as removeCompose,
} from "@/app/api/testcontainers/compose/[id]/route";
import { POST as composeStart } from "@/app/api/testcontainers/compose/[id]/start/route";
import { POST as composeStop } from "@/app/api/testcontainers/compose/[id]/stop/route";
import {
  GET as listWorktreesRoute,
  POST as createWorktreeRoute,
  DELETE as deleteWorktreeRoute,
} from "@/app/api/git/worktree/route";
import {
  GET as getUserSettingsRoute,
  PUT as putUserSettingsRoute,
} from "@/app/api/settings/user/route";
import {
  GET as getPolicyRoute,
  PUT as putPolicyRoute,
} from "@/app/api/settings/policy/route";
import { PUT as putOverridesRoute } from "@/app/api/settings/policy/users/[subject]/route";
import { POST as dockerPull } from "@/app/api/docker/pull/route";
import { GET as listTranscripts } from "@/app/api/transcripts/route";
import { GET as getTranscript } from "@/app/api/transcripts/[id]/route";
import { GET as watchtowerAttention } from "@/app/api/watchtower/attention/route";
import { GET as watchtowerTools } from "@/app/api/watchtower/sessions/[id]/tools/route";
import { GET as agentviewGet } from "@/app/api/agentview/[...path]/route";
import { sessionStore } from "@/lib/ai-sessions";

const RECORDINGS = join(homedir(), ".daax", "recordings");

function as(who: keyof typeof principals | null) {
  h.current = who ? principals[who] : null;
}

const ctx = <K extends string>(key: K, value: string) => ({
  params: Promise.resolve({ [key]: value } as Record<K, string>),
});
const req = (method = "GET", body?: unknown, url = "http://localhost/x") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;

function seedRecording(id: string, owner?: string) {
  h.files.set(
    join(RECORDINGS, `${id}.json`),
    JSON.stringify({
      id,
      sessionId: id,
      sessionType: "shell",
      command: "zsh",
      startTime: 1,
      cols: 80,
      rows: 24,
      ...(owner ? { owner } : {}),
    }),
  );
  h.files.set(join(RECORDINGS, `${id}.cast`), '{"version":2}\n');
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.files.clear();
  h.containers.clear();
  h.dockerOps.length = 0;
  h.execCalls.length = 0;
  h.testcontainers.clear();
  h.tcOps.length = 0;
  h.compose.clear();
  h.worktrees.clear();
  h.gitOps.length = 0;
  h.savedSettings.length = 0;
  h.effective = { settings: {}, locked: [] };
  sessionStore.clear();

  seedRecording("rec-a", A);
  seedRecording("rec-b", B);
  seedRecording("rec-legacy");

  h.containers.set("daax-aaaaaaaa", { "daax.owner": A });
  h.containers.set("daax-bbbbbbbb", { "daax.owner": B });
  h.containers.set("daax-00000000", {});
  h.containers.set("postgres", { "com.docker.compose.service": "pg" });

  h.testcontainers.set("tc-a", { "daax.owner": A });
  h.testcontainers.set("tc-b", { "daax.owner": B });
  h.compose.set("p-a", { id: "p-a", owner: A });
  h.compose.set("p-b", { id: "p-b", owner: B });

  h.worktrees.set("/workspace/repo", { owner: null, main: true });
  h.worktrees.set("/workspace/repo/.worktrees/a", { owner: A, main: false });
  h.worktrees.set("/workspace/repo/.worktrees/b", { owner: B, main: false });
});

// ===========================================================================
describe("recordings", () => {
  const ids = async (res: Response) =>
    ((await res.json()).recordings as { id: string }[]).map((r) => r.id).sort();

  it("a user lists only their own; an admin lists all, legacy included", async () => {
    as("A");
    expect(await ids(await listRecordings())).toEqual(["rec-a"]);
    as("B");
    expect(await ids(await listRecordings())).toEqual(["rec-b"]);
    as("ADMIN");
    expect(await ids(await listRecordings())).toEqual([
      "rec-a",
      "rec-b",
      "rec-legacy",
    ]);
  });

  it("unauthenticated is refused", async () => {
    as(null);
    expect((await listRecordings()).status).toBe(401);
  });

  it.each(["rec-b", "rec-legacy", "rec-missing"])(
    "A reading %s gets 404 (not-yours is not-found)",
    async (id) => {
      as("A");
      expect((await getRecording(req(), ctx("id", id))).status).toBe(404);
      expect((await exportRecording(req(), ctx("id", id))).status).toBe(404);
    },
  );

  it("A reads their own; the admin reads anyone's", async () => {
    as("A");
    expect((await getRecording(req(), ctx("id", "rec-a"))).status).toBe(200);
    as("ADMIN");
    expect((await getRecording(req(), ctx("id", "rec-b"))).status).toBe(200);
  });

  it("A deleting B's recording gets 404 and nothing is removed", async () => {
    as("A");
    const res = await deleteRecording(req("DELETE"), ctx("id", "rec-b"));
    expect(res.status).toBe(404);
    expect(h.files.has(join(RECORDINGS, "rec-b.json"))).toBe(true);
  });

  it("A deletes their own; the admin deletes a legacy one", async () => {
    as("A");
    expect(
      (await deleteRecording(req("DELETE"), ctx("id", "rec-a"))).status,
    ).toBe(200);
    expect(h.files.has(join(RECORDINGS, "rec-a.json"))).toBe(false);
    as("ADMIN");
    expect(
      (await deleteRecording(req("DELETE"), ctx("id", "rec-legacy"))).status,
    ).toBe(200);
  });

  it("delete, publish and create-pr need recording:write", async () => {
    as("NOPERM");
    expect(
      (await deleteRecording(req("DELETE"), ctx("id", "rec-a"))).status,
    ).toBe(403);
    expect(
      (await publishRecording(req("POST", {}), ctx("id", "rec-a"))).status,
    ).toBe(403);
    expect(
      (await createPrRecording(req("POST", {}), ctx("id", "rec-a"))).status,
    ).toBe(403);
  });

  it("A publishing or opening a PR from B's recording gets 404", async () => {
    as("A");
    expect(
      (await publishRecording(req("POST", {}), ctx("id", "rec-b"))).status,
    ).toBe(404);
    expect(
      (await createPrRecording(req("POST", {}), ctx("id", "rec-b"))).status,
    ).toBe(404);
  });
});

// ===========================================================================
describe("host containers (/api/containers)", () => {
  const names = async (res: Response) =>
    ((await res.json()).containers as { name: string }[])
      .map((c) => c.name)
      .sort();

  it("a user lists only containers labelled with their owner key", async () => {
    as("A");
    expect(await names(await listContainers(req()))).toEqual(["daax-aaaaaaaa"]);
    as("ADMIN");
    expect(await names(await listContainers(req()))).toEqual([
      "daax-00000000",
      "daax-aaaaaaaa",
      "daax-bbbbbbbb",
      "postgres",
    ]);
  });

  const actions = [
    ["start", startContainer],
    ["stop", stopContainer],
    ["restart", restartContainer],
  ] as const;

  it.each(["daax-bbbbbbbb", "postgres", "daax-00000000", "gone"])(
    "A acting on %s gets 404 and docker is never told to act",
    async (id) => {
      as("A");
      for (const [, fn] of actions) {
        expect((await fn(req("POST"), ctx("id", id))).status).toBe(404);
      }
      expect((await removeContainer(req("DELETE"), ctx("id", id))).status).toBe(
        404,
      );
      expect((await inspectContainer(req(), ctx("id", id))).status).toBe(404);
      expect((await containerLogs(req(), ctx("id", id))).status).toBe(404);
      expect(h.dockerOps).toEqual([]);
    },
  );

  it("A acts on their own container", async () => {
    as("A");
    for (const [name, fn] of actions) {
      expect((await fn(req("POST"), ctx("id", "daax-aaaaaaaa"))).status).toBe(
        200,
      );
      expect(h.dockerOps).toContain(`${name}:daax-aaaaaaaa`);
    }
  });

  it("the admin acts on B's and on unlabelled containers", async () => {
    as("ADMIN");
    expect(
      (await stopContainer(req("POST"), ctx("id", "daax-bbbbbbbb"))).status,
    ).toBe(200);
    expect(
      (await removeContainer(req("DELETE"), ctx("id", "postgres"))).status,
    ).toBe(200);
  });

  it("mutations need containers:write", async () => {
    as("NOPERM");
    expect(
      (await stopContainer(req("POST"), ctx("id", "daax-aaaaaaaa"))).status,
    ).toBe(403);
    expect(
      (await removeContainer(req("DELETE"), ctx("id", "daax-aaaaaaaa"))).status,
    ).toBe(403);
  });
});

// ===========================================================================
describe("AI container sessions (/api/ai/active-sessions)", () => {
  const sessionNames = async (res: Response) =>
    ((await res.json()).sessions as { containerName: string }[])
      .map((s) => s.containerName)
      .sort();

  it("a user lists only their own sessions; another tenant's are never probed", async () => {
    as("A");
    expect(await sessionNames(await listActive())).toEqual(["daax-aaaaaaaa"]);
    const probed = h.execCalls
      .filter((a) => a[0] === "inspect")
      .map((a) => a[a.length - 1]);
    expect(probed).not.toContain("daax-bbbbbbbb");
    as("ADMIN");
    expect(await sessionNames(await listActive())).toEqual([
      "daax-00000000",
      "daax-aaaaaaaa",
      "daax-bbbbbbbb",
    ]);
  });

  it("A killing B's session gets 404 and nothing is removed", async () => {
    as("A");
    const res = await killActive(req("DELETE"), ctx("name", "daax-bbbbbbbb"));
    expect(res.status).toBe(404);
    expect(h.dockerOps).toEqual([]);
  });

  it("A kills their own; the admin kills B's", async () => {
    as("A");
    expect(
      (await killActive(req("DELETE"), ctx("name", "daax-aaaaaaaa"))).status,
    ).toBe(200);
    as("ADMIN");
    expect(
      (await killActive(req("DELETE"), ctx("name", "daax-bbbbbbbb"))).status,
    ).toBe(200);
    expect(h.dockerOps).toEqual(["rm:daax-aaaaaaaa", "rm:daax-bbbbbbbb"]);
  });

  it("a reap by A removes only A's idle sessions", async () => {
    as("A");
    const res = await reapActive(req("POST", { idleThresholdSeconds: 60 }));
    expect(res.status).toBe(200);
    expect(h.dockerOps).toEqual(["rm:daax-aaaaaaaa"]);
  });

  it("kill and reap need containers:write", async () => {
    as("NOPERM");
    expect(
      (await killActive(req("DELETE"), ctx("name", "daax-aaaaaaaa"))).status,
    ).toBe(403);
    expect((await reapActive(req("POST", {}))).status).toBe(403);
  });
});

// ===========================================================================
describe("AI sessions (/api/ai/sessions)", () => {
  it("a session belongs to its creator; others get 404", async () => {
    as("A");
    const created = await createAiSession(
      req("POST", {
        agent: "claude-code",
        workingDirectory: "/workspace/repo",
      }),
    );
    expect(created.status).toBe(201);
    const { session } = await created.json();
    expect(session.owner).toBe(A);

    as("B");
    expect((await getAiSession(req(), ctx("id", session.id))).status).toBe(404);
    expect(
      (await stopAiSession(req("DELETE"), ctx("id", session.id))).status,
    ).toBe(404);
    expect((await (await listAiSessions()).json()).sessions).toEqual([]);

    as("ADMIN");
    expect((await getAiSession(req(), ctx("id", session.id))).status).toBe(200);
    expect((await (await listAiSessions()).json()).sessions).toHaveLength(1);
  });
});

// ===========================================================================
describe("testcontainers", () => {
  it("a user lists only their own containers and projects", async () => {
    as("A");
    const tc = await (await listTc(req())).json();
    expect(tc.containers.map((c: { id: string }) => c.id)).toEqual(["tc-a"]);
    expect(tc.total).toBe(1);
    const projects = await (await listCompose()).json();
    expect(projects.projects.map((p: { id: string }) => p.id)).toEqual(["p-a"]);
  });

  it("A on B's testcontainer gets 404 everywhere and nothing runs", async () => {
    as("A");
    const id = ctx("id", "tc-b");
    expect((await getTc(req(), id)).status).toBe(404);
    expect((await tcLogs(req(), ctx("id", "tc-b"))).status).toBe(404);
    expect((await tcStats(req(), ctx("id", "tc-b"))).status).toBe(404);
    expect((await tcStart(req("POST"), ctx("id", "tc-b"))).status).toBe(404);
    expect((await tcStop(req("POST"), ctx("id", "tc-b"))).status).toBe(404);
    expect((await tcRestart(req("POST"), ctx("id", "tc-b"))).status).toBe(404);
    expect((await removeTc(req("DELETE"), ctx("id", "tc-b"))).status).toBe(404);
    expect(h.tcOps).toEqual([]);
  });

  it("A on B's compose project gets 404 and nothing runs", async () => {
    as("A");
    expect((await getCompose(req(), ctx("id", "p-b"))).status).toBe(404);
    expect((await composeStart(req("POST"), ctx("id", "p-b"))).status).toBe(
      404,
    );
    expect((await composeStop(req("POST"), ctx("id", "p-b"))).status).toBe(404);
    expect((await removeCompose(req("DELETE"), ctx("id", "p-b"))).status).toBe(
      404,
    );
    expect(h.tcOps).toEqual([]);
  });

  it("creation stamps the caller's owner over any label the body supplies", async () => {
    as("A");
    const res = await createTc(
      req("POST", { image: "redis", labels: { "daax.owner": B } }),
    );
    expect(res.status).toBe(201);
    expect(h.tcOps[0]).toBe(`create:${JSON.stringify({ "daax.owner": A })}`);

    await createCompose(
      req("POST", { name: "x", yaml: "services: {}", owner: B }),
    );
    expect(h.tcOps).toContain(`compose-create:${A}`);
  });

  it("the global cleanup is admin-only", async () => {
    as("A");
    expect((await tcCleanup(req("POST"))).status).toBe(403);
  });

  it("the admin acts on B's testcontainer", async () => {
    as("ADMIN");
    expect((await tcStop(req("POST"), ctx("id", "tc-b"))).status).toBe(200);
  });
});

// ===========================================================================
describe("worktrees (/api/git/worktree)", () => {
  const url = "http://localhost/api/git/worktree?projectPath=/workspace/repo";
  const paths = async (res: Response) =>
    ((await res.json()).worktrees as { path: string }[])
      .map((w) => w.path)
      .sort();

  it("a user lists the shared main worktree and their own", async () => {
    as("A");
    const r = new Request(url) as unknown as NextRequest;
    Object.defineProperty(r, "nextUrl", { value: new URL(url) });
    expect(await paths(await listWorktreesRoute(r))).toEqual([
      "/workspace/repo",
      "/workspace/repo/.worktrees/a",
    ]);
  });

  it("creation records the caller as owner", async () => {
    as("A");
    await createWorktreeRoute(req("POST", { projectPath: "/workspace/repo" }));
    expect(h.gitOps).toEqual([`create:${A}`]);
  });

  it.each(["/workspace/repo/.worktrees/b", "/workspace/repo"])(
    "A removing %s gets 404 and git is never run",
    async (worktreePath) => {
      as("A");
      const res = await deleteWorktreeRoute(
        req("DELETE", { projectPath: "/workspace/repo", worktreePath }),
      );
      expect(res.status).toBe(404);
      expect(h.gitOps).toEqual([]);
    },
  );

  it("A removes their own; the admin removes B's", async () => {
    as("A");
    await deleteWorktreeRoute(
      req("DELETE", {
        projectPath: "/workspace/repo",
        worktreePath: "/workspace/repo/.worktrees/a",
      }),
    );
    as("ADMIN");
    await deleteWorktreeRoute(
      req("DELETE", {
        projectPath: "/workspace/repo",
        worktreePath: "/workspace/repo/.worktrees/b",
      }),
    );
    expect(h.gitOps).toEqual([
      "cleanup:/workspace/repo/.worktrees/a",
      "cleanup:/workspace/repo/.worktrees/b",
    ]);
  });

  it("create and remove need terminal:exec", async () => {
    as("NOPERM");
    expect(
      (
        await createWorktreeRoute(
          req("POST", { projectPath: "/workspace/repo" }),
        )
      ).status,
    ).toBe(403);
  });
});

// ===========================================================================
describe("server-side settings", () => {
  it("a user writes only their own row, and only unlocked keys", async () => {
    as("A");
    const ok = await putUserSettingsRoute(
      req("PUT", { settings: { containerImage: "daax-agent:mine" } }),
    );
    expect(ok.status).toBe(200);
    expect(h.savedSettings).toEqual([
      { sub: A, s: { containerImage: "daax-agent:mine" } },
    ]);

    h.effective = {
      settings: { containerImage: "daax-agent:locked" },
      locked: ["containerImage"],
    };
    const locked = await putUserSettingsRoute(
      req("PUT", { settings: { containerImage: "evil:latest" } }),
    );
    expect(locked.status).toBe(409);
  });

  it("a user cannot set the admin-only mountRoot", async () => {
    as("A");
    const res = await putUserSettingsRoute(
      req("PUT", { settings: { mountRoot: "" } }),
    );
    expect(res.status).toBe(400);
  });

  it("GET reports the effective values and locks", async () => {
    h.effective = { settings: { basePath: "~/prj" }, locked: ["basePath"] };
    as("B");
    const body = await (await getUserSettingsRoute()).json();
    expect(body).toMatchObject({
      serverSide: true,
      settings: { basePath: "~/prj" },
      locked: ["basePath"],
    });
  });

  it("the policy and per-user overrides are admin-only", async () => {
    as("A");
    expect((await getPolicyRoute()).status).toBe(403);
    expect(
      (await putPolicyRoute(req("PUT", { defaults: {}, locks: [] }))).status,
    ).toBe(403);
    expect(
      (
        await putOverridesRoute(
          req("PUT", { overrides: { mountRoot: "users/b" } }),
          ctx("subject", B),
        )
      ).status,
    ).toBe(403);
    as("ADMIN");
    expect(
      (
        await putPolicyRoute(
          req("PUT", { defaults: {}, locks: ["containerImage"] }),
        )
      ).status,
    ).toBe(200);
  });

  it("writing own settings needs settings:write", async () => {
    as("NOPERM");
    expect(
      (await putUserSettingsRoute(req("PUT", { settings: {} }))).status,
    ).toBe(403);
  });
});

// ===========================================================================
describe("docker pull", () => {
  it("needs containers:write", async () => {
    as("NOPERM");
    expect((await dockerPull(req("POST", { image: "redis" }))).status).toBe(
      403,
    );
  });
});

// ===========================================================================
describe("surfaces with no daax owner to filter on are admin-only", () => {
  it("transcripts, Watchtower and Agent View refuse a user (403)", async () => {
    as("A");
    expect((await listTranscripts()).status).toBe(403);
    expect((await getTranscript(req(), ctx("id", "claude:x"))).status).toBe(
      403,
    );
    expect((await watchtowerAttention(req())).status).toBe(403);
    expect((await watchtowerTools(req(), ctx("id", "s1"))).status).toBe(403);
    expect(
      (
        await agentviewGet(req(), {
          params: Promise.resolve({ path: ["agents"] }),
        })
      ).status,
    ).toBe(403);
  });
});

// ===========================================================================
describe("testcontainer / compose bind mounts stay inside the tenant boundary", () => {
  const create = (source: string) =>
    createTc(
      req("POST", {
        image: "redis",
        volumes: [{ source, target: "/data" }],
      }),
    );

  it("a user confined by mountRoot cannot bind another tenant's directory", async () => {
    h.effective = { settings: { mountRoot: "users/a" }, locked: ["mountRoot"] };
    as("A");
    expect((await create("/workspace/users/b/data")).status).toBe(400);
    expect((await create("/workspace/users/a/data")).status).toBe(201);
  });

  it.each([
    "/workspace/.daax/users/bbbbbbbb",
    "/workspace/.daax",
    "/workspace",
  ])("a user cannot bind %s (credential stores)", async (source) => {
    as("A");
    expect((await create(source)).status).toBe(400);
    expect(h.tcOps).toEqual([]);
  });

  it("the admin is not narrowed by the tenant boundary", async () => {
    as("ADMIN");
    expect((await create("/workspace/users/b/data")).status).toBe(201);
  });

  it("a compose service binding .daax is refused before anything is stored", async () => {
    as("A");
    const res = await createCompose(
      req("POST", {
        name: "x",
        yaml: "services:\n  db:\n    image: redis\n    volumes:\n      - /workspace/.daax:/x\n",
      }),
    );
    expect(res.status).toBe(400);
    expect(h.tcOps).toEqual([]);
  });
});

describe("named volumes are admin-only (they have no owner)", () => {
  const create = (source: string) =>
    createTc(
      req("POST", {
        image: "postgres:16",
        volumes: [{ source, target: "/var/lib/postgresql/data" }],
      }),
    );

  it.each(["daax_daax-pg-data", "daax_daax-recordings", "pgdata"])(
    "a user cannot mount the named volume %s",
    async (source) => {
      as("A");
      const res = await create(source);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Named volumes are admin-only/);
      expect(h.tcOps).toEqual([]);
    },
  );

  it("the admin may mount a named volume", async () => {
    as("ADMIN");
    expect((await create("pgdata")).status).toBe(201);
  });

  it("a compose service mounting a named volume is refused for a user", async () => {
    as("A");
    const res = await createCompose(
      req("POST", {
        name: "x",
        yaml: "services:\n  db:\n    image: redis\n    volumes:\n      - daax_daax-pg-data:/data\n",
      }),
    );
    expect(res.status).toBe(400);
    expect(h.tcOps).toEqual([]);
  });
});

describe("testcontainer binds with a symlinked tenant base", () => {
  it("are refused when the base resolves outside the workspace", async () => {
    // A tenant base outside the workspace: containment in the base alone
    // would pass, containment in the workspace root does not.
    h.effective = { settings: { mountRoot: "users/a" }, locked: ["mountRoot"] };
    as("A");
    const res = await createTc(
      req("POST", {
        image: "redis",
        volumes: [{ source: "/etc", target: "/data" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(h.tcOps).toEqual([]);
  });
});
