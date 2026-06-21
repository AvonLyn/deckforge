import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkElementBounds,
  checkElementOverlap,
  checkSlideDensity,
  elementTypes,
  type DeckIR,
  type DeckIrIssue,
  type ElementIR
} from "@deckforge/deck-ir";

export interface QaReport {
  deck_id: string;
  created_at: string;
  static_issues: DeckIrIssue[];
  html_screenshots: string[];
  pptx_screenshots: string[];
  comparisons: string[];
  warnings: string[];
}

export async function renderHtmlToScreenshots(htmlPath: string, outputDir: string): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(pathToFileURL(htmlPath).toString());
    const slides = await page.locator(".slide").count();
    const outputs: string[] = [];
    for (let i = 0; i < Math.max(1, slides); i += 1) {
      if (i > 0) await page.keyboard.press("ArrowRight");
      const outPath = path.join(outputDir, `html-slide-${i + 1}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      outputs.push(outPath);
    }
    await browser.close();
    return outputs;
  } catch {
    return [];
  }
}

export async function renderPptxToScreenshots(pptxPath: string, outputDir: string): Promise<{ screenshots: string[]; warnings: string[] }> {
  await mkdir(outputDir, { recursive: true });
  if (!existsSync(pptxPath)) return { screenshots: [], warnings: [`PPTX not found: ${pptxPath}`] };
  if (!hasLibreOffice()) {
    return { screenshots: [], warnings: ["PPTX rendering backend not available"] };
  }
  return {
    screenshots: [],
    warnings: ["LibreOffice detected, but PPTX screenshot conversion is reserved for the next MVP slice."]
  };
}

export function compareScreenshots(htmlScreenshots: string[], pptxScreenshots: string[]): string[] {
  if (htmlScreenshots.length === 0) return ["HTML screenshots were not generated."];
  if (pptxScreenshots.length === 0) return ["PPTX screenshots were not generated."];
  return [`Queued visual comparison for ${Math.min(htmlScreenshots.length, pptxScreenshots.length)} slide pairs.`];
}

export function runStaticDeckQa(deckIR: DeckIR): DeckIrIssue[] {
  const issues: DeckIrIssue[] = [
    ...checkElementBounds(deckIR),
    ...checkElementOverlap(deckIR),
    ...checkSlideDensity(deckIR)
  ];

  for (const slide of deckIR.slides) {
    for (const element of slide.elements) {
      issues.push(...checkElementTextLength(slide.id, element));
      issues.push(...checkFontSize(slide.id, element));
      issues.push(...checkImagePath(slide.id, element));
      if (!elementTypes.includes(element.type)) {
        issues.push({
          code: "UNSUPPORTED_ELEMENT_TYPE",
          message: `Unsupported element type ${element.type}.`,
          slide_id: slide.id,
          node_id: element.id,
          severity: "warning"
        });
      }
      if (deckIR.template_profile.logo_safe_area && intersects(element, deckIR.template_profile.logo_safe_area)) {
        issues.push({
          code: "LOGO_SAFE_AREA_CONFLICT",
          message: `Element ${element.id} intersects the logo safe area.`,
          slide_id: slide.id,
          node_id: element.id,
          severity: "warning"
        });
      }
    }
  }
  return issues;
}

export async function generateQaReport(input: {
  deckIR: DeckIR;
  outputDir: string;
  htmlPath?: string;
  pptxPath?: string;
}): Promise<{ report: QaReport; jsonPath: string; markdownPath: string }> {
  await mkdir(input.outputDir, { recursive: true });
  const htmlScreenshots = input.htmlPath ? await renderHtmlToScreenshots(input.htmlPath, path.join(input.outputDir, "html-screenshots")) : [];
  const pptxResult = input.pptxPath
    ? await renderPptxToScreenshots(input.pptxPath, path.join(input.outputDir, "pptx-screenshots"))
    : { screenshots: [], warnings: ["No PPTX path provided for render QA."] };
  const report: QaReport = {
    deck_id: input.deckIR.id,
    created_at: new Date().toISOString(),
    static_issues: runStaticDeckQa(input.deckIR),
    html_screenshots: htmlScreenshots,
    pptx_screenshots: pptxResult.screenshots,
    comparisons: compareScreenshots(htmlScreenshots, pptxResult.screenshots),
    warnings: pptxResult.warnings
  };
  const jsonPath = path.join(input.outputDir, "qa-report.json");
  const markdownPath = path.join(input.outputDir, "qa-report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(markdownPath, qaReportToMarkdown(report), "utf8");
  return { report, jsonPath, markdownPath };
}

function qaReportToMarkdown(report: QaReport): string {
  const issueLines = report.static_issues.length
    ? report.static_issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`).join("\n")
    : "- No static DeckIR issues found.";
  const warnings = report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- None";
  return `# DeckForge QA Report

- Deck: ${report.deck_id}
- Created: ${report.created_at}

## Static DeckIR QA
${issueLines}

## Render Warnings
${warnings}

## Comparison
${report.comparisons.map((item) => `- ${item}`).join("\n")}
`;
}

function checkElementTextLength(slideId: string, element: ElementIR): DeckIrIssue[] {
  const text = extractText(element.content);
  if (text.length <= 280) return [];
  return [{
    code: "TEXT_TOO_LONG",
    message: `Element ${element.id} has ${text.length} characters.`,
    slide_id: slideId,
    node_id: element.id,
    severity: "warning"
  }];
}

function checkFontSize(slideId: string, element: ElementIR): DeckIrIssue[] {
  if (!element.style.font_size || element.style.font_size >= 10) return [];
  return [{
    code: "FONT_TOO_SMALL",
    message: `Element ${element.id} font size is below 10px.`,
    slide_id: slideId,
    node_id: element.id,
    severity: "warning"
  }];
}

function checkImagePath(slideId: string, element: ElementIR): DeckIrIssue[] {
  if (element.type !== "image") return [];
  const content = element.content && typeof element.content === "object" ? (element.content as Record<string, unknown>) : {};
  const src = String(content["src"] ?? "");
  if (!src || existsSync(src)) return [];
  return [{
    code: "IMAGE_PATH_MISSING",
    message: `Image path does not exist: ${src}`,
    slide_id: slideId,
    node_id: element.id,
    severity: "warning"
  }];
}

function extractText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join(" ");
  if (typeof value === "object") return Object.values(value).map(extractText).join(" ");
  return String(value);
}

function intersects(a: ElementIR, b: { x: number; y: number; w: number; h: number }): boolean {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0;
}

function hasLibreOffice(): boolean {
  return spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0 ||
    spawnSync("libreoffice", ["--version"], { stdio: "ignore" }).status === 0;
}
