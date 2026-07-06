/**
 * Unit tests for the guarded browser-Notification wrapper (issue #154).
 *
 * The Notification API does not exist in jsdom, so it is mocked per-test. Covers
 * the firing guard (only when granted), permission reporting, the unsupported
 * path, and that the OS-level dedup tag is set per session.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  desktopSupported,
  fireAggregateNotification,
  fireBlockedNotification,
  permissionState,
  requestPermission,
} from "@/lib/notifications/desktop";
import type { NotifyCard } from "@/lib/attention/notifications";

const card: NotifyCard = {
  id: "sess-1234abcd",
  label: "galway",
  status: "waiting",
  cwd: "/workspace/daax-web",
};

/** Installs a mock Notification constructor with a given permission. */
function installNotification(permission: NotificationPermission) {
  const ctor = vi.fn();
  const NotificationMock = Object.assign(ctor, {
    permission,
    requestPermission: vi.fn(),
  });
  (globalThis as { Notification?: unknown }).Notification = NotificationMock;
  return NotificationMock;
}

function uninstallNotification() {
  (globalThis as { Notification?: unknown }).Notification = undefined;
}

afterEach(() => {
  uninstallNotification();
  vi.restoreAllMocks();
});

describe("desktopSupported / permissionState", () => {
  it("reports unsupported when Notification is absent", () => {
    uninstallNotification();
    expect(desktopSupported()).toBe(false);
    expect(permissionState()).toBe("unsupported");
  });

  it("reflects the browser permission when present", () => {
    installNotification("granted");
    expect(desktopSupported()).toBe(true);
    expect(permissionState()).toBe("granted");
  });
});

describe("fireBlockedNotification — guard", () => {
  it("does not construct a Notification when permission is not granted", () => {
    const N = installNotification("default");
    expect(fireBlockedNotification(card)).toBe(false);
    expect(N).not.toHaveBeenCalled();
  });

  it("does not construct a Notification when denied", () => {
    const N = installNotification("denied");
    expect(fireBlockedNotification(card)).toBe(false);
    expect(N).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the API is unsupported", () => {
    uninstallNotification();
    expect(fireBlockedNotification(card)).toBe(false);
  });

  it("constructs exactly one Notification when granted, with a per-session tag", () => {
    const N = installNotification("granted");
    expect(fireBlockedNotification(card)).toBe(true);
    expect(N).toHaveBeenCalledTimes(1);
    const [title, opts] = N.mock.calls[0];
    expect(title).toBe("Agent waiting for input");
    expect(opts.tag).toBe(`daax-waiting-${card.id}`);
    expect(opts.body).toContain("galway");
    expect(opts.body).toContain("/workspace/daax-web");
  });

  it("falls back to the label when the session has no cwd", () => {
    const N = installNotification("granted");
    fireBlockedNotification({ id: "x", label: "host-x", status: "waiting" });
    expect(N.mock.calls[0][1].body).toBe("host-x");
  });

  it("swallows a throwing Notification constructor (returns false)", () => {
    const throwing = Object.assign(
      vi.fn(() => {
        throw new Error("boom");
      }),
      { permission: "granted" as NotificationPermission },
    );
    (globalThis as { Notification?: unknown }).Notification = throwing;
    expect(fireBlockedNotification(card)).toBe(false);
  });
});

describe("fireAggregateNotification", () => {
  it("fires one summary notification with the count when granted", () => {
    const N = installNotification("granted");
    expect(fireAggregateNotification(7)).toBe(true);
    expect(N).toHaveBeenCalledTimes(1);
    expect(N.mock.calls[0][0]).toBe("7 agents waiting for input");
    expect(N.mock.calls[0][1].tag).toBe("daax-waiting-aggregate");
  });

  it("is a guarded no-op when not granted", () => {
    const N = installNotification("default");
    expect(fireAggregateNotification(7)).toBe(false);
    expect(N).not.toHaveBeenCalled();
  });
});

describe("requestPermission", () => {
  it("returns unsupported when the API is absent", async () => {
    uninstallNotification();
    await expect(requestPermission()).resolves.toBe("unsupported");
  });

  it("resolves the granted result from the browser", async () => {
    const N = installNotification("default");
    N.requestPermission.mockResolvedValue("granted");
    await expect(requestPermission()).resolves.toBe("granted");
  });

  it("degrades to the current permission if requestPermission throws", async () => {
    const N = installNotification("denied");
    N.requestPermission.mockRejectedValue(new Error("nope"));
    await expect(requestPermission()).resolves.toBe("denied");
  });

  it("supports the legacy callback signature (undefined return)", async () => {
    const N = installNotification("default");
    // Legacy browsers ignore the promise contract: they return undefined and
    // deliver the result only through the callback argument.
    N.requestPermission.mockImplementation(
      (cb?: (p: NotificationPermission) => void) => {
        cb?.("granted");
        return undefined;
      },
    );
    await expect(requestPermission()).resolves.toBe("granted");
  });
});
