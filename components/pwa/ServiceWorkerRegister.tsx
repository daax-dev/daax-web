"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (issue #156).
 *
 * Registration is gated to production builds on purpose: in `next dev` a service
 * worker can interfere with HMR and confuse the live-reload story, and host-dev
 * notifications already work through the foreground path (lib/notifications).
 * The SW itself is conservative (see public/sw.js) — it never caches the app
 * shell and never touches the terminal WebSocket, so this cannot serve stale
 * assets or break the terminal.
 *
 * Renders nothing; it is a side-effect-only mount in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Register after load so it never competes with first paint / hydration.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failure must never break the app; the site works fine
        // without the SW (just not installable/offline-capable).
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
