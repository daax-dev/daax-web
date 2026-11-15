/**
 * GET /api/substrate/config — whether the substrate backend is on, and what a
 * create form may offer (agents, sandbox classes, egress presets). dx#113/#123.
 * Answers 404 `substrate-disabled` when DAAX_SUBSTRATE_ENABLED is off.
 */
import { NextResponse } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { describeConfig } from "@/lib/substrate/service";
import { substrateDeps } from "@/lib/substrate/route-helpers";

export async function GET() {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(describeConfig(ctx.deps.config));
}
