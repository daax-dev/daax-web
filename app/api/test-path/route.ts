import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { getSettings } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const settings = getSettings();
  const home = homedir();

  // Test different paths
  const paths = [
    { name: "settings.basePath", path: settings.basePath },
    { name: "homedir", path: home },
    { name: "~/prj expanded", path: join(home, "prj") },
    {
      name: "~/prj exists",
      path: join(home, "prj"),
      exists: existsSync(join(home, "prj")),
    },
    { name: "~/ps expanded", path: join(home, "ps") },
    {
      name: "~/ps exists",
      path: join(home, "ps"),
      exists: existsSync(join(home, "ps")),
    },
    {
      name: "HOST_WORKSPACE_PATH",
      path: process.env.HOST_WORKSPACE_PATH || "not set",
    },
  ];

  return NextResponse.json({
    settings,
    paths,
    timestamp: new Date().toISOString(),
  });
}
