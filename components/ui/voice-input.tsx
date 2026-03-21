"use client";

import dynamic from "next/dynamic";
import type { VoiceInputProps } from "./voice-input-client";

// Re-export the type
export type { VoiceInputProps };

// Dynamic import with SSR disabled - the component is in a separate file
export const VoiceInput = dynamic<VoiceInputProps>(
  () => import("./voice-input-client").then((mod) => mod.VoiceInputClient),
  { ssr: false },
);
