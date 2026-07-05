import { describe, it, expect } from "vitest";
import type { TableSchema } from "@/lib/db-console/identifiers";
import { InvalidIdentifierError } from "@/lib/db-console/identifiers";
import {
  buildSelectRows,
  buildBoundedCount,
  buildWrite,
  clampLimit,
  clampOffset,
  normalizeDirection,
  WriteValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/db-console/query-builder";

const users: TableSchema = {
  schema: "public",
  name: "users",
  columns: [
    { name: "subject", dataType: "text", isNullable: false },
    { name: "email", dataType: "text", isNullable: true },
    { name: "is_system", dataType: "boolean", isNullable: false },
  ],
};

describe("db-console query builder (F6 #102)", () => {
  describe("pagination clamps", () => {
    it("defaults and clamps limit into [1, MAX]", () => {
      expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampLimit("0")).toBe(DEFAULT_PAGE_SIZE);
      expect(clampLimit("-5")).toBe(DEFAULT_PAGE_SIZE);
      expect(clampLimit("abc")).toBe(DEFAULT_PAGE_SIZE);
      expect(clampLimit("10")).toBe(10);
      expect(clampLimit("99999")).toBe(MAX_PAGE_SIZE);
    });

    it("clamps offset to a non-negative integer", () => {
      expect(clampOffset(undefined)).toBe(0);
      expect(clampOffset("-1")).toBe(0);
      expect(clampOffset("bad")).toBe(0);
      expect(clampOffset("25")).toBe(25);
    });

    it("normalises direction to a fixed whitelist", () => {
      expect(normalizeDirection("desc")).toBe("desc");
      expect(normalizeDirection("DESC")).toBe("desc");
      expect(normalizeDirection("asc")).toBe("asc");
      // Anything else (including an injection attempt) collapses to asc.
      expect(normalizeDirection("asc; DROP TABLE users")).toBe("asc");
      expect(normalizeDirection(undefined)).toBe("asc");
    });
  });

  describe("buildSelectRows", () => {
    it("binds limit/offset as params and quotes the qualified relation", () => {
      const q = buildSelectRows(users, { limit: 50, offset: 100 });
      expect(q.text).toBe(
        'SELECT * FROM "public"."users" LIMIT $1::bigint OFFSET $2::bigint',
      );
      expect(q.params).toEqual([50, 100]);
    });

    it("adds a validated, quoted ORDER BY with a whitelisted direction", () => {
      const q = buildSelectRows(users, {
        limit: 10,
        offset: 0,
        orderBy: "email",
        direction: "desc",
      });
      expect(q.text).toContain('ORDER BY "email" DESC');
      expect(q.params).toEqual([10, 0]);
    });

    it("REJECTS an unknown/injected ORDER BY column (never reaches SQL)", () => {
      expect(() =>
        buildSelectRows(users, {
          limit: 10,
          offset: 0,
          orderBy: "email; DROP TABLE users",
        }),
      ).toThrow(InvalidIdentifierError);
    });
  });

  describe("buildBoundedCount", () => {
    it("caps the count and binds the cap as a param", () => {
      const q = buildBoundedCount(users, 100);
      expect(q.text).toContain('FROM "public"."users"');
      expect(q.text).toContain("LIMIT $1::bigint");
      expect(q.params).toEqual([100]);
    });
  });

  describe("buildWrite — insert", () => {
    it("binds values as $N::type and quotes columns (no raw value in SQL)", () => {
      const q = buildWrite(users, {
        op: "insert",
        values: { subject: "s1", email: "e@x.z" },
      });
      expect(q.text).toBe(
        'INSERT INTO "public"."users" ("subject", "email") VALUES ($1::text, $2::text)',
      );
      expect(q.params).toEqual(["s1", "e@x.z"]);
    });

    it("keeps an injection VALUE as a bound param, never inlined", () => {
      const evil = "x'); DROP TABLE users; --";
      const q = buildWrite(users, { op: "insert", values: { subject: evil } });
      expect(q.text).not.toContain("DROP TABLE");
      expect(q.text).toBe(
        'INSERT INTO "public"."users" ("subject") VALUES ($1::text)',
      );
      expect(q.params).toEqual([evil]);
    });

    it("REJECTS an unknown/injected column name", () => {
      expect(() =>
        buildWrite(users, {
          op: "insert",
          values: { "subject); DROP TABLE users; --": "x" },
        }),
      ).toThrow(InvalidIdentifierError);
    });

    it("REJECTS an insert with no columns", () => {
      expect(() => buildWrite(users, { op: "insert", values: {} })).toThrow(
        WriteValidationError,
      );
    });
  });

  describe("buildWrite — update", () => {
    it("builds SET + WHERE with bound params in order", () => {
      const q = buildWrite(users, {
        op: "update",
        values: { email: "new@x.z" },
        where: { subject: "s1" },
      });
      expect(q.text).toBe(
        'UPDATE "public"."users" SET "email" = $1::text WHERE "subject" = $2::text',
      );
      expect(q.params).toEqual(["new@x.z", "s1"]);
    });

    it("renders a null WHERE value as IS NULL (not = NULL)", () => {
      const q = buildWrite(users, {
        op: "update",
        values: { email: "x@y.z" },
        where: { email: null },
      });
      expect(q.text).toBe(
        'UPDATE "public"."users" SET "email" = $1::text WHERE "email" IS NULL',
      );
      expect(q.params).toEqual(["x@y.z"]);
    });

    it("REFUSES an unqualified update (empty where would rewrite every row)", () => {
      expect(() =>
        buildWrite(users, { op: "update", values: { email: "x" }, where: {} }),
      ).toThrow(WriteValidationError);
    });

    it("REJECTS an unknown column in SET or WHERE", () => {
      expect(() =>
        buildWrite(users, {
          op: "update",
          values: { nope: "x" },
          where: { subject: "s1" },
        }),
      ).toThrow(InvalidIdentifierError);
    });
  });

  describe("buildWrite — delete", () => {
    it("builds a WHERE-qualified delete", () => {
      const q = buildWrite(users, {
        op: "delete",
        where: { subject: "s1", is_system: true },
      });
      expect(q.text).toBe(
        'DELETE FROM "public"."users" WHERE "subject" = $1::text AND "is_system" = $2::boolean',
      );
      expect(q.params).toEqual(["s1", true]);
    });

    it("REFUSES an unqualified delete (empty where would empty the table)", () => {
      expect(() => buildWrite(users, { op: "delete", where: {} })).toThrow(
        WriteValidationError,
      );
    });
  });

  it("REJECTS an unsupported op", () => {
    expect(() =>
      buildWrite(users, { op: "truncate" as unknown as "insert" }),
    ).toThrow(WriteValidationError);
  });
});
