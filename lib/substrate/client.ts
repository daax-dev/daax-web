/**
 * Browser client for substrate sessions (dx#113 / #114), for the UI work in
 * dx#123. Sessions are server-side and persistent: the UI lists them from
 * the server (never from React state), (re)attaches with a fresh grant on
 * every connect, and ends them only through an explicit End action.
 *
 * Terminal WS protocol, as for every daax terminal:
 *   client -> server: {type:"input",data} {type:"resize",cols,rows}
 *                     {type:"startRecording"} {type:"stopRecording"}
 *   server -> client: {type:"session",id,mode:"substrate",actor,persistent:true}
 *                     {type:"output",data} {type:"recordingStarted",recordingId}
 *                     {type:"detached",reason} (actor stream went away: the
 *                     session is NOT ended; refresh state, then reattach or resume)
 *                     {type:"error",error}
 * Closing the socket detaches. The agent keeps running.
 */
import { buildTerminalWsUrl } from "../websocket-utils";
import type { SessionView, AttachGrant } from "./service";

export type { SessionView, AttachGrant };

export interface CreateSessionRequest {
  agent: "claude" | "codex" | "gemini" | "opencode" | "copilot";
  sandboxClass?: "gvisor" | "microvm";
  egressPresets?: Array<"npm" | "pypi" | "github">;
  egressHosts?: string[];
}

export class SubstrateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SubstrateApiError(
      res.status,
      body?.error ?? "error",
      body?.message ?? res.statusText,
    );
  }
  return body as T;
}

const base = "/api/substrate/sessions";
const enc = encodeURIComponent;

export const substrateApi = {
  config: () => call<Record<string, unknown>>("/api/substrate/config"),
  list: () => call<{ sessions: SessionView[] }>(base),
  get: (id: string) => call<SessionView>(`${base}/${enc(id)}`),
  create: (req: CreateSessionRequest) =>
    call<SessionView>(base, { method: "POST", body: JSON.stringify(req) }),
  attach: (id: string) =>
    call<AttachGrant>(`${base}/${enc(id)}/attach`, { method: "POST" }),
  suspend: (id: string) =>
    call<SessionView>(`${base}/${enc(id)}/suspend`, { method: "POST" }),
  resume: (id: string) =>
    call<SessionView>(`${base}/${enc(id)}/resume`, { method: "POST" }),
  end: (id: string) =>
    call<{ id: string; state: "ended" | "ending" }>(`${base}/${enc(id)}/end`, {
      method: "POST",
    }),
};

/**
 * Attach (or reattach) to a session: fetch a fresh single-use grant and open
 * the terminal WebSocket with it. Call again for every reconnect.
 */
export async function openSubstrateTerminal(
  id: string,
  opts: { record?: boolean; sessionType?: string } = {},
): Promise<WebSocket> {
  const grant = await substrateApi.attach(id);
  const params = new URLSearchParams(grant.query);
  if (opts.record) params.set("record", "true");
  if (opts.sessionType) params.set("sessionType", opts.sessionType);
  const url = buildTerminalWsUrl(params);
  return grant.ticket
    ? new WebSocket(url, [grant.ticket.subprotocol, grant.ticket.token])
    : new WebSocket(url);
}
