import { Clipboard, ClipboardCheck, Download, ExternalLink, MessageSquarePlus, Wrench } from "lucide-react";
import type { Artifact, SelectedElement, SubmittedComment } from "../types/index.js";

interface InspectorProps {
  selected: SelectedElement | null;
  commentText: string;
  comments: SubmittedComment[];
  artifacts: Artifact[];
  isBusy: boolean;
  llmModeLabel: string;
  lastPatchWarning?: string;
  onCommentTextChange: (text: string) => void;
  onSubmitComment: () => void;
  onApplyComments: () => void;
  onCopyArtifact: (artifact: Artifact) => void;
  onOpenArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
}

export function Inspector({
  selected,
  commentText,
  comments,
  artifacts,
  isBusy,
  llmModeLabel,
  lastPatchWarning,
  onCommentTextChange,
  onSubmitComment,
  onApplyComments,
  onCopyArtifact,
  onOpenArtifact,
  onDownloadArtifact
}: InspectorProps) {
  return (
    <aside className="inspector" aria-label="评论与产物">
      <section className="side-section">
        <div className="panel-heading tight">
          <div>
            <h2>评论</h2>
            <p>{selected ? `${selected.slideId} / ${selected.element.id}` : "先在预览中选择元素"}</p>
          </div>
          <MessageSquarePlus aria-hidden="true" size={18} />
        </div>
        <div className="mode-pill">{llmModeLabel}</div>
        <textarea
          value={commentText}
          onChange={(event) => onCommentTextChange(event.target.value)}
          disabled={!selected}
          rows={5}
          placeholder="例如：把标题改成“私有化 AI 平台建设路线”，或把这一项右移并放大"
        />
        <button type="button" className="secondary-action" disabled={!selected || !commentText.trim() || isBusy} onClick={onSubmitComment}>
          <ClipboardCheck aria-hidden="true" size={16} />
          提交评论
        </button>
        <button type="button" className="secondary-action muted" disabled={comments.length === 0 || isBusy} onClick={onApplyComments}>
          <Wrench aria-hidden="true" size={16} />
          应用评论
        </button>
        {lastPatchWarning ? <p className="inline-warning">{lastPatchWarning}</p> : null}
      </section>

      <section className="side-section">
        <h2>评论列表</h2>
        {comments.length === 0 ? (
          <p className="empty-note">暂无评论。</p>
        ) : (
          <ul className="comment-list">
            {comments.map((comment) => (
              <li key={comment.comment_id}>
                <strong>{comment.node_id}</strong>
                <span>{comment.comment}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="side-section">
        <h2>Artifacts</h2>
        {artifacts.length === 0 ? (
          <p className="empty-note">导出或 QA 后会显示可操作产物。</p>
        ) : (
          <ul className="artifact-list">
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <div>
                  <strong>{artifact.type}</strong>
                  <span title={artifact.path}>{fileName(artifact.path)}</span>
                  <small title={artifact.path}>{artifact.path}</small>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-button" onClick={() => onCopyArtifact(artifact)} aria-label="复制路径">
                    <Clipboard aria-hidden="true" size={15} />
                  </button>
                  <button type="button" className="icon-button" onClick={() => onOpenArtifact(artifact)} aria-label="打开文件">
                    <ExternalLink aria-hidden="true" size={15} />
                  </button>
                  <button type="button" className="icon-button" onClick={() => onDownloadArtifact(artifact)} aria-label="下载 artifact">
                    <Download aria-hidden="true" size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function fileName(value: string): string {
  return value.split(/[\\/]/).pop() || value;
}
