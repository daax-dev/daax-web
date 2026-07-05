import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mintTicket, verifyTicket, getWsTokenSecret } from "@/lib/ws-ticket";

const SECRET = "ws-token-secret-value";
const NEW_SECRET = "ws-token-secret-rotated";

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

describe("ws-ticket dual-secret rotation (#103)", () => {
  afterEach(() => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
    delete process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS;
  });

  it("accepts an old-secret ticket after rotation when the old value is in _PREVIOUS", () => {
    // Ticket minted under the old secret (still within TTL).
    process.env.DAAX_WS_TOKEN_SECRET = SECRET;
    const { token } = mintTicket("user-123");

    // Rotate: new value becomes current, old value moves to _PREVIOUS.
    process.env.DAAX_WS_TOKEN_SECRET = NEW_SECRET;
    process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS = SECRET;

    const result = verifyTicket(token);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.sub).toBe("user-123");
  });

  it("accepts a new-secret ticket during the rotation window", () => {
    process.env.DAAX_WS_TOKEN_SECRET = NEW_SECRET;
    process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS = SECRET;
    // Minting always uses the current (new) secret.
    const { token } = mintTicket("user-123");
    expect(verifyTicket(token).valid).toBe(true);
  });

  it("rejects a ticket signed with a secret matching neither current nor previous", () => {
    process.env.DAAX_WS_TOKEN_SECRET = "unrelated-secret";
    const { token } = mintTicket("user-123");

    process.env.DAAX_WS_TOKEN_SECRET = NEW_SECRET;
    process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS = SECRET;

    const result = verifyTicket(token);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("bad-signature");
  });

  it("mints with the CURRENT secret (not previous): token survives dropping _PREVIOUS", () => {
    // During rotation both are set. Mint here, then remove _PREVIOUS so only the
    // current secret can verify — if mint had (wrongly) used the previous
    // secret, this verify would fail. Proves the mint-uses-current invariant
    // non-vacuously (verifyTicket alone would accept either secret).
    process.env.DAAX_WS_TOKEN_SECRET = NEW_SECRET;
    process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS = SECRET;
    const { token } = mintTicket("user-123");

    delete process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS;
    const result = verifyTicket(token);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.sub).toBe("user-123");
  });

  it("current-only (no weakening) when _PREVIOUS is unset: an old-secret ticket is rejected", () => {
    process.env.DAAX_WS_TOKEN_SECRET = SECRET;
    const { token } = mintTicket("user-123");

    // Rotate current but do NOT set _PREVIOUS — the old ticket must not verify.
    process.env.DAAX_WS_TOKEN_SECRET = NEW_SECRET;
    delete process.env.DAAX_WS_TOKEN_SECRET_PREVIOUS;

    const result = verifyTicket(token);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("bad-signature");
  });
});
