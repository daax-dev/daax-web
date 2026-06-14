"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  getTerminalWebSocketUrl,
  openTerminalWebSocket,
} from "@/lib/websocket-utils";

interface BtopTerminalProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function BtopTerminal({ onConnectionChange }: BtopTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const restartBtop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
      xtermRef.current.clear();
      wsRef.current.send(
        JSON.stringify({
          type: "start",
          command: "btop",
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket for btop via the shared ticket-aware opener (F1b #95).
    // No more hardcoded :4201 — getTerminalWebSocketUrl() is proxy-aware and
    // openTerminalWebSocket() attaches a single-use bearer ticket.
    let disposed = false;
    void (async () => {
      let ws: WebSocket;
      try {
        ws = await openTerminalWebSocket(getTerminalWebSocketUrl());
      } catch (err) {
        // Ticket fetch / WebSocket construction failed — clear the loading
        // state and surface, instead of an unhandled rejection.
        if (disposed) return;
        setIsLoading(false);
        const message = err instanceof Error ? err.message : String(err);
        xterm.write(
          `\r\n\x1b[31mFailed to connect to terminal server: ${message}\x1b[0m\r\n`,
        );
        return;
      }
      if (disposed) {
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        onConnectionChange?.(true);
        setIsLoading(false);
        // Send btop command
        const cols = xterm.cols;
        const rows = xterm.rows;
        ws.send(JSON.stringify({ type: "start", command: "btop", cols, rows }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "output" && data.data) {
            xterm.write(data.data);
          }
        } catch {
          // Raw data
          xterm.write(event.data);
        }
      };

      ws.onerror = () => {
        setIsLoading(false);
        xterm.write(
          "\r\n\x1b[31mFailed to connect to terminal server\x1b[0m\r\n",
        );
      };

      ws.onclose = () => {
        onConnectionChange?.(false);
        xterm.write("\r\n\x1b[33mConnection closed\x1b[0m\r\n");
      };
    })();

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }),
          );
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      wsRef.current?.close();
      xterm.dispose();
    };
  }, [onConnectionChange]);

  return (
    <div className="h-full w-full relative bg-[#1a1b26]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26] z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
        </div>
      )}
      <div ref={terminalRef} className="h-full w-full p-2" />
    </div>
  );
}

export default BtopTerminal;
