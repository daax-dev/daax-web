/**
 * Enumeration of the container images daax is built on and uses, with their
 * resolved sha256 digests, for the settings > Build panel.
 *
 * Three categories:
 *  - runtime     : the image the daax app container is built FROM.
 *  - platform    : images daax itself runs (code-server, the syft SBOM scanner).
 *  - devcontainer: the base-image catalog users pick when spawning devcontainers.
 *
 * Digests are resolved live from the local Docker daemon (daax has socket
 * access). Images that aren't present locally are reported present:false with a
 * null digest rather than guessed. The reference set of refs is a closed list,
 * so the per-image SBOM endpoint can whitelist against it.
 */
import { getDocker } from "@/lib/host-docker";
import { SYFT_IMAGE } from "@/lib/sbom-syft";
import { getEnabledBaseImages } from "@/lib/devcontainer-settings";

export type ImageCategory = "runtime" | "platform" | "devcontainer";

export interface KnownImageRef {
  category: ImageCategory;
  name: string;
  ref: string;
}

export interface KnownImage extends KnownImageRef {
  /** Repository digest, e.g. "sha256:…", or null when not resolvable. */
  digest: string | null;
  /** True when the image is present in the local Docker daemon. */
  present: boolean;
}

/** The app's runtime base image (Dockerfile FROM); override via env. */
function runtimeBaseImage(): string {
  return process.env.DAAX_RUNTIME_BASE_IMAGE || "node:22-bookworm-slim";
}

/** The code-server image daax proxies (/code-server); override via env. */
function codeServerImage(): string {
  return process.env.DAAX_CODE_SERVER_IMAGE || "daax-code-server:latest";
}

/**
 * The closed set of image references the Build panel reports on. Deduplicated by
 * ref (first wins) so a devcontainer base that equals a platform image doesn't
 * appear twice.
 */
export function knownImageRefs(): KnownImageRef[] {
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
  const seen = new Set<string>();
  return refs.filter((r) =>
    seen.has(r.ref) ? false : (seen.add(r.ref), true),
  );
}

/** True when `ref` is one of the known images (whitelist for the SBOM route). */
export function isKnownImageRef(ref: string): boolean {
  return knownImageRefs().some((r) => r.ref === ref);
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
function digestFromInspect(
  info: { RepoDigests?: string[]; Id?: string },
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

async function resolveImage(r: KnownImageRef): Promise<KnownImage> {
  try {
    const info = await getDocker().getImage(r.ref).inspect();
    return { ...r, digest: digestFromInspect(info, r.ref), present: true };
  } catch {
    // Not pulled locally, or the daemon is unreachable.
    return { ...r, digest: null, present: false };
  }
}

/** Resolve every known image's digest/presence (best-effort, in parallel). */
export async function collectImages(): Promise<KnownImage[]> {
  return Promise.all(knownImageRefs().map(resolveImage));
}
