import path from "node:path";
import {
  CommentAnchorSchema,
  GenerationBriefSchema,
  PatchOperationSchema,
  createEmptyMaterialManifest,
  type CommentAnchor,
  type DeckIR,
  type GenerationBrief,
  type PatchOperation
} from "@deckforge/deck-ir";
import { exportHtmlDeck } from "@deckforge/html-renderer";
import { createLlmAdapter } from "@deckforge/llm-adapter";
import { createMaterialManifestFromUploadedFiles, scanMaterialFolder, type UploadedMaterialInput } from "@deckforge/material-reader";
import { compileDeckToPptx } from "@deckforge/pptx-compiler";
import { generateQaReport } from "@deckforge/render-qa";
import { applyPatches, commentToPatch } from "@deckforge/review-engine";
import { createId, ensureDir, getWorkspaceDir, isPathInside } from "@deckforge/shared";
import { parseTemplateReference } from "@deckforge/template-engine";
import type { StorageRepository } from "../storage/repository.js";
import type { ArtifactRecord } from "../storage/repository.js";
import { SettingsService } from "./settings-service.js";

export interface CreateDeckInput {
  material_folder_path?: string;
  uploaded_materials?: UploadedMaterialInput[];
  user_prompt: string;
  generation_brief?: Partial<GenerationBrief>;
  template_reference_path?: string;
}

export class DeckService {
  private readonly workspaceDir: string;
  private readonly settings: SettingsService;

  constructor(private readonly storage: StorageRepository, options: { workspaceDir?: string; settings?: SettingsService } = {}) {
    this.workspaceDir = options.workspaceDir ?? getWorkspaceDir();
    this.settings = options.settings ?? new SettingsService(this.workspaceDir);
  }

  async createDeck(input: CreateDeckInput): Promise<DeckIR> {
    const manifest = input.uploaded_materials && input.uploaded_materials.length > 0
      ? createMaterialManifestFromUploadedFiles(input.uploaded_materials)
      : input.material_folder_path
      ? await scanMaterialFolder(resolveUserPath(input.material_folder_path, this.workspaceDir))
      : createEmptyMaterialManifest("");
    const brief = createGenerationBrief(input, manifest);
    const templateProfile = await parseTemplateReference(input.template_reference_path ? resolveUserPath(input.template_reference_path, this.workspaceDir) : undefined);
    const llm = createLlmAdapter(await this.settings.getResolvedLlmConfig());
    const outline = await llm.generateOutline({ brief, materials: manifest, templateProfile });
    const deck = await llm.generateDeckIR(outline, manifest, templateProfile, brief);
    this.storage.createDeck(deck);
    return deck;
  }

  listDecks(): DeckIR[] {
    return this.storage.listDecks().map((record) => record.deck);
  }

  getDeck(id: string): DeckIR {
    const record = this.storage.getDeck(id);
    if (!record) throw new Error(`Deck not found: ${id}`);
    return record.deck;
  }

  async scanMaterials(deckId: string, rootPath: string): Promise<DeckIR> {
    const deck = this.getDeck(deckId);
    const manifest = await scanMaterialFolder(resolveUserPath(rootPath, this.workspaceDir));
    const updated = { ...deck, material_manifest: manifest, metadata: { ...deck.metadata, updated_at: new Date().toISOString() } };
    this.storage.updateDeck(updated);
    return updated;
  }

  async parseTemplate(deckId: string, templatePath?: string): Promise<DeckIR> {
    const deck = this.getDeck(deckId);
    const templateProfile = await parseTemplateReference(templatePath ? resolveUserPath(templatePath, this.workspaceDir) : undefined);
    const updated = {
      ...deck,
      template_id: templateProfile.id,
      template_profile: templateProfile,
      metadata: { ...deck.metadata, updated_at: new Date().toISOString() }
    };
    this.storage.updateDeck(updated);
    return updated;
  }

  async renderHtml(deckId: string): Promise<{ htmlPath: string; html: string }> {
    const deck = this.getDeck(deckId);
    const result = await exportHtmlDeck(deck, path.join(this.getArtifactsDir(deckId), "html"));
    this.storage.addArtifact(deckId, "html", result.htmlPath);
    return result;
  }

  async exportPptx(deckId: string): Promise<{ outputPath: string; warnings: string[] }> {
    const deck = this.getDeck(deckId);
    const outputPath = path.join(this.getArtifactsDir(deckId), "pptx", `${safeFileName(deck.title)}.pptx`);
    const result = await compileDeckToPptx(deck, outputPath);
    this.storage.addArtifact(deckId, "pptx", result.outputPath);
    return result;
  }

  addComment(deckId: string, input: Omit<CommentAnchor, "comment_id" | "status">): CommentAnchor {
    const deck = this.getDeck(deckId);
    if (!deck.slides.some((slide) => slide.id === input.slide_id)) {
      throw new Error(`Slide not found: ${input.slide_id}`);
    }
    const comment = CommentAnchorSchema.parse({
      ...input,
      comment_id: createId("comment"),
      status: "open"
    });
    this.storage.addComment({ ...comment, slide_id: `${deckId}::${comment.slide_id}` });
    return comment;
  }

  async applyComments(deckId: string): Promise<{ deck: DeckIR; patches: PatchOperation[]; mode: string; warnings: string[] }> {
    const deck = this.getDeck(deckId);
    const comments = this.storage
      .listComments(deckId)
      .map((comment) => ({ ...comment, slide_id: comment.slide_id.replace(`${deckId}::`, "") }));
    const settings = await this.settings.getResolvedLlmConfig();
    const llm = createLlmAdapter(settings);
    const warnings: string[] = [];
    const useLlm = settings.mode === "openai-compatible" && Boolean(settings.apiKey);
    const patches: PatchOperation[] = useLlm
      ? []
      : comments.map(commentToPatch).filter((patch): patch is PatchOperation => Boolean(patch));
    if (useLlm) {
      for (const comment of comments) {
        const fallback = commentToPatch(comment);
        const patch = await this.patchCommentWithLlm(comment, deck, llm, fallback, warnings);
        if (patch) patches.push(patch);
      }
    }
    const updated = applyPatches(deck, patches);
    for (const patch of patches) this.storage.addPatch(deckId, patch);
    this.storage.markCommentsPatched(deckId);
    this.storage.updateDeck(updated);
    return { deck: updated, patches, mode: useLlm ? "llm" : "rules", warnings };
  }

  async runQa(deckId: string): Promise<{ jsonPath: string; markdownPath: string; report: unknown }> {
    const deck = this.getDeck(deckId);
    const artifacts = this.storage.listArtifacts(deckId);
    const htmlPath = artifacts.find((artifact) => artifact.type === "html")?.path;
    const pptxPath = artifacts.find((artifact) => artifact.type === "pptx")?.path;
    const result = await generateQaReport({
      deckIR: deck,
      outputDir: path.join(this.getArtifactsDir(deckId), "qa"),
      htmlPath,
      pptxPath
    });
    this.storage.addArtifact(deckId, "qa-json", result.jsonPath);
    this.storage.addArtifact(deckId, "qa-markdown", result.markdownPath);
    return result;
  }

  listArtifacts(deckId: string): unknown[] {
    this.getDeck(deckId);
    return this.storage.listArtifacts(deckId);
  }

  getArtifactForDownload(deckId: string, artifactId: string): ArtifactRecord {
    this.getDeck(deckId);
    const artifact = this.storage.listArtifacts(deckId).find((item) => item.id === artifactId);
    if (!artifact) throw httpError(404, `Artifact not found: ${artifactId}`);
    const artifactsRoot = this.getArtifactsDir(deckId);
    if (!isPathInside(artifactsRoot, artifact.path)) {
      throw httpError(403, "Artifact path is outside this deck's artifact directory.");
    }
    return artifact;
  }

  private getArtifactsDir(deckId: string): string {
    return ensureDir(path.join(this.workspaceDir, "artifacts", deckId));
  }

  private async patchCommentWithLlm(
    comment: CommentAnchor,
    deck: DeckIR,
    llm: ReturnType<typeof createLlmAdapter>,
    fallback: PatchOperation | undefined,
    warnings: string[]
  ): Promise<PatchOperation | undefined> {
    try {
      const candidate = await llm.commentToPatch(comment.comment, { deck, comment });
      return PatchOperationSchema.parse(candidate);
    } catch (error) {
      if (fallback?.op === "rewrite_text") {
        try {
          const rewritten = await llm.rewriteText(comment.selected_text || "", comment.comment);
          return {
            op: "replace_text",
            slide_id: comment.slide_id,
            node_id: comment.node_id,
            payload: { text: rewritten }
          };
        } catch {
          // Fall through to the deterministic patch.
        }
      }
      if (error instanceof Error && error.message !== "LLM response did not include message content.") {
        warnings.push(`LLM patch fallback for ${comment.node_id}: ${error.message}`);
      }
      return fallback;
    }
  }
}

export function defaultDbPath(workspaceDir = getWorkspaceDir()): string {
  return path.join(workspaceDir, "workspace.db");
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "deckforge";
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function resolveUserPath(inputPath: string, workspaceDir: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  const baseDir = process.env.INIT_CWD ?? (path.basename(workspaceDir) === ".deckforge" ? path.dirname(workspaceDir) : workspaceDir);
  return path.resolve(baseDir, inputPath);
}

function createGenerationBrief(input: CreateDeckInput, manifest: DeckIR["material_manifest"]): GenerationBrief {
  const provided = input.generation_brief ?? {};
  const userPrompt = input.user_prompt.trim();
  return GenerationBriefSchema.parse({
    ...provided,
    user_prompt: userPrompt,
    goal: provided.goal ?? deriveGoal(userPrompt, manifest),
    audience: provided.audience ?? "企业内部汇报对象"
  });
}

function deriveGoal(userPrompt: string, manifest: DeckIR["material_manifest"]): string {
  const promptGoal = firstMeaningfulLine(userPrompt);
  if (promptGoal) return promptGoal;
  const materialGoal = manifest.documents
    .map((document) => firstHeading(document.text) || firstSummaryPhrase(document.summary) || fileStem(document.relative_path))
    .find((item) => item.length > 0);
  return materialGoal ? `基于${materialGoal}生成汇报 PPT` : "生成企业汇报 PPT";
}

function firstMeaningfulLine(value: string): string {
  const line = value.split(/\r?\n/).map((item) => compactText(item, 90)).find(Boolean);
  return line ?? "";
}

function firstHeading(value: string): string {
  return compactText(value.match(/^\s*#{1,3}\s+(.+)$/m)?.[1] ?? "", 60);
}

function firstSummaryPhrase(value: string): string {
  return compactText(value.split(/[：:。.\n]/)[0] ?? "", 60);
}

function fileStem(value: string): string {
  const fileName = value.replaceAll("\\", "/").split("/").filter(Boolean).pop() ?? value;
  return fileName.replace(/\.[^.]+$/, "");
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
