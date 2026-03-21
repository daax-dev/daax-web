"use client";

import { cn } from "@/lib/utils";

export function SignedAttestations({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* SVG Diagram */}
      <svg
        viewBox="0 0 800 350"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="attestGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(190 40% 20%)" />
            <stop offset="100%" stopColor="hsl(190 40% 15%)" />
          </linearGradient>
          <linearGradient id="signedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(140 40% 20%)" />
            <stop offset="100%" stopColor="hsl(140 40% 15%)" />
          </linearGradient>
        </defs>

        {/* Build Process Box */}
        <g transform="translate(50, 80)">
          <rect
            width="150"
            height="80"
            rx="8"
            fill="url(#attestGradient)"
            stroke="hsl(190 50% 50%)"
            strokeWidth="2"
          />
          <text
            x="75"
            y="35"
            fill="hsl(var(--foreground))"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
          >
            Build Process
          </text>
          <text
            x="75"
            y="55"
            fill="hsl(var(--muted-foreground))"
            fontSize="11"
            textAnchor="middle"
          >
            Source → Artifact
          </text>
        </g>

        {/* Arrow to Attestation */}
        <line
          x1="200"
          y1="120"
          x2="260"
          y2="120"
          stroke="hsl(190 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="270,120 260,115 260,125" fill="hsl(190 50% 50%)" />

        {/* Attestation Document */}
        <g transform="translate(280, 60)">
          <rect
            width="180"
            height="120"
            rx="8"
            fill="url(#attestGradient)"
            stroke="hsl(190 50% 50%)"
            strokeWidth="2"
          />
          <text
            x="90"
            y="30"
            fill="hsl(var(--foreground))"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
          >
            Attestation
          </text>
          {/* Document content lines */}
          <text x="20" y="55" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">
            builder: github-actions
          </text>
          <text x="20" y="70" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">
            commit: a1b2c3d
          </text>
          <text x="20" y="85" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">
            digest: sha256:e4f5...
          </text>
          <text x="20" y="100" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">
            timestamp: 2026-01-26
          </text>
        </g>

        {/* Arrow to Signing */}
        <line
          x1="460"
          y1="120"
          x2="520"
          y2="120"
          stroke="hsl(140 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="530,120 520,115 520,125" fill="hsl(140 50% 50%)" />

        {/* Key/Signing */}
        <g transform="translate(540, 80)">
          <rect
            width="100"
            height="80"
            rx="8"
            fill="url(#signedGradient)"
            stroke="hsl(140 50% 50%)"
            strokeWidth="2"
          />
          {/* Key icon */}
          <g transform="translate(50, 25)">
            <circle r="8" fill="none" stroke="hsl(140 60% 60%)" strokeWidth="2" />
            <line x1="6" y1="6" x2="20" y2="20" stroke="hsl(140 60% 60%)" strokeWidth="2" />
            <line x1="15" y1="15" x2="15" y2="22" stroke="hsl(140 60% 60%)" strokeWidth="2" />
            <line x1="18" y1="18" x2="18" y2="22" stroke="hsl(140 60% 60%)" strokeWidth="2" />
          </g>
          <text
            x="50"
            y="65"
            fill="hsl(var(--foreground))"
            fontSize="12"
            fontWeight="500"
            textAnchor="middle"
          >
            Sign
          </text>
        </g>

        {/* Arrow to Signed Attestation */}
        <line
          x1="640"
          y1="120"
          x2="680"
          y2="120"
          stroke="hsl(140 50% 50%)"
          strokeWidth="2"
        />
        <polygon points="690,120 680,115 680,125" fill="hsl(140 50% 50%)" />

        {/* Signed Attestation (checkmark badge) */}
        <g transform="translate(700, 90)">
          <circle r="30" fill="hsl(140 40% 20%)" stroke="hsl(140 50% 50%)" strokeWidth="2" />
          {/* Checkmark */}
          <path
            d="M -10 0 L -3 8 L 12 -8"
            fill="none"
            stroke="hsl(140 60% 60%)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <text
          x="700"
          y="145"
          fill="hsl(var(--foreground))"
          fontSize="12"
          fontWeight="500"
          textAnchor="middle"
        >
          Verified
        </text>

        {/* Consumer verification flow */}
        <g transform="translate(280, 220)">
          <rect
            width="240"
            height="70"
            rx="8"
            fill="url(#attestGradient)"
            stroke="hsl(190 50% 50%)"
            strokeWidth="2"
            strokeDasharray="6,3"
          />
          <text
            x="120"
            y="30"
            fill="hsl(var(--foreground))"
            fontSize="13"
            fontWeight="500"
            textAnchor="middle"
          >
            Consumer Verification
          </text>
          <text
            x="120"
            y="50"
            fill="hsl(var(--muted-foreground))"
            fontSize="11"
            textAnchor="middle"
          >
            cosign verify-attestation --type slsa
          </text>
        </g>

        {/* Dotted line from signed to consumer */}
        <line
          x1="700"
          y1="145"
          x2="520"
          y2="220"
          stroke="hsl(140 50% 50%)"
          strokeWidth="2"
          strokeDasharray="6,3"
        />
      </svg>

      {/* Key points */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div className="p-4 rounded-lg bg-muted/20 border border-border/40">
          <h4 className="font-semibold text-foreground mb-2">What is Signed?</h4>
          <p className="text-muted-foreground">
            Build provenance: who built it, from what source, using which tools, and when.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/20 border border-border/40">
          <h4 className="font-semibold text-foreground mb-2">Who Signs?</h4>
          <p className="text-muted-foreground">
            Workload identity via OIDC—GitHub Actions, GitLab CI, or your own builder signs automatically.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/20 border border-border/40">
          <h4 className="font-semibold text-foreground mb-2">Why It Matters</h4>
          <p className="text-muted-foreground">
            Consumers can verify artifacts haven&apos;t been tampered with and came from a trusted source.
          </p>
        </div>
      </div>
    </div>
  );
}
