"use client";

/**
 * Recording Player Component
 *
 * Wraps rrweb-player for playback of recorded sessions.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RecordingData } from "../types";

interface RecordingPlayerProps {
  recording: RecordingData;
  autoPlay?: boolean;
}

export function RecordingPlayer({
  recording,
  autoPlay = false,
}: RecordingPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !recording.events.length) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function initPlayer() {
      try {
        // Dynamically import rrweb-player
        const rrwebPlayer = await import("rrweb-player");

        if (!mounted || !containerRef.current) return;

        // Clear previous player by removing all child nodes safely
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }

        // Create new player
        playerRef.current = new rrwebPlayer.default({
          target: containerRef.current,
          props: {
            events: recording.events,
            autoPlay,
            showController: true,
            width: containerRef.current.clientWidth,
            height: Math.min(containerRef.current.clientWidth * 0.6, 500),
            speedOption: [0.5, 1, 2, 4],
            skipInactive: true,
            showWarning: false,
            showDebug: false,
          },
        });

        setLoading(false);
      } catch (err) {
        console.error("[Recording Player] Failed to initialize:", err);
        setError("Failed to load player");
        setLoading(false);
      }
    }

    initPlayer();

    return () => {
      mounted = false;
      // Cleanup player if needed
      if (
        playerRef.current &&
        typeof (playerRef.current as { destroy?: () => void }).destroy ===
          "function"
      ) {
        (playerRef.current as { destroy: () => void }).destroy();
      }
    };
  }, [recording, autoPlay]);

  if (!recording.events.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No events in this recording
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border bg-muted"
      />
    </div>
  );
}
