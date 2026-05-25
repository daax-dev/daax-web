/**
 * Test Containers Plugin - Constants
 *
 * Default values, labels, and configuration constants.
 */

/**
 * Label used to identify containers managed by this plugin
 */
export const CONTAINER_LABEL = "org.daax.testcontainers";
export const CONTAINER_LABEL_VALUE = "true";

/**
 * Label for storing template ID
 */
export const TEMPLATE_LABEL = "org.daax.testcontainers.template";

/**
 * Label for storing project association
 */
export const PROJECT_LABEL = "org.daax.testcontainers.project";

/**
 * Default settings
 */
export const DEFAULT_SETTINGS = {
  autoRefreshInterval: 10, // seconds
  defaultCleanupAge: 24, // hours
  containerLabel: `${CONTAINER_LABEL}=${CONTAINER_LABEL_VALUE}`,
  maxContainers: 20,
  defaultMemoryLimitMb: 512,
  defaultCpuLimit: 0.5,
  imageAllowlist: [
    // Official images
    "postgres:*",
    "mysql:*",
    "mariadb:*",
    "mongo:*",
    "redis:*",
    "memcached:*",
    "elasticsearch:*",
    "rabbitmq:*",
    "nats:*",
    "zookeeper:*",
    "alpine:*",
    "busybox:*",
    // Testcontainers images
    "testcontainers/*",
    // Bitnami images
    "bitnami/*",
    // Confluent images
    "confluentinc/*",
    // LocalStack
    "localstack/localstack:*",
    // Keycloak
    "quay.io/keycloak/keycloak:*",
  ],
};

/**
 * Cleanup scheduler defaults
 */
export const CLEANUP_DEFAULTS = {
  intervalMs: 5 * 60 * 1000, // 5 minutes
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  inactivityMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Resource limits
 */
export const RESOURCE_LIMITS = {
  maxMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
  minMemoryBytes: 64 * 1024 * 1024, // 64MB
  maxCpus: 4,
  minCpus: 0.1,
};

/**
 * Status colors for UI
 */
export const STATUS_COLORS: Record<string, string> = {
  created: "text-gray-500",
  running: "text-green-500",
  paused: "text-yellow-500",
  restarting: "text-yellow-500",
  removing: "text-orange-500",
  exited: "text-red-500",
  dead: "text-red-700",
};

/**
 * Status background colors for badges
 */
export const STATUS_BG_COLORS: Record<string, string> = {
  created: "bg-gray-500/20",
  running: "bg-green-500/20",
  paused: "bg-yellow-500/20",
  restarting: "bg-yellow-500/20",
  removing: "bg-orange-500/20",
  exited: "bg-red-500/20",
  dead: "bg-red-700/20",
};

/**
 * Sensitive environment variable patterns (for redaction)
 */
export const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /api_key/i,
  /apikey/i,
  /auth/i,
  /private/i,
];

/**
 * API routes
 */
export const API_ROUTES = {
  containers: "/api/testcontainers",
  templates: "/api/testcontainers/templates",
  cleanup: "/api/testcontainers/cleanup",
  events: "/api/testcontainers/events",
  status: "/api/testcontainers/status",
};

/**
 * Template categories with display info
 */
export const TEMPLATE_CATEGORIES = {
  database: {
    label: "Databases",
    description: "Relational and NoSQL databases",
    icon: "Database",
  },
  messaging: {
    label: "Message Queues",
    description: "Message brokers and event streaming",
    icon: "MessageSquare",
  },
  cache: {
    label: "Caching",
    description: "In-memory caches and key-value stores",
    icon: "Zap",
  },
  service: {
    label: "Services",
    description: "Application services and utilities",
    icon: "Server",
  },
  custom: {
    label: "Custom",
    description: "User-defined templates",
    icon: "Settings",
  },
};
