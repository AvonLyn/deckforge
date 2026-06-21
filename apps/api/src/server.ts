import path from "node:path";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { getWorkspaceDir, toApiError } from "@deckforge/shared";
import { DeckService, defaultDbPath } from "./services/deck-service.js";
import { SettingsService } from "./services/settings-service.js";
import { StorageRepository } from "./storage/repository.js";

const UploadedMaterialSchema = z.object({
  relative_path: z.string().min(1),
  name: z.string().optional(),
  text: z.string(),
  size: z.number().nonnegative().optional(),
  mtime: z.string().optional()
});

const CreateDeckSchema = z.object({
  material_folder_path: z.string().optional(),
  uploaded_materials: z.array(UploadedMaterialSchema).optional(),
  user_prompt: z.string().min(1),
  generation_brief: z.record(z.string(), z.unknown()).optional(),
  template_reference_path: z.string().optional()
});

const ScanMaterialsSchema = z.object({
  material_folder_path: z.string().min(1)
});

const ParseTemplateSchema = z.object({
  template_reference_path: z.string().optional()
});

const CommentSchema = z.object({
  slide_id: z.string().min(1),
  node_id: z.string().min(1),
  selected_text: z.string().optional(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  comment: z.string().min(1)
});

const LlmSettingsSchema = z.object({
  mode: z.enum(["mock", "openai-compatible"]).optional(),
  baseUrl: z.string().trim().url().optional(),
  model: z.string().trim().min(1).optional(),
  authHeader: z.enum(["api-key", "authorization"]).optional(),
  apiKey: z.string().optional()
});

export interface BuildServerOptions {
  dbPath?: string;
  workspaceDir?: string;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = fastify({ logger: false });
  const workspaceDir = options.workspaceDir ?? getWorkspaceDir();
  const settings = new SettingsService(workspaceDir);
  const storage = new StorageRepository(options.dbPath ?? defaultDbPath(workspaceDir));
  const service = new DeckService(storage, { workspaceDir, settings });

  app.register(cors, {
    origin: process.env.DECKFORGE_WEB_ORIGIN ?? true,
    credentials: false
  });
  app.setErrorHandler((error, _request, reply) => {
    const err = error as { validation?: unknown; statusCode?: number; message?: string };
    const statusCode = err.validation ? 422 : err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.status(statusCode).send(toApiError(err.validation ? "VALIDATION_ERROR" : "REQUEST_FAILED", err.message ?? "Request failed"));
  });

  app.get("/api/health", async () => ({
    ok: true,
    name: "DeckForge API",
    workspace_dir: workspaceDir
  }));

  app.get("/api/settings", async () => settings.getPublicSettings());

  app.patch("/api/settings/llm", async (request) => {
    const input = LlmSettingsSchema.parse(request.body);
    return settings.updateLlmSettings(input);
  });

  app.post("/api/settings/llm/test", async () => settings.testLlm());

  app.get("/api/decks", async () => ({ data: service.listDecks() }));

  app.post("/api/decks", async (request, reply) => {
    const input = CreateDeckSchema.parse(request.body);
    const deck = await service.createDeck({
      material_folder_path: input.material_folder_path,
      uploaded_materials: input.uploaded_materials,
      user_prompt: input.user_prompt,
      generation_brief: input.generation_brief,
      template_reference_path: input.template_reference_path
    });
    reply.status(201).send(deck);
  });

  app.get("/api/decks/:id", async (request) => {
    const { id } = request.params as { id: string };
    return service.getDeck(id);
  });

  app.post("/api/decks/:id/scan-materials", async (request) => {
    const { id } = request.params as { id: string };
    const body = ScanMaterialsSchema.parse(request.body);
    return service.scanMaterials(id, body.material_folder_path);
  });

  app.post("/api/decks/:id/parse-template", async (request) => {
    const { id } = request.params as { id: string };
    const body = ParseTemplateSchema.parse(request.body);
    return service.parseTemplate(id, body.template_reference_path);
  });

  app.post("/api/decks/:id/render-html", async (request) => {
    const { id } = request.params as { id: string };
    return service.renderHtml(id);
  });

  app.post("/api/decks/:id/comments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const comment = service.addComment(id, CommentSchema.parse(request.body));
    reply.status(201).send(comment);
  });

  app.post("/api/decks/:id/apply-comments", async (request) => {
    const { id } = request.params as { id: string };
    return service.applyComments(id);
  });

  app.post("/api/decks/:id/export-pptx", async (request) => {
    const { id } = request.params as { id: string };
    return service.exportPptx(id);
  });

  app.post("/api/decks/:id/render-qa", async (request) => {
    const { id } = request.params as { id: string };
    return service.runQa(id);
  });

  app.get("/api/decks/:id/artifacts", async (request) => {
    const { id } = request.params as { id: string };
    return { data: service.listArtifacts(id) };
  });

  app.get("/api/decks/:id/artifacts/:artifactId/download", async (request, reply) => {
    const { id, artifactId } = request.params as { id: string; artifactId: string };
    const artifact = service.getArtifactForDownload(id, artifactId);
    reply.header("content-disposition", `attachment; filename="${path.basename(artifact.path).replaceAll('"', "")}"`);
    return reply.send(createReadStream(artifact.path));
  });

  return app;
}

async function main(): Promise<void> {
  const app = buildServer();
  const host = process.env.DECKFORGE_API_HOST ?? "127.0.0.1";
  const port = Number(process.env.DECKFORGE_API_PORT ?? 3217);
  await app.listen({ host, port });
  console.log(`DeckForge API listening at http://${host}:${port}`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
