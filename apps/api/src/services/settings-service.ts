import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MIMO_LLM_CONFIG, testLlmConnection, type LlmAuthHeader, type LlmConfig, type LlmMode } from "@deckforge/llm-adapter";
import { safeJsonParse } from "@deckforge/shared";

export interface LlmSettingsInput {
  mode?: LlmMode;
  baseUrl?: string;
  model?: string;
  authHeader?: LlmAuthHeader;
  apiKey?: string;
}

export interface PublicLlmSettings {
  mode: LlmMode;
  baseUrl: string;
  model: string;
  authHeader: LlmAuthHeader;
  hasApiKey: boolean;
  apiKeyPreview?: string;
}

export interface PublicSettings {
  llm: PublicLlmSettings;
  workspaceDir: string;
}

interface StoredSettings {
  llm?: Omit<LlmConfig, "apiKey">;
}

export class SettingsService {
  private readonly settingsPath: string;
  private readonly secretPath: string;

  constructor(private readonly workspaceDir: string) {
    this.settingsPath = path.join(workspaceDir, "settings.json");
    this.secretPath = path.join(workspaceDir, "secrets", "mimo.env");
  }

  async getPublicSettings(): Promise<PublicSettings> {
    const config = await this.getResolvedLlmConfig();
    return {
      workspaceDir: this.workspaceDir,
      llm: toPublicLlmSettings(config)
    };
  }

  async updateLlmSettings(input: LlmSettingsInput): Promise<PublicSettings> {
    const current = await this.getResolvedLlmConfig();
    const next: LlmConfig = {
      mode: input.mode ?? current.mode,
      baseUrl: input.baseUrl?.trim() ?? current.baseUrl,
      model: input.model?.trim() ?? current.model,
      authHeader: input.authHeader ?? current.authHeader,
      apiKey: input.apiKey === undefined ? current.apiKey : input.apiKey.trim() || undefined
    };
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(
      this.settingsPath,
      `${JSON.stringify({ llm: stripSecret(next) }, null, 2)}\n`,
      "utf8"
    );
    if (input.apiKey !== undefined) {
      if (next.apiKey) {
        await mkdir(path.dirname(this.secretPath), { recursive: true });
        await writeFile(this.secretPath, `LLM_API_KEY=${next.apiKey}\n`, "utf8");
      } else {
        await rm(this.secretPath, { force: true });
      }
    }
    return this.getPublicSettings();
  }

  async getResolvedLlmConfig(): Promise<LlmConfig> {
    const stored = await this.readStoredSettings();
    const secret = await this.readSecret();
    return {
      ...DEFAULT_MIMO_LLM_CONFIG,
      ...stored.llm,
      baseUrl: process.env.LLM_BASE_URL || stored.llm?.baseUrl || DEFAULT_MIMO_LLM_CONFIG.baseUrl,
      model: process.env.LLM_MODEL || stored.llm?.model || DEFAULT_MIMO_LLM_CONFIG.model,
      authHeader: (process.env.LLM_AUTH_HEADER as LlmAuthHeader | undefined) || stored.llm?.authHeader || DEFAULT_MIMO_LLM_CONFIG.authHeader,
      mode: (process.env.LLM_MODE as LlmMode | undefined) || stored.llm?.mode || DEFAULT_MIMO_LLM_CONFIG.mode,
      apiKey: process.env.LLM_API_KEY || secret
    };
  }

  async testLlm(): Promise<Awaited<ReturnType<typeof testLlmConnection>>> {
    return testLlmConnection(await this.getResolvedLlmConfig());
  }

  private async readStoredSettings(): Promise<StoredSettings> {
    try {
      return safeJsonParse(stripBom(await readFile(this.settingsPath, "utf8")), {});
    } catch {
      return {};
    }
  }

  private async readSecret(): Promise<string | undefined> {
    try {
      const content = stripBom(await readFile(this.secretPath, "utf8"));
      const line = content.split(/\r?\n/).find((item) => item.startsWith("LLM_API_KEY="));
      return line?.slice("LLM_API_KEY=".length).trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function stripSecret(config: LlmConfig): Omit<LlmConfig, "apiKey"> {
  return {
    mode: config.mode,
    baseUrl: config.baseUrl,
    model: config.model,
    authHeader: config.authHeader
  };
}

function toPublicLlmSettings(config: LlmConfig): PublicLlmSettings {
  return {
    ...stripSecret(config),
    hasApiKey: Boolean(config.apiKey),
    apiKeyPreview: config.apiKey ? maskSecret(config.apiKey) : undefined
  };
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
