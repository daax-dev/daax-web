"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface CloudIconProps {
  className?: string;
  size?: number;
}

export function AwsIcon({ className, size = 16 }: CloudIconProps) {
  return (
    <Image
      src="/aws-logo.svg"
      alt="AWS"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

export function AzureIcon({ className, size = 16 }: CloudIconProps) {
  return (
    <Image
      src="/azure-logo.svg"
      alt="Azure"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

export function GcpIcon({ className, size = 16 }: CloudIconProps) {
  return (
    <Image
      src="/gcp-logo.svg"
      alt="GCP"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

export function CloudProviderIcon({
  provider,
  className,
  size = 16,
}: CloudIconProps & { provider: "aws" | "azure" | "gcp" }) {
  switch (provider) {
    case "aws":
      return <AwsIcon className={className} size={size} />;
    case "azure":
      return <AzureIcon className={className} size={size} />;
    case "gcp":
      return <GcpIcon className={className} size={size} />;
    default:
      return <AwsIcon className={className} size={size} />;
  }
}
