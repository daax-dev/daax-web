/**
 * Enumeration of the container images daax runs on and uses, with their
 * resolved sha256 digests, for the settings > Build panel.
 *
 * Four categories:
 *  - stack       : what is RUNNING right now — every container in the same
 *                  compose project as this one (or all running containers when
 *                  not under compose), discovered live from the Docker daemon.
 *  - runtime     : the image the daax app container is built FROM.
 *  - platform    : images daax itself runs (code-server, the syft SBOM scanner).
 *  - devcontainer: the base-image catalog users pick when spawning devcontainers.
 *
 * Digests are resolved from the local Docker daemon. Images that aren't present
 * are reported present:false with a null digest rather than guessed, and when
 * the daemon is unreachable the stack category is simply absent. The set of
 * refs is closed per request: the per-image SBOM route whitelists against the
 * freshly computed set, so a client can only ever name an image that is in it.
 */
import os from "node:os";

import { getDocker } from "@/lib/host-docker";
import { SYFT_IMAGE } from "@/lib/sbom-syft";
import { getEnabledBaseImages } from "@/lib/devcontainer-settings";
import { positiveIntEnv } from "./build-info";

export type ImageCategory = "stack" | "runtime" | "platform" | "devcontainer";

export interface KnownImageRef {
  category: ImageCategory;
  /** Display name: a static label, or the container name(s) for stack rows. */
  name: string;
  ref: string;
  /** Stack rows: container name(s) running this image. */
  containers?: string[];
  /** Stack rows: compose service name (label), when running under compose. */
  service?: string;
  /** Stack rows: true for the container this process runs in. */
  self?: boolean;
  /**
   * Stack rows: the container's image ID (config digest). Digests are resolved
   * by ID so the row describes the image the container actually runs, even if
   * the tag was since re-pointed.
   */
  imageId?: string;
}

export interface KnownImage extends KnownImageRef {
  /** Repository digest, e.g. "sha256:…", or null when not resolvable. */
  digest: string | null;
  /** True when the image is present in the local Docker daemon. */
  present: boolean;
}

/** Minimal Docker client surface used here (dockerode satisfies it; tests inject a fake). */
export interface ImagesDockerClient {
  listContainers(opts?: { all?: boolean }): Promise<StackContainerInfo[]>;
  getImage(name: string): { inspect(): Promise<ImageInspectLike> };
}

export interface StackContainerInfo {
  Id: string;
  Names?: string[];
  Image: string;
  ImageID?: string;
  Labels?: Record<string, string>;
}

interface ImageInspectLike {
  RepoDigests?: string[];
  Id?: string;
}

export const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
export const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";

/** Default upper bound on stack rows (override via DAAX_BUILD_STACK_MAX). */
export const STACK_MAX_DEFAULT = 64;

/** The app's runtime base image (Dockerfile FROM); override via env. */
function runtimeBaseImage(): string {
  return process.env.DAAX_RUNTIME_BASE_IMAGE || "node:22-bookworm-slim";
}

/** The code-server image daax proxies (/code-server); override via env. */
function codeServerImage(): string {
  return process.env.DAAX_CODE_SERVER_IMAGE || "daax-code-server:latest";
}

/**
 * The static image references (runtime base, platform tools, devcontainer
 * catalog). Deduplicated by ref (first wins) so a devcontainer base that equals
 * a platform image doesn't appear twice.
 */
export function staticImageRefs(): KnownImageRef[] {
  const refs: KnownImageRef[] = [
    { category: "runtime", name: "App runtime base", ref: runtimeBaseImage() },
    { category: "platform", name: "Code Server", ref: codeServerImage() },
    { category: "platform", name: "syft (SBOM scanner)", ref: SYFT_IMAGE },
  ];
  // Enabled devcontainer bases (respects the enabled flag; server-side this
  // resolves to the enabled defaults since per-user settings live client-side).
  for (const b of getEnabledBaseImages()) {
    refs.push({ category: "devcontainer", name: b.name, ref: b.image });
  }
  return dedupeByRef(refs);
}

function dedupeByRef(refs: KnownImageRef[]): KnownImageRef[] {
  const seen = new Set<string>();
  return refs.filter((r) =>
    seen.has(r.ref) ? false : (seen.add(r.ref), true),
  );
}

/**
 * This process's container ID, when running in one. Docker sets the container
 * hostname to the short container ID unless overridden, so a hex hostname is
 * the ID prefix; DAAX_CONTAINER_ID overrides for deployments that set a real
 * hostname. Anything that isn't a hex ID (a workstation hostname) → null.
 */
export function selfContainerId(
  env: Record<string, string | undefined> = process.env,
  hostname: string = os.hostname(),
): string | null {
  const candidate = (env.DAAX_CONTAINER_ID || hostname || "").trim();
  return /^[0-9a-f]{12,64}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function containerName(c: StackContainerInfo): string {
  const first = c.Names?.[0];
  return first ? first.replace(/^\//, "") : c.Id.slice(0, 12);
}

export interface StackOptions {
  /** This process's container ID (prefix ok); default from selfContainerId(). */
  selfId?: string | null;
  /** Upper bound on rows; default DAAX_BUILD_STACK_MAX or STACK_MAX_DEFAULT. */
  max?: number;
}

/**
 * The images of the running stack: every running container in the same compose
 * project as this one (label com.docker.compose.project), or — when this
 * process is not a compose-managed container — every running container. Rows
 * are keyed by image ref, so two containers on one image (e.g. web + migrate)
 * share a row listing both names. Bounded by `max`; sorted by container name
 * with this container first. Any daemon failure yields [] (absence, not a
 * guess), never throws.
 */
export async function stackImageRefs(
  docker: ImagesDockerClient,
  opts: StackOptions = {},
): Promise<KnownImageRef[]> {
  const max =
    opts.max ?? positiveIntEnv("DAAX_BUILD_STACK_MAX", STACK_MAX_DEFAULT);
  const selfId = opts.selfId === undefined ? selfContainerId() : opts.selfId;

  let containers: StackContainerInfo[];
  try {
    containers = await docker.listContainers({ all: false });
  } catch (error) {
    console.warn(
      "[Build Images] docker listContainers failed — stack omitted:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }

  const self = selfId
    ? containers.find((c) => c.Id.toLowerCase().startsWith(selfId))
    : undefined;
  const project = self?.Labels?.[COMPOSE_PROJECT_LABEL];
  const scoped = project
    ? containers.filter((c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === project)
    : containers;

  const rows = new Map<string, KnownImageRef>();
  for (const c of scoped) {
    const ref = (c.Image || "").trim();
    if (!ref) continue;
    const name = containerName(c);
    const isSelf = self !== undefined && c.Id === self.Id;
    const existing = rows.get(ref);
    if (existing) {
      existing.containers = [...(existing.containers ?? []), name].sort();
      existing.name = existing.containers.join(", ");
      if (isSelf) existing.self = true;
      if (!existing.service && c.Labels?.[COMPOSE_SERVICE_LABEL]) {
        existing.service = c.Labels[COMPOSE_SERVICE_LABEL];
      }
      continue;
    }
    rows.set(ref, {
      category: "stack",
      name,
      ref,
      containers: [name],
      service: c.Labels?.[COMPOSE_SERVICE_LABEL] || undefined,
      self: isSelf || undefined,
      imageId: c.ImageID || undefined,
    });
  }

  return [...rows.values()]
    .sort((a, b) =>
      Boolean(a.self) === Boolean(b.self)
        ? a.name.localeCompare(b.name)
        : a.self
          ? -1
          : 1,
    )
    .slice(0, max);
}

/**
 * The closed set of image references for THIS request: the running stack
 * (when the daemon is reachable) followed by the static refs, deduplicated by
 * ref with the stack row winning (it carries the container context and the
 * digest of the image actually running).
 */
export async function knownImageRefs(
  docker: ImagesDockerClient = getDocker(),
  opts: StackOptions = {},
): Promise<KnownImageRef[]> {
  const stack = await stackImageRefs(docker, opts);
  return dedupeByRef([...stack, ...staticImageRefs()]);
}

/**
 * The known-set entry for `ref`, or null when it is not in the freshly computed
 * set (whitelist for the SBOM route). Computed once per call; a caller must not
 * cache a hit across requests, since the stack can change. Stack rows carry the
 * immutable `imageId` of the image the container runs.
 */
export async function findKnownImageRef(
  ref: string,
  docker: ImagesDockerClient = getDocker(),
): Promise<KnownImageRef | null> {
  if (!ref) return null;
  return (await knownImageRefs(docker)).find((r) => r.ref === ref) ?? null;
}

/** True when `ref` is in the freshly computed known set. */
export async function isKnownImageRef(
  ref: string,
  docker: ImagesDockerClient = getDocker(),
): Promise<boolean> {
  return (await findKnownImageRef(ref, docker)) !== null;
}

/**
 * The immutable image ID ("sha256:…") a ref currently resolves to in the local
 * daemon, or null when it is not present. Lets a caller key work by the image
 * itself rather than by a tag that can be re-pointed underneath it.
 */
export async function resolveImageId(
  ref: string,
  docker: ImagesDockerClient = getDocker(),
): Promise<string | null> {
  try {
    const info = await docker.getImage(ref).inspect();
    return info.Id && info.Id.startsWith("sha256:") ? info.Id : null;
  } catch {
    return null;
  }
}

/**
 * The repository part of an image ref, e.g. `node:22` → `node`,
 * `node@sha256:…` → `node`, `reg:5000/img:tag` → `reg:5000/img`. Strips a
 * trailing `@sha256:…` digest first, then a trailing `:tag` (a registry port
 * like `:5000` is kept because it's followed by a path segment, not end-of-ref).
 */
function repoOf(ref: string): string {
  return ref.replace(/@sha256:[a-f0-9]+$/i, "").replace(/:[^/:]+$/, "");
}

/**
 * Pick a sha256 digest from a dockerode image inspect result, preferring the
 * RepoDigest whose repository matches the requested ref (an image can carry
 * digests for several repos/mirrors; we want the one for this ref). Falls back
 * to any repo digest, then the config image Id.
 */
export function digestFromInspect(
  info: ImageInspectLike,
  ref: string,
): string | null {
  const digests = (info.RepoDigests ?? []).filter((d) =>
    d.includes("@sha256:"),
  );
  const wantRepo = repoOf(ref);
  const match =
    digests.find((d) => repoOf(d.slice(0, d.indexOf("@"))) === wantRepo) ??
    digests[0];
  if (match) return match.slice(match.indexOf("@") + 1);
  // Fall back to the (config) image ID, which is itself a sha256 digest.
  return info.Id && info.Id.startsWith("sha256:") ? info.Id : null;
}

async function resolveImage(
  docker: ImagesDockerClient,
  r: KnownImageRef,
): Promise<KnownImage> {
  try {
    // Stack rows resolve by image ID (the image the container runs); static
    // rows by ref (whatever is pulled locally under that name).
    const info = await docker.getImage(r.imageId ?? r.ref).inspect();
    return { ...r, digest: digestFromInspect(info, r.ref), present: true };
  } catch {
    // Not pulled locally, or the daemon is unreachable.
    return { ...r, digest: null, present: false };
  }
}

/** Resolve every known image's digest/presence (best-effort, in parallel). */
export async function collectImages(
  docker: ImagesDockerClient = getDocker(),
  opts: StackOptions = {},
): Promise<KnownImage[]> {
  // One Docker client for the whole collection rather than one per image.
  const refs = await knownImageRefs(docker, opts);
  return Promise.all(refs.map((r) => resolveImage(docker, r)));
}
