import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeckIR, ElementIR, SlideIR } from "@deckforge/deck-ir";

export async function exportHtmlDeck(deckIR: DeckIR, outputDir: string): Promise<{ htmlPath: string; html: string }> {
  await mkdir(outputDir, { recursive: true });
  const html = renderDeckToHtml(deckIR);
  const htmlPath = path.join(outputDir, "index.html");
  await writeFile(htmlPath, html, "utf8");
  await writeFile(path.join(outputDir, "deck.json"), JSON.stringify(deckIR, null, 2), "utf8");
  return { htmlPath, html };
}

export function renderDeckToHtml(deckIR: DeckIR): string {
  const slides = deckIR.slides.map((slide) => renderSlideToHtml(slide, deckIR.size.width, deckIR.size.height)).join("\n");
  return `<!doctype html>
<html lang="${escapeAttr(deckIR.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(deckIR.title)}</title>
  <style>
    :root {
      --df-slide-w: ${deckIR.size.width};
      --df-slide-h: ${deckIR.size.height};
      --df-accent: ${String(deckIR.theme["accent"] ?? "#0f766e")};
      --df-bg: #eef2f7;
      --df-text: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--df-bg);
      color: var(--df-text);
      font-family: "Microsoft YaHei", "Inter", Arial, sans-serif;
    }
    .deckforge-preview {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .slide {
      position: relative;
      container-type: inline-size;
      width: min(92vw, 1180px);
      aspect-ratio: ${deckIR.size.width} / ${deckIR.size.height};
      background: #fff;
      border: 1px solid #dbe3ea;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
      overflow: hidden;
      display: none;
    }
    .slide.is-active { display: block; }
    .element {
      position: absolute;
      padding: 0.08in;
      overflow: hidden;
      line-height: 1.18;
      font-size: max(10px, calc(var(--df-font-size, 16) * 0.1cqw));
      outline: 1px solid transparent;
      transition: outline-color 140ms ease, background-color 140ms ease;
    }
    .element.text { overflow: visible; }
    .element:hover, .element:focus {
      outline-color: var(--df-accent);
      background: rgba(15, 118, 110, 0.05);
    }
    .element ul { margin: 0; padding-left: 1.1em; }
    .element li { margin: 0.2em 0; }
    .shape { padding: 0; }
    .toolbar {
      position: fixed;
      left: 24px;
      bottom: 20px;
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,0.92);
      border: 1px solid #dbe3ea;
      font-size: 13px;
    }
    .toolbar button {
      border: 1px solid #cbd5e1;
      background: #fff;
      border-radius: 6px;
      padding: 6px 9px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="deckforge-preview" data-deck-id="${escapeAttr(deckIR.id)}">
    ${slides}
  </main>
  <nav class="toolbar" aria-label="slide navigation">
    <button type="button" data-prev>上一页</button>
    <span><strong data-index>1</strong> / ${deckIR.slides.length}</span>
    <button type="button" data-next>下一页</button>
  </nav>
  <script>
    const slides = Array.from(document.querySelectorAll(".slide"));
    let index = 0;
    function show(next) {
      index = Math.max(0, Math.min(slides.length - 1, next));
      slides.forEach((slide, i) => slide.classList.toggle("is-active", i === index));
      document.querySelector("[data-index]").textContent = String(index + 1);
    }
    document.querySelector("[data-prev]").addEventListener("click", () => show(index - 1));
    document.querySelector("[data-next]").addEventListener("click", () => show(index + 1));
    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight") show(index + 1);
    });
    show(0);
  </script>
</body>
</html>`;
}

export function renderSlideToHtml(slideIR: SlideIR, deckWidth = 13.333, deckHeight = 7.5): string {
  const elements = slideIR.elements.map((element) => renderElementToHtml(element, slideIR.id, deckWidth, deckHeight)).join("\n");
  return `<section class="slide" data-slide-id="${escapeAttr(slideIR.id)}" data-slide-index="${slideIR.index}">
${elements}
</section>`;
}

export function renderElementToHtml(elementIR: ElementIR, slideId = "", deckWidth = 13.333, deckHeight = 7.5): string {
  const style = [
    `left:${pct(elementIR.x, deckWidth)}%`,
    `top:${pct(elementIR.y, deckHeight)}%`,
    `width:${pct(elementIR.w, deckWidth)}%`,
    `height:${pct(elementIR.h, deckHeight)}%`,
    elementIR.style.font_family ? `font-family:${cssValue(elementIR.style.font_family)}` : "",
    elementIR.style.font_size ? `--df-font-size:${elementIR.style.font_size}` : "",
    elementIR.style.font_weight ? `font-weight:${elementIR.style.font_weight}` : "",
    elementIR.style.color ? `color:${elementIR.style.color}` : "",
    elementIR.style.fill ? `background:${elementIR.style.fill}` : "",
    elementIR.style.border ? `border:1px solid ${elementIR.style.border}` : "",
    elementIR.style.opacity !== undefined ? `opacity:${elementIR.style.opacity}` : "",
    elementIR.style.align ? `text-align:${elementIR.style.align}` : ""
  ]
    .filter(Boolean)
    .join(";");
  const attrs = `class="element ${escapeAttr(elementIR.type)}" tabindex="0" data-slide-id="${escapeAttr(slideId)}" data-node-id="${escapeAttr(elementIR.id)}" data-element-type="${escapeAttr(elementIR.type)}" style="${escapeAttr(style)}"`;
  return `<div ${attrs}>${renderElementContent(elementIR)}</div>`;
}

function renderElementContent(element: ElementIR): string {
  const content = toRecord(element.content);
  if (element.type === "bullet_list") {
    const items = Array.isArray(content["items"]) ? (content["items"] as unknown[]).map(String) : [];
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  if (element.type === "table") {
    const rows = Array.isArray(content["rows"]) ? (content["rows"] as unknown[][]) : [];
    return `<table>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`)
      .join("")}</table>`;
  }
  if (element.type === "image" && typeof content["src"] === "string") {
    return `<img src="${escapeAttr(content["src"])}" alt="${escapeAttr(String(content["alt"] ?? ""))}" style="width:100%;height:100%;object-fit:contain;" />`;
  }
  if (element.type === "shape" || element.type === "line") return "";
  if (element.type === "bar_chart" || element.type === "line_chart") return escapeHtml(String(content["title"] ?? element.type));
  return escapeHtml(String(content["text"] ?? content["label"] ?? ""));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pct(value: number, total: number): string {
  return ((value / total) * 100).toFixed(4);
}

function cssValue(value: string): string {
  return value.includes(" ") ? `"${value.replaceAll('"', "")}"` : value;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
