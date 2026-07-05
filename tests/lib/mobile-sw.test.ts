/**
 * Behavioural tests for the mobile service worker (issue #156, public/sw.js).
 *
 * public/sw.js is a plain worker script (not an ES module), so it is executed
 * inside a synthetic worker global: a fake `self` captures the event listeners,
 * and mocked `caches`/`fetch`/`clients` let each handler be driven with
 * synthetic events. This locks the security-relevant behaviour: it never
 * intercepts non-navigation/WS requests, falls back to the offline page only on
 * a failed navigation, evicts stale caches, and never hijacks an unrelated tab.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const SW_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../public/sw.js"),
  "utf8",
);

interface Harness {
  listeners: Record<string, (event: unknown) => void>;
  self: Record<string, unknown>;
  cacheStore: Map<string, Map<string, Response>>;
  fetchMock: ReturnType<typeof vi.fn>;
}

function makeCache(store: Map<string, Response>) {
  return {
    add: vi.fn(async (url: string) => {
      store.set(url, new Response("OFFLINE-BODY", { status: 200 }));
    }),
    match: vi.fn(async (url: string) => store.get(url)),
    put: vi.fn(async (url: string, res: Response) => store.set(url, res)),
  };
}

/** Executes sw.js in a fresh synthetic worker global and returns the harness. */
function loadSw(clientList: Array<Record<string, unknown>> = []): Harness {
  const listeners: Harness["listeners"] = {};
  const cacheStore = new Map<string, Map<string, Response>>();

  const caches = {
    open: vi.fn(async (name: string) => {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      return makeCache(cacheStore.get(name)!);
    }),
    keys: vi.fn(async () => [...cacheStore.keys()]),
    delete: vi.fn(async (name: string) => cacheStore.delete(name)),
  };

  const self: Record<string, unknown> = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn() },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => clientList),
      openWindow: vi.fn(async () => ({})),
    },
  };

  const fetchMock = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const run = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "URL",
    SW_SRC,
  );
  run(self, caches, fetchMock, Response, URL);
  return { listeners, self, cacheStore, fetchMock };
}

/** A waitUntil/respondWith collector so we can await the handler's work. */
function collector() {
  const promises: Array<Promise<unknown> | unknown> = [];
  return {
    waitUntil: (p: Promise<unknown>) => promises.push(p),
    respondWith: vi.fn((p: Promise<unknown> | unknown) => promises.push(p)),
    settle: () => Promise.all(promises),
  };
}

describe("service worker: install / activate", () => {
  it("precaches the offline page and skips waiting", async () => {
    const h = loadSw();
    const c = collector();
    h.listeners.install({ waitUntil: c.waitUntil });
    await c.settle();
    expect(h.self.skipWaiting).toHaveBeenCalled();
    // Offline page cached under the versioned cache.
    const cache = [...h.cacheStore.values()][0];
    expect(cache.has("/offline.html")).toBe(true);
  });

  it("evicts caches from previous versions and claims clients", async () => {
    const h = loadSw();
    // Seed a stale + a current cache.
    h.cacheStore.set("daax-old", new Map());
    h.cacheStore.set("daax-v1", new Map());
    const c = collector();
    h.listeners.activate({ waitUntil: c.waitUntil });
    await c.settle();
    expect(h.cacheStore.has("daax-old")).toBe(false);
    expect(h.cacheStore.has("daax-v1")).toBe(true);
    expect((h.self.clients as { claim: unknown }).claim).toHaveBeenCalled();
  });
});

describe("service worker: fetch", () => {
  it("ignores non-navigation requests (no respondWith) — WS/assets untouched", () => {
    const h = loadSw();
    const c = collector();
    h.listeners.fetch({
      request: { mode: "cors", method: "GET", url: "https://x/y.js" },
      respondWith: c.respondWith,
    });
    expect(c.respondWith).not.toHaveBeenCalled();
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("ignores non-GET navigations", () => {
    const h = loadSw();
    const c = collector();
    h.listeners.fetch({
      request: { mode: "navigate", method: "POST", url: "https://x/" },
      respondWith: c.respondWith,
    });
    expect(c.respondWith).not.toHaveBeenCalled();
  });

  it("passes a successful navigation straight through to the network", async () => {
    const h = loadSw();
    const netRes = new Response("PAGE", { status: 200 });
    h.fetchMock.mockResolvedValueOnce(netRes);
    const c = collector();
    h.listeners.fetch({
      request: { mode: "navigate", method: "GET", url: "https://x/" },
      respondWith: c.respondWith,
    });
    const [resolved] = await c.settle();
    expect(resolved).toBe(netRes);
  });

  it("serves the offline page when a navigation fetch fails", async () => {
    const h = loadSw();
    // Precache offline.html first.
    const ci = collector();
    h.listeners.install({ waitUntil: ci.waitUntil });
    await ci.settle();

    h.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const c = collector();
    h.listeners.fetch({
      request: { mode: "navigate", method: "GET", url: "https://x/" },
      respondWith: c.respondWith,
    });
    const [resolved] = await c.settle();
    expect(await (resolved as Response).text()).toBe("OFFLINE-BODY");
  });
});

describe("service worker: notificationclick", () => {
  function clickWith(clients: Array<Record<string, unknown>>) {
    const h = loadSw(clients);
    const c = collector();
    h.listeners.notificationclick({
      notification: { close: vi.fn(), data: { url: "/m" } },
      waitUntil: c.waitUntil,
    });
    return { h, settled: c.settle() };
  }

  it("focuses an existing /m tab instead of opening a new window", async () => {
    const mFocus = vi.fn();
    const { h, settled } = clickWith([
      { url: "https://x/shell", focus: vi.fn() },
      { url: "https://x/m", focus: mFocus },
    ]);
    await settled;
    expect(mFocus).toHaveBeenCalled();
    expect(
      (h.self.clients as { openWindow: unknown }).openWindow,
    ).not.toHaveBeenCalled();
  });

  it("does NOT hijack an unrelated tab; opens a new window instead", async () => {
    const otherFocus = vi.fn();
    const { h, settled } = clickWith([
      { url: "https://x/shell", focus: otherFocus },
    ]);
    await settled;
    expect(otherFocus).not.toHaveBeenCalled();
    expect(
      (h.self.clients as { openWindow: ReturnType<typeof vi.fn> }).openWindow,
    ).toHaveBeenCalledWith("/m");
  });
});
