import { CheckCircle2, Server, X } from "lucide-react";
import type { LlmSettingsPatch, PublicSettings } from "../types/index.js";

interface SettingsDrawerProps {
  isOpen: boolean;
  settings: PublicSettings | null;
  draft: LlmSettingsPatch & { apiKey?: string };
  isBusy: boolean;
  testResult: { ok: boolean; model: string; message?: string } | null;
  onDraftChange: (draft: LlmSettingsPatch & { apiKey?: string }) => void;
  onClose: () => void;
  onSave: () => void;
  onTest: () => void;
}

export function SettingsDrawer({
  isOpen,
  settings,
  draft,
  isBusy,
  testResult,
  onDraftChange,
  onClose,
  onSave,
  onTest
}: SettingsDrawerProps) {
  if (!isOpen) return null;

  const update = <K extends keyof LlmSettingsPatch>(key: K, value: LlmSettingsPatch[K]) => {
    onDraftChange({ ...draft, [key]: value });
  };

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 id="settings-title">API 与模型配置</h2>
            <p>本地保存，响应中只显示 masked key。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">
            <X aria-hidden="true" size={17} />
          </button>
        </div>

        <div className="settings-section">
          <div className="status-line">
            <Server aria-hidden="true" size={16} />
            <span>Workspace</span>
            <strong title={settings?.workspaceDir}>{settings?.workspaceDir ?? "未连接"}</strong>
          </div>
          <div className="status-line">
            <CheckCircle2 aria-hidden="true" size={16} />
            <span>Key</span>
            <strong>{settings?.llm.hasApiKey ? settings.llm.apiKeyPreview : "未配置"}</strong>
          </div>
        </div>

        <label className="field">
          <span>模式</span>
          <select value={draft.mode ?? "mock"} onChange={(event) => update("mode", event.target.value as "mock" | "openai-compatible")}>
            <option value="mock">Mock / 规则模式</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </label>

        <label className="field">
          <span>请求地址 / Base URL</span>
          <input value={draft.baseUrl ?? ""} onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://api.xiaomimimo.com/v1" />
          <small>可粘贴 base URL，或完整的 /chat/completions 请求地址。</small>
        </label>

        <div className="settings-grid two">
          <label className="field compact">
            <span>模型</span>
            <input value={draft.model ?? ""} onChange={(event) => update("model", event.target.value)} placeholder="mimo-v2.5" />
          </label>
          <label className="field compact">
            <span>鉴权头</span>
            <select value={draft.authHeader ?? "api-key"} onChange={(event) => update("authHeader", event.target.value as "api-key" | "authorization")}>
              <option value="api-key">api-key</option>
              <option value="authorization">Authorization Bearer</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span>API Key</span>
          <input
            type="password"
            value={draft.apiKey ?? ""}
            onChange={(event) => onDraftChange({ ...draft, apiKey: event.target.value })}
            placeholder={settings?.llm.hasApiKey ? "留空则保留现有 key" : "粘贴本地 key"}
          />
        </label>

        {testResult ? (
          <p className={`test-result ${testResult.ok ? "ok" : "down"}`}>
            {testResult.ok ? `连接成功：${testResult.model}` : `连接失败：${testResult.message ?? testResult.model}`}
          </p>
        ) : null}

        <div className="drawer-actions">
          <button className="quiet-button" type="button" onClick={onTest} disabled={isBusy || (!settings?.llm.hasApiKey && !draft.apiKey?.trim())}>
            测试连接
          </button>
          <button className="primary-action inline" type="button" onClick={onSave} disabled={isBusy}>
            保存配置
          </button>
        </div>
      </aside>
    </div>
  );
}
