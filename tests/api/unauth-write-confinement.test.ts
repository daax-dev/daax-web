/**
 * Auth + path-confinement tests for the unauthenticated arbitrary-directory
 * write routes (#187, Fable Review H2):
 *   - POST /api/devcontainers/save-local
 *   - POST /api/devcontainers/save        (sibling audit route, AC#4)
 *   - POST /api/workflow-editor/save
 *   - POST /api/workflow-editor/create    (sibling audit route, AC#4)
 *   - PUT  /api/workflow-editor/agents
 *   - PUT  /api/workflow-editor/prompts
 *   - PUT  /api/workflow-editor/skills
 *   - POST /api/workflow-editor/skills
 *
 * For each write route we assert three things deterministically:
 *   (a) a traversal payload (`../../…` or absolute path outside the root) is
 *       REJECTED (403) and NO file is written;
 *   (b) an unauthenticated request returns 401 and NO file is written (the
 *       guard runs before any fs write);
 *   (c) a legitimate in-root, authenticated request writes to the expected
 *       confined path.
 *
 * `@/lib/auth` is mocked so the real LOCAL_OPERATOR bypass never runs — the
 * guard is asserted regardless of DAAX_REQUIRE_AUTH. `@/lib/settings` is mocked
 * to a fixed workspace root so the confinement boundary is machine-independent.
 * `fs`/`fs/promises` writes are stubbed so nothing is written to disk and the
 * exact target path is observable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const WORKSPACE_ROOT = "/workspace";

const {
  mockRequireAuth,
  mockWriteFile,
  mockMkdir,
  mockAccess,
  mockReadFile,
  mockExistsSync,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockAccess: vi.fn(),
  mockReadFile: vi.fn(),
  mockExistsSync: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

// Fixed, machine-independent workspace root for confinement math. expandPath is
// identity for absolute paths and maps the base `~/prj` marker to the root.
vi.mock("@/lib/settings", () => ({
  getSettings: () => ({ basePath: "~/prj" }),
  expandPath: (p: string) => (p === "~/prj" ? WORKSPACE_ROOT : p),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const overrides = {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
    readFile: mockReadFile,
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});

// Route handlers import fs via different bindings:
//   devcontainers/save-local -> import { writeFile, mkdir } from "fs/promises"
//   workflow-editor/*        -> import { promises as fs } from "fs"
// Mock BOTH surfaces so every route's write path is intercepted.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const promises = {
    ...actual.promises,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
    readFile: mockReadFile,
  };
  return {
    ...actual,
    existsSync: mockExistsSync,
    promises,
    default: { ...actual, existsSync: mockExistsSync, promises },
  };
});

import { POST as saveLocalPOST } from "@/app/api/devcontainers/save-local/route";
import { POST as devSavePOST } from "@/app/api/devcontainers/save/route";
import { POST as workflowSavePOST } from "@/app/api/workflow-editor/save/route";
import { POST as workflowCreatePOST } from "@/app/api/workflow-editor/create/route";
import { PUT as agentsPUT } from "@/app/api/workflow-editor/agents/route";
import { PUT as promptsPUT } from "@/app/api/workflow-editor/prompts/route";
import {
  PUT as skillsPUT,
  POST as skillsPOST,
} from "@/app/api/workflow-editor/skills/route";

const AUTH_USER = {
  username: "tester",
  email: null,
  groups: [],
  authenticated: true as const,
  pictureUrl: null,
};

function authenticated() {
  mockRequireAuth.mockResolvedValue({ authenticated: true, user: AUTH_USER });
}

function unauthenticated() {
  mockRequireAuth.mockResolvedValue({
    authenticated: false,
    response: NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    ),
  });
}

function jsonReq(body: unknown, method: string): Request {
  return new Request("http://localhost/api/test", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// No file may be written outside the workspace / project root. Every write must
// resolve to an absolute path inside the confinement root.
function assertNoEscapedWrite(root: string) {
  for (const call of mockWriteFile.mock.calls) {
    const target = String(call[0]);
    expect(target.startsWith(root + "/") || target === root).toBe(true);
  }
}

let prevHostWorkspace: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  // access() rejects => "no existing file" branches (no backup / create path).
  mockAccess.mockRejectedValue(new Error("ENOENT"));
  mockReadFile.mockRejectedValue(new Error("ENOENT"));
  mockExistsSync.mockReturnValue(false);
  // Container mode: the devcontainers route derives its workspace root from
  // HOST_WORKSPACE_PATH -> "/workspace" (its own resolver, not @/lib/settings),
  // so set it here to pin that root deterministically. The workflow-editor
  // routes ignore this var (they use the mocked getSettings/expandPath).
  prevHostWorkspace = process.env.HOST_WORKSPACE_PATH;
  process.env.HOST_WORKSPACE_PATH = "/host/prj";
});

afterEach(() => {
  if (prevHostWorkspace === undefined) delete process.env.HOST_WORKSPACE_PATH;
  else process.env.HOST_WORKSPACE_PATH = prevHostWorkspace;
});

// ---------------------------------------------------------------------------
// devcontainers/save-local (project confined to /workspace)
// ---------------------------------------------------------------------------
describe("POST /api/devcontainers/save-local (#187)", () => {
  const legit = {
    project: "ps/daax",
    name: "default",
    devcontainerJson: '{"image":"x"}',
    destination: "devcontainer",
    basePath: "~/prj",
  };

  it("rejects a traversal `project` with 403 and writes nothing", async () => {
    authenticated();
    const res = await saveLocalPOST(
      jsonReq({ ...legit, project: "../../../../etc/cron.d" }, "POST"),
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await saveLocalPOST(jsonReq(legit, "POST"));
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes the confined devcontainer.json when authenticated + in-root (container mode)", async () => {
    authenticated();
    mockExistsSync.mockReturnValue(false);
    const res = await saveLocalPOST(jsonReq(legit, "POST"));
    expect(res.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const target = String(mockWriteFile.mock.calls[0][0]);
    expect(target).toBe("/workspace/ps/daax/.devcontainer/devcontainer.json");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });

  it("host mode: ignores a malicious body `basePath` — root is server-derived, no out-of-root write", async () => {
    // Host-dev mode (the CSRF vector in the issue): HOST_WORKSPACE_PATH unset.
    // The confinement root must come from server config (mocked getSettings /
    // expandPath("~/prj") -> /workspace), NOT the attacker-supplied basePath.
    delete process.env.HOST_WORKSPACE_PATH;
    authenticated();
    const res = await saveLocalPOST(
      jsonReq({ ...legit, basePath: "/tmp/pwn", project: "x" }, "POST"),
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    // Root is the configured workspace, not the body's /tmp/pwn.
    expect(target.startsWith(WORKSPACE_ROOT + "/")).toBe(true);
    expect(target).not.toContain("/tmp/pwn");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// devcontainers/save (projectPath + each client filename confined to /workspace)
// ---------------------------------------------------------------------------
describe("POST /api/devcontainers/save (#187, AC#4 sibling)", () => {
  const legit = {
    projectPath: "ps/daax",
    files: { "devcontainer.json": '{"image":"x"}' },
  };

  it("rejects a traversal `projectPath` with 403 and writes nothing", async () => {
    authenticated();
    const res = await devSavePOST(
      jsonReq(
        { ...legit, projectPath: "../../../../etc/cron.d" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a sibling-prefix `projectPath` (/workspace-evil) with 403", async () => {
    authenticated();
    const res = await devSavePOST(
      jsonReq(
        { ...legit, projectPath: "../workspace-evil/x" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a traversal `files` KEY with 403 and writes nothing (atomic batch)", async () => {
    authenticated();
    // Project exists so execution reaches the filename-confine pre-pass.
    mockAccess.mockResolvedValue(undefined);
    const res = await devSavePOST(
      jsonReq(
        {
          projectPath: "ps/daax",
          files: {
            "devcontainer.json": "ok",
            "../../../../tmp/pwned": "x",
          },
        },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    // One bad key rejects the whole batch — no partial write of the legit file.
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await devSavePOST(jsonReq(legit, "POST") as never);
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes the confined devcontainer file when authenticated + in-root", async () => {
    authenticated();
    mockAccess.mockResolvedValue(undefined);
    const res = await devSavePOST(jsonReq(legit, "POST") as never);
    expect(res.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const target = String(mockWriteFile.mock.calls[0][0]);
    expect(target).toBe("/workspace/ps/daax/.devcontainer/devcontainer.json");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// workflow-editor/save (projectPath confined to /workspace)
// ---------------------------------------------------------------------------
describe("POST /api/workflow-editor/save (#187)", () => {
  it("rejects an out-of-root projectPath with 403 and writes nothing", async () => {
    authenticated();
    const res = await workflowSavePOST(
      jsonReq(
        { projectPath: "/etc/systemd/user", config: { a: 1 } },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a traversal projectPath with 403 and writes nothing", async () => {
    authenticated();
    const res = await workflowSavePOST(
      jsonReq(
        { projectPath: "/workspace/../../etc", config: { a: 1 } },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await workflowSavePOST(
      jsonReq(
        { projectPath: "/workspace/proj", config: { a: 1 } },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes flowspec_workflow.yml in-root when authenticated", async () => {
    authenticated();
    const res = await workflowSavePOST(
      jsonReq(
        { projectPath: "/workspace/proj", config: { a: 1 } },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe("/workspace/proj/flowspec_workflow.yml");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// workflow-editor/create (projectPath confined to /workspace)
// ---------------------------------------------------------------------------
describe("POST /api/workflow-editor/create (#187, AC#4 sibling)", () => {
  it("rejects an out-of-root projectPath with 403 and writes nothing", async () => {
    authenticated();
    const res = await workflowCreatePOST(
      jsonReq(
        { projectPath: "/etc/systemd/user", template: "minimal" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a traversal projectPath with 403 and writes nothing", async () => {
    authenticated();
    const res = await workflowCreatePOST(
      jsonReq(
        { projectPath: "/workspace/../../etc", template: "minimal" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await workflowCreatePOST(
      jsonReq(
        { projectPath: "/workspace/proj", template: "minimal" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes flowspec_workflow.yml in-root when authenticated", async () => {
    authenticated();
    const res = await workflowCreatePOST(
      jsonReq(
        { projectPath: "/workspace/proj", template: "minimal" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe("/workspace/proj/flowspec_workflow.yml");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// workflow-editor/agents PUT (name confined under /workspace)
// ---------------------------------------------------------------------------
describe("PUT /api/workflow-editor/agents (#187)", () => {
  it("rejects a traversal `name` with 403 and writes nothing", async () => {
    authenticated();
    const res = await agentsPUT(
      jsonReq(
        { name: "../../../../etc/cron.d/x", content: "pwn" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await agentsPUT(
      jsonReq({ name: "my-agent", content: "hi" }, "PUT") as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes a confined agent file when authenticated", async () => {
    authenticated();
    const res = await agentsPUT(
      jsonReq({ name: "my-agent", content: "hi" }, "PUT") as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe("/workspace/jp/flowspec/.agents/my-agent.md");
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// workflow-editor/prompts PUT (name/category confined under /workspace)
// ---------------------------------------------------------------------------
describe("PUT /api/workflow-editor/prompts (#187)", () => {
  it("rejects a traversal `name` with 403 and writes nothing", async () => {
    authenticated();
    const res = await promptsPUT(
      jsonReq(
        {
          name: "../../../../../../../../etc/cron.d/x",
          content: "pwn",
          category: "flow",
        },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await promptsPUT(
      jsonReq(
        { name: "greet", content: "hi", category: "flow" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes a confined prompt file when authenticated", async () => {
    authenticated();
    const res = await promptsPUT(
      jsonReq(
        { name: "greet", content: "hi", category: "flow" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe(
      "/workspace/jp/flowspec/.claude/commands/flow/greet.md",
    );
    assertNoEscapedWrite(WORKSPACE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// workflow-editor/skills PUT + POST (confined to process.cwd())
// ---------------------------------------------------------------------------
describe("workflow-editor/skills (#187)", () => {
  const projectRoot = process.cwd();

  it("PUT rejects a traversal path with 403 and writes nothing", async () => {
    authenticated();
    const res = await skillsPUT(
      jsonReq(
        { path: "../../../../etc/cron.d/x", content: "pwn" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("PUT returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await skillsPUT(
      jsonReq(
        { path: ".claude/commands/flow/x.md", content: "hi" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("PUT writes a confined file when authenticated", async () => {
    authenticated();
    const res = await skillsPUT(
      jsonReq(
        { path: ".claude/commands/flow/x.md", content: "hi" },
        "PUT",
      ) as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe(`${projectRoot}/.claude/commands/flow/x.md`);
    assertNoEscapedWrite(projectRoot);
  });

  it("POST rejects a traversal `name` with 403 and writes nothing", async () => {
    authenticated();
    const res = await skillsPOST(
      jsonReq(
        { name: "../../../../etc/cron.d/x", type: "command", content: "pwn" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(403);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("POST returns 401 when unauthenticated and writes nothing", async () => {
    unauthenticated();
    const res = await skillsPOST(
      jsonReq(
        { name: "newcmd", type: "command", phase: "flow", content: "hi" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("POST writes a confined file when authenticated", async () => {
    authenticated();
    const res = await skillsPOST(
      jsonReq(
        { name: "newcmd", type: "command", phase: "flow", content: "hi" },
        "POST",
      ) as never,
    );
    expect(res.status).toBe(200);
    const target = String(mockWriteFile.mock.calls.at(-1)?.[0]);
    expect(target).toBe(`${projectRoot}/.claude/commands/flow/newcmd.md`);
    assertNoEscapedWrite(projectRoot);
  });
});
