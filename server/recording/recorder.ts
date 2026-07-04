/**
 * Terminal Session Recorder
 *
 * Records terminal sessions in asciinema v2 format with buffering
 * for performance optimization.
 */

import { join, resolve, dirname } from "path";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from "fs";
import { appendFile } from "fs/promises";
import {
  RECORDINGS_DIR,
  BUFFER_FLUSH_INTERVAL_MS,
  BUFFER_MAX_SIZE,
} from "../config/constants";
import { RecordingMetadata, ActiveRecordingState } from "./types";

// Active recordings map with buffering
const activeRecordings = new Map<string, ActiveRecordingState>();

// Serialized write queue per session to prevent concurrent async appends
// from interleaving and corrupting .cast files
const writeQueues = new Map<string, Promise<void>>();

// Track active recordings by clientSessionId to prevent duplicates from React remounts
// Maps clientSessionId -> recordingId
const clientSessionRecordings = new Map<string, string>();

/**
 * Initialize the recordings directory
 */
export function initializeRecordingsDir(): void {
  try {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  } catch (error) {
    console.error(
      "[Terminal Recorder] Failed to create recordings directory:",
      error,
    );
  }
}

/**
 * Start recording a session.
 * Returns the recording ID, or null if a recording already exists for this clientSessionId (deduplication).
 */
export function startRecording(
  sessionId: string,
  sessionType: string,
  command: string,
  cols: number,
  rows: number,
  clientSessionId?: string,
): string | null {
  // Deduplication: Check if there's already an active recording for this clientSessionId
  // This prevents duplicate recordings from React Strict Mode double-mounts
  if (clientSessionId) {
    const existingRecordingId = clientSessionRecordings.get(clientSessionId);
    if (existingRecordingId) {
      console.log(
        `[Recording] Skipping duplicate for clientSessionId=${clientSessionId}, existing=${existingRecordingId}`,
      );
      return null;
    }
  }

  // `sessionType` is CLIENT-CONTROLLED (a `sessionType` URL query param, see
  // server/handlers/connection-handler.ts). Interpolating it raw into
  // `recordingId` — which is then joined onto RECORDINGS_DIR to build the
  // `.cast`/`.json` write paths below — would let a crafted value such as
  // `"../../etc/x"` or `"a/b"` traverse OUT of RECORDINGS_DIR on the write
  // path (the read/delete guards in isValidRecordingId do not cover writes).
  // Slug it to the same allowlist isValidRecordingId enforces so the minted id
  // can never traverse. `sessionId` is a crypto.randomUUID (hex + `-`) and
  // Date.now() is digits, so the full id always matches RECORDING_ID_PATTERN.
  // Only the id is sanitized; metadata.sessionType / title keep the raw value.
  const safeSessionType = sessionType.replace(/[^A-Za-z0-9_-]/g, "-");
  const recordingId = `${safeSessionType}-${Date.now()}-${sessionId.slice(0, 8)}`;
  const filePath = join(RECORDINGS_DIR, `${recordingId}.cast`);

  const metadata: RecordingMetadata = {
    id: recordingId,
    sessionId,
    sessionType,
    command,
    startTime: Date.now(),
    cols,
    rows,
    title: `${sessionType} session - ${new Date().toLocaleString()}`,
  };

  // Write asciinema v2 header
  const header = {
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(Date.now() / 1000),
    env: { SHELL: "/bin/zsh", TERM: "xterm-256color" },
    title: metadata.title,
  };

  try {
    writeFileSync(filePath, JSON.stringify(header) + "\n");

    // Also write metadata file immediately (without endTime) so recording appears in listings
    // even if session terminates unexpectedly
    const metaPath = filePath.replace(".cast", ".json");
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  } catch (err) {
    console.error(
      `[Terminal Recorder] Failed to initialize recording files for ${sessionId}:`,
      err,
    );
    return null;
  }

  activeRecordings.set(sessionId, {
    metadata,
    filePath,
    startTime: Date.now(),
    buffer: [],
    lastFlush: Date.now(),
    clientSessionId,
  });

  // Track by clientSessionId for deduplication
  if (clientSessionId) {
    clientSessionRecordings.set(clientSessionId, recordingId);
  }

  console.log(
    `[Recording] Started: ${recordingId}${clientSessionId ? ` (clientSessionId=${clientSessionId})` : ""}`,
  );
  return recordingId;
}

/**
 * Flush recording buffer to disk asynchronously.
 * Uses async I/O to avoid blocking the Node.js event loop on the hot path.
 * Writes are serialized per-session via a queue to prevent interleaving.
 */
export function flushRecordingBuffer(sessionId: string): void {
  const recording = activeRecordings.get(sessionId);
  if (!recording || recording.buffer.length === 0) return;

  // Capture and clear the buffer synchronously to prevent data loss
  const data = recording.buffer.join("\n") + "\n";
  recording.buffer = [];
  recording.lastFlush = Date.now();

  // Chain onto the previous write to serialize appends and prevent interleaving
  const prev = writeQueues.get(sessionId) ?? Promise.resolve();
  const next = prev
    .then(() => appendFile(recording.filePath, data))
    .catch((err) => {
      console.error(
        `[Terminal Recorder] Failed to flush buffer for ${sessionId}:`,
        err,
      );
    });
  writeQueues.set(sessionId, next);
}

/**
 * Record output data (buffered)
 */
export function recordOutput(sessionId: string, data: string): void {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return;

  const elapsed = (Date.now() - recording.startTime) / 1000;
  // asciinema format: [time, "o", data] for output
  const entry = JSON.stringify([elapsed, "o", data]);
  recording.buffer.push(entry);

  // Flush if buffer is full or enough time has passed
  const shouldFlush =
    recording.buffer.length >= BUFFER_MAX_SIZE ||
    Date.now() - recording.lastFlush >= BUFFER_FLUSH_INTERVAL_MS;

  if (shouldFlush) {
    flushRecordingBuffer(sessionId);
  }
}

/**
 * Record input data (buffered)
 */
export function recordInput(sessionId: string, data: string): void {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return;

  const elapsed = (Date.now() - recording.startTime) / 1000;
  // asciinema format: [time, "i", data] for input
  const entry = JSON.stringify([elapsed, "i", data]);
  recording.buffer.push(entry);

  // Flush if buffer is full or enough time has passed
  const shouldFlush =
    recording.buffer.length >= BUFFER_MAX_SIZE ||
    Date.now() - recording.lastFlush >= BUFFER_FLUSH_INTERVAL_MS;

  if (shouldFlush) {
    flushRecordingBuffer(sessionId);
  }
}

/**
 * Stop recording and finalize.
 * Awaits any in-flight async flushes before performing the final sync write
 * to prevent interleaving with the async write queue.
 */
export async function stopRecording(
  sessionId: string,
): Promise<RecordingMetadata | null> {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return null;

  // Wait for any in-flight async flushes to complete before final sync write
  const pendingQueue = writeQueues.get(sessionId);
  if (pendingQueue) {
    await pendingQueue;
  }

  // Final flush uses synchronous I/O to guarantee data integrity
  try {
    if (recording.buffer.length > 0) {
      const data = recording.buffer.join("\n") + "\n";
      appendFileSync(recording.filePath, data);
      recording.buffer = [];
    }

    recording.metadata.endTime = Date.now();

    // Write metadata file alongside the cast file
    const metaPath = recording.filePath.replace(".cast", ".json");
    writeFileSync(metaPath, JSON.stringify(recording.metadata, null, 2));
  } catch (err) {
    console.error(
      `[Terminal Recorder] Failed to finalize recording for ${sessionId}:`,
      err,
    );
  }

  // Clean up tracking state regardless of write success
  if (recording.clientSessionId) {
    clientSessionRecordings.delete(recording.clientSessionId);
  }

  activeRecordings.delete(sessionId);
  writeQueues.delete(sessionId);

  console.log(`[Recording] Stopped: ${recording.metadata.id}`);
  return recording.metadata;
}

/**
 * List all recordings
 */
export function listRecordings(): RecordingMetadata[] {
  try {
    const files = readdirSync(RECORDINGS_DIR).filter((f) =>
      f.endsWith(".json"),
    );
    return files
      .map((f) => {
        try {
          const content = readFileSync(join(RECORDINGS_DIR, f), "utf-8");
          return JSON.parse(content) as RecordingMetadata;
        } catch (error) {
          console.error(
            `[Terminal Recorder] Failed to parse recording metadata ${f}:`,
            error,
          );
          return null;
        }
      })
      .filter((r): r is RecordingMetadata => r !== null)
      .sort((a, b) => b.startTime - a.startTime);
  } catch (error) {
    console.error("[Terminal Recorder] Failed to list recordings:", error);
    return [];
  }
}

/**
 * Recording id allowlist (#193).
 *
 * `getRecording`/`deleteRecording` receive a client-supplied `id` over the WS
 * message channel and interpolate it into a filesystem path. Without validation
 * an `id` such as `"../../../../etc/passwd"` would traverse out of
 * RECORDINGS_DIR and read/delete arbitrary `.json`/`.cast` files (the terminal
 * server runs as root in container mode). Confine ids to a strict allowlist —
 * `/`, `\`, `..` (blocked because `.` is disallowed), NUL bytes, and whitespace
 * are all rejected. IDs minted by `startRecording` have the shape
 * `${sessionType}-${Date.now()}-${sessionId.slice(0,8)}` (sessionId is a
 * crypto.randomUUID => hex + `-`), which this pattern accepts.
 */
const RECORDING_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a recording id before it is used in any filesystem path.
 * Returns true only for allowlisted ids whose resolved file stays directly
 * inside RECORDINGS_DIR (lexical, fs-free defense-in-depth).
 */
export function isValidRecordingId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0) return false;
  if (!RECORDING_ID_PATTERN.test(id)) return false;

  // Defense-in-depth: even if the allowlist were ever loosened, ensure the
  // resolved path is a direct child of RECORDINGS_DIR. `resolve()` here is
  // fs-free lexical (string-only) normalization — it does NOT touch the
  // filesystem and does NOT resolve symlinks — so it is deterministic and
  // identical in host-dev and container mode, at the cost of not detecting
  // a symlinked entry inside RECORDINGS_DIR that points elsewhere.
  const resolvedDir = resolve(RECORDINGS_DIR);
  const resolvedFile = resolve(RECORDINGS_DIR, `${id}.json`);
  return dirname(resolvedFile) === resolvedDir;
}

/**
 * Get recording content
 */
export function getRecording(
  id: string,
): { metadata: RecordingMetadata; content: string } | null {
  if (!isValidRecordingId(id)) {
    console.error(
      `[Terminal Recorder] Rejected invalid recording id: ${JSON.stringify(id)}`,
    );
    return null;
  }
  try {
    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    if (!existsSync(metaPath) || !existsSync(castPath)) return null;

    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
    const content = readFileSync(castPath, "utf-8");

    return { metadata, content };
  } catch (error) {
    console.error(`[Terminal Recorder] Failed to get recording ${id}:`, error);
    return null;
  }
}

/**
 * Delete recording
 */
export function deleteRecording(id: string): boolean {
  if (!isValidRecordingId(id)) {
    console.error(
      `[Terminal Recorder] Rejected invalid recording id: ${JSON.stringify(id)}`,
    );
    return false;
  }
  try {
    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    if (existsSync(metaPath)) unlinkSync(metaPath);
    if (existsSync(castPath)) unlinkSync(castPath);

    console.log(`[Recording] Deleted: ${id}`);
    return true;
  } catch (error) {
    console.error(
      `[Terminal Recorder] Failed to delete recording ${id}:`,
      error,
    );
    return false;
  }
}
