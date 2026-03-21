"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface OsIconProps {
  className?: string;
  size?: number;
}

/**
 * Ubuntu logo icon
 */
export function UbuntuIcon({ className, size = 16 }: OsIconProps) {
  return (
    <Image
      src="/ubuntu-logo.svg"
      alt="Ubuntu"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

/**
 * Windows logo icon
 */
export function WindowsIcon({ className, size = 16 }: OsIconProps) {
  return (
    <Image
      src="/windows-logo.svg"
      alt="Windows"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

/**
 * macOS logo icon
 */
export function MacOsIcon({ className, size = 16 }: OsIconProps) {
  return (
    <Image
      src="/macos-logo.svg"
      alt="macOS"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

/**
 * Raspberry Pi logo icon
 */
export function RaspberryPiIcon({ className, size = 16 }: OsIconProps) {
  return (
    <Image
      src="/raspberry-pi-logo.svg"
      alt="Raspberry Pi"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

/**
 * Get the appropriate OS icon component based on OS type
 */
export function OsIcon({
  os,
  className,
  size = 16,
}: OsIconProps & { os: "linux" | "windows" | "macos" | "raspberry-pi" }) {
  switch (os) {
    case "linux":
      return <UbuntuIcon className={className} size={size} />;
    case "windows":
      return <WindowsIcon className={className} size={size} />;
    case "macos":
      return <MacOsIcon className={className} size={size} />;
    case "raspberry-pi":
      return <RaspberryPiIcon className={className} size={size} />;
    default:
      return <UbuntuIcon className={className} size={size} />;
  }
}
