"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Slideshow,
  type Slide,
  type SlideshowRef,
} from "@/components/overview/Slideshow";
import {
  Bot,
  Shield,
  FileText,
  Video,
  Wrench,
  ShieldCheck,
  Users,
  FolderKanban,
  Server,
  Sparkles,
  Workflow,
  Lock,
  Eye,
  Terminal,
  Cloud,
  Laptop,
  GitBranch,
  CheckCircle,
  Layers,
  Cpu,
  Network,
  ChevronDown,
  Container,
  FlaskConical,
  Rocket,
  Zap,
  Target,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Feature card component for slides
function FeatureCard({
  icon,
  title,
  description,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg bg-card/50 backdrop-blur-sm border border-border/50",
        className,
      )}
    >
      <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Bullet point component
function BulletPoint({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-left">
      <div className="flex-shrink-0 mt-1 text-primary">
        {icon || <CheckCircle className="h-5 w-5" />}
      </div>
      <span className="text-lg text-muted-foreground">{children}</span>
    </div>
  );
}

// Define all slides with detail page links
const slides: Slide[] = [
  // 1. Overview / Title Slide
  {
    id: "intro",
    title: "Developer & Agent Experience",
    subtitle:
      "A platform where engineers and AI agents work together seamlessly",
    icon: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/white-daax-dev-transparent.png"
          alt="daax.dev"
          width={120}
          height={120}
          className="block dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/black-daax-dev-transparent.png"
          alt="daax.dev"
          width={120}
          height={120}
          className="hidden dark:block"
        />
      </>
    ),
    background:
      "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(220 30% 10%) 50%, hsl(var(--background)) 100%)",
    content: (
      <div className="flex flex-wrap justify-center gap-4 mt-8">
        <div className="px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20">
          Secure by Design
        </div>
        <div className="px-4 py-2 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
          AI-Native Workflows
        </div>
        <div className="px-4 py-2 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
          Full Audit Trail
        </div>
        <div className="px-4 py-2 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
          Self-Hosted or Cloud
        </div>
      </div>
    ),
  },

  // 2. Built on a Secure Foundation - Provenance
  {
    id: "provenance",
    title: "Built on a Secure Foundation",
    subtitle: "Software supply chain security with provenance tracking",
    icon: <ShieldCheck className="h-16 w-16 text-cyan-400" />,
    background:
      "linear-gradient(135deg, hsl(190 30% 8%) 0%, hsl(190 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Supply Chain Security
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<ShieldCheck className="h-5 w-5" />}>
              SLSA compliance for build artifacts
            </BulletPoint>
            <BulletPoint icon={<FileText className="h-5 w-5" />}>
              SBOM generation and tracking
            </BulletPoint>
            <BulletPoint icon={<Lock className="h-5 w-5" />}>
              Signed attestations for all builds
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Artifact Catalog
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Layers className="h-5 w-5" />}>
              Base images, builds, and container inventory
            </BulletPoint>
            <BulletPoint icon={<Eye className="h-5 w-5" />}>
              Vulnerability tracking per artifact
            </BulletPoint>
            <BulletPoint icon={<GitBranch className="h-5 w-5" />}>
              Reproducible build verification
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },
  // 3. Spec Driven with Backlog - flowspec
  {
    id: "spec-driven",
    title: "Spec-Driven Development",
    subtitle: "From requirements to implementation with flowspec + backlog",
    icon: <FileText className="h-16 w-16 text-blue-400" />,
    background:
      "linear-gradient(135deg, hsl(220 30% 8%) 0%, hsl(220 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-6 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            flowspec Workflow
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Workflow className="h-5 w-5" />}>
              7-phase workflow: assess, specify, research, plan, implement,
              validate, operate
            </BulletPoint>
            <BulletPoint icon={<Bot className="h-5 w-5" />}>
              13+ specialized AI agents orchestrated by role
            </BulletPoint>
            <BulletPoint icon={<FileText className="h-5 w-5" />}>
              Complexity-based mode selection (full SDD, spec-light, or skip)
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Backlog.md Integration
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<FolderKanban className="h-5 w-5" />}>
              Task tracking built for AI agents and humans
            </BulletPoint>
            <BulletPoint icon={<GitBranch className="h-5 w-5" />}>
              Version-controlled tasks in your repo
            </BulletPoint>
            <BulletPoint icon={<Terminal className="h-5 w-5" />}>
              MCP server for seamless agent integration
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },

  // 4. Record without Friction
  {
    id: "recording",
    title: "Record Without Friction",
    subtitle: "Out-of-the-box audit trail for every action",
    icon: <Video className="h-16 w-16 text-red-400" />,
    background:
      "linear-gradient(135deg, hsl(0 30% 8%) 0%, hsl(0 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Terminal Sessions
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Video className="h-5 w-5" />}>
              Terminal session recordings
            </BulletPoint>
            <BulletPoint icon={<Eye className="h-5 w-5" />}>
              Full playback in browser or export
            </BulletPoint>
            <BulletPoint icon={<GitBranch className="h-5 w-5" />}>
              Auto-attach to PR as evidence
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Screen Recording
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Video className="h-5 w-5" />}>
              Browser session capture
            </BulletPoint>
            <BulletPoint icon={<FileText className="h-5 w-5" />}>
              JSONL logs for agent actions
            </BulletPoint>
            <BulletPoint icon={<CheckCircle className="h-5 w-5" />}>
              Compliance-ready exports
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },

  // 5. Agent Sandbox - nanofuse
  {
    id: "sandbox",
    title: "Agent Sandbox",
    subtitle: "Isolated execution with only the access you grant",
    icon: <Lock className="h-16 w-16 text-orange-400" />,
    background:
      "linear-gradient(135deg, hsl(25 30% 8%) 0%, hsl(25 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5 text-orange-400" />
            nanofuse - Firecracker microVMs
          </h3>
          <div className="space-y-2">
            <BulletPoint>Hardware-level isolation in milliseconds</BulletPoint>
            <BulletPoint>Ephemeral by default - nothing persists</BulletPoint>
            <BulletPoint>Explicit filesystem and network grants</BulletPoint>
            <BulletPoint>Resource limits (CPU, memory, time)</BulletPoint>
          </div>
        </div>
        <div className="p-6 rounded-xl bg-card/30 border border-orange-500/20">
          <h4 className="font-semibold text-orange-400 mb-3">Security Model</h4>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-muted-foreground">
                Bootstrap short lived restricted credentials (tied to human)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-muted-foreground">
                Limited files shared for writing
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-muted-foreground">
                Capability-based permissions
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-muted-foreground">
                Automatic cleanup on exit
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  // 6. Orchestrate Agents
  {
    id: "orchestrate",
    title: "Orchestrate Agents",
    subtitle: "Local and remote agents with controlled autonomy",
    icon: <Bot className="h-16 w-16 text-yellow-400" />,
    background:
      "linear-gradient(135deg, hsl(45 30% 8%) 0%, hsl(45 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Deployment Options
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Laptop className="h-5 w-5" />}>
              Local agents on your machine
            </BulletPoint>
            <BulletPoint icon={<Network className="h-5 w-5" />}>
              Tailscale network for secure remote
            </BulletPoint>
            <BulletPoint icon={<Cloud className="h-5 w-5" />}>
              Cloud-hosted agent pools
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Autonomy Controls
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<CheckCircle className="h-5 w-5" />}>
              Permission levels per agent type
            </BulletPoint>
            <BulletPoint icon={<Eye className="h-5 w-5" />}>
              Real-time monitoring and intervention
            </BulletPoint>
            <BulletPoint icon={<Lock className="h-5 w-5" />}>
              Approval gates for sensitive operations
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },

  // 7. Developer & Cyber Tooling
  {
    id: "security-tools",
    title: "Developer & Cyber Tooling",
    subtitle: "Shift-left security with offensive and defensive tools built-in",
    icon: <Shield className="h-16 w-16 text-purple-400" />,
    background:
      "linear-gradient(135deg, hsl(270 30% 8%) 0%, hsl(270 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <FeatureCard
          icon={<Wrench className="h-6 w-6" />}
          title="Developer Security"
          description="SAST, secrets scanning, dependency checks in your workflow"
        />
        <FeatureCard
          icon={<Shield className="h-6 w-6" />}
          title="Cyber Toolkit"
          description="Pen testing, recon, and vulnerability assessment tools"
        />
        <FeatureCard
          icon={<FileText className="h-6 w-6" />}
          title="Audit & Compliance"
          description="Generate reports, track findings, verify remediation"
        />
        <FeatureCard
          icon={<Bot className="h-6 w-6" />}
          title="AI Security Agents"
          description="Automated triage and fix suggestions for vulnerabilities"
        />
        <FeatureCard
          icon={<Network className="h-6 w-6" />}
          title="Semgrep Integration"
          description="Custom rules and pattern-based code analysis"
        />
        <FeatureCard
          icon={<Layers className="h-6 w-6" />}
          title="Trivy Scanning"
          description="Container and filesystem vulnerability scanning"
        />
      </div>
    ),
  },

  // 8. Tooling for Engineers & Agents
  {
    id: "tooling",
    title: "Tooling for Engineers & Agents",
    subtitle: "Work together with shared context and capabilities",
    icon: <Users className="h-16 w-16 text-green-400" />,
    background:
      "linear-gradient(135deg, hsl(150 30% 8%) 0%, hsl(150 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <FeatureCard
          icon={<Container className="h-6 w-6" />}
          title="DevContainers"
          description="Reproducible dev environments that work identically for humans and AI agents"
          className="border-cyan-500/30 bg-cyan-500/5"
        />
        <FeatureCard
          icon={<FlaskConical className="h-6 w-6" />}
          title="TestContainers"
          description="Spin up real databases, queues, and services for integration testing"
          className="border-violet-500/30 bg-violet-500/5"
        />
        <FeatureCard
          icon={<Bot className="h-6 w-6" />}
          title="AI Coding Agents"
          description="Claude Code, Aider, Goose - all in containerized environments"
        />
        <FeatureCard
          icon={<Terminal className="h-6 w-6" />}
          title="Shared Terminal"
          description="Session recording captures every command for audit and replay"
        />
        <FeatureCard
          icon={<Network className="h-6 w-6" />}
          title="MCP Protocol"
          description="Model Context Protocol for tool sharing between agents"
        />
        <FeatureCard
          icon={<Laptop className="h-6 w-6" />}
          title="VS Code in Browser"
          description="code-server integration for full IDE experience"
        />
      </div>
    ),
  },

  // 9. Planning Across Projects
  {
    id: "planning",
    title: "Planning Across Projects",
    subtitle: "Coordinate work across your entire portfolio",
    icon: <FolderKanban className="h-16 w-16 text-indigo-400" />,
    background:
      "linear-gradient(135deg, hsl(240 30% 8%) 0%, hsl(240 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Multi-Project View
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<FolderKanban className="h-5 w-5" />}>
              Project hierarchies (portfolios, repos, features)
            </BulletPoint>
            <BulletPoint icon={<Workflow className="h-5 w-5" />}>
              Cross-project dependency tracking
            </BulletPoint>
            <BulletPoint icon={<GitBranch className="h-5 w-5" />}>
              Unified backlog across codebases
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Context Switching
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Sparkles className="h-5 w-5" />}>
              Project selector with smart detection
            </BulletPoint>
            <BulletPoint icon={<FileText className="h-5 w-5" />}>
              CLAUDE.md for per-project context
            </BulletPoint>
            <BulletPoint icon={<Bot className="h-5 w-5" />}>
              Agents inherit project settings
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },

  // 10. Not Locked In
  {
    id: "freedom",
    title: "Not Locked In",
    subtitle: "Try cutting-edge AI tools. Any CLI, IDE, or cloud.",
    icon: <Server className="h-16 w-16 text-emerald-400" />,
    background:
      "linear-gradient(135deg, hsl(160 30% 8%) 0%, hsl(160 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <FeatureCard
          icon={<Flame className="h-6 w-6" />}
          title="Beads & Gas Town"
          description="Steve Yegge's multi-agent workspace - spawn rigs, track work with beads"
          className="border-orange-500/30 bg-orange-500/5"
        />
        <FeatureCard
          icon={<Zap className="h-6 w-6" />}
          title="Claude Flow"
          description="60+ specialized agents in coordinated swarms with self-learning"
          className="border-cyan-500/30 bg-cyan-500/5"
        />
        <FeatureCard
          icon={<Target className="h-6 w-6" />}
          title="get-shit-done"
          description="Frictionless spec-driven development - the complexity is in the system"
          className="border-violet-500/30 bg-violet-500/5"
        />
        <FeatureCard
          icon={<Terminal className="h-6 w-6" />}
          title="Any CLI Tool"
          description="Claude Code, Aider, Cursor, Goose - use what works for you"
        />
        <FeatureCard
          icon={<Laptop className="h-6 w-6" />}
          title="Any IDE"
          description="VS Code, Neovim, JetBrains, Emacs - your choice"
        />
        <FeatureCard
          icon={<Cloud className="h-6 w-6" />}
          title="Any Deployment"
          description="Local, self-hosted, or cloud - run anywhere"
        />
      </div>
    ),
  },
];

function OverviewContent() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideshowRef = useRef<SlideshowRef>(null);

  const handleSlideChange = (index: number) => {
    setCurrentSlide(index);
  };

  const handleCardClick = (index: number) => {
    slideshowRef.current?.goToSlide(index);
    setCurrentSlide(index);
  };

  // Group slides into rows of 5
  const rows: Slide[][] = [];
  for (let i = 0; i < slides.length; i += 5) {
    rows.push(slides.slice(i, i + 5));
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Slideshow
          ref={slideshowRef}
          slides={slides}
          autoPlay={false}
          autoPlayInterval={10000}
          onSlideChange={handleSlideChange}
        />

        {/* Slide index below - organized in rows */}
        <div className="mt-8 space-y-3">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex}>
              {/* Row of cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {row.map((slide, colIndex) => {
                  const index = rowIndex * 5 + colIndex;

                  return (
                    <div
                      key={slide.id}
                      onClick={() => handleCardClick(index)}
                      className={cn(
                        "group relative p-3 rounded-lg text-center transition-all duration-300 cursor-pointer",
                        "hover:scale-105 hover:shadow-lg",
                        index === currentSlide
                          ? "bg-green-500/20 border-2 border-green-500 shadow-green-500/20 shadow-lg"
                          : "bg-card/50 border border-border/50 hover:border-green-500/50",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs",
                          index === currentSlide
                            ? "text-green-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {index + 1}.
                      </span>
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          index === currentSlide
                            ? "text-green-400"
                            : "text-foreground",
                        )}
                      >
                        {slide.title}
                      </p>

                      {/* Down arrow - navigates to subpage */}
                      <Link
                        href={`/overview/${slide.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute -bottom-2 left-1/2 -translate-x-1/2 p-1 rounded-full transition-all z-10",
                          index === currentSlide
                            ? "bg-green-500 text-white opacity-100"
                            : "bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-green-500 hover:text-white",
                        )}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return <OverviewContent />;
}
