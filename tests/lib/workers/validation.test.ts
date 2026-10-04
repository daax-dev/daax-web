import { describe, it, expect } from "vitest";
import {
  LIMITS,
  checkRunPolicy,
  cronError,
  parseGoal,
  parseRunRequest,
  parseWorkerCreate,
  parseWorkerPatch,
} from "@/lib/workers/validation";

const base = { slug: "tpm-1", name: "TPM" };

function err(r: { ok: boolean; error?: string }): string {
  expect(r.ok).toBe(false);
  return (r as { error: string }).error;
}

describe("parseWorkerCreate", () => {
  it("rejects a UUID-shaped slug (workers are looked up by id or slug)", () => {
    const r = parseWorkerCreate({
      ...base,
      slug: "12345678-1234-1234-1234-123456789abc",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must not look like a UUID/);
  });

  it("accepts a minimal body and strips undefined fields", () => {
    const r = parseWorkerCreate(base);
    expect(r).toEqual({ ok: true, value: { slug: "tpm-1", name: "TPM" } });
  });

  it("rejects non-object bodies", () => {
    expect(err(parseWorkerCreate(null))).toMatch(/JSON object/);
    expect(err(parseWorkerCreate([]))).toMatch(/JSON object/);
    expect(err(parseWorkerCreate("x"))).toMatch(/JSON object/);
  });

  it.each([
    ["A", "uppercase / too short"],
    ["a", "single char"],
    ["Abc", "uppercase"],
    ["-abc", "leading dash"],
    ["ab_c", "underscore"],
    ["a".repeat(50), "too long"],
    [123, "non-string"],
    [undefined, "missing"],
  ] as [unknown, string][])("rejects slug %j (%s)", (slug) => {
    expect(err(parseWorkerCreate({ ...base, slug }))).toMatch(
      /slug is required/,
    );
  });

  it.each([
    "deadbeef-dead-beef-dead-beefdeadbeef",
    "11111111-2222-4333-8444-555555555555",
  ])("rejects UUID-shaped slug %j", (slug) => {
    expect(err(parseWorkerCreate({ ...base, slug }))).toMatch(
      /slug must not look like a UUID/,
    );
  });

  it.each([
    "ab",
    "a1",
    "1a-b",
    "a".repeat(49),
    "tpm-weekly-2",
    // 36 hex chars without the 8-4-4-4-12 dashes is not a UUID.
    "abcdefabcdefabcdefabcdefabcdefabcdef",
  ])("accepts slug %j", (slug) => {
    expect(parseWorkerCreate({ ...base, slug }).ok).toBe(true);
  });

  it("requires name, and rejects blank name", () => {
    expect(err(parseWorkerCreate({ slug: "ab" }))).toMatch(/name is required/);
    expect(err(parseWorkerCreate({ slug: "ab", name: "   " }))).toMatch(
      /name must not be empty/,
    );
    expect(err(parseWorkerCreate({ slug: "ab", name: 5 }))).toMatch(/name/);
    expect(
      err(
        parseWorkerCreate({ slug: "ab", name: "x".repeat(LIMITS.nameMax + 1) }),
      ),
    ).toMatch(/at most 100/);
  });

  it("validates cron via croner", () => {
    expect(
      parseWorkerCreate({
        ...base,
        runMode: "schedule",
        cron: "0 8,16 * * 1-5",
      }).ok,
    ).toBe(true);
    expect(
      err(
        parseWorkerCreate({ ...base, runMode: "schedule", cron: "not a cron" }),
      ),
    ).toMatch(/cron is invalid/);
    expect(err(parseWorkerCreate({ ...base, cron: "99 * * * *" }))).toMatch(
      /cron is invalid/,
    );
    expect(cronError("*/5 * * * *")).toBeNull();
    expect(cronError("nope")).toMatch(/^cron is invalid:/);
  });

  it("requires cron when runMode is schedule (missing, null, empty)", () => {
    for (const cron of [undefined, null, ""]) {
      expect(
        err(parseWorkerCreate({ ...base, runMode: "schedule", cron })),
      ).toMatch(/cron is required when runMode is schedule/);
    }
  });

  it("does not require cron for adhoc/continuous", () => {
    expect(parseWorkerCreate({ ...base, runMode: "adhoc" }).ok).toBe(true);
    expect(parseWorkerCreate({ ...base, runMode: "continuous" }).ok).toBe(true);
  });

  it.each([
    ["cooldownSeconds", LIMITS.cooldownMin, LIMITS.cooldownMax],
    ["maxRunsPerDay", LIMITS.runsPerDayMin, LIMITS.runsPerDayMax],
    ["timeoutSeconds", LIMITS.timeoutMin, LIMITS.timeoutMax],
  ])("bounds %s to [%i, %i] integers", (key, min, max) => {
    expect(parseWorkerCreate({ ...base, [key]: min }).ok).toBe(true);
    expect(parseWorkerCreate({ ...base, [key]: max }).ok).toBe(true);
    for (const bad of [min - 1, max + 1, 1.5 + min, String(min), null]) {
      expect(err(parseWorkerCreate({ ...base, [key]: bad }))).toMatch(
        new RegExp(`${key} must be an integer between ${min} and ${max}`),
      );
    }
  });

  it.each([
    ["engine", "claude-cli", "gpt"],
    ["runMode", "continuous", "hourly"],
    ["autonomy", "act", "god"],
    ["executor", "container", "vm"],
    ["role", "tpm", "ceo"],
  ])("enum %s accepts %s and rejects %s", (key, good, bad) => {
    expect(parseWorkerCreate({ ...base, [key]: good }).ok).toBe(true);
    expect(err(parseWorkerCreate({ ...base, [key]: bad }))).toMatch(
      new RegExp(`${key} must be one of`),
    );
  });

  it("workingDir may be absolute or relative; NUL rejected; empty becomes null", () => {
    expect(parseWorkerCreate({ ...base, workingDir: "/workspace/p" }).ok).toBe(
      true,
    );
    const rel = parseWorkerCreate({ ...base, workingDir: "rel/p" });
    expect(rel.ok && rel.value.workingDir).toBe("rel/p");
    expect(err(parseWorkerCreate({ ...base, workingDir: "a\0b" }))).toMatch(
      /workingDir must not contain NUL/,
    );
    const r = parseWorkerCreate({ ...base, workingDir: "" });
    expect(r.ok && r.value.workingDir).toBeNull();
    const m = parseWorkerCreate({ ...base, model: "" });
    expect(m.ok && m.value.model).toBeNull();
  });

  it("validates enabled as boolean", () => {
    const r = parseWorkerCreate({ ...base, enabled: true });
    expect(r.ok && r.value.enabled).toBe(true);
    expect(err(parseWorkerCreate({ ...base, enabled: "yes" }))).toMatch(
      /enabled must be a boolean/,
    );
  });

  it("joins multiple errors with '; '", () => {
    const e = err(parseWorkerCreate({ slug: "A", engine: "x" }));
    expect(e.split("; ").length).toBeGreaterThanOrEqual(3);
  });

  describe("mcpServers", () => {
    const create = (mcpServers: unknown) =>
      parseWorkerCreate({ ...base, mcpServers });

    it("accepts refs and inline stdio/http", () => {
      const r = create([
        { kind: "ref", id: "github" },
        {
          kind: "inline",
          id: "backlog",
          type: "stdio",
          command: "backlog",
          args: ["mcp", "start"],
          envPassthrough: ["GITHUB_TOKEN", "_X1"],
        },
        {
          kind: "inline",
          id: "remote.x",
          type: "http",
          url: "https://mcp.example.com/mcp",
        },
      ]);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.mcpServers).toEqual([
        { kind: "ref", id: "github" },
        {
          kind: "inline",
          id: "backlog",
          type: "stdio",
          command: "backlog",
          args: ["mcp", "start"],
          url: undefined,
          envPassthrough: ["GITHUB_TOKEN", "_X1"],
        },
        {
          kind: "inline",
          id: "remote.x",
          type: "http",
          command: undefined,
          args: undefined,
          url: "https://mcp.example.com/mcp",
          envPassthrough: undefined,
        },
      ]);
    });

    it("drops extra fields on refs (no inline config smuggled through a ref)", () => {
      const r = create([
        { kind: "ref", id: "gh", command: "rm", env: { A: "b" } },
      ]);
      expect(r.ok && r.value.mcpServers).toEqual([{ kind: "ref", id: "gh" }]);
    });

    it("rejects non-array and more than 20 entries", () => {
      expect(err(create({}))).toMatch(/array of at most 20/);
      const many = Array.from({ length: 21 }, (_, i) => ({
        kind: "ref",
        id: `s${i}`,
      }));
      expect(err(create(many))).toMatch(/array of at most 20/);
      expect(create(many.slice(0, 20)).ok).toBe(true);
    });

    it("rejects invalid and duplicate ids", () => {
      expect(err(create([{ kind: "ref", id: "bad id!" }]))).toMatch(
        /mcpServers\[0\]\.id/,
      );
      expect(err(create([{ kind: "ref" }]))).toMatch(/mcpServers\[0\]\.id/);
      expect(err(create(["x"]))).toMatch(/mcpServers\[0\]\.id/);
      expect(
        err(
          create([
            { kind: "ref", id: "a" },
            { kind: "ref", id: "a" },
          ]),
        ),
      ).toMatch(/mcpServers\[1\]\.id "a" is duplicated/);
    });

    it("rejects unknown kind and type", () => {
      expect(err(create([{ kind: "magic", id: "a" }]))).toMatch(/kind must be/);
      expect(err(create([{ kind: "inline", id: "a", type: "sse" }]))).toMatch(
        /type must be "stdio" or "http"/,
      );
    });

    it("requires a command for stdio and string args", () => {
      expect(err(create([{ kind: "inline", id: "a", type: "stdio" }]))).toMatch(
        /command is required/,
      );
      expect(
        err(
          create([{ kind: "inline", id: "a", type: "stdio", command: "  " }]),
        ),
      ).toMatch(/command is required/);
      expect(
        err(
          create([
            { kind: "inline", id: "a", type: "stdio", command: "x", args: [1] },
          ]),
        ),
      ).toMatch(/args must be an array of strings/);
      expect(
        err(
          create([
            {
              kind: "inline",
              id: "a",
              type: "stdio",
              command: "x",
              args: "a b",
            },
          ]),
        ),
      ).toMatch(/args must be an array of strings/);
    });

    it.each([
      "ftp://x.example",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "not a url",
      undefined,
    ])("rejects http url %j", (url) => {
      expect(
        err(create([{ kind: "inline", id: "a", type: "http", url }])),
      ).toMatch(/url must be an http\(s\) URL/);
    });

    it("envPassthrough must be env var NAMES, not values", () => {
      const inline = (envPassthrough: unknown) =>
        create([
          {
            kind: "inline",
            id: "a",
            type: "stdio",
            command: "x",
            envPassthrough,
          },
        ]);
      for (const bad of [
        ["GITHUB_TOKEN=ghp_secret"],
        ["lower_case"],
        ["1ABC"],
        [{ GITHUB_TOKEN: "x" }],
        { GITHUB_TOKEN: "x" },
        "GITHUB_TOKEN",
        Array.from({ length: 21 }, (_, i) => `V${i}`),
      ]) {
        expect(err(inline(bad))).toMatch(
          /envPassthrough must list environment variable NAMES/,
        );
      }
      expect(inline(["A", "B_2"]).ok).toBe(true);
    });

    it("envPassthrough rejects reserved daax/engine variables", () => {
      const inline = (envPassthrough: unknown) =>
        create([
          {
            kind: "inline",
            id: "a",
            type: "stdio",
            command: "x",
            envPassthrough,
          },
        ]);
      for (const name of [
        "DATABASE_URL",
        "PGPASSWORD",
        "DAAX_WS_TOKEN_SECRET",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "PATH",
        "LD_PRELOAD",
      ]) {
        expect(err(inline(["GITHUB_TOKEN", name]))).toMatch(
          new RegExp(`cannot include daax or engine variables: ${name}`),
        );
      }
      expect(inline(["GITHUB_TOKEN"]).ok).toBe(true);
    });
  });
});

describe("parseWorkerPatch", () => {
  it("slug is immutable", () => {
    expect(err(parseWorkerPatch({ slug: "new" }))).toBe(
      "slug cannot be changed",
    );
  });

  it("accepts partial updates without requiring name/slug and strips undefined", () => {
    expect(parseWorkerPatch({ enabled: true })).toEqual({
      ok: true,
      value: { enabled: true },
    });
    expect(parseWorkerPatch({})).toEqual({ ok: true, value: {} });
  });

  it("keeps explicit nulls (clearing cron/model/workingDir)", () => {
    expect(
      parseWorkerPatch({ cron: null, model: "", workingDir: null }),
    ).toEqual({
      ok: true,
      value: { cron: null, model: null, workingDir: null },
    });
  });

  it("does not apply the cross-field schedule rule (caller does)", () => {
    expect(parseWorkerPatch({ runMode: "schedule" }).ok).toBe(true);
  });

  it("still validates fields", () => {
    expect(err(parseWorkerPatch({ name: "" }))).toMatch(
      /name must not be empty/,
    );
    expect(err(parseWorkerPatch({ cron: "bad" }))).toMatch(/cron is invalid/);
    expect(err(parseWorkerPatch(null))).toMatch(/JSON object/);
  });
});

describe("checkRunPolicy", () => {
  it("requires cron for schedule mode only", () => {
    expect(checkRunPolicy({ runMode: "schedule", cron: null })).toMatch(
      /cron is required/,
    );
    expect(
      checkRunPolicy({ runMode: "schedule", cron: "0 * * * *" }),
    ).toBeNull();
    expect(checkRunPolicy({ runMode: "adhoc", cron: null })).toBeNull();
    expect(checkRunPolicy({ runMode: "continuous", cron: null })).toBeNull();
  });
});

describe("parseGoal", () => {
  it("full: requires a non-blank title and trims it", () => {
    expect(err(parseGoal({}, false))).toMatch(/title is required/);
    expect(err(parseGoal({ title: "  " }, false))).toMatch(/title is required/);
    expect(parseGoal({ title: "  Ship v1 " }, false)).toEqual({
      ok: true,
      value: { title: "Ship v1" },
    });
  });

  it("partial: title optional but not blank", () => {
    expect(parseGoal({ status: "done" }, true)).toEqual({
      ok: true,
      value: { status: "done" },
    });
    expect(err(parseGoal({ title: " " }, true))).toMatch(
      /title must not be empty/,
    );
  });

  it("validates status, priority, lengths, projectRef", () => {
    expect(err(parseGoal({ title: "t", status: "paused" }, false))).toMatch(
      /status must be one of/,
    );
    expect(err(parseGoal({ title: "t", priority: 101 }, false))).toMatch(
      /priority/,
    );
    expect(err(parseGoal({ title: "t", priority: 1.5 }, false))).toMatch(
      /priority/,
    );
    expect(parseGoal({ title: "t", priority: -100 }, false).ok).toBe(true);
    expect(
      err(parseGoal({ title: "x".repeat(LIMITS.goalTitleMax + 1) }, false)),
    ).toMatch(/at most 200/);
    expect(
      err(
        parseGoal(
          { title: "t", description: "x".repeat(LIMITS.goalTextMax + 1) },
          false,
        ),
      ),
    ).toMatch(/description must be at most/);
    const r = parseGoal({ title: "t", projectRef: "" }, false);
    expect(r.ok && r.value.projectRef).toBeNull();
    expect(err(parseGoal("x", false))).toMatch(/JSON object/);
  });
});

describe("parseRunRequest", () => {
  it("defaults to trigger adhoc and empty input for missing bodies", () => {
    expect(parseRunRequest(undefined)).toEqual({
      ok: true,
      value: { input: "", trigger: "adhoc" },
    });
    expect(parseRunRequest(null)).toEqual({
      ok: true,
      value: { input: "", trigger: "adhoc" },
    });
    expect(parseRunRequest({})).toEqual({
      ok: true,
      value: { input: "", trigger: "adhoc" },
    });
  });

  it("trims input and accepts cli/voice triggers", () => {
    expect(parseRunRequest({ input: "  status? ", trigger: "voice" })).toEqual({
      ok: true,
      value: { input: "status?", trigger: "voice" },
    });
    expect(parseRunRequest({ trigger: "cli" }).ok).toBe(true);
  });

  it("rejects automatic triggers, long input, non-string input, non-object body", () => {
    expect(err(parseRunRequest({ trigger: "schedule" }))).toMatch(
      /trigger must be one of/,
    );
    expect(err(parseRunRequest({ trigger: "continuous" }))).toMatch(
      /trigger must be one of/,
    );
    expect(
      err(parseRunRequest({ input: "x".repeat(LIMITS.askMax + 1) })),
    ).toMatch(/input must be at most 4000/);
    expect(parseRunRequest({ input: "x".repeat(LIMITS.askMax) }).ok).toBe(true);
    expect(err(parseRunRequest({ input: 42 }))).toMatch(
      /input must be a string/,
    );
    expect(err(parseRunRequest([]))).toMatch(/JSON object/);
  });
});
