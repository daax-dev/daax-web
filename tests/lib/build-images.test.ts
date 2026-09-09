/**
 * Tests for the image enumeration + digest resolution (settings > Build):
 * the static set, the running-stack discovery (compose-project scoping, self
 * detection, dedup, bounding, daemon failure → absence), and the per-request
 * whitelist. A fake Docker client is injected — no daemon, no dockerode mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  staticImageRefs,
  stackImageRefs,
  knownImageRefs,
  isKnownImageRef,
  collectImages,
  selfContainerId,
  digestFromInspect,
  COMPOSE_PROJECT_LABEL,
  COMPOSE_SERVICE_LABEL,
  type ImagesDockerClient,
  type StackContainerInfo,
} from "@/lib/build/images";

function container(
  id: string,
  name: string,
  image: string,
  opts: { project?: string; service?: string; imageId?: string } = {},
): StackContainerInfo {
  const Labels: Record<string, string> = {};
  if (opts.project) Labels[COMPOSE_PROJECT_LABEL] = opts.project;
  if (opts.service) Labels[COMPOSE_SERVICE_LABEL] = opts.service;
  return {
    Id: id,
    Names: [`/${name}`],
    Image: image,
    ImageID: opts.imageId ?? `sha256:id-${image}`,
    Labels,
  };
}

const SELF_ID =
  "abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd";

const STACK: StackContainerInfo[] = [
  container(SELF_ID, "daax", "ghcr.io/daax-dev/daax-web:latest", {
    project: "daax",
    service: "daax",
    imageId: "sha256:web-id",
  }),
  container(
    "1111111111111111",
    "daax-migrate",
    "ghcr.io/daax-dev/daax-web:latest",
    {
      project: "daax",
      service: "migrate",
      imageId: "sha256:web-id",
    },
  ),
  container("2222222222222222", "daax-postgres", "postgres:18-alpine", {
    project: "daax",
    service: "postgres",
  }),
  container("3333333333333333", "traefik", "traefik:v3.6", {
    project: "daax",
    service: "traefik",
  }),
  // A container from ANOTHER compose project on the same host.
  container("4444444444444444", "other-app", "nginx:1.27", {
    project: "other",
    service: "web",
  }),
  // A container not under compose at all.
  container("5555555555555555", "adhoc", "alpine:3.20"),
];

function fakeDocker(
  containers: StackContainerInfo[] | Error = STACK,
  inspect?: (name: string) => Promise<{ RepoDigests?: string[]; Id?: string }>,
): ImagesDockerClient & { inspected: string[] } {
  const inspected: string[] = [];
  return {
    inspected,
    listContainers: vi.fn(async () => {
      if (containers instanceof Error) throw containers;
      return containers;
    }),
    getImage: (name: string) => ({
      inspect: async () => {
        inspected.push(name);
        if (inspect) return inspect(name);
        return { RepoDigests: [`${name.split(":")[0]}@sha256:${name}`] };
      },
    }),
  };
}

describe("staticImageRefs", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("includes runtime base, platform tools, and devcontainer bases", () => {
    const refs = staticImageRefs();
    const cats = new Set(refs.map((r) => r.category));
    expect(cats).toContain("runtime");
    expect(cats).toContain("platform");
    expect(cats).toContain("devcontainer");
    expect(cats).not.toContain("stack");
    expect(refs.some((r) => r.ref === "node:22-bookworm-slim")).toBe(true);
    expect(refs.some((r) => r.ref.includes("anchore/syft"))).toBe(true);
  });

  it("honors env overrides for the runtime base and code-server", () => {
    vi.stubEnv("DAAX_RUNTIME_BASE_IMAGE", "node:23-slim");
    vi.stubEnv("DAAX_CODE_SERVER_IMAGE", "my/code-server:pinned");
    const refs = staticImageRefs();
    expect(refs.some((r) => r.ref === "node:23-slim")).toBe(true);
    expect(refs.some((r) => r.ref === "my/code-server:pinned")).toBe(true);
  });

  it("deduplicates by ref", () => {
    const refs = staticImageRefs();
    expect(new Set(refs.map((r) => r.ref)).size).toBe(refs.length);
  });
});

describe("selfContainerId", () => {
  it("accepts a hex container-id hostname (Docker's default hostname)", () => {
    expect(selfContainerId({}, "abcdef123456")).toBe("abcdef123456");
    expect(selfContainerId({}, SELF_ID.toUpperCase())).toBe(SELF_ID);
  });

  it("rejects a workstation hostname and prefers DAAX_CONTAINER_ID", () => {
    expect(selfContainerId({}, "chamonix")).toBeNull();
    expect(selfContainerId({}, "")).toBeNull();
    expect(selfContainerId({ DAAX_CONTAINER_ID: "1234567890ab" }, "host")).toBe(
      "1234567890ab",
    );
    // A non-hex override is not trusted either.
    expect(selfContainerId({ DAAX_CONTAINER_ID: "daax" }, "host")).toBeNull();
  });
});

describe("stackImageRefs", () => {
  it("scopes to this container's compose project and puts self first", async () => {
    const rows = await stackImageRefs(fakeDocker(), { selfId: SELF_ID });
    expect(rows.map((r) => r.ref)).toEqual([
      "ghcr.io/daax-dev/daax-web:latest",
      "postgres:18-alpine",
      "traefik:v3.6",
    ]);
    expect(rows.every((r) => r.category === "stack")).toBe(true);
    // Other projects and ad-hoc containers are excluded.
    expect(rows.some((r) => r.ref === "nginx:1.27")).toBe(false);
    expect(rows.some((r) => r.ref === "alpine:3.20")).toBe(false);
  });

  it("matches self by ID prefix (short hostname)", async () => {
    const rows = await stackImageRefs(fakeDocker(), {
      selfId: SELF_ID.slice(0, 12),
    });
    expect(rows[0].self).toBe(true);
    expect(rows[0].service).toBe("daax");
  });

  it("merges containers that share an image into one row", async () => {
    const [web] = await stackImageRefs(fakeDocker(), { selfId: SELF_ID });
    expect(web.containers).toEqual(["daax", "daax-migrate"]);
    expect(web.name).toBe("daax, daax-migrate");
    expect(web.self).toBe(true);
    expect(web.imageId).toBe("sha256:web-id");
  });

  it("lists every running container when not under compose", async () => {
    // Not in a container at all (workstation): selfId null.
    const rows = await stackImageRefs(fakeDocker(), { selfId: null });
    expect(rows.map((r) => r.ref).sort()).toEqual(
      [
        "ghcr.io/daax-dev/daax-web:latest",
        "postgres:18-alpine",
        "traefik:v3.6",
        "nginx:1.27",
        "alpine:3.20",
      ].sort(),
    );
    expect(rows.some((r) => r.self)).toBe(false);
  });

  it("lists every running container when self is a non-compose container", async () => {
    const rows = await stackImageRefs(fakeDocker(), {
      selfId: "5555555555555555",
    });
    expect(rows).toHaveLength(5);
    expect(rows[0].ref).toBe("alpine:3.20");
    expect(rows[0].self).toBe(true);
  });

  it("bounds the number of rows", async () => {
    const rows = await stackImageRefs(fakeDocker(), { selfId: null, max: 2 });
    expect(rows).toHaveLength(2);
  });

  it("skips containers with an empty image and names by short id when unnamed", async () => {
    const rows = await stackImageRefs(
      fakeDocker([
        { Id: "6666666666666666", Image: "" },
        { Id: "7777777777777777abcdef", Image: "busybox:1" },
      ]),
      { selfId: null },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("777777777777");
  });

  it("degrades to an empty stack (never throws) when the daemon fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = await stackImageRefs(fakeDocker(new Error("ECONNREFUSED")), {
      selfId: null,
    });
    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("knownImageRefs / isKnownImageRef", () => {
  it("is the running stack plus the static refs, deduped with the stack row winning", async () => {
    vi.stubEnv("DAAX_CODE_SERVER_IMAGE", "postgres:18-alpine"); // collide on purpose
    try {
      const refs = await knownImageRefs(fakeDocker(), { selfId: SELF_ID });
      const pg = refs.filter((r) => r.ref === "postgres:18-alpine");
      expect(pg).toHaveLength(1);
      expect(pg[0].category).toBe("stack");
      expect(refs.some((r) => r.ref === "node:22-bookworm-slim")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("accepts exactly the refs of the freshly computed set", async () => {
    const docker = fakeDocker();
    expect(await isKnownImageRef("postgres:18-alpine", docker)).toBe(true);
    expect(await isKnownImageRef("node:22-bookworm-slim", docker)).toBe(true);
    // Running on the host but in another compose project → not in this
    // stack's set (self identified via DAAX_CONTAINER_ID).
    vi.stubEnv("DAAX_CONTAINER_ID", SELF_ID);
    try {
      expect(await isKnownImageRef("nginx:1.27", docker)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await isKnownImageRef("evil/attacker-image:latest", docker)).toBe(
      false,
    );
    expect(await isKnownImageRef("", docker)).toBe(false);
  });

  it("falls back to the static set alone when the daemon is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const docker = fakeDocker(new Error("down"));
    expect(await isKnownImageRef("node:22-bookworm-slim", docker)).toBe(true);
    expect(await isKnownImageRef("postgres:18-alpine", docker)).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("digestFromInspect", () => {
  it("prefers the RepoDigest for the requested repo, then any, then the Id", () => {
    const info = {
      RepoDigests: ["mirror/node@sha256:aaa", "node@sha256:bbb"],
      Id: "sha256:ccc",
    };
    expect(digestFromInspect(info, "node:22")).toBe("sha256:bbb");
    expect(digestFromInspect(info, "other:1")).toBe("sha256:aaa");
    expect(digestFromInspect({ Id: "sha256:ccc" }, "node:22")).toBe(
      "sha256:ccc",
    );
    expect(digestFromInspect({ Id: "notadigest" }, "node:22")).toBeNull();
  });
});

describe("collectImages", () => {
  it("resolves stack rows by image ID and static rows by ref", async () => {
    const docker = fakeDocker(STACK, async (name) => ({
      RepoDigests: [`repo@sha256:${name}`],
    }));
    const images = await collectImages(docker, { selfId: SELF_ID });
    const web = images.find(
      (i) => i.ref === "ghcr.io/daax-dev/daax-web:latest",
    );
    expect(web?.present).toBe(true);
    expect(web?.digest).toBe("sha256:sha256:web-id");
    expect(docker.inspected).toContain("sha256:web-id");
    expect(docker.inspected).toContain("node:22-bookworm-slim");
  });

  it("marks images not present when inspect fails", async () => {
    const docker = fakeDocker(STACK, async () => {
      throw new Error("No such image");
    });
    const images = await collectImages(docker, { selfId: null });
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.present).toBe(false);
      expect(img.digest).toBeNull();
    }
  });
});
