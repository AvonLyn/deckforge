import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function getWorkspaceDir(): string {
  const baseDir = process.env.INIT_CWD ?? process.cwd();
  return path.resolve(baseDir, process.env.DECKFORGE_WORKSPACE_DIR ?? ".deckforge");
}

export function ensureDir(dirPath: string): string {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function getArtifactsDir(deckId: string): string {
  return ensureDir(path.join(getWorkspaceDir(), "artifacts", deckId));
}

export function toApiError(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
