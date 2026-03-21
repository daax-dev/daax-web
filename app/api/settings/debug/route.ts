import { NextResponse } from "next/server";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();

  return NextResponse.json({
    currentSettings: settings,
    defaults: DEFAULT_SETTINGS,
    environment: {
      HOST_WORKSPACE_PATH: process.env.HOST_WORKSPACE_PATH || null,
      HOME: process.env.HOME || null,
      USER: process.env.USER || null,
      isContainer: !!process.env.HOST_WORKSPACE_PATH,
    },
    diagnostics: {
      basePath: settings.basePath,
      hasOldPsPath: settings.basePath?.includes("/ps"),
      needsMigration:
        settings.basePath === "~/ps" || settings.basePath?.startsWith("~/ps/"),
    },
  });
}

export async function DELETE() {
  // This would need to be done client-side
  return NextResponse.json({
    message:
      "To reset settings, run this in the browser console: localStorage.removeItem('daax-settings'); location.reload();",
  });
}
