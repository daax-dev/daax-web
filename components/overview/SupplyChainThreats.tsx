"use client";

import { cn } from "@/lib/utils";

// Supply Chain Threats Diagram - Dark Mode
// Based on SLSA supply chain threat model
export function SupplyChainThreats({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      {/* Main diagram */}
      <svg
        viewBox="0 0 900 400"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background */}
        <defs>
          {/* Gradient for boxes */}
          <linearGradient id="boxGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(190 40% 20%)" />
            <stop offset="100%" stopColor="hsl(190 40% 15%)" />
          </linearGradient>
          {/* Dashed pattern for dependencies */}
          <pattern
            id="dashedBorder"
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
          >
            <path
              d="M 0 4 L 8 4"
              stroke="hsl(190 50% 40%)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
          </pattern>
        </defs>

        {/* Category labels at top */}
        <text
          x="220"
          y="30"
          fill="hsl(0 70% 60%)"
          fontSize="14"
          fontWeight="600"
          textAnchor="middle"
        >
          SOURCE THREATS
        </text>
        <text
          x="520"
          y="30"
          fill="hsl(0 70% 60%)"
          fontSize="14"
          fontWeight="600"
          textAnchor="middle"
        >
          BUILD THREATS
        </text>

        {/* Category brackets */}
        <path
          d="M 130 40 L 130 50 L 310 50 L 310 40"
          stroke="hsl(0 70% 60%)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M 340 40 L 340 50 L 700 50 L 700 40"
          stroke="hsl(0 70% 60%)"
          strokeWidth="2"
          fill="none"
        />

        {/* Threat markers A-H */}
        {/* A - Bypassed code review */}
        <g transform="translate(170, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            A
          </text>
        </g>

        {/* B - Compromised source control */}
        <g transform="translate(270, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            B
          </text>
        </g>

        {/* C - Modified code after source control */}
        <g transform="translate(370, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            C
          </text>
        </g>

        {/* D - Compromised build platform */}
        <g transform="translate(470, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            D
          </text>
        </g>

        {/* F - Bypassed CI/CD */}
        <g transform="translate(570, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            F
          </text>
        </g>

        {/* G - Compromised package repo */}
        <g transform="translate(670, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            G
          </text>
        </g>

        {/* H - Using a bad package */}
        <g transform="translate(770, 70)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            H
          </text>
        </g>

        {/* Dotted lines from threats to pipeline */}
        <line
          x1="170"
          y1="95"
          x2="170"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="270"
          y1="95"
          x2="270"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="370"
          y1="95"
          x2="430"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="470"
          y1="95"
          x2="470"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="570"
          y1="95"
          x2="510"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="670"
          y1="95"
          x2="720"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />
        <line
          x1="770"
          y1="95"
          x2="770"
          y2="140"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />

        {/* Main pipeline flow */}
        {/* Developer */}
        <text
          x="50"
          y="175"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
        >
          Developer
        </text>

        {/* Arrow from Developer to Source */}
        <line
          x1="110"
          y1="170"
          x2="140"
          y2="170"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="150,170 140,165 140,175" fill="hsl(190 50% 50%)" />

        {/* Source box */}
        <rect
          x="155"
          y="145"
          width="130"
          height="50"
          rx="5"
          fill="url(#boxGradient)"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <text
          x="220"
          y="175"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
          textAnchor="middle"
        >
          Source
        </text>

        {/* Arrow from Source to Build */}
        <line
          x1="285"
          y1="170"
          x2="345"
          y2="170"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="355,170 345,165 345,175" fill="hsl(190 50% 50%)" />

        {/* Build box (octagon) */}
        <polygon
          points="470,135 530,135 560,170 530,205 470,205 440,170"
          fill="url(#boxGradient)"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <text
          x="500"
          y="175"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
          textAnchor="middle"
        >
          Build
        </text>

        {/* Arrow from Build to Package */}
        <line
          x1="560"
          y1="170"
          x2="620"
          y2="170"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="630,170 620,165 620,175" fill="hsl(190 50% 50%)" />

        {/* Package box */}
        <rect
          x="635"
          y="145"
          width="130"
          height="50"
          rx="5"
          fill="url(#boxGradient)"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <text
          x="700"
          y="175"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
          textAnchor="middle"
        >
          Package
        </text>

        {/* Arrow from Package to Consumer */}
        <line
          x1="765"
          y1="170"
          x2="795"
          y2="170"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="805,170 795,165 795,175" fill="hsl(190 50% 50%)" />

        {/* Consumer */}
        <text
          x="820"
          y="175"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
        >
          Consumer
        </text>

        {/* Dependencies box (dashed) */}
        <rect
          x="400"
          y="240"
          width="200"
          height="50"
          rx="5"
          fill="transparent"
          stroke="hsl(190 50% 40%)"
          strokeWidth="2"
          strokeDasharray="8,4"
        />
        <text
          x="500"
          y="270"
          fill="hsl(var(--foreground))"
          fontSize="14"
          fontWeight="500"
          textAnchor="middle"
        >
          Dependencies
        </text>

        {/* E - Dependency threat marker */}
        <g transform="translate(370, 250)">
          <polygon points="0,0 15,25 -15,25" fill="hsl(0 70% 55%)" />
          <text
            x="0"
            y="18"
            fill="white"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            E
          </text>
        </g>
        <line
          x1="370"
          y1="275"
          x2="400"
          y2="265"
          stroke="hsl(0 70% 55%)"
          strokeWidth="2"
          strokeDasharray="4,4"
        />

        {/* Arrows from Dependencies to Build and Package */}
        <line
          x1="500"
          y1="240"
          x2="500"
          y2="205"
          stroke="hsl(190 50% 40%)"
          strokeWidth="2"
        />
        <polygon points="500,200 495,210 505,210" fill="hsl(190 50% 40%)" />

        <line
          x1="600"
          y1="265"
          x2="700"
          y2="195"
          stroke="hsl(190 50% 40%)"
          strokeWidth="2"
        />
        <polygon points="700,195 690,200 695,210" fill="hsl(190 50% 40%)" />

        {/* Dependency threats label */}
        <text
          x="500"
          y="320"
          fill="hsl(0 70% 60%)"
          fontSize="12"
          fontWeight="500"
          textAnchor="middle"
        >
          DEPENDENCY THREATS
        </text>
        <path
          d="M 370 330 L 370 340 L 630 340 L 630 330"
          stroke="hsl(0 70% 60%)"
          strokeWidth="2"
          fill="none"
          transform="rotate(180, 500, 335)"
        />
      </svg>

      {/* Legend */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        {/* Source Threats */}
        <div className="space-y-2">
          <h4 className="font-semibold text-red-400">SOURCE THREATS</h4>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                A
              </span>
              <span>Bypassed code review</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                B
              </span>
              <span>Compromised source control system</span>
            </div>
          </div>
        </div>

        {/* Build Threats */}
        <div className="space-y-2">
          <h4 className="font-semibold text-red-400">BUILD THREATS</h4>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                C
              </span>
              <span>Modified code after source control</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                D
              </span>
              <span>Compromised build platform</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                F
              </span>
              <span>Bypassed CI/CD</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                G
              </span>
              <span>Compromised package repo</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                H
              </span>
              <span>Using a bad package</span>
            </div>
          </div>
        </div>

        {/* Dependency Threats */}
        <div className="space-y-2">
          <h4 className="font-semibold text-red-400">DEPENDENCY THREATS</h4>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-red-500/20 text-red-400 text-xs font-bold">
                E
              </span>
              <span>Using a bad dependency</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
