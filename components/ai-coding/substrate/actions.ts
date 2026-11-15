"use client";

import { toast } from "sonner";

import {
  SubstrateApiError,
  substrateApi,
  type SessionView,
} from "@/lib/substrate/client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Explicit Suspend (dx#114: never automatic). */
export async function suspendSession(id: string): Promise<SessionView | null> {
  try {
    const s = await substrateApi.suspend(id);
    toast.success("Session suspended. Resume it to continue.");
    return s;
  } catch (err) {
    toast.error(`Suspend failed: ${(err as Error).message}`);
    return null;
  }
}

/** Explicit Resume. */
export async function resumeSession(id: string): Promise<SessionView | null> {
  try {
    const s = await substrateApi.resume(id);
    toast.success("Session resumed.");
    return s;
  } catch (err) {
    toast.error(`Resume failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * End session: the only kill. A 202 `ending` means a create is still in
 * flight and finishes the End itself: poll until the session is gone (404)
 * or shows a retryable `error`. Resolves true once it is gone.
 */
export async function endSession(
  id: string,
  opts: { pollMs?: number; maxPolls?: number } = {},
): Promise<boolean> {
  try {
    const r = await substrateApi.end(id);
    if (r.state === "ended") {
      toast.success("Session ended.");
      return true;
    }
    for (let i = 0; i < (opts.maxPolls ?? 120); i++) {
      await sleep(opts.pollMs ?? 1000);
      try {
        const s = await substrateApi.get(id);
        if (s.state === "error") {
          toast.error(
            `End did not finish: ${s.lastError ?? "error"}. End again to retry.`,
          );
          return false;
        }
      } catch (err) {
        if (err instanceof SubstrateApiError && err.status === 404) {
          toast.success("Session ended.");
          return true;
        }
      }
    }
    toast.error("End is still in progress. Refresh to check.");
    return false;
  } catch (err) {
    toast.error(`End failed: ${(err as Error).message}`);
    return false;
  }
}
