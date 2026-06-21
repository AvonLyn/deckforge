import type { CommentAnchor, DeckIR, ElementIR, PatchOperation } from "@deckforge/deck-ir";

export interface Artifact {
  id: string;
  deck_id: string;
  type: string;
  path: string;
  created_at: string;
}

export interface ApplyCommentsResponse {
  deck: DeckIR;
  patches: PatchOperation[];
  mode?: string;
  warnings?: string[];
}

export interface SelectedElement {
  slideId: string;
  element: ElementIR;
  selectedText: string;
  bbox?: { x: number; y: number; w: number; h: number };
}

export type SubmittedComment = CommentAnchor;

export interface UploadedMaterial {
  relative_path: string;
  name?: string;
  text: string;
  size?: number;
  mtime?: string;
}

export interface PublicLlmSettings {
  mode: "mock" | "openai-compatible";
  baseUrl: string;
  model: string;
  authHeader: "api-key" | "authorization";
  hasApiKey: boolean;
  apiKeyPreview?: string;
}

export interface PublicSettings {
  workspaceDir: string;
  llm: PublicLlmSettings;
}

export interface LlmSettingsPatch {
  mode?: "mock" | "openai-compatible";
  baseUrl?: string;
  model?: string;
  authHeader?: "api-key" | "authorization";
  apiKey?: string;
}
