import type React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DECKFORGE_SLIDE_SIZE, type DeckIR, type ElementIR, type SlideIR } from "@deckforge/deck-ir";
import type { SelectedElement } from "../types/index.js";

interface SlideCanvasProps {
  deck: DeckIR | null;
  activeIndex: number;
  selected: SelectedElement | null;
  onSelect: (selection: SelectedElement) => void;
  onNavigate: (nextIndex: number) => void;
}

export function SlideCanvas({ deck, activeIndex, selected, onSelect, onNavigate }: SlideCanvasProps) {
  if (!deck) {
    return (
      <section className="preview-empty" aria-label="HTML 预览空状态">
        <h2>HTML 预览</h2>
        <p>生成任务后，这里会显示从 DeckIR 渲染出的 slide deck。点击文本、列表或图片即可创建局部评论。</p>
      </section>
    );
  }

  const slide = deck.slides[activeIndex] ?? deck.slides[0];
  if (!slide) return null;

  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <div className="preview-toolbar">
        <div>
          <h2 id="preview-title">HTML 预览</h2>
          <p>{deck.title}</p>
        </div>
        <div className="slide-nav">
          <button type="button" onClick={() => onNavigate(activeIndex - 1)} disabled={activeIndex === 0} aria-label="上一页">
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <span>{activeIndex + 1} / {deck.slides.length}</span>
          <button type="button" onClick={() => onNavigate(activeIndex + 1)} disabled={activeIndex >= deck.slides.length - 1} aria-label="下一页">
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
      <div className="slide-stage">
        <div className="slide-canvas" data-slide-id={slide.id}>
          {slide.elements.map((element) => (
            <DeckElement
              key={element.id}
              element={element}
              slide={slide}
              isSelected={selected?.element.id === element.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface DeckElementProps {
  element: ElementIR;
  slide: SlideIR;
  isSelected: boolean;
  onSelect: (selection: SelectedElement) => void;
}

function DeckElement({ element, slide, isSelected, onSelect }: DeckElementProps) {
  const style = {
    left: `${(element.x / DECKFORGE_SLIDE_SIZE.width) * 100}%`,
    top: `${(element.y / DECKFORGE_SLIDE_SIZE.height) * 100}%`,
    width: `${(element.w / DECKFORGE_SLIDE_SIZE.width) * 100}%`,
    height: `${(element.h / DECKFORGE_SLIDE_SIZE.height) * 100}%`,
    color: element.style.color,
    background: element.style.fill,
    borderColor: element.style.border,
    fontFamily: element.style.font_family,
    "--df-font-size": String(element.style.font_size ?? 16),
    fontWeight: element.style.font_weight,
    textAlign: element.style.align
  } as React.CSSProperties;

  const className = `deck-element ${element.type} ${isSelected ? "is-selected" : ""} ${isSelectable(element) ? "" : "is-decoration"}`;
  if (!isSelectable(element)) {
    return (
      <div className={className} data-slide-id={slide.id} data-node-id={element.id} style={style} aria-hidden="true">
        {renderElement(element)}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-slide-id={slide.id}
      data-node-id={element.id}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect({
          slideId: slide.id,
          element,
          selectedText: extractElementText(element),
          bbox: readDeckBox(event.currentTarget)
        });
      }}
    >
      {renderElement(element)}
    </button>
  );
}

function renderElement(element: ElementIR) {
  const content = element.content && typeof element.content === "object" ? (element.content as Record<string, unknown>) : {};
  if (element.type === "bullet_list") {
    const items = Array.isArray(content["items"]) ? (content["items"] as unknown[]).map(String) : [];
    return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
  }
  if (element.type === "shape" || element.type === "line") return null;
  return <span>{String(content["text"] ?? content["title"] ?? element.type)}</span>;
}

function extractElementText(element: ElementIR): string {
  const content = element.content && typeof element.content === "object" ? (element.content as Record<string, unknown>) : {};
  if (Array.isArray(content["items"])) return content["items"].map(String).join("\n");
  return String(content["text"] ?? content["title"] ?? "");
}

function isSelectable(element: ElementIR): boolean {
  return !(element.role === "decoration" || element.type === "shape" || element.type === "line");
}

function readDeckBox(target: HTMLElement): SelectedElement["bbox"] {
  const canvas = target.closest<HTMLElement>(".slide-canvas");
  if (!canvas) return undefined;
  const rect = target.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: round(((rect.left - canvasRect.left) / canvasRect.width) * DECKFORGE_SLIDE_SIZE.width),
    y: round(((rect.top - canvasRect.top) / canvasRect.height) * DECKFORGE_SLIDE_SIZE.height),
    w: round((rect.width / canvasRect.width) * DECKFORGE_SLIDE_SIZE.width),
    h: round((rect.height / canvasRect.height) * DECKFORGE_SLIDE_SIZE.height)
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
