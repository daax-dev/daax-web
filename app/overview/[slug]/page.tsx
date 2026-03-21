"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
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
  ArrowLeft,
  Maximize2,
  Minimize2,
  Construction,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSubSlides } from "@/lib/overview-slides";

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

// Full slide content for each detail page
const slideContent: Record<
  string,
  {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
    background: string;
    content: React.ReactNode;
  }
> = {
  intro: {
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
    color: "text-primary",
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
  provenance: {
    title: "Built on a Secure Foundation",
    subtitle: "Software supply chain security with provenance tracking",
    icon: <ShieldCheck className="h-16 w-16 text-cyan-400" />,
    color: "text-cyan-400",
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
  "spec-driven": {
    title: "Spec-Driven Development",
    subtitle: "From requirements to implementation with flowspec + backlog",
    icon: <FileText className="h-16 w-16 text-blue-400" />,
    color: "text-blue-400",
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
  recording: {
    title: "Record Without Friction",
    subtitle: "Out-of-the-box audit trail for every action",
    icon: <Video className="h-16 w-16 text-red-400" />,
    color: "text-red-400",
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
  sandbox: {
    title: "Agent Sandbox",
    subtitle: "Isolated execution with only the access you grant",
    icon: <Lock className="h-16 w-16 text-orange-400" />,
    color: "text-orange-400",
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
  orchestrate: {
    title: "Orchestrate Agents",
    subtitle: "Local and remote agents with controlled autonomy",
    icon: <Bot className="h-16 w-16 text-yellow-400" />,
    color: "text-yellow-400",
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
  "security-tools": {
    title: "Developer & Cyber Tooling",
    subtitle: "Shift-left security with offensive and defensive tools built-in",
    icon: <Shield className="h-16 w-16 text-purple-400" />,
    color: "text-purple-400",
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
  tooling: {
    title: "Tooling for Engineers & Agents",
    subtitle: "Work together with shared context and capabilities",
    icon: <Users className="h-16 w-16 text-green-400" />,
    color: "text-green-400",
    background:
      "linear-gradient(135deg, hsl(150 30% 8%) 0%, hsl(150 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <FeatureCard
          icon={<Terminal className="h-6 w-6" />}
          title="Shared Terminal"
          description="Session recording captures every command for audit and replay"
        />
        <FeatureCard
          icon={<Bot className="h-6 w-6" />}
          title="AI Coding Agents"
          description="Claude Code, Aider, Goose - all in containerized environments"
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
        <FeatureCard
          icon={<Workflow className="h-6 w-6" />}
          title="Workflow Editor"
          description="Visual workflow design for multi-step automations"
        />
        <FeatureCard
          icon={<FileText className="h-6 w-6" />}
          title="API Tools"
          description="REST, GraphQL, gRPC, WebSockets testing built-in"
        />
      </div>
    ),
  },
  planning: {
    title: "Planning Across Projects",
    subtitle: "Coordinate work across your entire portfolio",
    icon: <FolderKanban className="h-16 w-16 text-indigo-400" />,
    color: "text-indigo-400",
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
  freedom: {
    title: "Not Locked In",
    subtitle: "Any CLI or IDE. Any Cloud or Self-Hosted.",
    icon: <Server className="h-16 w-16 text-emerald-400" />,
    color: "text-emerald-400",
    background:
      "linear-gradient(135deg, hsl(160 30% 8%) 0%, hsl(160 40% 12%) 100%)",
    content: (
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Tool Freedom
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Terminal className="h-5 w-5" />}>
              Use any CLI tool - Claude Code, Aider, Cursor, etc.
            </BulletPoint>
            <BulletPoint icon={<Laptop className="h-5 w-5" />}>
              VS Code, Neovim, JetBrains - your choice
            </BulletPoint>
            <BulletPoint icon={<Network className="h-5 w-5" />}>
              MCP servers work everywhere
            </BulletPoint>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Deployment Freedom
          </h3>
          <div className="space-y-2">
            <BulletPoint icon={<Laptop className="h-5 w-5" />}>
              Run locally on your laptop
            </BulletPoint>
            <BulletPoint icon={<Server className="h-5 w-5" />}>
              Self-host on your infrastructure
            </BulletPoint>
            <BulletPoint icon={<Cloud className="h-5 w-5" />}>
              Deploy to any cloud provider
            </BulletPoint>
          </div>
        </div>
      </div>
    ),
  },
};

// Main slides array for top-level navigation (same as in [subslug]/page.tsx)
const mainSlides = [
  "intro",
  "provenance",
  "spec-driven",
  "recording",
  "sandbox",
  "orchestrate",
  "security-tools",
  "tooling",
  "planning",
  "freedom",
];

function DetailContent() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const slide = slideContent[slug];
  const subSlides = getSubSlides(slug);
  const hasSubSlides = subSlides.length > 0;
  const mainSlideIndex = mainSlides.indexOf(slug);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => {
        // Focus the container after entering fullscreen to ensure keyboard events work
        containerRef.current?.focus();
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Navigate back to overview
  const navigateBack = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => {
        router.push("/overview");
      });
    } else {
      router.push("/overview");
    }
  }, [router]);

  // Navigate down to first sub-slide
  const navigateDown = useCallback(() => {
    if (hasSubSlides) {
      if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
          router.push(`/overview/${slug}/${subSlides[0].id}`);
        });
      } else {
        router.push(`/overview/${slug}/${subSlides[0].id}`);
      }
    }
  }, [router, slug, subSlides, hasSubSlides]);

  // LEFT - Go to previous main slide's detail page
  const goLeft = useCallback(() => {
    if (mainSlideIndex > 0) {
      router.push(`/overview/${mainSlides[mainSlideIndex - 1]}`);
    }
  }, [router, mainSlideIndex]);

  // RIGHT - Go to next main slide's detail page
  const goRight = useCallback(() => {
    if (mainSlideIndex < mainSlides.length - 1) {
      router.push(`/overview/${mainSlides[mainSlideIndex + 1]}`);
    }
  }, [router, mainSlideIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateBack();
      } else if (e.key === "ArrowDown" && hasSubSlides) {
        e.preventDefault();
        navigateDown();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goLeft();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goRight();
      } else if (e.key === "Escape") {
        if (isFullscreen) {
          document.exitFullscreen();
        } else {
          e.preventDefault();
          navigateBack();
        }
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    navigateBack,
    navigateDown,
    goLeft,
    goRight,
    hasSubSlides,
    isFullscreen,
    toggleFullscreen,
  ]);

  if (!slide) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Page Not Found
          </h1>
          <p className="text-muted-foreground mb-8">
            The requested detail page does not exist.
          </p>
          <Link href="/overview">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "min-h-screen overflow-hidden outline-none",
        isFullscreen && "fixed inset-0 z-50",
      )}
      style={{ background: slide.background }}
    >
      {/* Back button */}
      <div className="absolute top-4 left-4 z-10">
        <Button
          variant="ghost"
          onClick={navigateBack}
          className="bg-background/50 backdrop-blur-sm hover:bg-background/80"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
      </div>

      {/* Fullscreen button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          className="h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Slide content - presentation style */}
      <div className="flex flex-col items-center justify-center min-h-screen p-8 md:p-16">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          {slide.icon}
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-3xl md:text-5xl lg:text-6xl font-bold text-center text-foreground mb-4"
        >
          {slide.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center max-w-3xl mb-8"
        >
          {slide.subtitle}
        </motion.p>

        {/* Content */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="w-full max-w-5xl"
        >
          {slide.content}
        </motion.div>
      </div>

      {/* Up arrow to go back */}
      <Button
        variant="ghost"
        size="icon"
        onClick={navigateBack}
        className="absolute top-16 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 z-10"
      >
        <ChevronUp className="h-6 w-6" />
      </Button>

      {/* LEFT - Go to previous main slide */}
      {mainSlideIndex > 0 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goLeft}
          className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 z-10"
          title="Previous main slide"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      )}

      {/* RIGHT - Go to next main slide */}
      {mainSlideIndex < mainSlides.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goRight}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 z-10"
          title="Next main slide"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      )}

      {/* Down arrow to go to sub-slides (only if sub-slides exist) */}
      {hasSubSlides && (
        <Button
          variant="ghost"
          size="icon"
          onClick={navigateDown}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 animate-bounce z-10"
        >
          <ChevronDown className="h-6 w-6" />
        </Button>
      )}

      {/* Sub-slides indicator */}
      {hasSubSlides && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/60">
          {subSlides.length} sub-slide{subSlides.length > 1 ? "s" : ""}
        </div>
      )}

      {/* Keyboard hints */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/60">
        <span className="hidden md:inline">
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">↑</kbd>
          Back
          {hasSubSlides && (
            <>
              <span className="mx-2">|</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">↓</kbd>
              Sub-slides
            </>
          )}
          <span className="mx-2">|</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">→</kbd>
          Slides
          <span className="mx-2">|</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">F</kbd>
          Fullscreen
        </span>
      </div>
    </div>
  );
}

export default function DetailPage() {
  return <DetailContent />;
}
