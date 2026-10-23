import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { UserNoteView } from "@/lib/notes/types";
import type { AuthContext } from "@/server/authz/context";
import { userNotes } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden, notFound, validationError } from "@/server/errors";

const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;

function newNoteId() {
  return `note_${randomBytes(8).toString("hex")}`;
}

function notesOwnerId(ctx: AuthContext): string {
  return ctx.impersonation?.actorUserId ?? ctx.userId;
}

function toView(row: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): UserNoteView {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnedNote(
  db: AppDb,
  ctx: AuthContext,
  noteId: string
) {
  const ownerId = notesOwnerId(ctx);
  const [row] = await db
    .select()
    .from(userNotes)
    .where(eq(userNotes.id, noteId))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Заметка не найдена");
  }
  if (row.userId !== ownerId) {
    throw forbidden("Нельзя открыть чужую заметку");
  }
  return row;
}

export async function listNotes(db: AppDb, ctx: AuthContext) {
  const ownerId = notesOwnerId(ctx);
  const rows = await db
    .select()
    .from(userNotes)
    .where(
      and(
        eq(userNotes.organizationId, ctx.organizationId),
        eq(userNotes.userId, ownerId)
      )
    )
    .orderBy(desc(userNotes.createdAt));
  return { notes: rows.map(toView) };
}

export async function createNote(db: AppDb, ctx: AuthContext) {
  const ownerId = notesOwnerId(ctx);
  const now = new Date();
  const row = {
    id: newNoteId(),
    organizationId: ctx.organizationId,
    userId: ownerId,
    title: "",
    content: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(userNotes).values(row);
  return { note: toView(row) };
}

export async function updateNote(
  db: AppDb,
  ctx: AuthContext,
  input: { noteId: string; title?: string; content?: string }
) {
  const row = await loadOwnedNote(db, ctx, input.noteId);
  if (input.title != null && input.title.length > TITLE_MAX) {
    throw validationError("Слишком длинное название заметки");
  }
  if (input.content != null && input.content.length > CONTENT_MAX) {
    throw validationError("Слишком длинный текст заметки");
  }
  const title = input.title != null ? input.title : row.title;
  const content = input.content != null ? input.content : row.content;
  const updatedAt = new Date();
  await db
    .update(userNotes)
    .set({ title, content, updatedAt })
    .where(eq(userNotes.id, row.id));
  return {
    note: toView({
      ...row,
      title,
      content,
      updatedAt,
    }),
  };
}

export async function deleteNote(
  db: AppDb,
  ctx: AuthContext,
  noteId: string
) {
  await loadOwnedNote(db, ctx, noteId);
  await db.delete(userNotes).where(eq(userNotes.id, noteId));
  return { ok: true as const };
}
