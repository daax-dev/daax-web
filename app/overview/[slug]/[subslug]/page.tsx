"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getSubSlides,
  getSubSlide,
  getSubSlideIndex,
} from "@/lib/overview-slides";
import { SupplyChainThreats } from "@/components/overview/SupplyChainThreats";
import { SLSALevelsTable } from "@/components/overview/SLSALevelsTable";
import { PlatformVision } from "@/components/overview/PlatformVision";
import { CorePrinciples } from "@/components/overview/CorePrinciples";
import { SBOMSample } from "@/components/overview/SBOMSample";
import { SignedAttestations } from "@/components/overview/SignedAttestations";
import { FeedbackLoop } from "@/components/overview/FeedbackLoop";
import { SecurityModel } from "@/components/overview/SecurityModel";
import { FilesystemGrants } from "@/components/overview/FilesystemGrants";
import { ComplianceExports } from "@/components/overview/ComplianceExports";
import {
  SharedTerminal,
  AIAgents,
  MCPProtocol,
  VSCodeIntegration,
} from "@/components/overview/ToolingContent";
import {
  LocalAgents,
  RemoteAgents,
  AutonomyControls,
} from "@/components/overview/OrchestrateContent";
import {
  MultiProjectView,
  ContextSwitching,
} from "@/components/overview/PlanningContent";
import {
  ToolFreedom,
  DeploymentOptions,
} from "@/components/overview/FreedomContent";
import { BeadsGasTown } from "@/components/overview/BeadsGasTown";
import { ClaudeFlow } from "@/components/overview/ClaudeFlow";
import { GetShitDone } from "@/components/overview/GetShitDone";
import {
  DeveloperSecurity,
  CyberToolkit,
  SemgrepIntegration,
  TrivyScanning,
} from "@/components/overview/SecurityToolsContent";
import { DevContainers } from "@/components/overview/DevContainers";
import { TestContainersContent } from "@/components/overview/TestContainers";

// Main slides array for top-level navigation
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

// Custom content for sub-slides that need React components
// Key format: "parentSlug/subSlideId"
const customSubSlideContent: Record<string, React.ReactNode> = {
  // Intro slides
  "intro/vision": <PlatformVision />,
  "intro/principles": <CorePrinciples />,
  // Provenance slides
  "provenance/supply-chain-threats": <SupplyChainThreats />,
  "provenance/slsa-levels": <SLSALevelsTable />,
  "provenance/sbom": <SBOMSample />,
  "provenance/attestations": <SignedAttestations />,
  // Recording slides
  "recording/feedback-loop": <FeedbackLoop />,
  "recording/compliance": <ComplianceExports />,
  // Sandbox slides
  "sandbox/security-model": <SecurityModel />,
  "sandbox/filesystem": <FilesystemGrants />,
  // Tooling slides
  "tooling/devcontainers": <DevContainers />,
  "tooling/testcontainers": <TestContainersContent />,
  "tooling/terminal": <SharedTerminal />,
  "tooling/ai-agents": <AIAgents />,
  "tooling/mcp": <MCPProtocol />,
  "tooling/ide": <VSCodeIntegration />,
  // Orchestrate slides
  "orchestrate/local": <LocalAgents />,
  "orchestrate/remote": <RemoteAgents />,
  "orchestrate/autonomy": <AutonomyControls />,
  // Planning slides
  "planning/multi-project": <MultiProjectView />,
  "planning/context": <ContextSwitching />,
  // Freedom slides
  "freedom/beads-gastown": <BeadsGasTown />,
  "freedom/claude-flow": <ClaudeFlow />,
  "freedom/get-shit-done": <GetShitDone />,
  "freedom/tools": <ToolFreedom />,
  "freedom/deployment": <DeploymentOptions />,
  // Security tools slides
  "security-tools/developer": <DeveloperSecurity />,
  "security-tools/cyber": <CyberToolkit />,
  "security-tools/semgrep": <SemgrepIntegration />,
  "security-tools/trivy": <TrivyScanning />,
};

export default function SubSlidePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const subslug = params.subslug as string;

  const subSlides = getSubSlides(slug);
  const currentSubSlide = getSubSlide(slug, subslug);
  const currentIndex = getSubSlideIndex(slug, subslug);
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

  // VERTICAL navigation - Up goes to previous sub-slide or parent
  const goUp = useCallback(() => {
    if (currentIndex > 0) {
      // Go to previous sub-slide (e.g., 2.2 → 2.1)
      router.push(`/overview/${slug}/${subSlides[currentIndex - 1].id}`);
    } else {
      // At first sub-slide, go back to parent detail page
      if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
          router.push(`/overview/${slug}`);
        });
      } else {
        router.push(`/overview/${slug}`);
      }
    }
  }, [router, slug, subSlides, currentIndex]);

  // VERTICAL navigation - Down goes to next sub-slide
  const goDown = useCallback(() => {
    if (currentIndex < subSlides.length - 1) {
      router.push(`/overview/${slug}/${subSlides[currentIndex + 1].id}`);
    }
  }, [router, slug, subSlides, currentIndex]);

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
        goUp();
      } else if (e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        goDown();
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
          router.push(`/overview/${slug}`);
        }
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    goUp,
    goDown,
    goLeft,
    goRight,
    isFullscreen,
    toggleFullscreen,
    router,
    slug,
  ]);

  if (!currentSubSlide) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Sub-slide Not Found
          </h1>
          <p className="text-muted-foreground mb-8">
            The requested sub-slide does not exist.
          </p>
          <Button onClick={() => router.push(`/overview/${slug}`)}>
            <ChevronUp className="h-4 w-4 mr-2" />
            Back to {slug}
          </Button>
        </div>
      </div>
    );
  }

  // Get slide number for display (e.g., "2.1")
  const slideNumber = `${mainSlideIndex + 1}.${currentIndex + 1}`;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background outline-none",
        isFullscreen && "fixed inset-0 z-50",
      )}
    >
      {/* VERTICAL Navigation - Up arrow (previous sub-slide or parent) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={goUp}
        className="absolute top-16 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 z-10"
      >
        <ChevronUp className="h-6 w-6" />
      </Button>

      {/* VERTICAL Navigation - Down arrow (next sub-slide) */}
      {currentIndex < subSlides.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goDown}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 z-10 animate-bounce"
        >
          <ChevronDown className="h-6 w-6" />
        </Button>
      )}

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

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {/* Slide counter */}
        <span className="text-sm text-muted-foreground bg-background/50 backdrop-blur-sm px-3 py-1 rounded-full">
          {slideNumber} ({currentIndex + 1} / {subSlides.length})
        </span>

        {/* Fullscreen button */}
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

      {/* Slide content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-8 md:p-16">
        {/* Title */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-3xl md:text-5xl lg:text-6xl font-bold text-center text-foreground mb-4"
        >
          {currentSubSlide.title}
        </motion.h1>

        {/* Subtitle */}
        {currentSubSlide.subtitle && (
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center max-w-3xl mb-8"
          >
            {currentSubSlide.subtitle}
          </motion.p>
        )}

        {/* Content - image, custom content, or placeholder */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="w-full max-w-5xl"
        >
          {currentSubSlide.imagePath ? (
            <div className="flex items-center justify-center">
              <img
                src={currentSubSlide.imagePath}
                alt={currentSubSlide.title}
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
              />
            </div>
          ) : customSubSlideContent[`${slug}/${subslug}`] ? (
            customSubSlideContent[`${slug}/${subslug}`]
          ) : currentSubSlide.content ? (
            currentSubSlide.content
          ) : (
            <div className="flex items-center justify-center p-12 rounded-xl border border-dashed border-muted-foreground/30">
              <p className="text-muted-foreground text-center">
                Content for sub-slide {slideNumber} coming soon...
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Vertical progress dots on the right side */}
      <div className="absolute right-16 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        {subSlides.map((_, index) => (
          <button
            key={index}
            onClick={() =>
              router.push(`/overview/${slug}/${subSlides[index].id}`)
            }
            className={cn(
              "transition-all duration-300",
              index === currentIndex
                ? "h-8 w-2 rounded-full bg-primary"
                : "h-2 w-2 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60",
            )}
            aria-label={`Go to sub-slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/60">
        <span className="hidden md:inline">
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">↑</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-2">↓</kbd>
          Sub-slides
          <span className="mx-2">|</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-2">→</kbd>
          Main slides
          <span className="mx-2">|</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">F</kbd>
          Fullscreen
        </span>
      </div>
    </div>
  );
}
