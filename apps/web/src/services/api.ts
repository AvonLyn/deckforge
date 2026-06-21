import type { CommentAnchor, DeckIR, GenerationBrief } from "@deckforge/deck-ir";
import type { ApplyCommentsResponse, Artifact, LlmSettingsPatch, PublicSettings, UploadedMaterial } from "../types/index.js";

const API_BASE = import.meta.env.VITE_DECKFORGE_API_URL ?? "http://127.0.0.1:3217";

export async function getHealth(): Promise<{ ok: boolean }> {
  return request("/api/health");
}

export async function getSettings(): Promise<PublicSettings> {
  return request("/api/settings");
}

export async function updateLlmSettings(input: LlmSettingsPatch): Promise<PublicSettings> {
  return request("/api/settings/llm", { method: "PATCH", body: JSON.stringify(input) });
}

export async function testLlmSettings(): Promise<{ ok: boolean; model: string; message?: string }> {
  return request("/api/settings/llm/test", { method: "POST" });
}

export async function createDeck(input: {
  material_folder_path?: string;
  uploaded_materials?: UploadedMaterial[];
  user_prompt: string;
  generation_brief: Partial<GenerationBrief>;
  template_reference_path?: string;
}): Promise<DeckIR> {
  return request("/api/decks", { method: "POST", body: JSON.stringify(input) });
}

export async function renderHtml(deckId: string): Promise<{ htmlPath: string; html: string }> {
  return request(`/api/decks/${deckId}/render-html`, { method: "POST" });
}

export async function exportPptx(deckId: string): Promise<{ outputPath: string; warnings: string[] }> {
  return request(`/api/decks/${deckId}/export-pptx`, { method: "POST" });
}

export async function runQa(deckId: string): Promise<{ jsonPath: string; markdownPath: string; report: unknown }> {
  return request(`/api/decks/${deckId}/render-qa`, { method: "POST" });
}

export async function postComment(deckId: string, comment: Omit<CommentAnchor, "comment_id" | "status">): Promise<CommentAnchor> {
  return request(`/api/decks/${deckId}/comments`, { method: "POST", body: JSON.stringify(comment) });
}

export async function applyComments(deckId: string): Promise<ApplyCommentsResponse> {
  return request(`/api/decks/${deckId}/apply-comments`, { method: "POST" });
}

export async function listArtifacts(deckId: string): Promise<{ data: Artifact[] }> {
  return request(`/api/decks/${deckId}/artifacts`);
}

export function artifactDownloadUrl(deckId: string, artifactId: string): string {
  return `${API_BASE}/api/decks/${deckId}/artifacts/${artifactId}/download`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body
    ? {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    : init.headers;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
