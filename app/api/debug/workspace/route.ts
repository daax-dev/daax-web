import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();

  // Log what we're getting
  console.log("[Debug] Settings basePath:", settings.basePath);
  console.log(
    "[Debug] Process.env.HOST_WORKSPACE_PATH:",
    process.env.HOST_WORKSPACE_PATH,
  );

  return NextResponse.json({
    settings: {
      basePath: settings.basePath,
      allSettings: settings,
    },
    environment: {
      HOST_WORKSPACE_PATH: process.env.HOST_WORKSPACE_PATH,
      HOME: process.env.HOME,
      PWD: process.env.PWD,
    },
    diagnostic: {
      isContainer: !!process.env.HOST_WORKSPACE_PATH,
      expectedPath: settings.basePath,
    },
  });
}
