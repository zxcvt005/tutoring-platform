import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { chatMessages, students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  assignHomework,
  publishHomework,
  setAttendance,
  setLessonTopic,
  upsertHomework,
  upsertLesson,
  upsertStudent,
} from "@/server/services/platform-mutations";
import {
  deleteMessage,
  editMessage,
  getAttachmentForViewer,
  getOrCreateChatPair,
  listChats,
  listMessages,
  markChatRead,
  sendMessage,
} from "@/server/services/chat-service";
import { setChatObjectStoreForTests as setStore } from "@/server/media/chat-storage";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("chats", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    setStore(null);
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

  function jpeg() {
    return Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
  }

  it("creates a chat with the current teacher and does not duplicate it", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const first = await listChats(t.db, student);
    const second = await listChats(t.db, student);
    const withAnna = first.items.filter((c) => c.teacherId === "t1");
    expect(withAnna).toHaveLength(1);
    expect(second.items.filter((c) => c.teacherId === "t1")).toHaveLength(1);
    expect(withAnna[0]!.id).toBe(
      second.items.find((c) => c.teacherId === "t1")!.id
    );
    const pair = await getOrCreateChatPair(t.db, {
      organizationId: student.organizationId,
      studentId: "s1",
      teacherId: "t1",
    });
    expect(pair.id).toBe(withAnna[0]!.id);
  });

  it("keeps history after teacher change and isolates chats", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const igor = await asRole(t.db, "igor@example.com");
    const other = await asRole(t.db, "s2@demo.local");
    const director = await asRole(t.db, "director@demo.local");

    const before = await listChats(t.db, student);
    const oldChat = before.items.find((c) => c.teacherId === "t1")!;
    await sendMessage(t.db, student, {
      chatId: oldChat.id,
      body: "Привет, Анна",
      clientRequestId: "req_oldchat01",
    });

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s1"))
      .limit(1);
    await upsertStudent(t.db, director, {
      id: "s1",
      fullName: row!.fullName,
      status: row!.status as "active" | "paused",
      teacherId: "t2",
      contacts: row!.contacts ?? undefined,
      notes: row!.notes ?? undefined,
    });

    const after = await listChats(t.db, student);
    const stillOld = after.items.find((c) => c.teacherId === "t1")!;
    const nextChat = after.items.find((c) => c.teacherId === "t2")!;
    expect(stillOld.id).toBe(oldChat.id);
    expect(nextChat.id).not.toBe(oldChat.id);
    expect(stillOld.canSend).toBe(false);
    expect(nextChat.canSend).toBe(true);
    expect(stillOld.isCurrentPair).toBe(false);
    expect(nextChat.isCurrentPair).toBe(true);

    const oldHistory = await listMessages(t.db, student, { chatId: stillOld.id });
    expect(oldHistory.messages.some((m) => m.body === "Привет, Анна")).toBe(true);

    await sendMessage(t.db, student, {
      chatId: nextChat.id,
      body: "Привет, Игорь",
      clientRequestId: "req_newchat01",
    });

    await expect(
      listMessages(t.db, anna, { chatId: nextChat.id })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      listMessages(t.db, igor, { chatId: stillOld.id })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      listMessages(t.db, other, { chatId: stillOld.id })
    ).rejects.toMatchObject({ status: 403 });

    const igorList = await listChats(t.db, igor);
    expect(igorList.items.some((c) => c.id === nextChat.id)).toBe(true);
    expect(igorList.items.some((c) => c.id === stillOld.id)).toBe(false);
    const annaList = await listChats(t.db, anna);
    expect(annaList.items.some((c) => c.id === stillOld.id)).toBe(true);
    expect(annaList.items.some((c) => c.id === nextChat.id)).toBe(false);
  });

  it("sends messages, paginates, and is idempotent on retry", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const list = await listChats(t.db, student);
    const chatId = list.items[0]!.id;
    for (let i = 0; i < 45; i++) {
      await sendMessage(t.db, student, {
        chatId,
        body: `msg ${i}`,
        clientRequestId: `reqpage${String(i).padStart(4, "0")}`,
      });
    }
    const page = await listMessages(t.db, student, { chatId, limit: 40 });
    expect(page.messages).toHaveLength(40);
    expect(page.hasMore).toBe(true);
    const older = await listMessages(t.db, student, {
      chatId,
      before: page.oldestCreatedAt,
      beforeId: page.messages[0]!.id,
      limit: 40,
    });
    expect(older.messages.length).toBeGreaterThan(0);
    expect(older.messages[0]!.body).not.toBe(page.messages[0]!.body);

    const first = await sendMessage(t.db, student, {
      chatId,
      body: "один раз",
      clientRequestId: "req_dup_send01",
    });
    const again = await sendMessage(t.db, student, {
      chatId,
      body: "один раз",
      clientRequestId: "req_dup_send01",
    });
    expect(again.message.id).toBe(first.message.id);
  });

  it("allows edit/delete within 24 hours and forbids later or foreign", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const list = await listChats(t.db, student);
    const chatId = list.items[0]!.id;
    const sent = await sendMessage(t.db, student, {
      chatId,
      body: "черновик",
      clientRequestId: "req_edit_ok01",
    });
    const edited = await editMessage(t.db, student, {
      chatId,
      messageId: sent.message.id,
      body: "готово",
    });
    expect(edited.body).toBe("готово");
    expect(edited.editedAt).toBeTruthy();

    await expect(
      editMessage(t.db, anna, {
        chatId,
        messageId: sent.message.id,
        body: "чужое",
      })
    ).rejects.toMatchObject({ status: 403 });

    const deleted = await deleteMessage(t.db, student, {
      chatId,
      messageId: sent.message.id,
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.body).toBeNull();
    expect(deleted.attachments).toEqual([]);

    const late = await sendMessage(t.db, student, {
      chatId,
      body: "старое",
      clientRequestId: "req_edit_old01",
    });
    await t.db
      .update(chatMessages)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(chatMessages.id, late.message.id));
    await expect(
      editMessage(t.db, student, {
        chatId,
        messageId: late.message.id,
        body: "поздно",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteMessage(t.db, student, { chatId, messageId: late.message.id })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("uploads allowed files, rejects bad ones, and hides foreign attachments", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const other = await asRole(t.db, "s2@demo.local");
    const list = await listChats(t.db, student);
    const chatId = list.items[0]!.id;
    const ok = await sendMessage(t.db, student, {
      chatId,
      body: "фото",
      clientRequestId: "req_file_ok001",
      files: [{ bytes: jpeg(), filename: "photo.jpg" }],
    });
    expect(ok.incomplete).toBe(false);
    expect(ok.message.attachments).toHaveLength(1);
    const attId = ok.message.attachments[0]!.id;
    const file = await getAttachmentForViewer(t.db, student, attId);
    expect(file.mimeType).toBe("image/jpeg");
    await expect(getAttachmentForViewer(t.db, other, attId)).rejects.toMatchObject(
      { status: 403 }
    );

    await expect(
      sendMessage(t.db, student, {
        chatId,
        clientRequestId: "req_file_bad01",
        files: [{ bytes: Buffer.from("MZ not an image"), filename: "virus.exe" }],
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      sendMessage(t.db, student, {
        chatId,
        clientRequestId: "req_file_big01",
        files: [{ bytes: Buffer.alloc(20 * 1024 * 1024 + 8, 0xff), filename: "big.jpg" }],
      })
    ).rejects.toMatchObject({ status: 400 });

    setStore({
      async put() {
        throw new Error("storage down");
      },
      async get() {
        throw new Error("missing");
      },
      async delete() {},
    });
    const failed = await sendMessage(t.db, student, {
      chatId,
      body: "с файлом",
      clientRequestId: "req_file_fail1",
      files: [{ bytes: jpeg(), filename: "again.jpg" }],
    });
    expect(failed.incomplete).toBe(true);
    expect(failed.attachmentErrors.length).toBeGreaterThan(0);
    expect(failed.message.body).toBe("с файлом");
  });

  it("tracks unread until a specific dialog is opened and restores after re-login", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const list = await listChats(t.db, student);
    const chatId = list.items[0]!.id;
    await sendMessage(t.db, anna, {
      chatId,
      body: "новое",
      clientRequestId: "req_unr_001",
    });
    const unread = await listChats(t.db, student);
    expect(unread.unreadTotal).toBeGreaterThan(0);
    const item = unread.items.find((c) => c.id === chatId)!;
    expect(item.unreadCount).toBeGreaterThan(0);

    const listedAgain = await listChats(t.db, student);
    expect(listedAgain.unreadTotal).toBe(unread.unreadTotal);

    const thread = await listMessages(t.db, student, { chatId });
    const last = thread.messages[thread.messages.length - 1]!;
    await markChatRead(t.db, student, { chatId, messageId: last.id });
    const relogin = await asRole(t.db, "s1@demo.local");
    const restored = await listChats(t.db, relogin);
    expect(restored.items.find((c) => c.id === chatId)!.unreadCount).toBe(0);
  });

  it("creates system events after success, skips errors and duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s1@demo.local");
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    const lesson = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Кинематика",
    });

    await expect(
      setAttendance(t.db, student, lesson.id, "s1", "present")
    ).rejects.toMatchObject({ status: 403 });

    await setAttendance(t.db, anna, lesson.id, "s1", "present");
    await setAttendance(t.db, anna, lesson.id, "s1", "present");
    await setLessonTopic(t.db, anna, {
      lessonId: lesson.id,
      title: "Кинематика",
    });
    await setLessonTopic(t.db, anna, {
      lessonId: lesson.id,
      title: "Кинематика",
    });

    await publishHomework(t.db, anna, "hw1").catch(() => undefined);
    await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      teacherId: "t1",
      studentIds: ["s1"],
      lessonId: lesson.id,
    });
    await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      teacherId: "t1",
      studentIds: ["s1"],
      lessonId: lesson.id,
    });

    await upsertLesson(t.db, anna, {
      id: lesson.id,
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "cancelled",
      subject: "Кинематика",
    });

    const chats = await listChats(t.db, student);
    const chatId = chats.items.find((c) => c.teacherId === "t1")!.id;
    const thread = await listMessages(t.db, student, { chatId, limit: 80 });
    const events = thread.messages.filter((m) => m.type === "system_event");
    const types = events.map((m) => m.eventType);
    expect(types.filter((x) => x === "attendance_saved")).toHaveLength(1);
    expect(types.filter((x) => x === "topic_set")).toHaveLength(1);
    expect(types.filter((x) => x === "homework_assigned")).toHaveLength(1);
    expect(types.filter((x) => x === "lesson_cancelled")).toHaveLength(1);
    expect(events.every((m) => !m.canEdit && !m.canDelete)).toBe(true);

    await expect(
      editMessage(t.db, student, {
        chatId,
        messageId: events[0]!.id,
        body: "подделка",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteMessage(t.db, student, { chatId, messageId: events[0]!.id })
    ).rejects.toMatchObject({ status: 403 });

    const igor = await asRole(t.db, "igor@example.com");
    await expect(listMessages(t.db, igor, { chatId })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("emits homework completed and awaiting review without leaking answers", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s1@demo.local");
    await upsertHomework(t.db, anna, {
      id: "hw_chat_auto",
      teacherId: "t1",
      title: "Законы Ньютона",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "F=?",
          maxScore: 1,
          options: [
            { id: "oa", text: "ma" },
            { id: "ob", text: "mv" },
          ],
          correctOptionIds: ["oa"],
        },
      ],
    });
    await publishHomework(t.db, anna, "hw_chat_auto");
    const assigned = await assignHomework(t.db, anna, {
      homeworkId: "hw_chat_auto",
      teacherId: "t1",
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);

    const { submitAssignment } = await import(
      "@/server/services/assignments-service"
    );
    const { testAssignments } = await import("@/server/db/schema");
    const [ha] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, "hw_chat_auto"));
    await submitAssignment(t.db, student, ha!.id, [
      { questionId: "q1", selectedOptionIds: ["oa"] },
    ]);

    const list = await listChats(t.db, student);
    const chatId = list.items.find((c) => c.teacherId === "t1")!.id;
    const thread = await listMessages(t.db, student, { chatId, limit: 80 });
    const events = thread.messages.filter((m) => m.type === "system_event");
    expect(events.some((m) => m.eventType === "homework_completed")).toBe(true);
    const payload = JSON.stringify(events.map((m) => m.eventPayload));
    expect(payload).not.toContain("correctOptionIds");
    expect(payload).not.toContain("oa");
  });
});
