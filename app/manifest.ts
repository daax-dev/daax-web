import type { MetadataRoute } from "next";

/**
 * PWA Web App Manifest (issue #156).
 *
 * Served at /manifest.webmanifest by Next.js. Making the app installable
 * (Lighthouse "installable") requires: a name, a start_url, display
 * standalone, and at least a 192px and a 512px icon. Maskable variants let
 * Android render an adaptive icon without letterboxing.
 *
 * The colors mirror the dark semantic theme (`--background` = 0 0% 3.9% ≈
 * #0a0a0a) so the OS splash/theme chrome stays on-brand. `start_url` points at
 * the mobile unblock view so a home-screen launch lands straight on the
 * approve/deny surface.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "daax — Mobile Terminal",
    short_name: "daax",
    // Honest description: this drives a NEW shell session on the workbench. It
    // does NOT yet attach to an already-running agent (server-side pty
    // multiplexing is deferred), so it must not claim agent approve/deny.
    description:
      "Send terminal keystrokes to a shell session on your daax workbench from your phone. Opens a new session; does not yet attach to a running agent.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icons/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
