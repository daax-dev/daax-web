import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { findKnownImageRef, resolveImageId } from "@/lib/build/images";
import { getDocker } from "@/lib/host-docker";
import { positiveIntEnv } from "@/lib/build/build-info";
import { generateRealSbom } from "@/lib/sbom-syft";
import { checkSbom } from "@/lib/sbom-guard";

/**
 * GET /api/build/images/sbom?ref=<image-ref-or-id>&inline=1
 *
 * Generates (via syft) and returns the CycloneDX SBOM for one of the known
 * container images (settings > Build panel per-image SBOM).
 *   - Unauthenticated (strict mode) → 401.
 *   - `ref` missing / not whitelisted → 400.
 *   - Image not present / syft returned an unusable SBOM → 404 (graceful).
 *   - syft execution threw → 500.
 *   - Otherwise → 200 application/json.
 *
 * `ref` MUST be an unambiguous reference or immutable ID from the closed known
 * image set (findKnownImageRef, computed fresh for this request: the running
 * stack + the static refs): syft runs as `docker run … docker:<image>` (arg
 * array, no shell), so the whitelist keeps a caller from scanning an arbitrary
 * image. The set is never cached across requests — only scan RESULTS are.
 *
 * Identity: a tag is mutable (postgres:18-alpine can be re-pulled under daax),
 * so the scan target, the in-flight coalescing and the cache are all keyed by
 * the IMMUTABLE image ID — the stack row's imageId (the image the container
 * runs), else whatever the ref resolves to in the daemon right now. A replaced
 * image therefore gets a fresh SBOM instead of the previous image's. Only when
 * the ref resolves to nothing (not pulled) does it fall back to the ref, and
 * that scan yields the graceful 404 rather than a stale document.
 *
 * Resource safety (each scan spawns a Docker/syft process):
 *  - In-flight scans are coalesced per ref, so N concurrent requests for the
 *    same image share ONE syft run instead of spawning N.
 *  - A small global semaphore bounds how many distinct scans run at once, so a
 *    caller can't fan out one scan per whitelisted image simultaneously.
 *  - The shared syft runner kills scans that exceed its output or time limit,
 *    so a corrupt image cannot hold a semaphore slot forever.
 *  - Results are cached per ref in a small LRU (DAAX_IMAGE_SBOM_CACHE_MAX
 *    entries, default 32): the whitelist follows the running stack, so refs
 *    churn over a server's lifetime and a cache keyed only by "was whitelisted
 *    once" would grow without bound. Results over a size cap are served but
 *    not retained, to bound resident memory.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

const MAX_IMAGE_SBOM_BYTES = positiveIntEnv(
  "DAAX_IMAGE_SBOM_MAX_BYTES",
  64 * 1024 * 1024,
);
const MAX_CONCURRENT_SCANS = positiveIntEnv(
  "DAAX_IMAGE_SBOM_MAX_CONCURRENCY",
  2,
);
export const MAX_CACHED_SBOMS = positiveIntEnv("DAAX_IMAGE_SBOM_CACHE_MAX", 32);

// LRU by Map insertion order: a hit is re-inserted (moves to the end), an
// insert past the bound evicts the oldest entry (the first key).
const cache = new Map<string, string>();
function cacheGet(ref: string): string | null {
  const hit = cache.get(ref);
  if (hit === undefined) return null;
  cache.delete(ref);
  cache.set(ref, hit);
  return hit;
}
function cacheSet(ref: string, content: string): void {
  cache.delete(ref);
  cache.set(ref, content);
  while (cache.size > MAX_CACHED_SBOMS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
const inflight = new Map<string, Promise<string | null>>();

// Minimal FIFO semaphore. A released slot is handed directly to the next waiter
// (active count unchanged) so at most MAX_CONCURRENT_SCANS scans ever run.
let active = 0;
const waiters: Array<() => void> = [];
function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_SCANS) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}
function release(): void {
  const next = waiters.shift();
  if (next) next();
  else if (active > 0) active--; // clamp so a stray release (e.g. after a
  // state reset while a scan was in flight) can't drive the count negative.
}

async function scan(ref: string): Promise<string | null> {
  await acquire();
  try {
    return await generateRealSbom(ref);
  } finally {
    release();
  }
}

/** Test-only: reset the module-level cache/semaphore state. */
export function __resetImageSbomState(): void {
  cache.clear();
  inflight.clear();
  active = 0;
  waiters.length = 0;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = request.nextUrl;
  const ref = searchParams.get("ref") || "";
  const inline = TRUTHY.has((searchParams.get("inline") || "").toLowerCase());

  const docker = getDocker();
  const known = ref ? await findKnownImageRef(ref, docker) : null;
  if (!known) {
    return NextResponse.json(
      { error: "unknown or missing image ref" },
      { status: 400 },
    );
  }
  // Immutable identity for scanning/caching (see the header comment).
  const image = known.imageId ?? (await resolveImageId(ref, docker)) ?? ref;

  let content = cacheGet(image);
  if (!content) {
    // Coalesce concurrent scans for the same image onto a single syft run.
    let pending = inflight.get(image);
    if (!pending) {
      pending = scan(image).finally(() => inflight.delete(image));
      inflight.set(image, pending);
    }

    let generated: string | null;
    try {
      generated = await pending;
    } catch (error) {
      console.error(
        `[Build Images SBOM] syft failed for ${ref} (${image}):`,
        error,
      );
      return NextResponse.json(
        { error: "Failed to generate SBOM" },
        { status: 500 },
      );
    }

    // generateRealSbom returns null when the image is absent, syft failed, or
    // the output doesn't pass the placeholder-vs-real guard.
    if (!generated || !checkSbom(generated).real) {
      return NextResponse.json(
        {
          available: false,
          ref,
          note: "SBOM unavailable — image not present locally or syft could not scan it.",
        },
        { status: 404 },
      );
    }

    // Retain only reasonably-sized results so the cache can't pin large memory.
    if (Buffer.byteLength(generated, "utf-8") <= MAX_IMAGE_SBOM_BYTES) {
      cacheSet(image, generated);
    }
    content = generated;
  }

  // Sanitize and cap the ref-derived filename so a long registry path/tag can't
  // produce an oversized Content-Disposition header.
  const safeRef = ref.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const filename = `daax-image-${safeRef}.cyclonedx.json`;
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}
