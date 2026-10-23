import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { userNotes } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { startImpersonation } from "@/server/services/impersonation-service";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/server/services/notes-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("personal notes", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("creates, updates, lists newest first, and deletes only the owner note", async () => {
    const t = await createTestDb();
    close = t.close;
    const s1 = await asRole(t.db, "s1@demo.local");

    const first = await createNote(t.db, s1);
    expect(first.note.title).toBe("");
    expect(first.note.content).toBe("");

    const saved = await updateNote(t.db, s1, {
      noteId: first.note.id,
      title: "Мои задачи",
      content: "повторить кинематику",
    });
    expect(saved.note.title).toBe("Мои задачи");
    expect(saved.note.content).toBe("повторить кинематику");
    expect(saved.note.createdAt).toBe(first.note.createdAt);
    expect(new Date(saved.note.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.note.updatedAt).getTime()
    );

    await t.db
      .update(userNotes)
      .set({ createdAt: new Date(Date.now() - 1000) })
      .where(eq(userNotes.id, first.note.id));
    const second = await createNote(t.db, s1);

    const listed = await listNotes(t.db, s1);
    expect(listed.notes.map((n) => n.id)).toEqual([
      second.note.id,
      first.note.id,
    ]);

    const again = await updateNote(t.db, s1, {
      noteId: first.note.id,
      content: "повторить кинематику ещё раз",
    });
    const rows = await t.db
      .select()
      .from(userNotes)
      .where(eq(userNotes.userId, s1.userId));
    expect(rows).toHaveLength(2);
    expect(again.note.content).toBe("повторить кинематику ещё раз");

    await deleteNote(t.db, s1, first.note.id);
    const afterDelete = await listNotes(t.db, s1);
    expect(afterDelete.notes.map((n) => n.id)).toEqual([second.note.id]);
  });

  it("isolates notes between users and rejects spoofed ids", async () => {
    const t = await createTestDb();
    close = t.close;
    const s1 = await asRole(t.db, "s1@demo.local");
    const s2 = await asRole(t.db, "s2@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const director = await asRole(t.db, "director@demo.local");

    const studentNote = await createNote(t.db, s1);
    await updateNote(t.db, s1, {
      noteId: studentNote.note.id,
      title: "личное",
      content: "не для других",
    });
    await createNote(t.db, s2);
    await createNote(t.db, anna);
    await createNote(t.db, director);

    expect((await listNotes(t.db, s1)).notes).toHaveLength(1);
    expect((await listNotes(t.db, s2)).notes).toHaveLength(1);
    expect((await listNotes(t.db, anna)).notes).toHaveLength(1);
    expect((await listNotes(t.db, director)).notes).toHaveLength(1);
    expect((await listNotes(t.db, s1)).notes[0]?.id).toBe(studentNote.note.id);

    await expect(
      updateNote(t.db, s2, {
        noteId: studentNote.note.id,
        title: "чужое",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteNote(t.db, director, studentNote.note.id)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateNote(t.db, director, {
        noteId: studentNote.note.id,
        content: "директор не должен видеть",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not expose student notes while the director impersonates the student", async () => {
    const t = await createTestDb();
    close = t.close;
    const s1 = await asRole(t.db, "s1@demo.local");
    const director = await asRole(t.db, "director@demo.local");
    const studentNote = await createNote(t.db, s1);
    const directorNote = await createNote(t.db, director);

    const started = await startImpersonation(t.db, director, {
      targetUserId: s1.userId,
    });
    const imp = await resolveAuthContext(t.db, started.session.rawToken);
    const listed = await listNotes(t.db, imp);
    expect(listed.notes.map((n) => n.id)).toEqual([directorNote.note.id]);
    expect(listed.notes.find((n) => n.id === studentNote.note.id)).toBeUndefined();
    await expect(
      updateNote(t.db, imp, {
        noteId: studentNote.note.id,
        title: "подмена",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
