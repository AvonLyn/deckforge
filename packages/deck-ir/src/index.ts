import { z } from "zod";

export const DECKFORGE_SLIDE_SIZE = {
  width: 13.333,
  height: 7.5
} as const;

export const slideTypes = [
  "cover",
  "agenda",
  "section",
  "title_content",
  "two_column",
  "image_text",
  "table",
  "process",
  "summary"
] as const;

export const elementTypes = [
  "text",
  "bullet_list",
  "image",
  "table",
  "bar_chart",
  "line_chart",
  "shape",
  "line",
  "icon",
  "group"
] as const;

export const patchOps = [
  "replace_text",
  "rewrite_text",
  "move_element",
  "resize_element",
  "change_style",
  "split_slide",
  "delete_element",
  "add_element"
] as const;

const StringArraySchema = z.array(z.string()).default([]);
const NumberBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative()
});

export const StyleIRSchema = z.object({
  font_family: z.string().optional(),
  font_size: z.number().positive().optional(),
  font_weight: z.union([z.string(), z.number()]).optional(),
  color: z.string().optional(),
  fill: z.string().optional(),
  border: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional()
});

export const LayoutIRSchema = z.object({
  id: z.string(),
  name: z.string(),
  slide_type: z.enum(slideTypes),
  zones: z.array(NumberBoxSchema).default([])
});

export const TemplateBindingSchema = z.object({
  template_id: z.string().optional(),
  layout_id: z.string().optional(),
  placeholder_id: z.string().optional(),
  role: z.string().optional()
});

export const ElementIRSchema = z.object({
  id: z.string(),
  type: z.enum(elementTypes),
  role: z.string().optional(),
  content: z.unknown().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  style: StyleIRSchema.default({}),
  template_binding: TemplateBindingSchema.optional(),
  animation: z.record(z.string(), z.unknown()).optional()
});

export const SlideIRSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  type: z.enum(slideTypes),
  layout_id: z.string().optional(),
  title: z.string(),
  speaker_note: z.string().optional(),
  elements: z.array(ElementIRSchema).default([])
});

export const GenerationBriefSchema = z.object({
  goal: z.string().default("生成企业汇报 PPT"),
  audience: z.string().default("企业内部汇报对象"),
  page_count: z.number().int().positive().default(6),
  tone: z.string().default("正式"),
  language: z.string().default("zh-CN"),
  must_include: StringArraySchema,
  must_avoid: StringArraySchema,
  user_prompt: z.string().default("")
});

export const MaterialDocumentSchema = z.object({
  id: z.string(),
  path: z.string(),
  relative_path: z.string(),
  ext: z.string(),
  kind: z.string(),
  size: z.number().nonnegative(),
  mtime: z.string(),
  hash: z.string(),
  text: z.string(),
  summary: z.string(),
  warnings: StringArraySchema
});

export const MaterialManifestSchema = z.object({
  root_path: z.string(),
  documents: z.array(MaterialDocumentSchema).default([]),
  skipped_files: z.array(z.object({ path: z.string(), reason: z.string() })).default([]),
  warnings: StringArraySchema,
  created_at: z.string()
});

export const TemplateProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  source_type: z.enum(["none", "pptx", "html", "image", "pdf", "json", "unsupported"]),
  source_path: z.string().optional(),
  slide_size: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  theme_colors: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
  layout_profiles: z.array(LayoutIRSchema).default([]),
  logo_safe_area: NumberBoxSchema.optional(),
  notes: z.string().optional(),
  warnings: StringArraySchema
});

export const CommentAnchorSchema = z.object({
  comment_id: z.string(),
  slide_id: z.string(),
  node_id: z.string(),
  selected_text: z.string().optional(),
  bbox: NumberBoxSchema.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  comment: z.string(),
  status: z.enum(["open", "patched", "dismissed"]).default("open")
});

export const PatchOperationSchema = z.object({
  op: z.enum(patchOps),
  slide_id: z.string(),
  node_id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const DeckIRSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  language: z.string().default("zh-CN"),
  template_id: z.string().optional(),
  theme: z.record(z.string(), z.unknown()).default({}),
  generation_brief: GenerationBriefSchema,
  material_manifest: MaterialManifestSchema,
  template_profile: TemplateProfileSchema,
  slides: z.array(SlideIRSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type StyleIR = z.infer<typeof StyleIRSchema>;
export type LayoutIR = z.infer<typeof LayoutIRSchema>;
export type TemplateBinding = z.infer<typeof TemplateBindingSchema>;
export type ElementIR = z.infer<typeof ElementIRSchema>;
export type SlideIR = z.infer<typeof SlideIRSchema>;
export type GenerationBrief = z.infer<typeof GenerationBriefSchema>;
export type MaterialDocument = z.infer<typeof MaterialDocumentSchema>;
export type MaterialManifest = z.infer<typeof MaterialManifestSchema>;
export type TemplateProfile = z.infer<typeof TemplateProfileSchema>;
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;
export type PatchOperation = z.infer<typeof PatchOperationSchema>;
export type DeckIR = z.infer<typeof DeckIRSchema>;
export type ElementType = (typeof elementTypes)[number];

export interface DeckIrIssue {
  code: string;
  message: string;
  slide_id?: string;
  node_id?: string;
  severity: "info" | "warning" | "error";
}

export function validateDeckIR(input: unknown): DeckIR {
  return DeckIRSchema.parse(input);
}

export function validateSlideIR(input: unknown): SlideIR {
  return SlideIRSchema.parse(input);
}

export function validateElementIR(input: unknown): ElementIR {
  return ElementIRSchema.parse(input);
}

export function normalizeDeckIR(input: unknown): DeckIR {
  const deck = validateDeckIR(input);
  return {
    ...deck,
    size: deck.size ?? DECKFORGE_SLIDE_SIZE,
    slides: deck.slides.map((slide, index) => ({
      ...slide,
      index,
      elements: slide.elements.map((element) => ({
        ...element,
        style: element.style ?? {}
      }))
    }))
  };
}

export function findElementById(deck: DeckIR, nodeId: string): { slide: SlideIR; element: ElementIR } | undefined {
  for (const slide of deck.slides) {
    const element = slide.elements.find((candidate) => candidate.id === nodeId);
    if (element) return { slide, element };
  }
  return undefined;
}

export function checkElementBounds(deck: DeckIR): DeckIrIssue[] {
  const issues: DeckIrIssue[] = [];
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      const out =
        element.x < 0 ||
        element.y < 0 ||
        element.x + element.w > deck.size.width ||
        element.y + element.h > deck.size.height;
      if (out) {
        issues.push({
          code: "ELEMENT_OUT_OF_BOUNDS",
          message: `Element ${element.id} is outside the slide bounds.`,
          slide_id: slide.id,
          node_id: element.id,
          severity: "warning"
        });
      }
    }
  }
  return issues;
}

export function checkSlideDensity(deck: DeckIR, maxElements = 16): DeckIrIssue[] {
  return deck.slides
    .filter((slide) => slide.elements.length > maxElements)
    .map((slide) => ({
      code: "SLIDE_TOO_DENSE",
      message: `Slide ${slide.id} has ${slide.elements.length} elements; max recommended is ${maxElements}.`,
      slide_id: slide.id,
      severity: "warning" as const
    }));
}

export function checkElementOverlap(deck: DeckIR, overlapThreshold = 0.35): DeckIrIssue[] {
  const issues: DeckIrIssue[] = [];
  for (const slide of deck.slides) {
    for (let i = 0; i < slide.elements.length; i += 1) {
      for (let j = i + 1; j < slide.elements.length; j += 1) {
        const a = slide.elements[i];
        const b = slide.elements[j];
        if (!a || !b) continue;
        const overlapArea = rectIntersection(a, b);
        const smallerArea = Math.max(0.01, Math.min(a.w * a.h, b.w * b.h));
        if (overlapArea / smallerArea > overlapThreshold) {
          issues.push({
            code: "ELEMENT_OVERLAP",
            message: `Elements ${a.id} and ${b.id} overlap significantly.`,
            slide_id: slide.id,
            node_id: a.id,
            severity: "warning"
          });
        }
      }
    }
  }
  return issues;
}

export function applyPatchOperation(deck: DeckIR, patch: PatchOperation): DeckIR {
  const parsedPatch = PatchOperationSchema.parse(patch);
  const next = cloneDeck(deck);
  const slide = next.slides.find((candidate) => candidate.id === parsedPatch.slide_id);
  if (!slide) return next;

  const elementIndex = parsedPatch.node_id
    ? slide.elements.findIndex((candidate) => candidate.id === parsedPatch.node_id)
    : -1;
  const element = elementIndex >= 0 ? slide.elements[elementIndex] : undefined;

  switch (parsedPatch.op) {
    case "replace_text":
    case "rewrite_text":
      if (element) {
        element.content = patchTextContent(element.content, String(parsedPatch.payload.text ?? parsedPatch.payload.value ?? ""));
      }
      break;
    case "move_element":
      if (element) {
        element.x += Number(parsedPatch.payload.dx ?? 0);
        element.y += Number(parsedPatch.payload.dy ?? 0);
      }
      break;
    case "resize_element":
      if (element) {
        element.w = Math.max(0.1, element.w + Number(parsedPatch.payload.dw ?? 0));
        element.h = Math.max(0.1, element.h + Number(parsedPatch.payload.dh ?? 0));
      }
      break;
    case "change_style":
      if (element) {
        element.style = { ...element.style, ...(parsedPatch.payload.style as StyleIR | undefined) };
      }
      break;
    case "delete_element":
      if (elementIndex >= 0) slide.elements.splice(elementIndex, 1);
      break;
    case "add_element": {
      const added = ElementIRSchema.safeParse(parsedPatch.payload.element);
      if (added.success) slide.elements.push(added.data);
      break;
    }
    case "split_slide":
      next.metadata = {
        ...next.metadata,
        warnings: [...metadataWarnings(next), "split_slide is reserved for a later MVP slice."]
      };
      break;
  }

  next.metadata = {
    ...next.metadata,
    updated_at: new Date().toISOString()
  };
  return normalizeDeckIR(next);
}

export function createEmptyMaterialManifest(rootPath = ""): MaterialManifest {
  return {
    root_path: rootPath,
    documents: [],
    skipped_files: [],
    warnings: [],
    created_at: new Date().toISOString()
  };
}

export function createDefaultTemplateProfile(): TemplateProfile {
  return {
    id: "template_default",
    name: "DeckForge Default",
    source_type: "none",
    slide_size: { ...DECKFORGE_SLIDE_SIZE },
    theme_colors: ["#0f766e", "#f59e0b", "#111827", "#f8fafc"],
    fonts: ["Microsoft YaHei", "Arial"],
    layout_profiles: [
      {
        id: "layout_title_content",
        name: "Title Content",
        slide_type: "title_content",
        zones: [
          { x: 0.75, y: 0.55, w: 11.8, h: 0.7 },
          { x: 0.85, y: 1.55, w: 11.6, h: 5.3 }
        ]
      }
    ],
    logo_safe_area: { x: 11.55, y: 0.25, w: 1.4, h: 0.55 },
    notes: "Default MVP profile. Replace with enterprise template profile when available.",
    warnings: []
  };
}

export function createExampleDeck(overrides: Partial<DeckIR> = {}): DeckIR {
  const brief: GenerationBrief = {
    goal: "生成企业内网 AI 平台建设汇报",
    audience: "企业领导与信息化负责人",
    page_count: 6,
    tone: "正式",
    language: "zh-CN",
    must_include: ["建设背景", "技术架构", "部署进展", "风险", "下一步计划"],
    must_avoid: ["夸大承诺", "不可验证指标"],
    user_prompt: "请根据材料生成 6 页以内的企业内网 AI 平台建设汇报。"
  };
  const templateProfile = createDefaultTemplateProfile();
  const deck: DeckIR = {
    id: "deck_internal_ai_platform",
    title: "企业内网 AI 平台建设汇报",
    subtitle: "DeckForge MVP 示例",
    size: { ...DECKFORGE_SLIDE_SIZE },
    language: "zh-CN",
    template_id: templateProfile.id,
    theme: {
      accent: "#0f766e",
      warning: "#f59e0b",
      text: "#111827",
      background: "#f8fafc"
    },
    generation_brief: brief,
    material_manifest: createEmptyMaterialManifest("user-materials"),
    template_profile: templateProfile,
    slides: [
      slide("slide_cover", 0, "cover", "企业内网 AI 平台建设汇报", [
        text("cover_title", "企业内网 AI 平台建设汇报", 0.9, 1.55, 8.8, 1.15, 34, "bold"),
        text("cover_subtitle", "建设背景、技术架构、实施路径与风险闭环", 0.95, 2.75, 8.6, 0.5, 18),
        shape("cover_band", 0.9, 4.85, 11.5, 0.12, "#0f766e")
      ]),
      slide("slide_background", 1, "title_content", "项目背景", [
        text("background_title", "项目背景", 0.75, 0.55, 4.8, 0.45, 24, "bold"),
        bullets("background_points", ["企业知识分散在项目文档、部署记录与业务材料中", "汇报材料制作周期长，人工排版与校对成本高", "内网私有化要求模型、材料和输出均可本地闭环"], 0.9, 1.45, 7.6, 3.6),
        shape("background_metric", 9.0, 1.45, 3.2, 2.2, "#ecfeff", "#0f766e")
      ]),
      slide("slide_scope", 2, "two_column", "目标与范围", [
        text("scope_title", "目标与范围", 0.75, 0.55, 4.8, 0.45, 24, "bold"),
        bullets("scope_left", ["材料目录输入", "结构化 DeckIR", "HTML 审稿预览"], 0.9, 1.45, 5.0, 3.9),
        bullets("scope_right", ["局部评论与 Patch", "可编辑 PPTX 导出", "静态与渲染 QA"], 7.0, 1.45, 5.0, 3.9)
      ]),
      slide("slide_architecture", 3, "process", "技术架构", [
        text("architecture_title", "技术架构", 0.75, 0.55, 4.8, 0.45, 24, "bold"),
        text("arch_flow", "Material Reader -> Outline Planner -> DeckIR -> HTML/PPTX/QA", 1.0, 1.5, 11.2, 0.6, 20, "bold"),
        bullets("arch_points", ["DeckIR 是唯一中间表示", "Web 与 Desktop 复用同一 API", "LLM adapter 默认 mock，可接 OpenAI-compatible 私有模型"], 1.05, 2.5, 10.6, 2.9)
      ]),
      slide("slide_roadmap", 4, "process", "实施路径", [
        text("roadmap_title", "实施路径", 0.75, 0.55, 4.8, 0.45, 24, "bold"),
        bullets("roadmap_points", ["Phase 1: schema + material scanner", "Phase 2: preview + PPTX compiler", "Phase 3: comment patch + QA", "Phase 4: desktop packaging"], 1.0, 1.35, 10.8, 4.6)
      ]),
      slide("slide_summary", 5, "summary", "总结与下一步", [
        text("summary_title", "总结与下一步", 0.75, 0.55, 5.2, 0.45, 24, "bold"),
        bullets("summary_points", ["先跑通端到端闭环，再增强模板语义与 RAG", "保持可编辑 PPTX 为主要输出，不以截图冒充", "以渲染 QA 和修改记录支撑企业审稿流程"], 0.95, 1.45, 10.9, 4.4)
      ])
    ],
    metadata: {
      created_at: new Date().toISOString(),
      generator: "deckforge-mock"
    },
    ...overrides
  };
  return normalizeDeckIR(deck);
}

function slide(id: string, index: number, type: SlideIR["type"], title: string, elements: ElementIR[]): SlideIR {
  return { id, index, type, title, elements };
}

function text(
  id: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 18,
  fontWeight: string | number = "normal"
): ElementIR {
  return {
    id,
    type: "text",
    role: "body",
    content: { text: value },
    x,
    y,
    w,
    h,
    style: {
      font_family: "Microsoft YaHei",
      font_size: fontSize,
      font_weight: fontWeight,
      color: "#111827"
    }
  };
}

function bullets(id: string, items: string[], x: number, y: number, w: number, h: number): ElementIR {
  return {
    id,
    type: "bullet_list",
    role: "body",
    content: { items },
    x,
    y,
    w,
    h,
    style: {
      font_family: "Microsoft YaHei",
      font_size: 17,
      color: "#1f2937"
    }
  };
}

function shape(id: string, x: number, y: number, w: number, h: number, fill: string, border?: string): ElementIR {
  return {
    id,
    type: "shape",
    role: "decoration",
    content: { shape: "rect" },
    x,
    y,
    w,
    h,
    style: { fill, border }
  };
}

function rectIntersection(a: Pick<ElementIR, "x" | "y" | "w" | "h">, b: Pick<ElementIR, "x" | "y" | "w" | "h">): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function patchTextContent(content: unknown, textValue: string): unknown {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return { ...(content as Record<string, unknown>), text: textValue };
  }
  return { text: textValue };
}

function metadataWarnings(deck: DeckIR): string[] {
  const warnings = deck.metadata["warnings"];
  return Array.isArray(warnings) ? warnings.map(String) : [];
}

function cloneDeck(deck: DeckIR): DeckIR {
  return JSON.parse(JSON.stringify(deck)) as DeckIR;
}
