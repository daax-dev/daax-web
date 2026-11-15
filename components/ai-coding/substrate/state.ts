/**
 * Substrate session state helpers for the AI Coding UI (dx#123).
 * Pure; shared by the badge, the sessions list and the session tab.
 */
import type { SessionView } from "@/lib/substrate/client";

export type SessionState = SessionView["state"];

/** What the persistent badge shows. Transitional states fold into their target. */
export type BadgeState =
  | "creating"
  | "running"
  | "suspended"
  | "ending"
  | "error";

export function badgeState(state: SessionState): BadgeState {
  switch (state) {
    case "creating":
      return "creating";
    case "running":
      return "running";
    case "suspending":
    case "suspended":
    case "resuming":
      return "suspended";
    case "ending":
    case "ended":
      return "ending";
    default:
      return "error";
  }
}

/** A state that is moving on by itself: poll until it settles. */
export function isTransitional(state: SessionState): boolean {
  return ["creating", "suspending", "resuming", "ending"].includes(state);
}

export const canAttach = (s: Pick<SessionView, "state">) =>
  s.state === "running";
export const canSuspend = (s: Pick<SessionView, "state">) =>
  s.state === "running";
export const canResume = (s: Pick<SessionView, "state">) =>
  s.state === "suspended";
/** End is allowed in every live state (the backend accepts all of them). */
export const canEnd = (s: Pick<SessionView, "state">) => s.state !== "ended";
export const canEditEgress = (s: Pick<SessionView, "state" | "actorOwned">) =>
  (s.state === "running" || s.state === "suspended") && s.actorOwned;

export const SANDBOX_LABELS: Record<string, string> = {
  gvisor: "gVisor",
  microvm: "microVM",
};

export const AGENT_LABELS: Record<string, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  copilot: "GitHub Copilot",
};

/** Short, stable label for a session (agent + the actor name's hex). */
export function sessionLabel(
  s: Pick<SessionView, "agent" | "actorName">,
): string {
  const agent = AGENT_LABELS[s.agent] ?? s.agent;
  return `${agent} · ${s.actorName.replace(/^daax-/, "")}`;
}
