import { applyPatchOperation, type CommentAnchor, type DeckIR, type PatchOperation } from "@deckforge/deck-ir";

export function commentToPatch(comment: CommentAnchor): PatchOperation | undefined {
  const text = comment.comment.trim();
  const replacement = text.match(/(?:改成|替换为|replace with)\s*[:：]?\s*(.+)$/i);
  if (replacement?.[1]) {
    return {
      op: "replace_text",
      slide_id: comment.slide_id,
      node_id: comment.node_id,
      payload: { text: cleanupQuoted(replacement[1]) }
    };
  }
  if (/删除|去掉|delete/i.test(text)) {
    return { op: "delete_element", slide_id: comment.slide_id, node_id: comment.node_id, payload: {} };
  }
  if (/往右|右移/i.test(text)) return move(comment, 0.25, 0);
  if (/往左|左移/i.test(text)) return move(comment, -0.25, 0);
  if (/上移|往上/i.test(text)) return move(comment, 0, -0.25);
  if (/下移|往下/i.test(text)) return move(comment, 0, 0.25);
  if (/放大/i.test(text)) return resize(comment, 0.25, 0.18);
  if (/缩小/i.test(text)) return resize(comment, -0.25, -0.18);
  return {
    op: "rewrite_text",
    slide_id: comment.slide_id,
    node_id: comment.node_id,
    payload: {
      instruction: text,
      text: comment.selected_text || text
    }
  };
}

export function applyPatch(deckIR: DeckIR, patch: PatchOperation): DeckIR {
  return applyPatchOperation(deckIR, patch);
}

export function applyPatches(deckIR: DeckIR, patches: PatchOperation[]): DeckIR {
  return patches.reduce((deck, patch) => applyPatchOperation(deck, patch), deckIR);
}

function move(comment: CommentAnchor, dx: number, dy: number): PatchOperation {
  return { op: "move_element", slide_id: comment.slide_id, node_id: comment.node_id, payload: { dx, dy } };
}

function resize(comment: CommentAnchor, dw: number, dh: number): PatchOperation {
  return { op: "resize_element", slide_id: comment.slide_id, node_id: comment.node_id, payload: { dw, dh } };
}

function cleanupQuoted(value: string): string {
  return value.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
}
