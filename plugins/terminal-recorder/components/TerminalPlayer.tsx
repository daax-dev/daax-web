"use client";

/**
 * Terminal Player Component
 *
 * Plays back asciinema v2 recordings using xterm.js
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Play, Pause, RotateCcw, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ParsedAsciinema, AsciinemaEvent } from "../types";

import "@xterm/xterm/css/xterm.css";

interface TerminalPlayerProps {
  content: string;
  autoPlay?: boolean;
}

/**
 * Parse asciinema v2 format (JSON lines)
 */
function parseAsciinema(content: string): ParsedAsciinema | null {
  try {
    const lines = content.trim().split("\n");
    if (lines.length === 0) return null;

    const header = JSON.parse(lines[0]);
    const events: AsciinemaEvent[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]) as AsciinemaEvent;
        events.push(event);
      } catch {
        // Skip malformed lines
      }
    }

    return { header, events };
  } catch {
    return null;
  }
}

/**
 * Format time as MM:SS.mmm
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function TerminalPlayer({
  content,
  autoPlay = false,
}: TerminalPlayerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const playbackRef = useRef<{
    timeoutId?: ReturnType<typeof setTimeout>;
    eventIndex: number;
    startTime: number;
    pausedAt: number;
  }>({ eventIndex: 0, startTime: 0, pausedAt: 0 });

  const [parsed, setParsed] = useState<ParsedAsciinema | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Parse content on mount
  useEffect(() => {
    const result = parseAsciinema(content);
    setParsed(result);
    if (result && result.events.length > 0) {
      const lastEvent = result.events[result.events.length - 1];
      setDuration(lastEvent[0]);
    }
  }, [content]);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || !parsed) return;

    const term = new Terminal({
      cols: parsed.header.width || 120,
      rows: parsed.header.height || 30,
      fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#1a1a1a",
        foreground: "#e4e4e4",
        cursor: "#e4e4e4",
      },
      cursorBlink: false,
      disableStdin: true, // Read-only playback
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Auto-play if enabled
    if (autoPlay) {
      startPlayback();
    }

    return () => {
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      fitAddonRef.current?.fit();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * Play next event in sequence
   */
  const playNextEvent = useCallback(() => {
    if (!xtermRef.current || !parsed) return;

    const pb = playbackRef.current;
    if (pb.eventIndex >= parsed.events.length) {
      setPlaying(false);
      return;
    }

    const event = parsed.events[pb.eventIndex];
    const eventTime = event[0];
    const eventType = event[1];
    const eventData = event[2];

    // Calculate when this event should fire
    const elapsed = ((Date.now() - pb.startTime) / 1000) * speed;
    const delay = Math.max(0, ((eventTime - elapsed) * 1000) / speed);

    pb.timeoutId = setTimeout(() => {
      if (eventType === "o") {
        xtermRef.current?.write(eventData);
      }
      // Input events ('i') are typically not displayed during playback

      setCurrentTime(eventTime);
      pb.eventIndex++;
      playNextEvent();
    }, delay);
  }, [parsed, speed]);

  /**
   * Start playback
   */
  const startPlayback = useCallback(() => {
    if (!parsed || !xtermRef.current) return;

    const pb = playbackRef.current;
    pb.startTime = Date.now() - (pb.pausedAt * 1000) / speed;
    setPlaying(true);
    playNextEvent();
  }, [parsed, playNextEvent, speed]);

  /**
   * Pause playback
   */
  const pausePlayback = useCallback(() => {
    const pb = playbackRef.current;
    if (pb.timeoutId) {
      clearTimeout(pb.timeoutId);
    }
    pb.pausedAt = currentTime;
    setPlaying(false);
  }, [currentTime]);

  /**
   * Reset playback to beginning
   */
  const resetPlayback = useCallback(() => {
    const pb = playbackRef.current;
    if (pb.timeoutId) {
      clearTimeout(pb.timeoutId);
    }
    pb.eventIndex = 0;
    pb.pausedAt = 0;
    pb.startTime = 0;
    setCurrentTime(0);
    setPlaying(false);
    xtermRef.current?.reset();
    xtermRef.current?.clear();
  }, []);

  /**
   * Seek to position
   */
  const seekTo = useCallback(
    (time: number) => {
      if (!parsed || !xtermRef.current) return;

      // Stop current playback
      const pb = playbackRef.current;
      if (pb.timeoutId) {
        clearTimeout(pb.timeoutId);
      }

      // Clear terminal and replay up to target time
      xtermRef.current.reset();
      xtermRef.current.clear();

      let eventIndex = 0;
      for (let i = 0; i < parsed.events.length; i++) {
        const event = parsed.events[i];
        if (event[0] > time) break;
        if (event[1] === "o") {
          xtermRef.current.write(event[2]);
        }
        eventIndex = i + 1;
      }

      pb.eventIndex = eventIndex;
      pb.pausedAt = time;
      setCurrentTime(time);

      // Resume if was playing
      if (playing) {
        pb.startTime = Date.now() - (time * 1000) / speed;
        playNextEvent();
      }
    },
    [parsed, playing, playNextEvent, speed],
  );

  if (!parsed) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to parse recording
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Terminal display */}
      <div
        ref={terminalRef}
        className="rounded-lg overflow-hidden border bg-[#1a1a1a]"
        style={{ minHeight: "300px" }}
      />

      {/* Controls */}
      <div className="flex items-center gap-4 p-2 bg-muted rounded-lg">
        {/* Play/Pause/Reset buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={resetPlayback}
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={playing ? pausePlayback : startPlayback}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 1}
            step={0.1}
            onValueChange={([val]: number[]) => seekTo(val)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-16 text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-1">
          <FastForward className="h-3 w-3 text-muted-foreground" />
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="text-xs bg-transparent border rounded px-1 py-0.5"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>
    </div>
  );
}
