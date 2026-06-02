/**
 * Connection Info
 *
 * Pure helpers that map a container image to its connection details and
 * surface the real connection credentials for known database / service
 * images.
 *
 * SECURITY: only an explicit allowlist of connection-relevant environment
 * variables is ever surfaced (see CONNECTION_CREDENTIAL_KEYS). Arbitrary
 * secrets in the container environment are never exposed here. The values
 * are populated only on a single-container inspect, never in bulk listings.
 */

import type { TestContainer } from "../types";

/** Mask shown in place of a sensitive value when secrets are hidden. */
export const SECRET_MASK = "••••••••";

/**
 * Environment variables that hold connection credentials for the built-in
 * templates. This is a deliberate allowlist: the server surfaces only these
 * keys' values, keeping all other environment values redacted.
 */
export const CONNECTION_CREDENTIAL_KEYS = [
  // PostgreSQL
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  // MySQL
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_DATABASE",
  // MariaDB
  "MARIADB_USER",
  "MARIADB_PASSWORD",
  "MARIADB_ROOT_PASSWORD",
  "MARIADB_DATABASE",
  // MongoDB
  "MONGO_INITDB_ROOT_USERNAME",
  "MONGO_INITDB_ROOT_PASSWORD",
  // RabbitMQ
  "RABBITMQ_DEFAULT_USER",
  "RABBITMQ_DEFAULT_PASS",
  // Keycloak
  "KEYCLOAK_ADMIN",
  "KEYCLOAK_ADMIN_PASSWORD",
] as const;

const CONNECTION_CREDENTIAL_KEY_SET = new Set<string>(
  CONNECTION_CREDENTIAL_KEYS,
);

/**
 * Extract the connection-relevant credential values from a Docker `Config.Env`
 * array (`KEY=value` strings). Only allowlisted keys are returned; everything
 * else is dropped.
 */
export function extractConnectionCredentials(
  env: string[] | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of env || []) {
    const idx = entry.indexOf("=");
    if (idx === -1) continue;
    const key = entry.slice(0, idx);
    if (CONNECTION_CREDENTIAL_KEY_SET.has(key)) {
      result[key] = entry.slice(idx + 1);
    }
  }
  return result;
}

export interface Credential {
  label: string;
  value: string;
  /** When true, the value is a secret and should be masked until revealed. */
  sensitive?: boolean;
}

export interface ConnectionInfo {
  type: string;
  /** Full connection string with the real password (working). */
  connectionString: string;
  /** Connection string with the password masked. */
  maskedConnectionString: string;
  credentials: Credential[];
  /**
   * True when real secret values are available (i.e. the container detail with
   * connectionCredentials was loaded). False for bulk-list containers where
   * secrets were never fetched.
   */
  secretsAvailable: boolean;
}

/**
 * Build connection info for a container. When `container.connectionCredentials`
 * is present (single-container inspect), real values are used; otherwise the
 * built-in template defaults are used for non-sensitive fields and secrets are
 * reported as unavailable.
 */
export function getConnectionInfo(
  container: TestContainer,
): ConnectionInfo | null {
  const image = container.image.toLowerCase();
  const hostPort = container.ports[0]?.hostPort;

  if (!hostPort) return null;

  const env = container.connectionCredentials;
  const secretsAvailable = env !== undefined;
  const get = (key: string, fallback: string): string => env?.[key] ?? fallback;
  // User/password may contain URI-reserved characters (@ : / # %). Encode them
  // in connection strings so the copied value is a valid, working URI. The
  // credentials grid below shows the raw values (what you type into a client).
  const enc = encodeURIComponent;

  // PostgreSQL
  if (image.includes("postgres")) {
    const user = get("POSTGRES_USER", "test");
    const db = get("POSTGRES_DB", "testdb");
    const password = get("POSTGRES_PASSWORD", "");
    return {
      type: "PostgreSQL",
      connectionString: `postgresql://${enc(user)}:${enc(password)}@localhost:${hostPort}/${db}`,
      maskedConnectionString: `postgresql://${enc(user)}:${SECRET_MASK}@localhost:${hostPort}/${db}`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: db },
        { label: "User", value: user },
        { label: "Password", value: password, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // MySQL
  if (image.includes("mysql")) {
    const user = get("MYSQL_USER", "test");
    const db = get("MYSQL_DATABASE", "testdb");
    const password = get("MYSQL_PASSWORD", "");
    const rootPassword = get("MYSQL_ROOT_PASSWORD", "");
    return {
      type: "MySQL",
      connectionString: `mysql://${enc(user)}:${enc(password)}@localhost:${hostPort}/${db}`,
      maskedConnectionString: `mysql://${enc(user)}:${SECRET_MASK}@localhost:${hostPort}/${db}`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: db },
        { label: "User", value: user },
        { label: "Password", value: password, sensitive: true },
        { label: "Root Password", value: rootPassword, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // MariaDB
  if (image.includes("mariadb")) {
    const user = get("MARIADB_USER", "test");
    const db = get("MARIADB_DATABASE", "testdb");
    const password = get("MARIADB_PASSWORD", "");
    const rootPassword = get("MARIADB_ROOT_PASSWORD", "");
    return {
      type: "MariaDB",
      connectionString: `mysql://${enc(user)}:${enc(password)}@localhost:${hostPort}/${db}`,
      maskedConnectionString: `mysql://${enc(user)}:${SECRET_MASK}@localhost:${hostPort}/${db}`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: db },
        { label: "User", value: user },
        { label: "Password", value: password, sensitive: true },
        { label: "Root Password", value: rootPassword, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // MongoDB
  if (image.includes("mongo")) {
    const user = get("MONGO_INITDB_ROOT_USERNAME", "test");
    const password = get("MONGO_INITDB_ROOT_PASSWORD", "");
    return {
      type: "MongoDB",
      connectionString: `mongodb://${enc(user)}:${enc(password)}@localhost:${hostPort}`,
      maskedConnectionString: `mongodb://${enc(user)}:${SECRET_MASK}@localhost:${hostPort}`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "User", value: user },
        { label: "Password", value: password, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // Redis (no auth in the default template)
  if (image.includes("redis")) {
    return {
      type: "Redis",
      connectionString: `redis://localhost:${hostPort}`,
      maskedConnectionString: `redis://localhost:${hostPort}`,
      credentials: [{ label: "Host", value: `localhost:${hostPort}` }],
      secretsAvailable,
    };
  }

  // RabbitMQ
  if (image.includes("rabbitmq")) {
    const mgmtPort = container.ports.find(
      (p) => p.containerPort === 15672,
    )?.hostPort;
    const user = get("RABBITMQ_DEFAULT_USER", "test");
    const password = get("RABBITMQ_DEFAULT_PASS", "");
    return {
      type: "RabbitMQ",
      connectionString: `amqp://${enc(user)}:${enc(password)}@localhost:${hostPort}`,
      maskedConnectionString: `amqp://${enc(user)}:${SECRET_MASK}@localhost:${hostPort}`,
      credentials: [
        { label: "AMQP Host", value: `localhost:${hostPort}` },
        {
          label: "Management UI",
          value: mgmtPort ? `http://localhost:${mgmtPort}` : "N/A",
        },
        { label: "User", value: user },
        { label: "Password", value: password, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // Elasticsearch (security disabled in the default template)
  if (image.includes("elasticsearch")) {
    return {
      type: "Elasticsearch",
      connectionString: `http://localhost:${hostPort}`,
      maskedConnectionString: `http://localhost:${hostPort}`,
      credentials: [{ label: "URL", value: `http://localhost:${hostPort}` }],
      secretsAvailable,
    };
  }

  // Keycloak
  if (image.includes("keycloak")) {
    const adminUser = get("KEYCLOAK_ADMIN", "admin");
    const adminPassword = get("KEYCLOAK_ADMIN_PASSWORD", "");
    return {
      type: "Keycloak",
      connectionString: `http://localhost:${hostPort}`,
      maskedConnectionString: `http://localhost:${hostPort}`,
      credentials: [
        { label: "URL", value: `http://localhost:${hostPort}` },
        { label: "Admin User", value: adminUser },
        { label: "Admin Password", value: adminPassword, sensitive: true },
      ],
      secretsAvailable,
    };
  }

  // LocalStack (no auth)
  if (image.includes("localstack")) {
    return {
      type: "LocalStack",
      connectionString: `http://localhost:${hostPort}`,
      maskedConnectionString: `http://localhost:${hostPort}`,
      credentials: [
        { label: "Endpoint", value: `http://localhost:${hostPort}` },
        { label: "AWS_ENDPOINT_URL", value: `http://localhost:${hostPort}` },
      ],
      secretsAvailable,
    };
  }

  return null;
}
