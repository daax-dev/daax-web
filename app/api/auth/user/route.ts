import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import type { AuthUserPayload } from "@/lib/auth-types";
import { logoutUrl } from "@/lib/idp-urls";

export async function GET() {
  const user = await getAuthUser();
  const body: AuthUserPayload = { ...user, logoutUrl: logoutUrl() };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
