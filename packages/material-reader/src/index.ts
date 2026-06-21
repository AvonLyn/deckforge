import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { MaterialDocument, MaterialManifest } from "@deckforge/deck-ir";

export interface MaterialScanOptions {
  maxFileSizeBytes?: number;
  maxFiles?: number;
  maxTotalChars?: number;
  includeUnsupportedPlaceholders?: boolean;
}

export interface UploadedMaterialInput {
  relative_path: string;
  name?: string;
  text: string;
  size?: number;
  mtime?: string;
}

export const DEFAULT_MATERIAL_OPTIONS: Required<MaterialScanOptions> = {
  maxFileSizeBytes: 2 * 1024 * 1024,
  maxFiles: 200,
  maxTotalChars: 300_000,
  includeUnsupportedPlaceholders: true
};

const skippedDirectories = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".next",
  "target",
  "vendor",
  "__pycache__"
]);

const textExtensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".html",
  ".htm",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".cs",
  ".sql",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env.example"
]);

const specialTextNames = new Set(["dockerfile", "docker-compose.yml"]);
const placeholderExtensions = new Set([".docx", ".pdf", ".pptx", ".xlsx", ".xls"]);

export async function scanMaterialFolder(rootPath: string, options: MaterialScanOptions = {}): Promise<MaterialManifest> {
  const resolvedOptions = { ...DEFAULT_MATERIAL_OPTIONS, ...options };
  const root = path.resolve(rootPath);
  const documents: MaterialDocument[] = [];
  const skipped_files: MaterialManifest["skipped_files"] = [];
  const warnings: string[] = [];
  let totalChars = 0;

  async function walk(currentPath: string): Promise<void> {
    if (documents.length >= resolvedOptions.maxFiles) return;
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Failed to read directory ${currentPath}: ${errorMessage(error)}`);
      return;
    }

    for (const entry of entries) {
      if (documents.length >= resolvedOptions.maxFiles) {
        warnings.push(`Material scan stopped at ${resolvedOptions.maxFiles} files.`);
        return;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipPath(entryPath)) continue;
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;

      try {
        const fileStat = await stat(entryPath);
        if (fileStat.size > resolvedOptions.maxFileSizeBytes) {
          skipped_files.push({ path: entryPath, reason: `File exceeds ${resolvedOptions.maxFileSizeBytes} bytes.` });
          continue;
        }
        if (totalChars >= resolvedOptions.maxTotalChars) {
          skipped_files.push({ path: entryPath, reason: "Material character budget exhausted." });
          continue;
        }
        const document = await readMaterialDocument(entryPath, root, resolvedOptions);
        totalChars += document.text.length;
        documents.push(document);
      } catch (error) {
        skipped_files.push({ path: entryPath, reason: errorMessage(error) });
      }
    }
  }

  await walk(root);
  return {
    root_path: root,
    documents,
    skipped_files,
    warnings,
    created_at: new Date().toISOString()
  };
}

export async function createMaterialManifest(rootPath: string, options: MaterialScanOptions = {}): Promise<MaterialManifest> {
  return scanMaterialFolder(rootPath, options);
}

export function createMaterialManifestFromUploadedFiles(
  files: UploadedMaterialInput[],
  options: MaterialScanOptions = {}
): MaterialManifest {
  const resolvedOptions = { ...DEFAULT_MATERIAL_OPTIONS, ...options };
  const documents: MaterialDocument[] = [];
  const skipped_files: MaterialManifest["skipped_files"] = [];
  const warnings: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    if (documents.length >= resolvedOptions.maxFiles) {
      warnings.push(`Material upload stopped at ${resolvedOptions.maxFiles} files.`);
      break;
    }

    const relativePath = safeUploadedRelativePath(file.relative_path || file.name || "");
    if (!relativePath) {
      skipped_files.push({ path: file.relative_path || file.name || "", reason: "Invalid uploaded relative path." });
      continue;
    }

    const declaredSize = file.size ?? Buffer.byteLength(file.text, "utf8");
    if (declaredSize > resolvedOptions.maxFileSizeBytes) {
      skipped_files.push({ path: relativePath, reason: `File exceeds ${resolvedOptions.maxFileSizeBytes} bytes.` });
      continue;
    }
    if (totalChars >= resolvedOptions.maxTotalChars) {
      skipped_files.push({ path: relativePath, reason: "Material character budget exhausted." });
      continue;
    }

    const ext = detectExtension(relativePath);
    const kind = detectDocumentKind(relativePath);
    const docWarnings: string[] = [];
    let text = file.text;
    if (!textExtensions.has(ext) && !specialTextNames.has(path.basename(relativePath).toLowerCase())) {
      docWarnings.push(`Uploaded file type ${ext || relativePath} was accepted as browser-provided text.`);
    }
    if (totalChars + text.length > resolvedOptions.maxTotalChars) {
      text = text.slice(0, Math.max(0, resolvedOptions.maxTotalChars - totalChars));
      docWarnings.push(`Document text truncated to fit ${resolvedOptions.maxTotalChars} total characters.`);
    }
    totalChars += text.length;
    const hash = createHash("sha256").update(`${relativePath}\n${text}`).digest("hex");
    documents.push({
      id: `mat_${hash.slice(0, 16)}`,
      path: `uploaded/${relativePath}`,
      relative_path: relativePath,
      ext,
      kind,
      size: declaredSize,
      mtime: file.mtime ?? new Date().toISOString(),
      hash,
      text,
      summary: summarizeText(text, docWarnings),
      warnings: docWarnings
    });
  }

  return {
    root_path: "uploaded",
    documents,
    skipped_files,
    warnings,
    created_at: new Date().toISOString()
  };
}

export async function readMaterialDocument(
  filePath: string,
  rootPath = path.dirname(filePath),
  options: MaterialScanOptions = {}
): Promise<MaterialDocument> {
  const resolvedOptions = { ...DEFAULT_MATERIAL_OPTIONS, ...options };
  const absolutePath = path.resolve(filePath);
  const fileStat = await stat(absolutePath);
  const ext = detectExtension(absolutePath);
  const kind = detectDocumentKind(absolutePath);
  const warnings: string[] = [];
  let text = "";

  if (textExtensions.has(ext) || specialTextNames.has(path.basename(absolutePath).toLowerCase())) {
    text = await readFile(absolutePath, "utf8");
    if (text.length > resolvedOptions.maxTotalChars) {
      text = text.slice(0, resolvedOptions.maxTotalChars);
      warnings.push(`Document text truncated to ${resolvedOptions.maxTotalChars} characters.`);
    }
  } else if (placeholderExtensions.has(ext)) {
    warnings.push(`${ext} parsing is a placeholder in MVP; file metadata was indexed but full text was not extracted.`);
  } else if (resolvedOptions.includeUnsupportedPlaceholders) {
    warnings.push(`Unsupported file type ${ext || path.basename(absolutePath)} was indexed as metadata only.`);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const hash = await hashFile(absolutePath);
  const document: MaterialDocument = {
    id: `mat_${hash.slice(0, 16)}`,
    path: absolutePath,
    relative_path: slash(path.relative(path.resolve(rootPath), absolutePath)),
    ext,
    kind,
    size: fileStat.size,
    mtime: fileStat.mtime.toISOString(),
    hash,
    text,
    summary: summarizeText(text, warnings),
    warnings
  };
  return document;
}

export function summarizeMaterialDocument(document: MaterialDocument): string {
  return summarizeText(document.text, document.warnings);
}

export function detectDocumentKind(filePath: string): string {
  const ext = detectExtension(filePath);
  const basename = path.basename(filePath).toLowerCase();
  if (basename === "dockerfile" || basename === "docker-compose.yml") return "code";
  if ([".md", ".txt", ".html", ".htm"].includes(ext)) return "document";
  if ([".json", ".csv", ".yaml", ".yml", ".toml", ".ini"].includes(ext)) return "structured";
  if ([".docx", ".pdf", ".pptx", ".xlsx", ".xls"].includes(ext)) return "office";
  if (textExtensions.has(ext)) return "code";
  return "unknown";
}

export function shouldSkipPath(filePath: string): boolean {
  return filePath
    .split(/[\\/]/)
    .some((segment) => skippedDirectories.has(segment));
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function detectExtension(filePath: string): string {
  const basename = path.basename(filePath).toLowerCase();
  if (basename === "dockerfile") return "Dockerfile";
  if (basename === "docker-compose.yml") return "docker-compose.yml";
  if (basename.endsWith(".env.example")) return ".env.example";
  return path.extname(filePath).toLowerCase();
}

function summarizeText(text: string, warnings: string[]): string {
  if (!text.trim()) return warnings[0] ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function slash(input: string): string {
  return input.replaceAll(path.sep, "/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeUploadedRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return "";
  if (path.isAbsolute(normalized)) return "";
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) return "";
  return normalized;
}
