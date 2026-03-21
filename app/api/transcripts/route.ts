import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Get Claude projects directory
function getClaudeProjectsDir(): string {
  // Check environment variable first
  const envPath = process.env.CLAUDE_PROJECTS_DIR;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // Container mode: mount point for Claude data
  const containerPath = "/host-claude/projects";
  if (existsSync(containerPath)) {
    return containerPath;
  }

  // Host mode: default Claude location
  const hostPath = join(homedir(), ".claude", "projects");
  if (existsSync(hostPath)) {
    return hostPath;
  }

  return hostPath; // Return default even if doesn't exist
}

export interface TranscriptSession {
  id: string;
  sessionId: string;
  projectPath: string;
  projectName: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string | null;
  fullPath: string;
  size: number;
}

interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
  projectPath: string;
  isSidechain: boolean;
}

interface SessionIndex {
  version: number;
  entries: SessionIndexEntry[];
}

export async function GET() {
  const projectsDir = getClaudeProjectsDir();

  try {
    if (!existsSync(projectsDir)) {
      console.log(`[transcripts API] Claude projects directory not found: ${projectsDir}`);
      return NextResponse.json({
        transcripts: [],
        path: projectsDir,
        hint: "Claude projects directory not found. In container mode, mount ~/.claude to /host-claude",
      });
    }

    console.log(`[transcripts API] Reading from: ${projectsDir}`);
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });
    const allSessions: TranscriptSession[] = [];

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectPath = join(projectsDir, projectDir.name);
      const indexPath = join(projectPath, "sessions-index.json");

      if (!existsSync(indexPath)) continue;

      try {
        const indexContent = await readFile(indexPath, "utf-8");
        const index: SessionIndex = JSON.parse(indexContent);

        for (const entry of index.entries) {
          // Skip sidechains
          if (entry.isSidechain) continue;

          // Translate fullPath from host path to container path if needed
          // e.g., /home/jpoley/.claude/projects/xxx -> /host-claude/projects/xxx
          let sessionFilePath = entry.fullPath;
          if (!existsSync(sessionFilePath) && projectsDir.startsWith("/host-claude")) {
            // Extract relative path from the fullPath
            const match = entry.fullPath.match(/\.claude\/projects\/(.+)$/);
            if (match) {
              sessionFilePath = join("/host-claude/projects", match[1]);
            }
          }

          // Get file size
          let size = 0;
          try {
            const fileStat = await stat(sessionFilePath);
            size = fileStat.size;
          } catch {
            // File might not exist anymore
            continue;
          }

          // Extract project name from directory name
          // Format: -home-jpoley-prj-ps-daax -> prj/ps/daax
          // Use delimiter-based approach to handle usernames with hyphens (e.g., "jane-doe")
          //
          // Note: This heuristic approach parses directory names using common markers.
          // If parsing fails or produces unexpected results, the raw directory name
          // is used as a fallback. Consider consulting Claude's project configuration
          // for more reliable project name extraction in the future.
          let projectName = projectDir.name; // Default: use raw directory name as fallback
          let parsingSucceeded = false;

          const prjMarker = "-prj-";
          const prjIndex = projectDir.name.indexOf(prjMarker);

          if (prjIndex !== -1) {
            // Found "-prj-" marker - extract everything after it and convert to path
            const rest = projectDir.name.slice(prjIndex + prjMarker.length);
            if (rest) {
              projectName = `prj/${rest.replace(/-/g, "/")}`;
              parsingSucceeded = true;
            }
          }

          if (!parsingSucceeded) {
            // Fallback: try to find other common markers
            // Look for common project root markers
            const markers = ["-workspace-", "-projects-", "-code-", "-src-"];
            for (const marker of markers) {
              const idx = projectDir.name.indexOf(marker);
              if (idx !== -1) {
                const rest = projectDir.name.slice(idx + marker.length);
                if (rest) {
                  projectName = rest.replace(/-/g, "/");
                  parsingSucceeded = true;
                  break;
                }
              }
            }
          }

          // If no markers matched, use raw directory name with dashes converted to slashes
          // This handles cases where directory naming convention differs from expected patterns
          if (!parsingSucceeded) {
            // Keep projectName as the raw directory name for clarity in UI
            // rather than blindly converting all dashes which could be misleading
            projectName = projectDir.name;
          }

          allSessions.push({
            id: entry.sessionId,
            sessionId: entry.sessionId,
            projectPath: entry.projectPath,
            projectName,
            firstPrompt: entry.firstPrompt?.slice(0, 200) || "",
            summary: entry.summary || "",
            messageCount: entry.messageCount,
            created: entry.created,
            modified: entry.modified,
            gitBranch: entry.gitBranch || null,
            fullPath: sessionFilePath, // Use translated path
            size,
          });
        }
      } catch (err) {
        console.error(`Error reading sessions-index.json from ${projectPath}:`, err);
      }
    }

    // Sort by modified date, newest first
    allSessions.sort(
      (a, b) =>
        new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    console.log(`[transcripts API] Found ${allSessions.length} sessions`);

    return NextResponse.json({
      transcripts: allSessions,
      path: projectsDir,
    });
  } catch (error) {
    console.error("Error reading Claude projects:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to read transcripts",
        details: errorMessage,
        transcripts: [],
      },
      { status: 500 }
    );
  }
}
