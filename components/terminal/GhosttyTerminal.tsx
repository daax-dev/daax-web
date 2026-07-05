"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { openTerminalWebSocket } from "@/lib/websocket-utils";
import { createStreamMasker } from "@/lib/redaction/mask";
import { getPresentationMode } from "@/lib/presentation-mode";

export interface GhosttyTerminalProps {
  wsUrl: string;
  onSessionStart?: (sessionId: string, mode: string) => void;
  onExit?: (code: number, signal?: number) => void;
  onError?: (error: string) => void;
  className?: string;
}

export interface GhosttyTerminalRef {
  sendInput: (text: string) => void;
  stopRecording: () => void;
  isRecording: boolean;
}

export const GhosttyTerminal = forwardRef<
  GhosttyTerminalRef,
  GhosttyTerminalProps
>(function GhosttyTerminal(
  { wsUrl, onSessionStart, onExit, onError, className = "" },
  ref,
) {
  const terminalRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ghosttyRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  // Store callbacks in refs to avoid recreating the effect when they change
  const onSessionStartRef = useRef(onSessionStart);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onSessionStartRef.current = onSessionStart;
    onExitRef.current = onExit;
    onErrorRef.current = onError;
  }, [onSessionStart, onExit, onError]);

  const handleResize = useCallback(() => {
    if (
      fitAddonRef.current &&
      ghosttyRef.current &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      fitAddonRef.current.fit();
      const { cols, rows } = ghosttyRef.current;
      wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Tracks unmount so a ticket fetch resolving after teardown closes its
    // orphaned socket rather than wiring handlers to a dead component (F1b #95).
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fitAddon: any = null;
    let dataDisposer: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    // Presentation mode (#155): visually redact secrets at the write boundary.
    // Best-effort, visual-only; handles ANSI escapes and tokens split across
    // chunks. When off, flush carried bytes then write raw so nothing is lost.
    const masker = createStreamMasker();
    const writeOutput = (data: string) => {
      if (!term) return;
      if (getPresentationMode()) {
        term.write(masker.push(data));
      } else {
        const carried = masker.flush();
        if (carried) term.write(carried);
        term.write(data);
      }
    };

    const initGhostty = async () => {
      try {
        setIsLoading(true);

        // Reset reconnection state on mount
        shouldReconnectRef.current = true;
        reconnectAttemptRef.current = 0;

        // Dynamically import ghostty-web
        const ghosttyModule = await import("ghostty-web");

        // Initialize WASM
        await ghosttyModule.init();

        if (!terminalRef.current) return;

        // Create terminal instance
        term = new ghosttyModule.Terminal({
          cursorBlink: true,
          fontFamily:
            '"JetBrainsMono Nerd Font", "MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
          fontSize: 14,
          theme: {
            background: "#1a1b26",
            foreground: "#c0caf5",
            cursor: "#c0caf5",
            cursorAccent: "#1a1b26",
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

        // Add FitAddon
        fitAddon = new ghosttyModule.FitAddon();
        term.loadAddon(fitAddon);

        // Store refs
        ghosttyRef.current = term;
        fitAddonRef.current = fitAddon;

        // Open terminal in container
        term.open(terminalRef.current);

        // Initial fit - with defensive check
        setTimeout(() => {
          try {
            if (
              terminalRef.current &&
              terminalRef.current.offsetWidth > 0 &&
              terminalRef.current.offsetHeight > 0
            ) {
              fitAddon?.fit();
            }
          } catch (e) {
            console.warn("[GhosttyTerminal] Initial fit failed:", e);
          }
        }, 0);

        setIsLoading(false);

        // Function to setup WebSocket with all handlers (reusable for reconnections)
        const setupWebSocket = async (isReconnect = false): Promise<void> => {
          let newWs: WebSocket;
          try {
            newWs = await openTerminalWebSocket(wsUrl);
          } catch (err) {
            // Ticket fetch / WebSocket construction failed — surface instead of
            // an unhandled rejection (which would break reconnection).
            if (disposed) return;
            const message = err instanceof Error ? err.message : String(err);
            term?.writeln(
              `\x1b[31mFailed to open terminal connection: ${message}\x1b[0m`,
            );
            onErrorRef.current?.(`WebSocket open failed: ${message}`);
            return;
          }
          if (disposed) {
            try {
              newWs.close();
            } catch {
              /* already closing */
            }
            return;
          }
          wsRef.current = newWs;

          newWs.onopen = () => {
            setConnected(true);
            reconnectAttemptRef.current = 0;

            if (isReconnect) {
              term?.writeln("\x1b[32mReconnected successfully!\x1b[0m");
            } else {
              term?.writeln("\x1b[35m[Ghostty Web Terminal]\x1b[0m");
              term?.writeln("\x1b[32mConnecting to terminal server...\x1b[0m");
            }

            // Send initial resize and focus terminal
            setTimeout(() => {
              fitAddon?.fit();
              if (term) {
                newWs.send(
                  JSON.stringify({
                    type: "resize",
                    cols: term.cols,
                    rows: term.rows,
                  }),
                );
                term.focus();
              }
            }, 100);
          };

          newWs.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);

              switch (msg.type) {
                case "session":
                  term?.writeln(`\x1b[32mSession started: ${msg.id}\x1b[0m`);
                  if (msg.mode === "container") {
                    term?.writeln(
                      `\x1b[36mContainer: ${msg.containerImage}\x1b[0m`,
                    );
                  }
                  term?.writeln("");
                  term?.focus();
                  onSessionStartRef.current?.(msg.id, msg.mode);
                  break;

                case "output":
                  writeOutput(msg.data);
                  break;

                case "exit": {
                  const carried = masker.flush();
                  if (carried) term?.write(carried);
                  term?.writeln("");
                  term?.writeln(
                    `\x1b[33mProcess exited with code ${msg.code}\x1b[0m`,
                  );
                  setConnected(false);
                  setIsRecording(false);
                  onExitRef.current?.(msg.code, msg.signal);
                  break;
                }

                case "recordingStarted":
                  setIsRecording(true);
                  break;

                case "recordingStopped":
                  setIsRecording(false);
                  break;

                default:
                  console.log("Unknown message type:", msg.type);
              }
            } catch {
              // Raw data (shouldn't happen with our protocol)
              term?.write(event.data);
            }
          };

          newWs.onerror = () => {
            // Don't write error message here - wait for onclose to handle it
          };

          newWs.onclose = (event: CloseEvent) => {
            // Render any masked bytes held for a cross-chunk token and clear the
            // carry so nothing bleeds into a reconnect (#155).
            const carried = masker.flush();
            if (carried) term?.write(carried);
            setConnected(false);

            // 1008 (policy violation) is an auth/origin/ticket rejection (F1b
            // #95): retrying cannot succeed and would hammer the ticket-mint
            // endpoint, so treat it as non-recoverable — surface and stop.
            if (event.code === 1008) {
              const reasonText = event.reason ? ` (${event.reason})` : "";
              term?.writeln(
                `\x1b[31mConnection refused${reasonText}. Authentication/authorization failed — not retrying.\x1b[0m`,
              );
              onErrorRef.current?.(
                `WebSocket refused: ${event.reason || "policy violation"}`,
              );
            } else if (event.code !== 1000 && shouldReconnectRef.current) {
              term?.writeln(
                "\x1b[31mConnection lost. Attempting to reconnect...\x1b[0m",
              );

              // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
              const currentAttempt = reconnectAttemptRef.current;
              const delay = Math.min(1000 * Math.pow(2, currentAttempt), 10000);

              reconnectTimerRef.current = setTimeout(() => {
                reconnectAttemptRef.current += 1;
                term?.writeln(
                  `\x1b[33mReconnecting (attempt ${reconnectAttemptRef.current})...\x1b[0m`,
                );

                // Create new WebSocket with fresh handlers (fresh ticket).
                void setupWebSocket(true);
              }, delay);
            } else if (event.code === 1000) {
              term?.writeln("\x1b[33mConnection closed\x1b[0m");
            } else {
              term?.writeln("\x1b[31mConnection closed\x1b[0m");
              onErrorRef.current?.("WebSocket connection closed unexpectedly");
            }
          };
        };

        // Connect WebSocket (async: mints a fresh single-use ticket).
        void setupWebSocket();

        // Handle terminal input — read the live socket from the ref since the
        // socket is created asynchronously (after the ticket fetch).
        dataDisposer = term.onData((data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "input", data }));
          }
        });

        // Handle resize - with defensive error handling
        resizeObserver = new ResizeObserver(() => {
          try {
            if (
              terminalRef.current &&
              terminalRef.current.offsetWidth > 0 &&
              terminalRef.current.offsetHeight > 0
            ) {
              handleResize();
            }
          } catch (e) {
            console.warn("[GhosttyTerminal] Resize failed:", e);
          }
        });
        resizeObserver.observe(terminalRef.current);

        window.addEventListener("resize", handleResize);
      } catch (error) {
        console.error("[GhosttyTerminal] Initialization failed:", error);
        setInitError(
          error instanceof Error
            ? error.message
            : "Failed to initialize Ghostty terminal",
        );
        setIsLoading(false);
        onErrorRef.current?.("Failed to initialize Ghostty terminal");
      }
    };

    initGhostty();

    // Cleanup
    return () => {
      disposed = true;
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      dataDisposer?.dispose();
      wsRef.current?.close(1000, "Component unmounting"); // Clean close
      term?.dispose();
    };
  }, [wsUrl, handleResize]);

  // Method to send input text (for voice input, etc.)
  const sendInput = useCallback((text: string) => {
    console.log(
      "GhosttyTerminal.sendInput called:",
      text,
      "wsState:",
      wsRef.current?.readyState,
    );
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: text }));
      console.log("GhosttyTerminal.sendInput: sent successfully");
    } else {
      console.warn(
        "GhosttyTerminal.sendInput: WebSocket not open, state:",
        wsRef.current?.readyState,
      );
    }
  }, []);

  // Method to stop terminal recording
  const stopRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "stopRecording" }));
      } catch (error) {
        console.error("Failed to send stopRecording message:", error);
      }
    }
  }, []);

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      sendInput,
      stopRecording,
      isRecording,
    }),
    [sendInput, stopRecording, isRecording],
  );

  // Focus terminal when clicking anywhere in the container
  const handleContainerClick = useCallback(() => {
    ghosttyRef.current?.focus();
  }, []);

  if (initError) {
    return (
      <div
        className={`relative flex items-center justify-center bg-[#1a1b26] ${className}`}
      >
        <div className="text-center p-8">
          <div className="text-red-400 text-lg font-semibold mb-2">
            Failed to load Ghostty Terminal
          </div>
          <div className="text-muted-foreground text-sm">{initError}</div>
          <div className="text-muted-foreground text-xs mt-4">
            Try refreshing the page or check the browser console for more
            details.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} onClick={handleContainerClick}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26] z-10">
          <div className="text-center">
            <div className="text-purple-400 text-lg font-semibold mb-2">
              Loading Ghostty Terminal...
            </div>
            <div className="text-muted-foreground text-sm">
              Initializing WebAssembly runtime
            </div>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="w-full h-full min-h-[400px]"
        style={{ padding: "8px" }}
      />
      {!connected && !isLoading && (
        <div className="absolute top-2 right-2 px-2 py-1 text-xs bg-yellow-500/20 text-yellow-500 rounded">
          Disconnected
        </div>
      )}
      <div className="absolute top-2 left-2 px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
        </span>
        Ghostty
      </div>
    </div>
  );
});
