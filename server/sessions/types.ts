/**
 * Session Types
 *
 * Type definitions for terminal sessions and PTY management.
 */

import { WebSocket } from "ws";

// Minimal local typings for optional node-pty dependency so TypeScript
// can compile even when node-pty is not installed.
export interface IPty {
  pid: number;
  process: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (exit: { exitCode: number; signal?: number }) => void): void;
}

export type NodePtyModule = {
  spawn(command: string, args?: string[], options?: unknown): IPty;
};

/**
 * A terminal session with PTY and WebSocket connection
 */
export interface TerminalSession {
  pty: IPty;
  ws: WebSocket;
  containerId?: string;
  recordingId?: string;
}

/**
 * Extended session type with internal timeout tracking
 */
export interface TerminalSessionWithTimeouts extends TerminalSession {
  _killTimeout?: NodeJS.Timeout;
  _commandTimeout?: NodeJS.Timeout;
}
