"use client";

import { useEffect, useState } from "react";

import {
  SubstrateApiError,
  substrateApi,
  type SubstrateUiConfig,
} from "@/lib/substrate/client";

export type SubstrateConfigState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "enabled"; config: SubstrateUiConfig };

let cached: SubstrateConfigState | null = null;
let inflight: Promise<SubstrateConfigState> | null = null;

function load(): Promise<SubstrateConfigState> {
  if (!inflight) {
    inflight = substrateApi
      .config()
      .then(
        (config): SubstrateConfigState =>
          config?.enabled
            ? { status: "enabled", config }
            : { status: "disabled" },
      )
      .catch((err): SubstrateConfigState => {
        if (err instanceof SubstrateApiError && err.status === 404) {
          return { status: "disabled" };
        }
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      })
      .then((s) => {
        // Cache only a definitive answer; an error retries on next mount.
        if (s.status !== "error") cached = s;
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test-only. */
export function _resetSubstrateConfigCache(): void {
  cached = null;
  inflight = null;
}

/**
 * `GET /api/substrate/config`: whether the substrate backend is on, and what
 * the launcher may offer. 404 `substrate-disabled` means "off", not an error.
 */
export function useSubstrateConfig(): SubstrateConfigState {
  const [state, setState] = useState<SubstrateConfigState>(
    cached ?? { status: "loading" },
  );
  useEffect(() => {
    // A cached answer was already used as the initial state.
    if (cached) return;
    let cancelled = false;
    void load().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
