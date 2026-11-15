import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openSubstrateTerminal,
  substrateApi,
  SubstrateApiError,
} from "@/lib/substrate/client";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status < 400,
    status,
    statusText: "x",
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("substrate client", () => {
  it("attaches with the grant's ticket as the WS subprotocol, never in the URL", async () => {
    const fetchMock = stubFetch(200, {
      sessionId: "s1",
      actor: "daax-0123456789",
      query: { mode: "substrate", session: "s1", actor: "daax-0123456789" },
      ticket: { token: "tok.sig", exp: 1, subprotocol: "daax-ws-ticket" },
    });
    const ctor = vi.fn();
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(url: string, protocols?: string[]) {
          ctor(url, protocols);
        }
      },
    );
    await openSubstrateTerminal("s1", { record: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/substrate/sessions/s1/attach",
      expect.objectContaining({ method: "POST" }),
    );
    const [url, protocols] = ctor.mock.calls[0];
    expect(url).toContain("mode=substrate");
    expect(url).toContain("record=true");
    expect(url).not.toContain("tok.sig");
    expect(protocols).toEqual(["daax-ws-ticket", "tok.sig"]);
  });

  it("surfaces API errors with their code", async () => {
    stubFetch(409, {
      error: "not-running",
      message: "session is suspended; resume it first",
    });
    await expect(substrateApi.attach("s1")).rejects.toMatchObject({
      status: 409,
      code: "not-running",
    });
    await expect(substrateApi.attach("s1")).rejects.toBeInstanceOf(
      SubstrateApiError,
    );
  });
});
