import type { UploadedMaterial } from "../types/index.js";

const MAX_CLIENT_FILE_BYTES = 2 * 1024 * 1024;

export async function readUploadedMaterials(fileList: FileList | File[]): Promise<UploadedMaterial[]> {
  const files = Array.from(fileList);
  const materials: UploadedMaterial[] = [];
  for (const file of files) {
    if (file.size > MAX_CLIENT_FILE_BYTES) continue;
    const relativePath = safeRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    if (!relativePath) continue;
    materials.push({
      relative_path: relativePath,
      name: file.name,
      text: await file.text(),
      size: file.size,
      mtime: new Date(file.lastModified || Date.now()).toISOString()
    });
  }
  return materials;
}

export function safeRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return "";
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) return "";
  return normalized;
}
