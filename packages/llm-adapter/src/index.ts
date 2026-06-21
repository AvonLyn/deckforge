import {
  DECKFORGE_SLIDE_SIZE,
  PatchOperationSchema,
  normalizeDeckIR,
  type DeckIR,
  type ElementIR,
  type GenerationBrief,
  type MaterialManifest,
  type PatchOperation,
  type SlideIR,
  type TemplateProfile
} from "@deckforge/deck-ir";

export interface OutlineSlide {
  title: string;
  intent: string;
  bullets: string[];
}

export interface LlmAdapter {
  generateOutline(input: GenerateOutlineInput): Promise<OutlineSlide[]>;
  generateDeckIR(outline: OutlineSlide[], materials: MaterialManifest, templateProfile: TemplateProfile, brief: GenerationBrief): Promise<DeckIR>;
  rewriteText(text: string, instruction: string): Promise<string>;
  commentToPatch(comment: string, context: unknown): Promise<unknown>;
}

export type LlmMode = "mock" | "openai-compatible";
export type LlmAuthHeader = "api-key" | "authorization";

export interface LlmConfig {
  mode: LlmMode;
  baseUrl: string;
  model: string;
  authHeader: LlmAuthHeader;
  apiKey?: string;
}

export const DEFAULT_MIMO_LLM_CONFIG: Omit<LlmConfig, "apiKey"> = {
  mode: "mock",
  baseUrl: "https://api.xiaomimimo.com/v1",
  model: "mimo-v2.5",
  authHeader: "api-key"
};

export interface GenerateOutlineInput {
  brief: GenerationBrief;
  materials: MaterialManifest;
  templateProfile: TemplateProfile;
}

export class MockLlmAdapter implements LlmAdapter {
  async generateOutline(input: GenerateOutlineInput): Promise<OutlineSlide[]> {
    const pageCount = Math.max(1, input.brief.page_count);
    const signals = materialSignals(input.materials);
    const topics = outlineTopics(input.brief, signals, pageCount);
    return Array.from({ length: pageCount }, (_, index) => {
      if (index === 0) {
        return {
          title: input.brief.goal,
          intent: `Introduce ${input.brief.goal} for ${input.brief.audience}`,
          bullets: coverBullets(input.brief, input.materials, signals)
        };
      }
      const topic = topics[index - 1] ?? `重点 ${index}`;
      const signal = signals[(index - 1) % Math.max(signals.length, 1)];
      return {
        title: topic,
        intent: `Summarize ${topic} with project materials`,
        bullets: materialBullets(topic, signal, input.brief)
      };
    });
  }

  async generateDeckIR(
    _outline: OutlineSlide[],
    materials: MaterialManifest,
    templateProfile: TemplateProfile,
    brief: GenerationBrief
  ): Promise<DeckIR> {
    return outlineToDeck(_outline, materials, templateProfile, brief, "deckforge-mock");
  }

  async rewriteText(text: string, instruction: string): Promise<string> {
    return `${text}（按要求调整：${instruction}）`;
  }

  async commentToPatch(comment: string, context: unknown): Promise<unknown> {
    return { comment, context, mode: "mock" };
  }
}

export class OpenAiCompatibleLlmAdapter implements LlmAdapter {
  private readonly config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async generateOutline(input: GenerateOutlineInput): Promise<OutlineSlide[]> {
    const result = await this.chatJson<{ slides?: OutlineSlide[] }>([
      {
        role: "system",
        content: "You are DeckForge, an enterprise presentation planning assistant. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a concise slide outline.",
          expected_schema: { slides: [{ title: "string", intent: "string", bullets: ["string"] }] },
          page_count: input.brief.page_count,
          brief: input.brief,
          material_summaries: input.materials.documents.slice(0, 20).map((doc) => ({
            path: doc.relative_path,
            summary: doc.summary || doc.text.slice(0, 500)
          })),
          template: { name: input.templateProfile.name, colors: input.templateProfile.theme_colors }
        })
      }
    ]);
    const slides = Array.isArray(result.slides) ? result.slides : [];
    return normalizeOutline(slides, input.brief);
  }

  async generateDeckIR(
    outline: OutlineSlide[],
    materials: MaterialManifest,
    templateProfile: TemplateProfile,
    brief: GenerationBrief
  ): Promise<DeckIR> {
    const result = await this.chatJson<{ title?: string; slides?: Array<{ title?: string; bullets?: string[]; speaker_note?: string }> }>([
      {
        role: "system",
        content: "You turn outlines into concise presentation content. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Refine slide titles and bullets for a PPT deck.",
          expected_schema: { title: "string", slides: [{ title: "string", bullets: ["string"], speaker_note: "string" }] },
          brief,
          outline,
          material_summaries: materials.documents.slice(0, 20).map((doc) => ({
            path: doc.relative_path,
            summary: doc.summary || doc.text.slice(0, 500)
          }))
        })
      }
    ]);
    const refined = Array.isArray(result.slides) && result.slides.length > 0
      ? result.slides.map((slide, index) => ({
          title: slide.title || outline[index]?.title || `Slide ${index + 1}`,
          intent: outline[index]?.intent || "",
          bullets: sanitizeStringArray(slide.bullets).slice(0, 5)
        }))
      : outline;
    return {
      ...outlineToDeck(refined, materials, templateProfile, brief, "mimo-openai-compatible"),
      title: result.title || brief.goal
    };
  }

  async rewriteText(text: string, instruction: string): Promise<string> {
    const result = await this.chatJson<{ text?: string }>([
      {
        role: "system",
        content: "Rewrite presentation text. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({ expected_schema: { text: "string" }, text, instruction })
      }
    ]);
    return String(result.text || text);
  }

  async commentToPatch(comment: string, context: unknown): Promise<unknown> {
    const result = await this.chatJson<unknown>([
      {
        role: "system",
        content:
          "Convert a reviewer comment into one DeckForge PatchOperation JSON object. Valid ops: replace_text, rewrite_text, move_element, resize_element, change_style, delete_element. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          expected_schema: { op: "replace_text", slide_id: "string", node_id: "string", payload: { text: "string" } },
          comment,
          context
        })
      }
    ]);
    return PatchOperationSchema.parse(result);
  }

  private async chatJson<T>(messages: Array<{ role: "system" | "user"; content: string }>): Promise<T> {
    const content = await this.chatText(messages, 0.2);
    return parseJsonContent<T>(content);
  }

  private async chatText(messages: Array<{ role: "system" | "user"; content: string }>, temperature: number): Promise<string> {
    const endpoint = chatCompletionsEndpoint(this.config.baseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(this.config)
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature
      })
    });
    if (!response.ok) {
      throw await llmHttpError(response, endpoint);
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM response did not include message content.");
    return content;
  }
}

export async function testLlmConnection(config: LlmConfig): Promise<{ ok: true; model: string } | { ok: false; model: string; message: string }> {
  try {
    const endpoint = chatCompletionsEndpoint(config.baseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(config)
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Reply with ok." }],
        temperature: 0
      })
    });
    if (!response.ok) throw await llmHttpError(response, endpoint);
    const body = (await response.json()) as { choices?: unknown[] };
    if (!Array.isArray(body.choices)) throw new Error("LLM response did not include choices.");
    return { ok: true, model: config.model };
  } catch (error) {
    return { ok: false, model: config.model, message: error instanceof Error ? error.message : String(error) };
  }
}

export function createLlmAdapter(config?: Partial<LlmConfig>): LlmAdapter {
  const resolved = { ...DEFAULT_MIMO_LLM_CONFIG, ...config };
  if (resolved.mode === "openai-compatible" && resolved.apiKey) {
    return new OpenAiCompatibleLlmAdapter(resolved);
  }
  return new MockLlmAdapter();
}

function outlineToDeck(
  outline: OutlineSlide[],
  materials: MaterialManifest,
  templateProfile: TemplateProfile,
  brief: GenerationBrief,
  generator: string
): DeckIR {
  const slides = normalizeOutline(outline, brief).map<SlideIR>((item, index) => ({
    id: `slide_${index + 1}`,
    index,
    type: index === 0 ? "cover" : "title_content",
    title: item.title,
    elements:
      index === 0
        ? [
            textElement("cover_title", item.title, 0.9, 1.45, 10.8, 0.8, 30, "bold"),
            textElement("cover_subtitle", item.bullets[0] || brief.audience, 0.95, 2.45, 10.4, 0.55, 17),
            shapeElement("cover_band", 0.9, 4.65, 11.5, 0.1, templateProfile.theme_colors[0] || "#0f766e")
          ]
        : [
            textElement(`slide_${index + 1}_title`, item.title, 0.75, 0.55, 10.8, 0.55, 24, "bold"),
            bulletElement(`slide_${index + 1}_bullets`, item.bullets, 0.9, 1.45, 10.9, 4.8)
          ]
  }));
  return normalizeDeckIR({
    id: `deck_${Date.now()}`,
    title: brief.goal,
    subtitle: brief.audience,
    size: { ...DECKFORGE_SLIDE_SIZE },
    language: brief.language,
    template_id: templateProfile.id,
    theme: {
      accent: templateProfile.theme_colors[0] || "#0f766e",
      text: "#111827",
      background: "#ffffff"
    },
    generation_brief: brief,
    material_manifest: materials,
    template_profile: templateProfile,
    slides,
    metadata: { created_at: new Date().toISOString(), generator }
  });
}

function normalizeOutline(outline: OutlineSlide[], brief: GenerationBrief): OutlineSlide[] {
  const fallback = brief.must_include.length > 0 ? brief.must_include : ["背景", "目标", "方案", "路径", "风险", "下一步"];
  const source = outline.length > 0 ? outline : fallback.map((item) => ({ title: item, intent: item, bullets: [] }));
  return source.slice(0, brief.page_count).map((item, index) => ({
    title: item.title || (index === 0 ? brief.goal : fallback[index] || `Slide ${index + 1}`),
    intent: item.intent || "",
    bullets: sanitizeStringArray(item.bullets).slice(0, 5)
  }));
}

function textElement(
  id: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
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

function bulletElement(id: string, items: string[], x: number, y: number, w: number, h: number): ElementIR {
  return {
    id,
    type: "bullet_list",
    role: "body",
    content: { items: items.length > 0 ? items : ["梳理材料要点", "确认实施路径", "跟踪风险和下一步"] },
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

function shapeElement(id: string, x: number, y: number, w: number, h: number, fill: string): ElementIR {
  return {
    id,
    type: "shape",
    role: "decoration",
    content: { shape: "rect" },
    x,
    y,
    w,
    h,
    style: { fill }
  };
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function chatCompletionsEndpoint(baseUrlOrEndpoint: string): string {
  const trimmed = trimSlash(baseUrlOrEndpoint.trim());
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function authHeaders(config: LlmConfig): Record<string, string> {
  if (config.authHeader === "authorization") return { authorization: `Bearer ${config.apiKey ?? ""}` };
  return { "api-key": config.apiKey ?? "" };
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  return JSON.parse(fenced ?? trimmed) as T;
}

async function llmHttpError(response: Response, endpoint: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const details = compactText(body, 260);
  return new Error(`LLM request failed: ${response.status}${statusText} at ${redactedEndpoint(endpoint)}${details ? ` - ${details}` : ""}`);
}

function redactedEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint.split("?")[0] ?? endpoint;
  }
}

interface MaterialSignal {
  title: string;
  path: string;
  bullets: string[];
}

function materialSignals(materials: MaterialManifest): MaterialSignal[] {
  return materials.documents.slice(0, 12).map((document) => {
    const text = document.summary || document.text;
    const title = materialTitle(document.relative_path, document.text, text);
    const bullets = uniqueStrings(extractFacts(text).filter((fact) => fact !== title)).slice(0, 3);
    return {
      title,
      path: document.relative_path || document.path,
      bullets: bullets.length > 0 ? bullets : [`材料路径：${document.relative_path || document.path}`]
    };
  });
}

function outlineTopics(brief: GenerationBrief, signals: MaterialSignal[], pageCount: number): string[] {
  const requested = brief.must_include.length > 0 ? brief.must_include : [];
  const materialTitles = signals.map((signal) => signal.title);
  const promptTopics = extractPromptTopics(brief.user_prompt);
  const fallback = ["关键发现", "实施建议", "风险与约束", "下一步计划"];
  return uniqueStrings([...requested, ...materialTitles, ...promptTopics, ...fallback]).slice(0, Math.max(0, pageCount - 1));
}

function coverBullets(brief: GenerationBrief, materials: MaterialManifest, signals: MaterialSignal[]): string[] {
  const firstSignal = signals[0];
  return [
    firstSignal ? `核心材料：${firstSignal.title}（${firstSignal.path}）` : `生成要求：${compactText(brief.user_prompt || brief.goal, 90)}`,
    `材料数量：${materials.documents.length} 份`,
    `受众：${brief.audience}`,
    `风格：${brief.tone}`
  ].filter(Boolean);
}

function materialBullets(topic: string, signal: MaterialSignal | undefined, brief: GenerationBrief): string[] {
  if (!signal) {
    return [
      `生成要求：${compactText(brief.user_prompt || brief.goal, 90)}`,
      `汇报重点：${topic}`,
      `风格：${brief.tone}`
    ];
  }
  return uniqueStrings([
    `材料依据：${signal.path}`,
    ...signal.bullets,
    `汇报重点：${topic}`
  ]).slice(0, 5);
}

function materialTitle(relativePath: string, text: string, summary: string): string {
  const heading = text.match(/^\s*#{1,3}\s+(.+)$/m)?.[1];
  const summaryTitle = summary.split(/[：:。.\n]/)[0];
  return compactText(heading || summaryTitle || fileStem(relativePath), 42);
}

function extractFacts(value: string): string[] {
  return value
    .replace(/^#+\s+/gm, "")
    .split(/[。.!?；;\n]/)
    .map((item) => compactText(item, 90))
    .filter((item) => item.length > 0)
    .slice(0, 4);
}

function extractPromptTopics(value: string): string[] {
  return value
    .split(/[，,。；;、\n]/)
    .map((item) => compactText(item, 36))
    .filter((item) => item.length >= 3)
    .slice(0, 4);
}

function fileStem(value: string): string {
  const fileName = value.replaceAll("\\", "/").split("/").filter(Boolean).pop() ?? value;
  return fileName.replace(/\.[^.]+$/, "") || value;
}

function compactText(value: string, maxLength = 120): string {
  const normalized = value
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = compactText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
