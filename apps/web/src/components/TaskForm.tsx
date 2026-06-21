import { FolderOpen, Paperclip, Play, Settings2, Upload } from "lucide-react";
import { useRef } from "react";
import type { GenerationBrief } from "@deckforge/deck-ir";

export interface TaskFormValue {
  material_folder_path: string;
  template_reference_path: string;
  user_prompt: string;
  page_count: number;
  language: string;
  tone: string;
}

interface TaskFormProps {
  value: TaskFormValue;
  isBusy: boolean;
  uploadedCount: number;
  isDesktop: boolean;
  onChange: (value: TaskFormValue) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
  onSelectMaterialDirectory: () => void;
  onSelectTemplateFile: () => void;
  onUploadMaterials: (files: FileList) => void;
}

export function toGenerationBrief(value: TaskFormValue): Partial<GenerationBrief> {
  return {
    page_count: value.page_count,
    tone: value.tone,
    language: value.language,
    user_prompt: value.user_prompt
  };
}

export function TaskForm({
  value,
  isBusy,
  uploadedCount,
  isDesktop,
  onChange,
  onSubmit,
  onOpenSettings,
  onSelectMaterialDirectory,
  onSelectTemplateFile,
  onUploadMaterials
}: TaskFormProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const directoryPickerAttrs = { webkitdirectory: "", directory: "" };
  const update = <K extends keyof TaskFormValue>(key: K, next: TaskFormValue[K]) => onChange({ ...value, [key]: next });

  return (
    <section className="task-panel" aria-labelledby="task-title">
      <div className="panel-heading">
        <div>
          <h2 id="task-title">新建任务</h2>
          <p>材料、描述和模板会汇入同一份 DeckIR。</p>
        </div>
        <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="打开 API 与模型配置">
          <Settings2 aria-hidden="true" size={17} />
        </button>
      </div>

      <label className="field">
        <span>材料目录</span>
        <div className="path-row">
          <FolderOpen aria-hidden="true" size={16} />
          <input
            value={value.material_folder_path}
            onChange={(event) => update("material_folder_path", event.target.value)}
            placeholder="选择目录，或输入可被 API 访问的路径"
          />
          <button className="quiet-button path-action" type="button" onClick={onSelectMaterialDirectory}>
            选择
          </button>
          <button className="quiet-button path-action" type="button" onClick={() => uploadRef.current?.click()}>
            <Upload aria-hidden="true" size={15} />
            上传
          </button>
        </div>
        <input
          ref={uploadRef}
          className="visually-hidden"
          type="file"
          multiple
          {...directoryPickerAttrs}
          onChange={(event) => {
            if (event.currentTarget.files) onUploadMaterials(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <small>{isDesktop ? "桌面端会返回真实目录路径。" : uploadedCount > 0 ? `已上传 ${uploadedCount} 个材料文件。` : "浏览器模式可上传文件夹，或保留手动路径。"}</small>
      </label>

      <label className="field">
        <span>用户描述</span>
        <textarea
          value={value.user_prompt}
          onChange={(event) => update("user_prompt", event.target.value)}
          rows={6}
          placeholder="请根据项目材料生成一份给领导汇报的项目汇报 PPT..."
        />
      </label>

      <div className="settings-grid">
        <label className="field compact">
          <span>页数</span>
          <input type="number" min={1} max={12} value={value.page_count} onChange={(event) => update("page_count", Number(event.target.value))} />
        </label>
        <label className="field compact">
          <span>语言</span>
          <select value={value.language} onChange={(event) => update("language", event.target.value)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <label className="field compact">
          <span>风格</span>
          <select value={value.tone} onChange={(event) => update("tone", event.target.value)}>
            <option value="正式">正式</option>
            <option value="技术汇报">技术汇报</option>
            <option value="管理层简报">管理层简报</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>模板引用</span>
        <div className="path-row">
          <Paperclip aria-hidden="true" size={16} />
          <input value={value.template_reference_path} onChange={(event) => update("template_reference_path", event.target.value)} placeholder="可选 .pptx / .html / .png / .pdf / .json" />
          <button className="quiet-button path-action" type="button" onClick={onSelectTemplateFile}>
            选择
          </button>
        </div>
      </label>

      <button className="primary-action" type="button" onClick={onSubmit} disabled={isBusy || !value.user_prompt.trim()}>
        <Play aria-hidden="true" size={16} />
        生成 DeckIR
      </button>
    </section>
  );
}
