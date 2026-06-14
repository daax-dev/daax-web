/**
 * Unit tests for the Postgres connection-config resolver (issue #92).
 *
 * Pure env-parsing — no Postgres, no Docker — so this runs in the default
 * `bun run test` suite and is the always-green AC evidence for
 * "connection string sourced from env/secret" + "missing-var failure".
 */

import { describe, it, expect } from "vitest";
import {
  resolveDbConfig,
  isDbConfigured,
  DbConfigError,
} from "@/lib/db/config";

/** Build an env with ONLY the given keys (no leakage from process.env). */
function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe("resolveDbConfig", () => {
  it("prefers DATABASE_URL and passes it through as connectionString", () => {
    const url = "postgres://daax:secret@db:5432/daax?sslmode=require";
    const cfg = resolveDbConfig(env({ DATABASE_URL: url }));
    expect(cfg.source).toBe("DATABASE_URL");
    expect(cfg.poolConfig).toEqual({ connectionString: url });
  });

  it("trims surrounding whitespace on DATABASE_URL", () => {
    const cfg = resolveDbConfig(env({ DATABASE_URL: "  postgres://x/y  " }));
    expect(cfg.poolConfig.connectionString).toBe("postgres://x/y");
  });

  it("assembles a pool config from discrete PG* env vars", () => {
    const cfg = resolveDbConfig(
      env({
        PGHOST: "localhost",
        PGPORT: "5433",
        PGDATABASE: "daax",
        PGUSER: "daax",
        PGPASSWORD: "pw",
      }),
    );
    expect(cfg.source).toBe("discrete-env");
    expect(cfg.poolConfig).toMatchObject({
      host: "localhost",
      port: 5433,
      database: "daax",
      user: "daax",
      password: "pw",
    });
    expect(cfg.poolConfig.ssl).toBeUndefined();
  });

  it("defaults the port to 5432 when PGPORT is omitted", () => {
    const cfg = resolveDbConfig(
      env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u" }),
    );
    expect(cfg.poolConfig.port).toBe(5432);
  });

  it("throws DbConfigError listing every missing required var", () => {
    let caught: unknown;
    try {
      resolveDbConfig(env({}));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DbConfigError);
    expect((caught as Error).message).toContain("PGHOST");
    expect((caught as Error).message).toContain("PGDATABASE");
    expect((caught as Error).message).toContain("PGUSER");
  });

  it("throws when only some discrete vars are present (PGPASSWORD/PGPORT optional)", () => {
    expect(() =>
      resolveDbConfig(env({ PGHOST: "h", PGUSER: "u" })),
    ).toThrowError(DbConfigError);
  });

  it("does NOT require PGPASSWORD or PGPORT (trust/peer auth)", () => {
    expect(() =>
      resolveDbConfig(env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u" })),
    ).not.toThrow();
  });

  it("rejects a non-integer PGPORT", () => {
    expect(() =>
      resolveDbConfig(
        env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u", PGPORT: "abc" }),
      ),
    ).toThrowError(/PGPORT/);
  });

  it("rejects a partial-numeric PGPORT like '5432abc' (no silent parseInt)", () => {
    expect(() =>
      resolveDbConfig(
        env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u", PGPORT: "5432abc" }),
      ),
    ).toThrowError(/PGPORT/);
  });

  it("enables TLS when DAAX_DB_SSL is truthy (discrete env)", () => {
    const cfg = resolveDbConfig(
      env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u", DAAX_DB_SSL: "1" }),
    );
    expect(cfg.poolConfig.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("enables TLS for a non-disable PGSSLMODE and honours reject-unauthorized override", () => {
    const cfg = resolveDbConfig(
      env({
        PGHOST: "h",
        PGDATABASE: "d",
        PGUSER: "u",
        PGSSLMODE: "require",
        DAAX_DB_SSL_REJECT_UNAUTHORIZED: "false",
      }),
    );
    expect(cfg.poolConfig.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("keeps TLS off for PGSSLMODE=disable/prefer", () => {
    for (const mode of ["disable", "prefer"]) {
      const cfg = resolveDbConfig(
        env({ PGHOST: "h", PGDATABASE: "d", PGUSER: "u", PGSSLMODE: mode }),
      );
      expect(cfg.poolConfig.ssl).toBeUndefined();
    }
  });
});

describe("isDbConfigured", () => {
  it("is true with DATABASE_URL", () => {
    expect(isDbConfigured(env({ DATABASE_URL: "postgres://x/y" }))).toBe(true);
  });
  it("is false when nothing is set", () => {
    expect(isDbConfigured(env({}))).toBe(false);
  });
});
