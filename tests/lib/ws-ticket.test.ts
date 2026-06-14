import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mintTicket, verifyTicket, getWsTokenSecret } from "@/lib/ws-ticket";

const SECRET = "ws-token-secret-value";

describe("ws-ticket mint/verify (F1b, #95)", () => {
  beforeEach(() => {
    process.env.DAAX_WS_TOKEN_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
  });

  it("mints a token that verifies for the same subject", () => {
    const { token } = mintTicket("user-123");
    const result = verifyTicket(token);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.sub).toBe("user-123");
  });

  it("rejects a token whose signature was tampered with", () => {
    const { token } = mintTicket("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    const result = verifyTicket(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("bad-signature");
  });

  it("rejects a token whose payload was tampered with (signature mismatch)", () => {
    const { token } = mintTicket("user-123");
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        jti: "x",
        sub: "admin",
        iat: Date.now(),
        exp: Date.now() + 10000,
      }),
    ).toString("base64url");
    const result = verifyTicket(`${forgedPayload}.${sig}`);
    expect(result.valid).toBe(false);
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 60_000;
    const { token } = mintTicket("user-123", past);
    const result = verifyTicket(token);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });

  it("rejects a malformed token", () => {
    expect(verifyTicket("not-a-token").valid).toBe(false);
    expect(verifyTicket("").valid).toBe(false);
  });

  it("cannot verify when the secret is unset", () => {
    const { token } = mintTicket("user-123");
    delete process.env.DAAX_WS_TOKEN_SECRET;
    const result = verifyTicket(token);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("secret-unset");
  });

  it("does not verify a token signed with a different secret", () => {
    const { token } = mintTicket("user-123");
    process.env.DAAX_WS_TOKEN_SECRET = "a-different-secret";
    expect(verifyTicket(token).valid).toBe(false);
  });

  it("mintTicket throws when the secret is unset", () => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
    expect(() => mintTicket("user-123")).toThrow();
    expect(getWsTokenSecret()).toBeUndefined();
  });
});
