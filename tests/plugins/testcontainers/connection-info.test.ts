/**
 * Tests for connection-info helpers.
 *
 * Covers the credential allowlist extraction and the image → connection-info
 * mapping, including reveal/mask behaviour and the "secrets not loaded" path.
 */

import { describe, it, expect } from "vitest";
import {
  extractConnectionCredentials,
  getConnectionInfo,
  SECRET_MASK,
  CONNECTION_CREDENTIAL_KEYS,
} from "@/plugins/testcontainers/lib/connection-info";
import type { TestContainer } from "@/plugins/testcontainers/types";

function makeContainer(overrides: Partial<TestContainer>): TestContainer {
  return {
    id: "abc123",
    containerId: "abc123def456",
    name: "test",
    image: "mysql:8.0",
    status: "running",
    ports: [{ containerPort: 3306, hostPort: 61215, protocol: "tcp" }],
    labels: {},
    environmentKeys: [],
    mounts: [],
    networks: ["bridge"],
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("extractConnectionCredentials", () => {
  it("returns only allowlisted keys", () => {
    const env = [
      "MYSQL_PASSWORD=secret-pw",
      "MYSQL_ROOT_PASSWORD=root-pw",
      "MYSQL_USER=test",
      "MYSQL_DATABASE=testdb",
      "PATH=/usr/bin", // not a credential
      "SOME_API_TOKEN=should-not-leak", // sensitive but not connection-relevant
    ];
    expect(extractConnectionCredentials(env)).toEqual({
      MYSQL_PASSWORD: "secret-pw",
      MYSQL_ROOT_PASSWORD: "root-pw",
      MYSQL_USER: "test",
      MYSQL_DATABASE: "testdb",
    });
  });

  it("does not leak arbitrary secrets outside the allowlist", () => {
    const env = ["AWS_SECRET_ACCESS_KEY=abc", "GITHUB_TOKEN=ghp_x"];
    expect(extractConnectionCredentials(env)).toEqual({});
  });

  it("preserves '=' characters inside values", () => {
    const env = ["POSTGRES_PASSWORD=a=b=c"];
    expect(extractConnectionCredentials(env)).toEqual({
      POSTGRES_PASSWORD: "a=b=c",
    });
  });

  it("ignores malformed entries and handles undefined", () => {
    expect(extractConnectionCredentials(["NOEQUALS"])).toEqual({});
    expect(extractConnectionCredentials(undefined)).toEqual({});
  });

  it("every allowlist key is a non-empty string", () => {
    for (const key of CONNECTION_CREDENTIAL_KEYS) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe("getConnectionInfo - secrets available", () => {
  it("uses real MySQL credentials and a working connection string", () => {
    const container = makeContainer({
      image: "mysql:8.0",
      connectionCredentials: {
        MYSQL_USER: "appuser",
        MYSQL_PASSWORD: "s3cr3t",
        MYSQL_ROOT_PASSWORD: "rootpw",
        MYSQL_DATABASE: "appdb",
      },
    });
    const info = getConnectionInfo(container)!;
    expect(info.type).toBe("MySQL");
    expect(info.secretsAvailable).toBe(true);
    expect(info.connectionString).toBe(
      "mysql://appuser:s3cr3t@localhost:61215/appdb",
    );
    expect(info.maskedConnectionString).toBe(
      `mysql://appuser:${SECRET_MASK}@localhost:61215/appdb`,
    );
    expect(info.maskedConnectionString).not.toContain("s3cr3t");

    const password = info.credentials.find((c) => c.label === "Password");
    expect(password).toMatchObject({ value: "s3cr3t", sensitive: true });
    const root = info.credentials.find((c) => c.label === "Root Password");
    expect(root).toMatchObject({ value: "rootpw", sensitive: true });
  });

  it("URL-encodes credentials with reserved characters in the connection string", () => {
    const container = makeContainer({
      image: "postgres:16-alpine",
      ports: [{ containerPort: 5432, hostPort: 5000, protocol: "tcp" }],
      connectionCredentials: {
        POSTGRES_USER: "us@r",
        POSTGRES_PASSWORD: "p@ss:w/rd",
        POSTGRES_DB: "pgdb",
      },
    });
    const info = getConnectionInfo(container)!;
    // Connection string is a valid URI (reserved chars percent-encoded).
    expect(info.connectionString).toBe(
      "postgresql://us%40r:p%40ss%3Aw%2Frd@localhost:5000/pgdb",
    );
    // The credentials grid keeps the raw, paste-into-a-client value.
    const password = info.credentials.find((c) => c.label === "Password");
    expect(password!.value).toBe("p@ss:w/rd");
  });

  it("maps PostgreSQL credentials", () => {
    const container = makeContainer({
      image: "postgres:16-alpine",
      ports: [{ containerPort: 5432, hostPort: 5000, protocol: "tcp" }],
      connectionCredentials: {
        POSTGRES_USER: "pguser",
        POSTGRES_PASSWORD: "pgpass",
        POSTGRES_DB: "pgdb",
      },
    });
    const info = getConnectionInfo(container)!;
    expect(info.type).toBe("PostgreSQL");
    expect(info.connectionString).toBe(
      "postgresql://pguser:pgpass@localhost:5000/pgdb",
    );
  });

  it("maps RabbitMQ including the management UI port", () => {
    const container = makeContainer({
      image: "rabbitmq:3-management-alpine",
      ports: [
        { containerPort: 5672, hostPort: 5672, protocol: "tcp" },
        { containerPort: 15672, hostPort: 15672, protocol: "tcp" },
      ],
      connectionCredentials: {
        RABBITMQ_DEFAULT_USER: "rmq",
        RABBITMQ_DEFAULT_PASS: "rmqpass",
      },
    });
    const info = getConnectionInfo(container)!;
    expect(info.type).toBe("RabbitMQ");
    expect(info.connectionString).toBe("amqp://rmq:rmqpass@localhost:5672");
    const mgmt = info.credentials.find((c) => c.label === "Management UI");
    expect(mgmt?.value).toBe("http://localhost:15672");
  });

  it("maps Keycloak admin credentials", () => {
    const container = makeContainer({
      image: "quay.io/keycloak/keycloak:23.0",
      ports: [{ containerPort: 8080, hostPort: 8080, protocol: "tcp" }],
      connectionCredentials: {
        KEYCLOAK_ADMIN: "admin",
        KEYCLOAK_ADMIN_PASSWORD: "kcpass",
      },
    });
    const info = getConnectionInfo(container)!;
    expect(info.type).toBe("Keycloak");
    const pw = info.credentials.find((c) => c.label === "Admin Password");
    expect(pw).toMatchObject({ value: "kcpass", sensitive: true });
  });
});

describe("getConnectionInfo - secrets not loaded (bulk list)", () => {
  it("reports secrets unavailable and never embeds a real password", () => {
    const container = makeContainer({ image: "mysql:8.0" }); // no connectionCredentials
    const info = getConnectionInfo(container)!;
    expect(info.secretsAvailable).toBe(false);
    // Falls back to template defaults for non-sensitive fields
    expect(info.maskedConnectionString).toBe(
      `mysql://test:${SECRET_MASK}@localhost:61215/testdb`,
    );
    const password = info.credentials.find((c) => c.label === "Password");
    expect(password?.value).toBe("");
    expect(password?.sensitive).toBe(true);
  });
});

describe("getConnectionInfo - edge cases", () => {
  it("returns null when there is no host port", () => {
    const container = makeContainer({ ports: [] });
    expect(getConnectionInfo(container)).toBeNull();
  });

  it("returns no sensitive credentials for Redis", () => {
    const container = makeContainer({
      image: "redis:7-alpine",
      ports: [{ containerPort: 6379, hostPort: 6379, protocol: "tcp" }],
      connectionCredentials: {},
    });
    const info = getConnectionInfo(container)!;
    expect(info.type).toBe("Redis");
    expect(info.credentials.some((c) => c.sensitive)).toBe(false);
  });

  it("returns null for an unrecognised image", () => {
    const container = makeContainer({ image: "nginx:latest" });
    expect(getConnectionInfo(container)).toBeNull();
  });
});
