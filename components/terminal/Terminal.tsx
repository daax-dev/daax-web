"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export interface TerminalProps {
  wsUrl: string;
  // containerName is the server-assigned docker container name (e.g.
  // "daax-abc12345") when running in container mode. Tabs use it to
  // cross-reference live containers and surface a "stray/lost" state.
  onSessionStart?: (
    sessionId: string,
    mode: string,
    containerName?: string,
  ) => void;
  onExit?: (code: number, signal?: number) => void;
  onError?: (error: string) => void;
  className?: string;
  initialCommand?: string;
}

export interface TerminalRef {
  sendInput: (text: string) => void;
  stopRecording: () => void;
  isRecording: boolean;
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(
  function Terminal(
    { wsUrl, onSessionStart, onExit, onError, className = "", initialCommand },
    ref,
  ) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const shouldReconnectRef = useRef(true);
    const initialCommandSentRef = useRef(false);

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
        xtermRef.current &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    }, []);

    useEffect(() => {
      if (!terminalRef.current) return;

      // Reset reconnection state on mount
      shouldReconnectRef.current = true;
      reconnectAttemptRef.current = 0;

      // Create xterm instance
      const term = new XTerm({
        cursorBlink: true,
        fontFamily:
          '"JetBrainsMono Nerd Font", "MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
        fontSize: 14,
        lineHeight: 1.2,
        allowProposedApi: true,
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

      // Add addons
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      // Store refs
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Open terminal in container
      term.open(terminalRef.current);

      // Initial fit - with defensive check to avoid dimension errors
      setTimeout(() => {
        try {
          if (
            terminalRef.current &&
            terminalRef.current.offsetWidth > 0 &&
            terminalRef.current.offsetHeight > 0
          ) {
            fitAddon.fit();
          }
        } catch (e) {
          console.warn("[Terminal] Initial fit failed:", e);
        }
      }, 0);

      // Function to setup WebSocket with all handlers (reusable for reconnections)
      const setupWebSocket = (isReconnect = false): WebSocket => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(
            `[Terminal] WebSocket ${isReconnect ? "re" : ""}connected successfully to ${wsUrl}`,
          );
          setConnected(true);
          reconnectAttemptRef.current = 0;

          if (isReconnect) {
            term.writeln("\x1b[32mReconnected successfully!\x1b[0m");
          } else {
            term.writeln("\x1b[32mConnecting to terminal server...\x1b[0m");
          }

          // Send initial resize and focus terminal
          setTimeout(() => {
            fitAddon.fit();
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows,
              }),
            );
            term.focus();
          }, 100);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
              case "session":
                term.writeln(`\x1b[32mSession started: ${msg.id}\x1b[0m`);
                if (msg.mode === "container") {
                  term.writeln(
                    `\x1b[36mContainer: ${msg.containerImage}\x1b[0m`,
                  );
                }
                term.writeln("");
                term.focus();
                onSessionStartRef.current?.(
                  msg.id,
                  msg.mode,
                  msg.containerName,
                );

                // Send initial command if provided (after shell is ready)
                // Note: We use a 500ms delay as a heuristic for shell initialization.
                // A more robust approach would be to wait for a prompt pattern in the output,
                // but this would require significant refactoring to track shell state.
                // TODO: Consider implementing prompt detection for more reliable command timing.
                if (initialCommand && !initialCommandSentRef.current) {
                  initialCommandSentRef.current = true;
                  // Wait for shell prompt to be ready (heuristic delay)
                  setTimeout(() => {
                    // Sanitize the initial command defensively to avoid sending control characters
                    const sanitizedCommand = initialCommand.replace(
                      /[\x00-\x1f\x7f]/g,
                      "",
                    );
                    if (sanitizedCommand) {
                      ws.send(
                        JSON.stringify({
                          type: "input",
                          data: sanitizedCommand + "\n",
                        }),
                      );
                    }
                  }, 500);
                }
                break;

              case "output":
                term.write(msg.data);
                break;

              case "exit":
                term.writeln("");
                term.writeln(
                  `\x1b[33mProcess exited with code ${msg.code}\x1b[0m`,
                );
                setConnected(false);
                setIsRecording(false);
                onExitRef.current?.(msg.code, msg.signal);
                break;

              case "recordingStarted":
                setIsRecording(true);
                break;

              case "recordingStopped":
                setIsRecording(false);
                break;

              default:
                console.log("Unknown message type:", msg.type);
            }
          } catch (_e) {
            // Raw data (shouldn't happen with our protocol)
            term.write(event.data);
          }
        };

        ws.onerror = (_event) => {
          // Don't write error message here - wait for onclose to handle it
        };

        ws.onclose = (event) => {
          setConnected(false);
          console.log(
            `[Terminal] WebSocket closed: code=${event.code}, reason="${event.reason}", wsUrl=${wsUrl}`,
          );

          // Only show error and attempt reconnect if it wasn't a clean close
          if (event.code !== 1000 && shouldReconnectRef.current) {
            const reasonText = event.reason ? ` (${event.reason})` : "";
            term.writeln(
              `\x1b[31mConnection lost (code ${event.code}${reasonText}). Attempting to reconnect...\x1b[0m`,
            );

            // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
            const currentAttempt = reconnectAttemptRef.current;
            const delay = Math.min(1000 * Math.pow(2, currentAttempt), 10000);

            reconnectTimerRef.current = setTimeout(() => {
              reconnectAttemptRef.current += 1;
              term.writeln(
                `\x1b[33mReconnecting (attempt ${reconnectAttemptRef.current})...\x1b[0m`,
              );

              // Create new WebSocket with fresh handlers
              setupWebSocket(true);
            }, delay);
          } else if (event.code === 1000) {
            term.writeln("\x1b[33mConnection closed cleanly\x1b[0m");
          } else {
            term.writeln(
              `\x1b[31mConnection closed (code ${event.code})\x1b[0m`,
            );
            // Don't call onError for clean shutdown to avoid noise in logs
            if (event.code !== 1001) {
              // 1001 is "Going Away" which is often benign
              onErrorRef.current?.(
                `WebSocket closed: code ${event.code}, reason: ${event.reason || "none"}`,
              );
            }
          }
        };

        return ws;
      };

      // Connect WebSocket
      console.log(`[Terminal] Connecting to WebSocket: ${wsUrl}`);
      const ws = setupWebSocket();

      // Handle terminal input
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Handle resize - with defensive error handling
      const resizeObserver = new ResizeObserver(() => {
        try {
          if (
            terminalRef.current &&
            terminalRef.current.offsetWidth > 0 &&
            terminalRef.current.offsetHeight > 0
          ) {
            handleResize();
          }
        } catch (e) {
          console.warn("[Terminal] Resize failed:", e);
        }
      });
      resizeObserver.observe(terminalRef.current);

      window.addEventListener("resize", handleResize);

      // Cleanup
      return () => {
        shouldReconnectRef.current = false;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
        ws.close(1000, "Component unmounting"); // Clean close
        term.dispose();
      };
    }, [wsUrl, handleResize]);

    // Method to send input text (for voice input, etc.)
    const sendInput = useCallback((text: string) => {
      console.log(
        "Terminal.sendInput called:",
        text,
        "wsState:",
        wsRef.current?.readyState,
      );
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data: text }));
        console.log("Terminal.sendInput: sent successfully");
      } else {
        console.warn(
          "Terminal.sendInput: WebSocket not open, state:",
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
      xtermRef.current?.focus();
    }, []);

    return (
      <div className={`relative ${className}`} onClick={handleContainerClick}>
        <div
          ref={terminalRef}
          className="w-full h-full min-h-[400px]"
          style={{ padding: "8px" }}
        />
        {!connected && (
          <div className="absolute top-2 right-2 px-2 py-1 text-xs bg-yellow-500/20 text-yellow-500 rounded">
            Disconnected
          </div>
        )}
      </div>
    );
  },
);
