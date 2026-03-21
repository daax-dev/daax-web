import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

// GET /api/vite-allowed-hosts - Return current allowed hosts configuration
export async function GET() {
  const settings = getSettings();

  return NextResponse.json({
    allowedHosts: settings.viteAllowedHosts,
    // Also provide formatted for direct use in vite.config.js
    viteConfig: {
      server: {
        allowedHosts:
          settings.viteAllowedHosts.length > 0
            ? settings.viteAllowedHosts
            : true,
      },
    },
  });
}
