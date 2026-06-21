import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import pptxgen from "pptxgenjs";
import type { DeckIR, ElementIR, SlideIR } from "@deckforge/deck-ir";

export interface PptxCompileResult {
  outputPath: string;
  warnings: string[];
}

export async function compileDeckToPptx(deckIR: DeckIR, outputPath: string): Promise<PptxCompileResult> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const PptxGenJS = resolvePptxConstructor(pptxgen);
  const pptx = new PptxGenJS();
  pptx.author = "DeckForge";
  pptx.company = "DeckForge";
  pptx.subject = deckIR.title;
  pptx.title = deckIR.title;
  pptx.lang = deckIR.language;
  pptx.defineLayout({ name: "DECKFORGE_WIDE", width: deckIR.size.width, height: deckIR.size.height });
  pptx.layout = "DECKFORGE_WIDE";

  const warnings: string[] = [];
  for (const slideIR of deckIR.slides) {
    compileSlide(pptx, slideIR, warnings);
  }

  await pptx.writeFile({ fileName: outputPath });
  return { outputPath, warnings };
}

export function compileSlide(pptx: any, slideIR: SlideIR, warnings: string[] = []): any {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addNotes(slideIR.speaker_note ? `Speaker note: ${slideIR.speaker_note}` : `DeckForge slide: ${slideIR.title}`);
  for (const element of slideIR.elements) {
    compileElement(pptx, slide, element, warnings);
  }
  return slide;
}

export function compileElement(pptx: any, slide: any, element: ElementIR, warnings: string[] = []): void {
  const opts = {
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    margin: 0.05,
    fontFace: element.style.font_family ?? "Microsoft YaHei",
    fontSize: element.style.font_size ?? 16,
    bold: element.style.font_weight === "bold" || Number(element.style.font_weight) >= 600,
    color: cleanColor(element.style.color ?? "#111827"),
    align: element.style.align ?? "left",
    valign: element.style.valign ?? "top",
    fill: element.style.fill ? { color: cleanColor(element.style.fill) } : undefined,
    line: element.style.border ? { color: cleanColor(element.style.border) } : { color: "FFFFFF", transparency: 100 }
  };

  const content = toRecord(element.content);
  if (element.type === "text") {
    slide.addText(String(content["text"] ?? ""), opts);
    return;
  }
  if (element.type === "bullet_list") {
    const items = Array.isArray(content["items"]) ? (content["items"] as unknown[]).map(String) : [];
    slide.addText(items.map((item) => `• ${item}`).join("\n"), opts);
    return;
  }
  if (element.type === "shape") {
    slide.addShape(pptx.ShapeType.rect, {
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      fill: { color: cleanColor(element.style.fill ?? "#E5E7EB") },
      line: element.style.border ? { color: cleanColor(element.style.border) } : { color: cleanColor(element.style.fill ?? "#E5E7EB") }
    });
    return;
  }
  if (element.type === "line") {
    slide.addShape(pptx.ShapeType.line, {
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      line: { color: cleanColor(element.style.border ?? element.style.color ?? "#111827"), width: 1.2 }
    });
    return;
  }
  if (element.type === "image") {
    const src = typeof content["src"] === "string" ? content["src"] : "";
    if (src && existsSync(src)) {
      slide.addImage({ path: src, x: element.x, y: element.y, w: element.w, h: element.h });
    } else {
      warnings.push(`Image not found for element ${element.id}: ${src}`);
    }
    return;
  }
  if (element.type === "table") {
    const rows = Array.isArray(content["rows"]) ? (content["rows"] as unknown[][]) : [];
    slide.addTable(rows.map((row) => row.map((cell) => String(cell))), {
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      border: { color: "CBD5E1", pt: 1 },
      fontFace: element.style.font_family ?? "Microsoft YaHei",
      fontSize: element.style.font_size ?? 12,
      color: cleanColor(element.style.color ?? "#111827")
    });
    return;
  }
  if (element.type === "bar_chart" || element.type === "line_chart" || element.type === "icon" || element.type === "group") {
    warnings.push(`${element.type} is not emitted as a native editable object in MVP; placeholder text was inserted.`);
    slide.addText(String(content["title"] ?? element.type), opts);
    return;
  }
  warnings.push(`Unsupported element ${element.id} of type ${element.type}.`);
}

function cleanColor(value: string): string {
  return value.replace("#", "").slice(0, 6).toUpperCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolvePptxConstructor(input: unknown): new () => any {
  if (typeof input === "function") return input as new () => any;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record["default"] === "function") return record["default"] as new () => any;
  }
  throw new Error("PptxGenJS constructor is not available.");
}
