// Overview slides data structure with hierarchical sub-slides

export interface SubSlide {
  id: string;
  title: string;
  subtitle?: string;
  content?: React.ReactNode;
  background?: string;
  imagePath?: string; // Path to an image to display
}

export interface SlideData {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  background: string;
  subSlides?: SubSlide[];
}

// Sub-slides for each main slide
// These are the detailed content pages you navigate DOWN into
export const slideSubSlides: Record<string, SubSlide[]> = {
  intro: [
    {
      id: "vision",
      title: "Platform Vision",
      subtitle: "What we're building and why",
    },
    {
      id: "principles",
      title: "Core Principles",
      subtitle: "Security, observability, and developer freedom",
    },
  ],
  "spec-driven": [
    {
      id: "sdd-flow",
      title: "Spec-Driven Development Flow",
      subtitle:
        "From backlog to validated feature with AI agents at every step",
      imagePath: "/sdd-flow.png",
    },
    {
      id: "backlog",
      title: "Backlog.md Integration",
      subtitle: "Task tracking built for humans and AI agents",
      imagePath: "/backlog.png",
    },
    {
      id: "agents",
      title: "Customizable Agents",
      subtitle: "Specialized agents orchestrated by flowspec",
      imagePath: "/agent-definitions.png",
    },
  ],
  tooling: [
    {
      id: "devcontainers",
      title: "DevContainers",
      subtitle: "Reproducible development environments for humans and AI",
    },
    {
      id: "testcontainers",
      title: "TestContainers",
      subtitle: "Real infrastructure for integration testing",
    },
    {
      id: "terminal",
      title: "Shared Terminal",
      subtitle: "Session recording and replay for audit trails",
    },
    {
      id: "ai-agents",
      title: "AI Coding Agents",
      subtitle: "Claude Code, Aider, Goose in containerized environments",
    },
    {
      id: "mcp",
      title: "MCP Protocol",
      subtitle: "Model Context Protocol for tool sharing",
    },
    {
      id: "ide",
      title: "VS Code Integration",
      subtitle: "code-server for full browser IDE experience",
    },
  ],
  sandbox: [
    {
      id: "microvm",
      title: "Container / MicroVM Sandboxing",
      subtitle: "Hardware-level isolation in milliseconds",
      imagePath: "/contain.png",
    },
    {
      id: "security-model",
      title: "Security Model",
      subtitle: "Capability-based permissions and resource limits",
    },
    {
      id: "filesystem",
      title: "Filesystem Grants",
      subtitle: "Explicit read/write access controls",
    },
  ],
  recording: [
    {
      id: "screen-recording",
      title: "Screen Recording",
      subtitle: "Browser session capture for UI interactions",
      imagePath: "/ai-recording.png",
    },
    {
      id: "track-decisions",
      title: "Track Decisions",
      subtitle: "Agent decision logs with full context",
      imagePath: "/decisions.png",
    },
    {
      id: "track-events",
      title: "Track Events",
      subtitle: "Timeline of all agent and user actions",
      imagePath: "/track-events.png",
    },
    {
      id: "feedback-loop",
      title: "Agentic Retrospective",
      subtitle: "Learn from every session—insights for human and agent alike",
    },
    {
      id: "compliance",
      title: "Compliance Exports",
      subtitle: "JSONL logs and audit-ready formats",
    },
  ],
  "security-tools": [
    {
      id: "developer",
      title: "Developer Security",
      subtitle: "SAST, secrets scanning, dependency checks",
    },
    {
      id: "cyber",
      title: "Cyber Toolkit",
      subtitle: "Pen testing and vulnerability assessment",
    },
    {
      id: "semgrep",
      title: "Semgrep Integration",
      subtitle: "Custom rules and pattern-based analysis",
    },
    {
      id: "trivy",
      title: "Trivy Scanning",
      subtitle: "Container and filesystem vulnerability scanning",
    },
  ],
  provenance: [
    {
      id: "supply-chain-threats",
      title: "Supply Chain Threats",
      subtitle: "Understanding attack vectors in the software supply chain",
    },
    {
      id: "slsa-levels",
      title: "SLSA Levels",
      subtitle: "Progressive security levels for supply chain integrity",
    },
    {
      id: "identity",
      title: "Identity Infrastructure",
      subtitle:
        "auth.poley.dev - OIDC, SPIFFE/SPIRE, and cloud workload identity federation",
      imagePath: "/identity-architecture.png",
    },
    {
      id: "sbom",
      title: "SBOM Generation",
      subtitle: "Software Bill of Materials tracking",
    },
    {
      id: "attestations",
      title: "Signed Attestations",
      subtitle: "Cryptographic verification for all builds",
    },
  ],
  orchestrate: [
    {
      id: "local",
      title: "Local Agents",
      subtitle: "Run agents on your machine",
    },
    {
      id: "remote",
      title: "Remote Agents",
      subtitle: "Tailscale network for secure remote execution",
    },
    {
      id: "autonomy",
      title: "Autonomy Controls",
      subtitle: "Permission levels and approval gates",
    },
  ],
  planning: [
    {
      id: "multi-project",
      title: "Multi-Project View",
      subtitle: "Project hierarchies and dependency tracking",
    },
    {
      id: "context",
      title: "Context Switching",
      subtitle: "Smart project detection and CLAUDE.md integration",
    },
  ],
  freedom: [
    {
      id: "beads-gastown",
      title: "Beads & Gas Town",
      subtitle: "Steve Yegge's multi-agent workspace manager",
    },
    {
      id: "claude-flow",
      title: "Claude Flow",
      subtitle: "60+ specialized agents in coordinated swarms",
    },
    {
      id: "get-shit-done",
      title: "get-shit-done",
      subtitle: "Frictionless spec-driven development for Claude Code",
    },
    {
      id: "tools",
      title: "Tool Freedom",
      subtitle: "Use any CLI, IDE, or AI agent",
    },
    {
      id: "deployment",
      title: "Deployment Options",
      subtitle: "Local, self-hosted, or cloud deployment",
    },
  ],
};

// Get sub-slides for a given slide ID
export function getSubSlides(slideId: string): SubSlide[] {
  return slideSubSlides[slideId] || [];
}

// Get a specific sub-slide
export function getSubSlide(
  slideId: string,
  subSlideId: string,
): SubSlide | undefined {
  const subSlides = slideSubSlides[slideId];
  return subSlides?.find((s) => s.id === subSlideId);
}

// Get the index of a sub-slide
export function getSubSlideIndex(slideId: string, subSlideId: string): number {
  const subSlides = slideSubSlides[slideId];
  return subSlides?.findIndex((s) => s.id === subSlideId) ?? -1;
}
