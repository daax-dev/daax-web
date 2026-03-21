/**
 * API Tools - Data Storage Utilities
 *
 * Handles saving and loading API templates and credentials
 * Supports both container mode and host mode
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync,
  accessSync,
  constants,
} from "fs";
import { join, basename } from "path";

/**
 * Check if a path is a valid, writable directory
 */
function isValidDirectory(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    const stat = statSync(path);
    if (!stat.isDirectory()) return false;
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the data directory path for API tools
 * Supports container mode and host mode
 */
export function getApiToolsDataDir(): string {
  // Configurable override via environment variable
  const envPath = process.env.API_TOOLS_DATA_DIR;
  if (envPath && envPath.trim().length > 0 && isValidDirectory(envPath)) {
    return envPath;
  }

  // Container mode: workspace mounted at /workspace (parent prj/ directory)
  const containerBasePath = "/workspace/.data";
  const containerPath = join(containerBasePath, "api-tools");
  if (isValidDirectory(containerBasePath)) {
    try {
      if (!existsSync(containerPath)) {
        mkdirSync(containerPath, { recursive: true });
      }
      if (isValidDirectory(containerPath)) {
        return containerPath;
      }
    } catch {
      // Fall through to host mode if we can't create or validate the container directory
    }
  }

  // Host mode: relative to cwd
  const hostPath = join(process.cwd(), ".data", "api-tools");
  return hostPath;
}

/**
 * Ensure the API tools data directory exists
 */
export function ensureApiToolsDataDir(): string {
  const dir = getApiToolsDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the path to a template file
 */
export function getTemplatePath(type: string, name: string): string {
  const dir = ensureApiToolsDataDir();
  // Sanitize type and name to prevent path traversal
  const sanitizedType = basename(type).replace(/[^a-zA-Z0-9-_]/g, "_");
  const sanitizedName = basename(name).replace(/[^a-zA-Z0-9-_]/g, "_");
  return join(dir, `${sanitizedType}_${sanitizedName}.json`);
}

/**
 * Get the path to the credentials file
 */
export function getCredentialsPath(): string {
  const dir = ensureApiToolsDataDir();
  return join(dir, "credentials.json");
}

/**
 * List all templates for a given API type
 */
export function listTemplates(type: string): string[] {
  const dir = ensureApiToolsDataDir();
  if (!existsSync(dir)) {
    return [];
  }

  // Sanitize type to prevent directory traversal or injection
  const sanitizedType = basename(type).replace(/[^a-zA-Z0-9-_]/g, "_");
  const files = readdirSync(dir);
  const prefix = `${sanitizedType}_`;
  const suffix = ".json";

  return files
    .filter((file) => file.startsWith(prefix) && file.endsWith(suffix))
    .map((file) => file.slice(prefix.length, -suffix.length));
}

/**
 * Load a template
 */
export function loadTemplate<T>(type: string, name: string): T | null {
  try {
    const path = getTemplatePath(type, name);
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`[API Tools] Error loading template ${type}/${name}:`, error);
    return null;
  }
}

/**
 * Save a template
 */
export function saveTemplate<T>(type: string, name: string, data: T): void {
  try {
    const path = getTemplatePath(type, name);
    const content = JSON.stringify(data, null, 2);
    writeFileSync(path, content, "utf-8");
  } catch (error) {
    console.error(`[API Tools] Error saving template ${type}/${name}:`, error);
    throw error;
  }
}

/**
 * Delete a template
 * @returns true if the template was deleted, false if it didn't exist
 */
export function deleteTemplate(type: string, name: string): boolean {
  try {
    const path = getTemplatePath(type, name);
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  } catch (error) {
    console.error(
      `[API Tools] Error deleting template ${type}/${name}:`,
      error,
    );
    throw error;
  }
}

/**
 * Load credentials
 *
 * ⚠️ SECURITY WARNING: Credentials are currently stored in plain text.
 * Do not store production secrets. This feature is intended for development
 * and testing purposes only. Encryption will be added in a future iteration.
 */
export function loadCredentials(): Record<string, string> {
  try {
    const path = getCredentialsPath();
    if (!existsSync(path)) {
      return {};
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Record<string, string>;
  } catch (error) {
    console.error("[API Tools] Error loading credentials:", error);
    return {};
  }
}

/**
 * Save credentials
 *
 * ⚠️ SECURITY WARNING: Credentials are currently stored in plain text.
 * Do not store production secrets. This feature is intended for development
 * and testing purposes only. Encryption will be added in a future iteration.
 */
export function saveCredentials(credentials: Record<string, string>): void {
  // Warn in production - credentials storage is for development/testing only
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[API Tools] WARNING: Storing credentials in production. " +
        "Consider using a secure vault service instead.",
    );
  }

  try {
    const path = getCredentialsPath();
    const content = JSON.stringify(credentials, null, 2);
    writeFileSync(path, content, "utf-8");
  } catch (error) {
    console.error("[API Tools] Error saving credentials:", error);
    throw error;
  }
}
