/**
 * HTML Export for Terminal Recordings
 *
 * Generates standalone HTML files with embedded asciinema-player
 * for viewing terminal recordings in a web browser.
 */

import type { TerminalRecording } from "../types";

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(startTime: number, endTime?: number): string {
  if (!endTime) return "In progress";
  const duration = endTime - startTime;
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format timestamp to ISO string
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Format timestamp to human-readable string
 */
function formatHumanTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Git metadata for the recording
 */
export interface GitMetadata {
  branch?: string;
  commit?: string;
  remote?: string;
  projectPath?: string;
}

/**
 * Generate a standalone HTML file for a terminal recording
 */
export function generateRecordingHtml(
  metadata: TerminalRecording,
  castContent: string,
  gitInfo?: GitMetadata,
): string {
  const title = metadata.title || `${metadata.sessionType} recording`;
  const duration = formatDuration(metadata.startTime, metadata.endTime);
  const timestamp = formatHumanTime(metadata.startTime);
  const isoTimestamp = formatTimestamp(metadata.startTime);

  // Note: Cast content is embedded via external file reference
  // For future inline embedding, parse: const lines = castContent.trim().split('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Terminal Recording</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.css">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #30363d;
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
      color: #e6edf3;
    }
    .header .subtitle {
      color: #8b949e;
      font-size: 14px;
    }
    .metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
      padding: 16px;
      background: #161b22;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .metadata-item {
      display: flex;
      flex-direction: column;
    }
    .metadata-label {
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .metadata-value {
      font-size: 14px;
      color: #e6edf3;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      word-break: break-all;
    }
    .metadata-value.command {
      background: #21262d;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
    }
    .player-container {
      background: #0d1117;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #30363d;
    }
    .player-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot.red { background: #ff5f56; }
    .dot.yellow { background: #ffbd2e; }
    .dot.green { background: #27c93f; }
    .player-title {
      flex: 1;
      text-align: center;
      font-size: 13px;
      color: #8b949e;
    }
    #player {
      min-height: 400px;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #30363d;
      font-size: 12px;
      color: #8b949e;
      text-align: center;
    }
    .footer a {
      color: #58a6ff;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.completed {
      background: #238636;
      color: #fff;
    }
    .badge.in-progress {
      background: #9e6a03;
      color: #fff;
    }
    @media (max-width: 600px) {
      body { padding: 12px; }
      .metadata { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">
        Terminal recording captured on ${escapeHtml(timestamp)}
        <span class="badge ${metadata.endTime ? "completed" : "in-progress"}">
          ${metadata.endTime ? "Completed" : "In Progress"}
        </span>
      </div>
    </div>

    <div class="metadata">
      <div class="metadata-item">
        <span class="metadata-label">Session Type</span>
        <span class="metadata-value">${escapeHtml(metadata.sessionType)}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Duration</span>
        <span class="metadata-value">${escapeHtml(duration)}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Terminal Size</span>
        <span class="metadata-value">${metadata.cols}×${metadata.rows}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Recorded</span>
        <span class="metadata-value">
          <time datetime="${isoTimestamp}">${escapeHtml(timestamp)}</time>
        </span>
      </div>
      <div class="metadata-item" style="grid-column: 1 / -1;">
        <span class="metadata-label">Command</span>
        <span class="metadata-value command">${escapeHtml(metadata.command)}</span>
      </div>
      ${
        gitInfo?.branch
          ? `
      <div class="metadata-item">
        <span class="metadata-label">Git Branch</span>
        <span class="metadata-value">${escapeHtml(gitInfo.branch)}</span>
      </div>
      `
          : ""
      }
      ${
        gitInfo?.commit
          ? `
      <div class="metadata-item">
        <span class="metadata-label">Git Commit</span>
        <span class="metadata-value">${escapeHtml(gitInfo.commit.slice(0, 8))}</span>
      </div>
      `
          : ""
      }
      ${
        gitInfo?.projectPath
          ? `
      <div class="metadata-item" style="grid-column: 1 / -1;">
        <span class="metadata-label">Project</span>
        <span class="metadata-value">${escapeHtml(gitInfo.projectPath)}</span>
      </div>
      `
          : ""
      }
    </div>

    <div class="player-container">
      <div class="player-header">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
        <span class="player-title">${escapeHtml(metadata.command)}</span>
      </div>
      <div id="player"></div>
    </div>

    <div class="footer">
      <p>
        Recording ID: <code>${escapeHtml(metadata.id)}</code>
      </p>
      <p>
        Generated by <a href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener">Daax</a>
        using <a href="https://asciinema.org" target="_blank" rel="noopener">asciinema</a>
      </p>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.min.js"></script>
  <script>
    // Embedded recording data
    const castData = ${JSON.stringify(castContent)};

    // Create player
    AsciinemaPlayer.create(
      { data: castData },
      document.getElementById('player'),
      {
        theme: 'monokai',
        fit: 'width',
        idleTimeLimit: 2,
        poster: 'npt:0:0',
        preload: true,
      }
    );
  </script>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Reduce a client-controlled value to a filesystem-safe token.
 *
 * Any character outside `[A-Za-z0-9_-]` (path separators, `.`, whitespace,
 * etc.) is replaced with `-`, so the result can never contain `/`, `\`, or
 * `..` — closing the write-side path-traversal where the raw value would flow
 * into `join(outputDir, filename)` (#193).
 */
export function slugifyFilenamePart(value: string): string {
  return String(value).replace(/[^A-Za-z0-9_-]/g, "-");
}

/**
 * Generate a filename for the HTML export
 */
export function generateExportFilename(metadata: TerminalRecording): string {
  const date = new Date(metadata.startTime);
  // Derive both the date and time from the same UTC `toISOString()` value so
  // the filename is timezone-independent. Mixing a UTC date with a
  // local-time `toTimeString()` clock (the previous behavior) let the two
  // components describe different moments and made the filename vary by
  // runner timezone.
  const isoParts = date.toISOString().split("T"); // ["YYYY-MM-DD", "HH:MM:SS.sssZ"]
  const dateStr = isoParts[0]; // YYYY-MM-DD
  const timeStr = isoParts[1].split(".")[0].replace(/:/g, ""); // HHMMSS (UTC)
  // `sessionType` is a raw client-controlled value persisted in the recording
  // metadata; slug it so it cannot inject path separators or `..`.
  const sessionType = slugifyFilenamePart(metadata.sessionType);
  // `id` is server-generated and route-validated, but slug its tail defensively
  // so every component of the filename is guaranteed separator-free.
  const idSuffix = slugifyFilenamePart(metadata.id.slice(-8));
  return `${dateStr}-${timeStr}-${sessionType}-${idSuffix}.html`;
}
