import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Download, FileJson2, FileText, Gauge, Layers3, Server, Sparkles } from "lucide-react";
import type { CommentAnchor, DeckIR } from "@deckforge/deck-ir";
import { Inspector } from "./components/Inspector.js";
import { SettingsDrawer } from "./components/SettingsDrawer.js";
import { SlideCanvas } from "./components/SlideCanvas.js";
import { TaskForm, toGenerationBrief, type TaskFormValue } from "./components/TaskForm.js";
import {
  applyComments,
  artifactDownloadUrl,
  createDeck,
  exportPptx,
  getHealth,
  getSettings,
  listArtifacts,
  postComment,
  renderHtml,
  runQa,
  testLlmSettings,
  updateLlmSettings
} from "./services/api.js";
import { copyText, getDesktopBridge } from "./services/desktop.js";
import { readUploadedMaterials } from "./services/materialUpload.js";
import type { Artifact, LlmSettingsPatch, PublicSettings, SelectedElement, SubmittedComment, UploadedMaterial } from "./types/index.js";

type WorkspaceView = "generate" | "deckir" | "artifacts" | "qa";

const defaultForm: TaskFormValue = {
  material_folder_path: "",
  template_reference_path: "",
  user_prompt: "请基于我选择或上传的材料，生成一份结构清晰、适合汇报的 PPT。",
  page_count: 6,
  language: "zh-CN",
  tone: "正式"
};

export function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("generate");
  const [apiOk, setApiOk] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LlmSettingsPatch & { apiKey?: string }>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; model: string; message?: string } | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [uploadedMaterials, setUploadedMaterials] = useState<UploadedMaterial[]>([]);
  const [deck, setDeck] = useState<DeckIR | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<SubmittedComment[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [qaReport, setQaReport] = useState<unknown>(null);
  const [lastPatchWarning, setLastPatchWarning] = useState<string>();
  const [status, setStatus] = useState("准备就绪");
  const [busy, setBusy] = useState(false);

  const desktopBridge = getDesktopBridge();
  const canExport = Boolean(deck);
  const activeDeckId = deck?.id;

  useEffect(() => {
    void refreshConnection();
  }, []);

  const llmModeLabel = useMemo(() => {
    if (!settings) return "模型状态未知";
    if (settings.llm.mode === "openai-compatible" && settings.llm.hasApiKey) return `Mimo / ${settings.llm.model}`;
    if (settings.llm.mode === "openai-compatible") return "OpenAI-compatible（缺少 key）";
    return "Mock / 规则模式";
  }, [settings]);

  const selectedCommentPayload = useMemo<Omit<CommentAnchor, "comment_id" | "status"> | null>(() => {
    if (!selected) return null;
    const bbox = selected.bbox ?? { x: selected.element.x, y: selected.element.y, w: selected.element.w, h: selected.element.h };
    return {
      slide_id: selected.slideId,
      node_id: selected.element.id,
      selected_text: selected.selectedText,
      bbox,
      x: bbox.x,
      y: bbox.y,
      comment: commentText
    };
  }, [commentText, selected]);

  async function refreshConnection() {
    const [healthResult, settingsResult] = await Promise.allSettled([getHealth(), getSettings()]);
    setApiOk(healthResult.status === "fulfilled");
    if (settingsResult.status === "fulfilled") {
      setSettings(settingsResult.value);
      setSettingsDraft({
        mode: settingsResult.value.llm.mode,
        baseUrl: settingsResult.value.llm.baseUrl,
        model: settingsResult.value.llm.model,
        authHeader: settingsResult.value.llm.authHeader
      });
    }
  }

  async function withBusy(label: string, action: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await action();
      setStatus("完成");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshArtifacts(deckId = activeDeckId) {
    if (!deckId) return;
    const result = await listArtifacts(deckId);
    setArtifacts(result.data);
  }

  async function handleSaveSettings() {
    await withBusy("保存模型配置", async () => {
      const payload: LlmSettingsPatch = {
        mode: settingsDraft.mode,
        baseUrl: settingsDraft.baseUrl,
        model: settingsDraft.model,
        authHeader: settingsDraft.authHeader
      };
      if (settingsDraft.apiKey?.trim()) payload.apiKey = settingsDraft.apiKey.trim();
      const next = await updateLlmSettings(payload);
      setSettings(next);
      setSettingsDraft({ mode: next.llm.mode, baseUrl: next.llm.baseUrl, model: next.llm.model, authHeader: next.llm.authHeader });
      setTestResult(null);
      await refreshConnection();
    });
  }

  async function handleTestSettings() {
    await withBusy("测试模型连接", async () => {
      if (settingsDraft.apiKey?.trim()) await handleSaveSettings();
      setTestResult(await testLlmSettings());
      await refreshConnection();
    });
  }

  async function handleSelectMaterialDirectory() {
    if (!desktopBridge) {
      setStatus("浏览器模式请使用“上传”选择文件夹材料。");
      return;
    }
    const nextPath = await desktopBridge.selectMaterialDirectory();
    if (nextPath) {
      setForm((current) => ({ ...current, material_folder_path: nextPath }));
      setUploadedMaterials([]);
    }
  }

  async function handleSelectTemplateFile() {
    if (!desktopBridge) {
      setStatus("浏览器模式暂不支持读取本机模板路径，可手动输入 API 可访问路径。");
      return;
    }
    const nextPath = await desktopBridge.selectTemplateFile();
    if (nextPath) setForm((current) => ({ ...current, template_reference_path: nextPath }));
  }

  async function handleUploadMaterials(files: FileList) {
    await withBusy("读取浏览器材料", async () => {
      const materials = await readUploadedMaterials(files);
      setUploadedMaterials(materials);
      setForm((current) => ({ ...current, material_folder_path: "" }));
      setStatus(`已读取 ${materials.length} 个材料文件`);
    });
  }

  async function handleCreateDeck() {
    await withBusy("生成 DeckIR", async () => {
      const nextDeck = await createDeck({
        material_folder_path: uploadedMaterials.length > 0 ? undefined : form.material_folder_path || undefined,
        uploaded_materials: uploadedMaterials.length > 0 ? uploadedMaterials : undefined,
        template_reference_path: form.template_reference_path || undefined,
        user_prompt: form.user_prompt,
        generation_brief: toGenerationBrief(form)
      });
      setDeck(nextDeck);
      setActiveIndex(0);
      setSelected(null);
      setComments([]);
      setLastPatchWarning(undefined);
      setActiveView("generate");
      await refreshArtifacts(nextDeck.id);
    });
  }

  function openArtifactDownload(artifact: Artifact) {
    if (!activeDeckId) return;
    window.open(artifactDownloadUrl(activeDeckId, artifact.id), "_blank", "noopener,noreferrer");
  }

  const inspector = (
    <Inspector
      selected={selected}
      commentText={commentText}
      comments={comments}
      artifacts={artifacts}
      isBusy={busy}
      llmModeLabel={llmModeLabel}
      lastPatchWarning={lastPatchWarning}
      onCommentTextChange={setCommentText}
      onSubmitComment={() =>
        activeDeckId &&
        selectedCommentPayload &&
        withBusy("提交评论", async () => {
          const saved = await postComment(activeDeckId, selectedCommentPayload);
          setComments((current) => [...current, saved]);
          setCommentText("");
        })
      }
      onApplyComments={() =>
        activeDeckId &&
        withBusy("应用评论", async () => {
          const result = await applyComments(activeDeckId);
          setDeck(result.deck);
          setComments([]);
          setSelected(null);
          setLastPatchWarning(result.warnings?.[0]);
        })
      }
      onCopyArtifact={(artifact) => void copyText(artifact.path).then(() => setStatus("已复制路径"))}
      onOpenArtifact={(artifact) => {
        if (desktopBridge) void desktopBridge.openPath(artifact.path);
        else void copyText(artifact.path).then(() => setStatus("浏览器模式已复制路径"));
      }}
      onDownloadArtifact={openArtifactDownload}
    />
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">稿</div>
          <div>
            <h1>DeckForge 稿炉</h1>
            <p>企业内网 PPT Agent 工作台</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className={`api-status ${apiOk ? "ok" : "down"}`} type="button" onClick={() => setSettingsOpen(true)}>
            <Server aria-hidden="true" size={15} />
            {apiOk ? "API 已连接" : "API 未连接"}
          </button>
          <button className="quiet-button" type="button" disabled={!canExport || busy} onClick={() => activeDeckId && withBusy("生成 HTML 预览", async () => { await renderHtml(activeDeckId); await refreshArtifacts(activeDeckId); setActiveView("artifacts"); })}>
            <FileText aria-hidden="true" size={16} />
            HTML 预览
          </button>
          <button className="quiet-button" type="button" disabled={!canExport || busy} onClick={() => activeDeckId && withBusy("导出 PPTX", async () => { await exportPptx(activeDeckId); await refreshArtifacts(activeDeckId); setActiveView("artifacts"); })}>
            <Download aria-hidden="true" size={16} />
            导出 PPTX
          </button>
          <button className="quiet-button" type="button" disabled={!canExport || busy} onClick={() => activeDeckId && withBusy("运行 QA", async () => { const result = await runQa(activeDeckId); setQaReport(result.report); await refreshArtifacts(activeDeckId); setActiveView("qa"); })}>
            <Gauge aria-hidden="true" size={16} />
            运行 QA
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <nav aria-label="workspace">
            <NavButton active={activeView === "generate"} icon={<Sparkles aria-hidden="true" size={16} />} onClick={() => setActiveView("generate")}>生成任务</NavButton>
            <NavButton active={activeView === "deckir"} icon={<FileJson2 aria-hidden="true" size={16} />} onClick={() => setActiveView("deckir")}>DeckIR</NavButton>
            <NavButton active={activeView === "artifacts"} icon={<Layers3 aria-hidden="true" size={16} />} onClick={() => setActiveView("artifacts")}>Artifacts</NavButton>
            <NavButton active={activeView === "qa"} icon={<Gauge aria-hidden="true" size={16} />} onClick={() => setActiveView("qa")}>渲染报告</NavButton>
          </nav>
          <div className="sidebar-status">
            <span>状态</span>
            <strong>{busy ? "处理中" : status}</strong>
          </div>
        </aside>

        {activeView === "generate" ? (
          <div className="work-grid">
            <TaskForm
              value={form}
              isBusy={busy}
              uploadedCount={uploadedMaterials.length}
              isDesktop={Boolean(desktopBridge)}
              onChange={setForm}
              onSubmit={handleCreateDeck}
              onOpenSettings={() => setSettingsOpen(true)}
              onSelectMaterialDirectory={() => void handleSelectMaterialDirectory()}
              onSelectTemplateFile={() => void handleSelectTemplateFile()}
              onUploadMaterials={(files) => void handleUploadMaterials(files)}
            />
            <SlideCanvas
              deck={deck}
              activeIndex={activeIndex}
              selected={selected}
              onSelect={(selection) => {
                setSelected(selection);
                setCommentText("");
              }}
              onNavigate={(nextIndex) => setActiveIndex(Math.max(0, Math.min((deck?.slides.length ?? 1) - 1, nextIndex)))}
            />
            {inspector}
          </div>
        ) : (
          <div className="work-grid">
            <DataView
              view={activeView}
              deck={deck}
              artifacts={artifacts}
              qaReport={qaReport}
              onCopyArtifact={(artifact) => void copyText(artifact.path).then(() => setStatus("已复制路径"))}
              onOpenArtifact={(artifact) => {
                if (desktopBridge) void desktopBridge.openPath(artifact.path);
                else openArtifactDownload(artifact);
              }}
              onDownloadArtifact={openArtifactDownload}
            />
            {inspector}
          </div>
        )}
      </main>

      <SettingsDrawer
        isOpen={settingsOpen}
        settings={settings}
        draft={settingsDraft}
        isBusy={busy}
        testResult={testResult}
        onDraftChange={setSettingsDraft}
        onClose={() => setSettingsOpen(false)}
        onSave={() => void handleSaveSettings()}
        onTest={() => void handleTestSettings()}
      />
    </div>
  );
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`nav-item ${active ? "is-active" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function DataView({
  view,
  deck,
  artifacts,
  qaReport,
  onCopyArtifact,
  onOpenArtifact,
  onDownloadArtifact
}: {
  view: Exclude<WorkspaceView, "generate">;
  deck: DeckIR | null;
  artifacts: Artifact[];
  qaReport: unknown;
  onCopyArtifact: (artifact: Artifact) => void;
  onOpenArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
}) {
  if (view === "deckir") {
    return (
      <section className="data-view span-two">
        <div className="panel-heading">
          <div>
            <h2>DeckIR</h2>
            <p>{deck ? `${deck.slides.length} slides / ${deck.material_manifest.documents.length} materials` : "生成后显示结构化 JSON。"}</p>
          </div>
        </div>
        <pre className="json-view">{deck ? JSON.stringify(deck, null, 2) : "尚未生成 DeckIR"}</pre>
      </section>
    );
  }

  if (view === "artifacts") {
    return (
      <section className="data-view span-two">
        <div className="panel-heading">
          <div>
            <h2>Artifacts</h2>
            <p>导出的 HTML、PPTX 和 QA 文件会出现在这里。</p>
          </div>
        </div>
        <ArtifactTable artifacts={artifacts} onCopy={onCopyArtifact} onOpen={onOpenArtifact} onDownload={onDownloadArtifact} />
      </section>
    );
  }

  return (
    <section className="data-view span-two">
      <div className="panel-heading">
        <div>
          <h2>渲染报告</h2>
          <p>运行 QA 后显示静态和渲染检查结果。</p>
        </div>
      </div>
      <pre className="json-view">{qaReport ? JSON.stringify(qaReport, null, 2) : "尚未运行 QA"}</pre>
    </section>
  );
}

function ArtifactTable({
  artifacts,
  onCopy,
  onOpen,
  onDownload
}: {
  artifacts: Artifact[];
  onCopy: (artifact: Artifact) => void;
  onOpen: (artifact: Artifact) => void;
  onDownload: (artifact: Artifact) => void;
}) {
  if (artifacts.length === 0) return <p className="empty-note">暂无 artifact。</p>;
  return (
    <div className="artifact-table">
      {artifacts.map((artifact) => (
        <div className="artifact-row" key={artifact.id}>
          <strong>{artifact.type}</strong>
          <span title={artifact.path}>{artifact.path}</span>
          <time>{new Date(artifact.created_at).toLocaleString()}</time>
          <div className="row-actions">
            <button className="quiet-button" type="button" onClick={() => onCopy(artifact)}>复制路径</button>
            <button className="quiet-button" type="button" onClick={() => onOpen(artifact)}>打开</button>
            <button className="quiet-button" type="button" onClick={() => onDownload(artifact)}>下载</button>
          </div>
        </div>
      ))}
    </div>
  );
}
