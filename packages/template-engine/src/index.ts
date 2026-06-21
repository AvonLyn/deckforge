import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  createDefaultTemplateProfile as createDeckIrDefaultTemplateProfile,
  TemplateProfileSchema,
  type TemplateProfile
} from "@deckforge/deck-ir";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function parseTemplateReference(inputPath?: string): Promise<TemplateProfile> {
  if (!inputPath) return createDefaultTemplateProfile();
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".pptx") return parsePptxTemplate(inputPath);
  if (ext === ".html" || ext === ".htm") return parseHtmlTemplate(inputPath);
  if (imageExtensions.has(ext)) return parseImageTemplate(inputPath);
  if (ext === ".pdf") return parsePdfTemplate(inputPath);
  if (ext === ".json") return loadTemplateProfile(inputPath);
  return {
    ...createDefaultTemplateProfile(),
    id: `template_unsupported_${Date.now()}`,
    name: path.basename(inputPath),
    source_type: "unsupported",
    source_path: path.resolve(inputPath),
    warnings: [`Unsupported template reference: ${ext || path.basename(inputPath)}`]
  };
}

export async function parsePptxTemplate(inputPath: string): Promise<TemplateProfile> {
  const fileStat = await stat(inputPath);
  return {
    ...createDefaultTemplateProfile(),
    id: stableTemplateId(inputPath),
    name: path.basename(inputPath),
    source_type: "pptx",
    source_path: path.resolve(inputPath),
    notes: `PPTX template metadata indexed (${fileStat.size} bytes).`,
    warnings: [
      "MVP reads PPTX as a template reference and keeps slide-size defaults; master slide semantic extraction is TODO."
    ]
  };
}

export async function parseHtmlTemplate(inputPath: string): Promise<TemplateProfile> {
  const html = await readFile(inputPath, "utf8");
  return {
    ...createDefaultTemplateProfile(),
    id: stableTemplateId(inputPath),
    name: path.basename(inputPath),
    source_type: "html",
    source_path: path.resolve(inputPath),
    theme_colors: extractColors(html),
    fonts: extractFonts(html),
    warnings: ["HTML template is used as visual reference in MVP; semantic layout extraction is TODO."]
  };
}

export async function parseImageTemplate(inputPath: string): Promise<TemplateProfile> {
  const fileStat = await stat(inputPath);
  return {
    ...createDefaultTemplateProfile(),
    id: stableTemplateId(inputPath),
    name: path.basename(inputPath),
    source_type: "image",
    source_path: path.resolve(inputPath),
    notes: `Image template reference indexed (${fileStat.size} bytes).`,
    warnings: ["Image template is a visual reference only in MVP; VLM style analysis is TODO."]
  };
}

export async function parsePdfTemplate(inputPath: string): Promise<TemplateProfile> {
  const fileStat = await stat(inputPath);
  return {
    ...createDefaultTemplateProfile(),
    id: stableTemplateId(inputPath),
    name: path.basename(inputPath),
    source_type: "pdf",
    source_path: path.resolve(inputPath),
    notes: `PDF template reference indexed (${fileStat.size} bytes).`,
    warnings: ["PDF template text/visual extraction is TODO in MVP."]
  };
}

export function createDefaultTemplateProfile(): TemplateProfile {
  return createDeckIrDefaultTemplateProfile();
}

export async function loadTemplateProfile(profilePath: string): Promise<TemplateProfile> {
  const raw = await readFile(profilePath, "utf8");
  const parsed = TemplateProfileSchema.parse(JSON.parse(raw));
  return { ...parsed, source_path: path.resolve(profilePath) };
}

function extractColors(text: string): string[] {
  return Array.from(new Set(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])).slice(0, 8);
}

function extractFonts(text: string): string[] {
  const matches = text.match(/font-family\s*:\s*([^;}{]+)/gi) ?? [];
  return Array.from(
    new Set(matches.map((value) => value.split(":")[1]?.replaceAll(/["']/g, "").trim()).filter(Boolean) as string[])
  ).slice(0, 8);
}

function stableTemplateId(inputPath: string): string {
  return `template_${Buffer.from(path.resolve(inputPath)).toString("hex").slice(0, 16)}`;
}
