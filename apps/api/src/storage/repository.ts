import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { CommentAnchor, DeckIR, PatchOperation } from "@deckforge/deck-ir";
import { safeJsonParse } from "@deckforge/shared";

const require = createRequire(import.meta.url);

interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

export interface DeckRecord {
  id: string;
  title: string;
  deck: DeckIR;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRecord {
  id: string;
  deck_id: string;
  type: string;
  path: string;
  created_at: string;
}

export class StorageRepository {
  private readonly db: DatabaseLike;

  constructor(dbPath: string) {
    const resolved = resolve(dbPath);
    mkdirSync(dirname(resolved), { recursive: true });
    const sqlite = require("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseLike };
    this.db = new sqlite.DatabaseSync(resolved);
    this.migrate();
  }

  createDeck(deck: DeckIR): DeckRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO decks (id, title, deck_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(deck.id, deck.title, JSON.stringify(deck), now, now);
    return { id: deck.id, title: deck.title, deck, created_at: now, updated_at: now };
  }

  updateDeck(deck: DeckIR): DeckRecord {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE decks SET title = ?, deck_json = ?, updated_at = ? WHERE id = ?").run(deck.title, JSON.stringify(deck), now, deck.id);
    const record = this.getDeck(deck.id);
    if (!record) throw new Error(`Deck not found after update: ${deck.id}`);
    return record;
  }

  getDeck(id: string): DeckRecord | undefined {
    const row = this.db.prepare("SELECT * FROM decks WHERE id = ?").get(id);
    return row ? rowToDeckRecord(row) : undefined;
  }

  listDecks(): DeckRecord[] {
    return this.db.prepare("SELECT * FROM decks ORDER BY updated_at DESC").all().map(rowToDeckRecord);
  }

  addComment(comment: CommentAnchor): CommentAnchor {
    this.db
      .prepare("INSERT INTO comments (id, deck_id, slide_id, node_id, comment_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        comment.comment_id,
        comment.slide_id.split("::")[0] ?? "",
        comment.slide_id,
        comment.node_id,
        JSON.stringify(comment),
        comment.status,
        new Date().toISOString()
      );
    return comment;
  }

  listComments(deckId: string): CommentAnchor[] {
    return this.db
      .prepare("SELECT comment_json FROM comments WHERE deck_id = ? OR slide_id LIKE ? ORDER BY created_at ASC")
      .all(deckId, `${deckId}::%`)
      .map((row) => safeJsonParse(String(row["comment_json"]), undefined as unknown as CommentAnchor))
      .filter(Boolean);
  }

  markCommentsPatched(deckId: string): void {
    this.db.prepare("UPDATE comments SET status = 'patched' WHERE deck_id = ? OR slide_id LIKE ?").run(deckId, `${deckId}::%`);
  }

  addPatch(deckId: string, patch: PatchOperation): void {
    this.db
      .prepare("INSERT INTO patches (id, deck_id, patch_json, created_at) VALUES (?, ?, ?, ?)")
      .run(`${deckId}_${Date.now()}_${Math.random().toString(16).slice(2)}`, deckId, JSON.stringify(patch), new Date().toISOString());
  }

  addArtifact(deckId: string, type: string, artifactPath: string): ArtifactRecord {
    const artifact: ArtifactRecord = {
      id: `artifact_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      deck_id: deckId,
      type,
      path: artifactPath,
      created_at: new Date().toISOString()
    };
    this.db
      .prepare("INSERT INTO artifacts (id, deck_id, type, path, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(artifact.id, artifact.deck_id, artifact.type, artifact.path, artifact.created_at);
    return artifact;
  }

  listArtifacts(deckId: string): ArtifactRecord[] {
    return this.db
      .prepare("SELECT * FROM artifacts WHERE deck_id = ? ORDER BY created_at DESC")
      .all(deckId)
      .map((row) => ({
        id: String(row["id"]),
        deck_id: String(row["deck_id"]),
        type: String(row["type"]),
        path: String(row["path"]),
        created_at: String(row["created_at"])
      }));
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        deck_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        comment_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS patches (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        patch_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?, ?)").run("001_initial", new Date().toISOString());
  }
}

function rowToDeckRecord(row: Record<string, unknown>): DeckRecord {
  return {
    id: String(row["id"]),
    title: String(row["title"]),
    deck: safeJsonParse(String(row["deck_json"]), undefined as unknown as DeckIR),
    created_at: String(row["created_at"]),
    updated_at: String(row["updated_at"])
  };
}
