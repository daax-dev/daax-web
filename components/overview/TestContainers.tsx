"use client";

import { cn } from "@/lib/utils";
import {
  FlaskConical,
  Database,
  MessageSquare,
  Cloud,
  Zap,
  Trash2,
  CheckCircle,
  Code,
  Server,
} from "lucide-react";

const supportedServices = [
  { name: "PostgreSQL", icon: <Database className="w-4 h-4" />, color: "text-blue-400" },
  { name: "Redis", icon: <Database className="w-4 h-4" />, color: "text-red-400" },
  { name: "MongoDB", icon: <Database className="w-4 h-4" />, color: "text-green-400" },
  { name: "Kafka", icon: <MessageSquare className="w-4 h-4" />, color: "text-orange-400" },
  { name: "Elasticsearch", icon: <Database className="w-4 h-4" />, color: "text-yellow-400" },
  { name: "LocalStack", icon: <Cloud className="w-4 h-4" />, color: "text-cyan-400" },
  { name: "MySQL", icon: <Database className="w-4 h-4" />, color: "text-blue-300" },
  { name: "RabbitMQ", icon: <MessageSquare className="w-4 h-4" />, color: "text-orange-300" },
];

export function TestContainersContent({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Hero statement */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mx-auto mb-6">
          <FlaskConical className="w-10 h-10 text-violet-400" />
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Stop mocking. Start testing against <span className="text-violet-400 font-semibold">real infrastructure</span>.
          TestContainers spins up actual databases, message queues, and cloud services as throwaway Docker containers—
          so your integration tests run against the real thing.
        </p>
      </div>

      {/* The key insight */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 mb-10">
        <h3 className="font-semibold text-foreground mb-3 text-center">The Integration Testing Problem</h3>
        <p className="text-muted-foreground text-center max-w-2xl mx-auto">
          Mocks drift from reality. Shared test databases cause flaky tests. Local installs are painful to maintain.
          TestContainers solves this: <span className="text-foreground">each test gets a fresh, isolated, real service</span>—
          created on demand, destroyed after use.
        </p>
      </div>

      {/* Code example */}
      <div className="p-6 rounded-xl bg-muted/20 border border-border/50 mb-10">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Code className="w-5 h-5 text-violet-400" />
          Integration Test with Real PostgreSQL
        </h3>
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-muted-foreground">
{`import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { describe, it, beforeAll, afterAll, expect } from "vitest";

describe("UserRepository", () => {
  let container: StartedPostgreSqlContainer;
  let db: Database;

  beforeAll(async () => {
    // Spin up a real PostgreSQL instance
    container = await new PostgreSqlContainer("postgres:16")
      .withDatabase("testdb")
      .start();

    // Connect to the real database
    db = await connectTo(container.getConnectionUri());
    await db.migrate();
  });

  afterAll(async () => {
    await container.stop(); // Clean up automatically
  });

  it("creates and retrieves users", async () => {
    const user = await db.users.create({ name: "Alice" });
    const found = await db.users.findById(user.id);

    expect(found.name).toBe("Alice"); // Testing real SQL, not mocks
  });
});`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This test runs against a real PostgreSQL 16 instance. The container starts in ~2 seconds,
          runs your migrations, executes tests, then disappears. No cleanup scripts. No shared state.
        </p>
      </div>

      {/* Supported services */}
      <h3 className="font-semibold text-foreground mb-4 text-center">Spin Up Any Infrastructure</h3>
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        {supportedServices.map((service) => (
          <div
            key={service.name}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/40"
          >
            <span className={service.color}>{service.icon}</span>
            <span className="text-sm text-foreground">{service.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">+ 50 more modules</span>
        </div>
      </div>

      {/* Why it matters for AI */}
      <h3 className="font-semibold text-foreground mb-6 text-center">Why TestContainers Matter for AI Coding</h3>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-400" />
          </div>
          <h4 className="font-semibold text-foreground mb-2">AI Can Verify Its Work</h4>
          <p className="text-sm text-muted-foreground">
            When Claude Code writes a database migration, it can run the actual migration against a real
            PostgreSQL container and verify the schema is correct—not just check syntax.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-violet-400" />
          </div>
          <h4 className="font-semibold text-foreground mb-2">Fast Feedback Loops</h4>
          <p className="text-sm text-muted-foreground">
            Containers start in seconds. AI agents can iterate rapidly—write code, test against real services,
            fix issues, test again—without waiting for shared infrastructure.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-4">
            <Trash2 className="w-6 h-6 text-cyan-400" />
          </div>
          <h4 className="font-semibold text-foreground mb-2">No Cleanup Required</h4>
          <p className="text-sm text-muted-foreground">
            Each test run is isolated. AI agents can&apos;t corrupt shared test data or leave behind state
            that breaks future runs. Containers are ephemeral by design.
          </p>
        </div>
      </div>

      {/* Bottom callout */}
      <div className="mt-10 p-6 rounded-xl bg-muted/20 border border-border/50 text-center">
        <p className="text-muted-foreground">
          TestContainers works in CI too. GitHub Actions, GitLab CI, and Jenkins all support Docker-in-Docker.
          Your local tests and CI tests run against <span className="text-foreground font-semibold">identical infrastructure</span>.
        </p>
      </div>
    </div>
  );
}
