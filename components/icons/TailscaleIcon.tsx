"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface TailscaleIconProps {
  className?: string;
  size?: number;
}

/**
 * Tailscale logo icon - 3x3 grid of dots
 */
export function TailscaleIcon({ className, size = 16 }: TailscaleIconProps) {
  return (
    <Image
      src="/tailscale-logo.svg"
      alt="Tailscale"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}
