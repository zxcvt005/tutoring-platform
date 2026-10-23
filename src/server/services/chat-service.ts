import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  CHAT_EDIT_WINDOW_MS,
  CHAT_LIST_PAGE_SIZE,
  CHAT_MAX_BODY_CHARS,
  CHAT_MAX_FILES,
  CHAT_PAGE_SIZE,
  CHAT_PENDING_TTL_MS,
} from "@/lib/chat/constants";
import {
  extForMime,
  isChatImageMime,
  safeOriginalName,
  sniffChatFile,
} from "@/lib/chat/file-sniff";
import { chatMessagePreview } from "@/lib/chat/preview";
import type {
  ChatAttachmentView,
  ChatListItem,
  ChatListResponse,
  ChatMessageView,
  ChatMessagesResponse,
  ChatSendResult,
  ChatSummary,
  ChatThreadMeta,
} from "@/lib/chat/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  chatAttachments,
  chatMessages,
  chatPendingObjects,
  chatReadCursors,
  chats,
  students,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  forbidden,
  notFound,
} from "@/server/errors";
import {
  deleteChatObject,
  getChatObject,
  putChatObject,
} from "@/server/media/chat-storage";

export type ChatUploadInput = {
  bytes: Buffer;
  filename: string;
};

type ChatRow = typeof chats.$inferSelect;

export function newChatEntityId(prefix: "cht" | "msg" | "att"): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function isWithinEditWindow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= CHAT_EDIT_WINDOW_MS;
}

export async function getOrCreateChatPair(
  db: AppDb,
  input: { organizationId: string; studentId: string; teacherId: string }
): Promise<ChatRow> {
  const id = newChatEntityId("cht");
  await db
    .insert(chats)
    .values({
      id,
      organizationId: input.organizationId,
      studentId: input.studentId,
      teacherId: input.teacherId,
    })
    .onConflictDoNothing({
      target: [chats.organizationId, chats.studentId, chats.teacherId],
    });
  const [row] = await db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.organizationId, input.organizationId),
        eq(chats.studentId, input.studentId),
        eq(chats.teacherId, input.teacherId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Чат не найден");
  return row;
}

async function loadChatInOrg(db: AppDb, ctx: AuthContext, chatId: string) {
  const [row] = await db
    .select()
    .from(chats)
    .where(
      and(eq(chats.id, chatId), eq(chats.organizationId, ctx.organizationId))
    )
    .limit(1);
  if (!row) throw notFound("Чат не найден");
  return row;
}

function assertParticipant(ctx: AuthContext, chat: ChatRow) {
  if (ctx.role === "student" && ctx.studentId === chat.studentId) return;
  if (ctx.role === "teacher" && ctx.teacherId === chat.teacherId) return;
  throw forbidden("Нет доступа к этому чату");
}

async function pairCanSend(
  db: AppDb,
  chat: ChatRow
): Promise<boolean> {
  const [student] = await db
    .select({ primaryTeacherId: students.primaryTeacherId })
    .from(students)
    .where(eq(students.id, chat.studentId))
    .limit(1);
  return Boolean(student && student.primaryTeacherId === chat.teacherId);
}

async function loadPeerMeta(
  db: AppDb,
  ctx: AuthContext,
  chat: ChatRow
): Promise<ChatThreadMeta> {
  const [student] = await db
    .select({
      fullName: students.fullName,
      primaryTeacherId: students.primaryTeacherId,
    })
    .from(students)
    .where(eq(students.id, chat.studentId))
    .limit(1);
  const [teacher] = await db
    .select({ fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.id, chat.teacherId))
    .limit(1);
  if (!student || !teacher) throw notFound("Участник чата не найден");
  const isCurrentPair = student.primaryTeacherId === chat.teacherId;
  const unread = await unreadCountsFor(db, ctx.userId, [chat.id]);
  return {
    id: chat.id,
    studentId: chat.studentId,
    teacherId: chat.teacherId,
    studentName: student.fullName,
    teacherName: teacher.fullName,
    peerName: ctx.role === "teacher" ? student.fullName : teacher.fullName,
    peerRole: ctx.role === "teacher" ? "student" : "teacher",
    isCurrentPair,
    canSend: isCurrentPair,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    lastPreview: null,
    unreadCount: unread.get(chat.id) ?? 0,
  };
}

async function unreadCountsFor(
  db: AppDb,
  userId: string,
  chatIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (chatIds.length === 0) return map;
  const rows = await db
    .select({
      chatId: chatMessages.chatId,
      count: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .leftJoin(
      chatReadCursors,
      and(
        eq(chatReadCursors.chatId, chatMessages.chatId),
        eq(chatReadCursors.userId, userId)
      )
    )
    .where(
      and(
        inArray(chatMessages.chatId, chatIds),
        sql`${chatMessages.authorUserId} is distinct from ${userId}`,
        sql`(
          ${chatReadCursors.lastReadAt} is null
          or ${chatMessages.createdAt} > ${chatReadCursors.lastReadAt}
        )`
      )
    )
    .groupBy(chatMessages.chatId);
  for (const row of rows) map.set(row.chatId, Number(row.count) || 0);
  return map;
}

async function lastPreviewsFor(
  db: AppDb,
  chatIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (chatIds.length === 0) return map;
  const rows = await db
    .selectDistinctOn([chatMessages.chatId], {
      chatId: chatMessages.chatId,
      type: chatMessages.type,
      body: chatMessages.body,
      deletedAt: chatMessages.deletedAt,
      eventPayload: chatMessages.eventPayload,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.chatId, chatIds))
    .orderBy(chatMessages.chatId, desc(chatMessages.createdAt));
  for (const row of rows) {
    map.set(
      row.chatId,
      chatMessagePreview({
        deleted: Boolean(row.deletedAt),
        type: row.type,
        body: row.body,
        eventPayload: row.eventPayload,
      })
    );
  }
  return map;
}

function toAttachmentView(row: typeof chatAttachments.$inferSelect): ChatAttachmentView {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    isImage: isChatImageMime(row.mimeType),
    url: `/api/chats/attachments/${row.id}`,
  };
}

async function toMessageView(
  db: AppDb,
  ctx: AuthContext,
  row: typeof chatMessages.$inferSelect,
  now = new Date()
): Promise<ChatMessageView> {
  const deleted = Boolean(row.deletedAt);
  const mine = row.authorUserId === ctx.userId;
  const editable =
    mine &&
    row.type === "user_message" &&
    !deleted &&
    isWithinEditWindow(row.createdAt, now);
  let attachments: ChatAttachmentView[] = [];
  if (!deleted) {
    const files = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.messageId, row.id));
    attachments = files.map(toAttachmentView);
  }
  return {
    id: row.id,
    chatId: row.chatId,
    type: row.type as ChatMessageView["type"],
    authorUserId: row.authorUserId,
    body: deleted ? null : row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted,
    eventType: row.eventType,
    eventPayload: deleted ? null : row.eventPayload,
    attachments,
    clientRequestId: row.clientRequestId,
    canEdit: editable,
    canDelete: editable,
    mine,
  };
}

async function ensureStudentCurrentChat(db: AppDb, ctx: AuthContext) {
  if (ctx.role !== "student" || !ctx.studentId) return;
  const [student] = await db
    .select({ primaryTeacherId: students.primaryTeacherId })
    .from(students)
    .where(
      and(
        eq(students.id, ctx.studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student?.primaryTeacherId) return;
  await getOrCreateChatPair(db, {
    organizationId: ctx.organizationId,
    studentId: ctx.studentId,
    teacherId: student.primaryTeacherId,
  });
}

export async function listChats(
  db: AppDb,
  ctx: AuthContext,
  input: { query?: string; offset?: number } = {}
): Promise<ChatListResponse> {
  requireRoles(ctx, ["student", "teacher"]);
  await maybeCleanupPending(db);
  const offset = Math.max(0, input.offset ?? 0);
  const limit = CHAT_LIST_PAGE_SIZE;
  const q = input.query?.trim() ?? "";

  if (ctx.role === "student") {
    await ensureStudentCurrentChat(db, ctx);
    const rows = await db
      .select({
        chat: chats,
        studentName: students.fullName,
        teacherName: teachers.fullName,
        primaryTeacherId: students.primaryTeacherId,
      })
      .from(chats)
      .innerJoin(students, eq(students.id, chats.studentId))
      .innerJoin(teachers, eq(teachers.id, chats.teacherId))
      .where(
        and(
          eq(chats.organizationId, ctx.organizationId),
          eq(chats.studentId, ctx.studentId!),
          q
            ? or(
                ilike(teachers.fullName, `%${q}%`),
                ilike(students.fullName, `%${q}%`)
              )
            : undefined
        )
      )
      .orderBy(sql`${chats.lastMessageAt} desc nulls last`, teachers.fullName)
      .limit(limit + 1)
      .offset(offset);
    return finishList(db, ctx, rows, offset, limit);
  }

  const teacherId = ctx.teacherId!;
  const candidateRows = await db
    .select({
      studentId: students.id,
      studentName: students.fullName,
      primaryTeacherId: students.primaryTeacherId,
      chatId: chats.id,
    })
    .from(students)
    .leftJoin(
      chats,
      and(
        eq(chats.studentId, students.id),
        eq(chats.teacherId, teacherId),
        eq(chats.organizationId, ctx.organizationId)
      )
    )
    .where(
      and(
        eq(students.organizationId, ctx.organizationId),
        or(eq(students.primaryTeacherId, teacherId), sql`${chats.id} is not null`),
        q ? ilike(students.fullName, `%${q}%`) : undefined
      )
    )
    .orderBy(sql`${chats.lastMessageAt} desc nulls last`, students.fullName)
    .limit(limit + 1)
    .offset(offset);

  for (const row of candidateRows.slice(0, limit)) {
    if (!row.chatId) {
      await getOrCreateChatPair(db, {
        organizationId: ctx.organizationId,
        studentId: row.studentId,
        teacherId,
      });
    }
  }

  const studentIds = candidateRows.map((r) => r.studentId);
  const rows =
    studentIds.length === 0
      ? []
      : await db
          .select({
            chat: chats,
            studentName: students.fullName,
            teacherName: teachers.fullName,
            primaryTeacherId: students.primaryTeacherId,
          })
          .from(chats)
          .innerJoin(students, eq(students.id, chats.studentId))
          .innerJoin(teachers, eq(teachers.id, chats.teacherId))
          .where(
            and(
              eq(chats.organizationId, ctx.organizationId),
              eq(chats.teacherId, teacherId),
              inArray(chats.studentId, studentIds)
            )
          );

  const byStudent = new Map(rows.map((r) => [r.chat.studentId, r]));
  const ordered = candidateRows
    .map((c) => byStudent.get(c.studentId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return finishList(db, ctx, ordered, offset, limit);
}

async function finishList(
  db: AppDb,
  ctx: AuthContext,
  rows: {
    chat: ChatRow;
    studentName: string;
    teacherName: string;
    primaryTeacherId: string | null;
  }[],
  offset: number,
  limit: number
): Promise<ChatListResponse> {
  const page = rows.slice(0, limit);
  const ids = page.map((r) => r.chat.id);
  const [unread, previews, summary] = await Promise.all([
    unreadCountsFor(db, ctx.userId, ids),
    lastPreviewsFor(db, ids),
    getChatSummary(db, ctx),
  ]);
  const items: ChatListItem[] = page.map((r) => {
    const isCurrentPair = r.primaryTeacherId === r.chat.teacherId;
    return {
      id: r.chat.id,
      studentId: r.chat.studentId,
      teacherId: r.chat.teacherId,
      peerName: ctx.role === "teacher" ? r.studentName : r.teacherName,
      peerRole: ctx.role === "teacher" ? "student" : "teacher",
      isCurrentPair,
      canSend: isCurrentPair,
      lastMessageAt: r.chat.lastMessageAt?.toISOString() ?? null,
      lastPreview: previews.get(r.chat.id) ?? null,
      unreadCount: unread.get(r.chat.id) ?? 0,
    };
  });
  return {
    items,
    nextOffset: rows.length > limit ? offset + limit : null,
    unreadTotal: summary.unreadTotal,
  };
}

export async function getChatSummary(
  db: AppDb,
  ctx: AuthContext
): Promise<ChatSummary> {
  requireRoles(ctx, ["student", "teacher"]);
  const participant =
    ctx.role === "student"
      ? eq(chats.studentId, ctx.studentId!)
      : eq(chats.teacherId, ctx.teacherId!);
  const [row] = await db
    .select({
      unreadTotal: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .innerJoin(chats, eq(chats.id, chatMessages.chatId))
    .leftJoin(
      chatReadCursors,
      and(
        eq(chatReadCursors.chatId, chatMessages.chatId),
        eq(chatReadCursors.userId, ctx.userId)
      )
    )
    .where(
      and(
        eq(chats.organizationId, ctx.organizationId),
        participant,
        sql`${chatMessages.authorUserId} is distinct from ${ctx.userId}`,
        sql`(
          ${chatReadCursors.lastReadAt} is null
          or ${chatMessages.createdAt} > ${chatReadCursors.lastReadAt}
        )`
      )
    );
  const [latest] = await db
    .select({
      chatId: chats.id,
      lastMessageAt: chats.lastMessageAt,
    })
    .from(chats)
    .where(and(eq(chats.organizationId, ctx.organizationId), participant))
    .orderBy(sql`${chats.lastMessageAt} desc nulls last`)
    .limit(1);
  return {
    unreadTotal: Number(row?.unreadTotal ?? 0) || 0,
    latestChatId: latest?.chatId ?? null,
    latestAt: latest?.lastMessageAt?.toISOString() ?? null,
  };
}

export async function listMessages(
  db: AppDb,
  ctx: AuthContext,
  input: {
    chatId: string;
    before?: string | null;
    beforeId?: string | null;
    limit?: number;
  }
): Promise<ChatMessagesResponse> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  const meta = await loadPeerMeta(db, ctx, chat);
  const limit = Math.min(Math.max(input.limit ?? CHAT_PAGE_SIZE, 1), 80);
  const conditions = [eq(chatMessages.chatId, chat.id)];
  if (input.before) {
    const beforeDate = new Date(input.before);
    if (input.beforeId) {
      conditions.push(
        sql`(
          ${chatMessages.createdAt} < ${beforeDate}
          or (
            ${chatMessages.createdAt} = ${beforeDate}
            and ${chatMessages.id} < ${input.beforeId}
          )
        )`
      );
    } else {
      conditions.push(sql`${chatMessages.createdAt} < ${beforeDate}`);
    }
  }
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const messages = await Promise.all(page.map((row) => toMessageView(db, ctx, row)));
  return {
    chat: {
      ...meta,
      lastPreview: messages.length
        ? chatMessagePreview(messages[messages.length - 1]!)
        : null,
    },
    messages,
    hasMore,
    oldestCreatedAt: messages[0]?.createdAt ?? null,
  };
}

async function persistUploads(
  db: AppDb,
  ctx: AuthContext,
  chat: ChatRow,
  messageId: string,
  files: ChatUploadInput[]
): Promise<{ name: string; error: string }[]> {
  const errors: { name: string; error: string }[] = [];
  const existing = await db
    .select({ id: chatAttachments.id })
    .from(chatAttachments)
    .where(eq(chatAttachments.messageId, messageId));
  const remaining = CHAT_MAX_FILES - existing.length;
  const batch = files.slice(0, Math.max(0, remaining));
  if (files.length > remaining) {
    for (const extra of files.slice(remaining)) {
      errors.push({
        name: extra.filename,
        error: `Не больше ${CHAT_MAX_FILES} файлов`,
      });
    }
  }
  for (const file of batch) {
    try {
      const mime = sniffChatFile(file.bytes, file.filename);
      const attachmentId = newChatEntityId("att");
      const objectKey = `chats/${ctx.organizationId}/${chat.id}/${messageId}/${attachmentId}${extForMime(mime)}`;
      await db.insert(chatPendingObjects).values({
        objectKey,
        organizationId: ctx.organizationId,
      });
      await putChatObject(objectKey, file.bytes, mime);
      await db.insert(chatAttachments).values({
        id: attachmentId,
        messageId,
        chatId: chat.id,
        organizationId: ctx.organizationId,
        objectKey,
        originalName: safeOriginalName(file.filename),
        mimeType: mime,
        sizeBytes: file.bytes.length,
      });
      await db
        .delete(chatPendingObjects)
        .where(eq(chatPendingObjects.objectKey, objectKey));
    } catch (err) {
      errors.push({
        name: file.filename,
        error: err instanceof Error ? err.message : "Не удалось загрузить файл",
      });
    }
  }
  return errors;
}

export async function sendMessage(
  db: AppDb,
  ctx: AuthContext,
  input: {
    chatId: string;
    body?: string;
    clientRequestId: string;
    files?: ChatUploadInput[];
  }
): Promise<ChatSendResult> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  if (!(await pairCanSend(db, chat))) {
    throw forbidden("Отправка в этот чат недоступна");
  }
  const requestId = input.clientRequestId.trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
    throw badRequest("Некорректный идентификатор запроса");
  }
  const body = (input.body ?? "").trim();
  if (body.length > CHAT_MAX_BODY_CHARS) {
    throw badRequest("Слишком длинное сообщение");
  }
  const files = input.files ?? [];
  if (files.length > CHAT_MAX_FILES) {
    throw badRequest(`Можно прикрепить не больше ${CHAT_MAX_FILES} файлов`);
  }
  try {
    for (const file of files) {
      sniffChatFile(file.bytes, file.filename);
    }
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Некорректный файл");
  }
  if (!body && files.length === 0) {
    throw badRequest("Введите текст или прикрепите файл");
  }

  const [existing] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.chatId, chat.id),
        eq(chatMessages.clientRequestId, requestId)
      )
    )
    .limit(1);
  if (existing) {
    if (existing.authorUserId !== ctx.userId) throw forbidden();
    const extraErrors =
      files.length > 0 ? await persistUploads(db, ctx, chat, existing.id, files) : [];
    const message = await toMessageView(db, ctx, existing);
    const incomplete = extraErrors.length > 0;
    return { message, incomplete, attachmentErrors: extraErrors };
  }

  const id = newChatEntityId("msg");
  try {
    await db.insert(chatMessages).values({
      id,
      chatId: chat.id,
      organizationId: ctx.organizationId,
      type: "user_message",
      authorUserId: ctx.userId,
      body: body || null,
      clientRequestId: requestId,
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      (err as { code?: string }).code === "23505"
    ) {
      const [replay] = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.chatId, chat.id),
            eq(chatMessages.clientRequestId, requestId)
          )
        )
        .limit(1);
      if (replay) {
        const extraErrors =
          files.length > 0
            ? await persistUploads(db, ctx, chat, replay.id, files)
            : [];
        return {
          message: await toMessageView(db, ctx, replay),
          incomplete: extraErrors.length > 0,
          attachmentErrors: extraErrors,
        };
      }
    }
    throw err;
  }
  const attachmentErrors = await persistUploads(db, ctx, chat, id, files);
  await db
    .update(chats)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(chats.id, chat.id));
  const [saved] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id))
    .limit(1);
  const message = await toMessageView(db, ctx, saved!);
  return {
    message,
    incomplete: attachmentErrors.length > 0,
    attachmentErrors,
  };
}

export async function retryMessageAttachments(
  db: AppDb,
  ctx: AuthContext,
  input: { chatId: string; messageId: string; files: ChatUploadInput[] }
): Promise<ChatSendResult> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.id, input.messageId), eq(chatMessages.chatId, chat.id))
    )
    .limit(1);
  if (!row) throw notFound("Сообщение не найдено");
  if (row.authorUserId !== ctx.userId || row.type !== "user_message") {
    throw forbidden();
  }
  if (row.deletedAt) throw badRequest("Сообщение удалено");
  const attachmentErrors = await persistUploads(
    db,
    ctx,
    chat,
    row.id,
    input.files
  );
  const message = await toMessageView(db, ctx, row);
  return {
    message,
    incomplete: attachmentErrors.length > 0,
    attachmentErrors,
  };
}

export async function editMessage(
  db: AppDb,
  ctx: AuthContext,
  input: { chatId: string; messageId: string; body: string; now?: Date }
): Promise<ChatMessageView> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.id, input.messageId), eq(chatMessages.chatId, chat.id))
    )
    .limit(1);
  if (!row) throw notFound("Сообщение не найдено");
  if (row.type !== "user_message") {
    throw forbidden("Системные события нельзя редактировать");
  }
  if (row.authorUserId !== ctx.userId) throw forbidden();
  if (row.deletedAt) throw badRequest("Сообщение удалено");
  const now = input.now ?? new Date();
  if (!isWithinEditWindow(row.createdAt, now)) {
    throw forbidden("Редактирование доступно в течение 24 часов");
  }
  const body = input.body.trim();
  if (!body) throw badRequest("Введите текст");
  if (body.length > CHAT_MAX_BODY_CHARS) {
    throw badRequest("Слишком длинное сообщение");
  }
  await db
    .update(chatMessages)
    .set({ body, editedAt: now })
    .where(eq(chatMessages.id, row.id));
  const [saved] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, row.id))
    .limit(1);
  return toMessageView(db, ctx, saved!, now);
}

export async function deleteMessage(
  db: AppDb,
  ctx: AuthContext,
  input: { chatId: string; messageId: string; now?: Date }
): Promise<ChatMessageView> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.id, input.messageId), eq(chatMessages.chatId, chat.id))
    )
    .limit(1);
  if (!row) throw notFound("Сообщение не найдено");
  if (row.type !== "user_message") {
    throw forbidden("Системные события нельзя удалять");
  }
  if (row.authorUserId !== ctx.userId) throw forbidden();
  const now = input.now ?? new Date();
  if (!isWithinEditWindow(row.createdAt, now)) {
    throw forbidden("Удаление доступно в течение 24 часов");
  }
  if (!row.deletedAt) {
    await db
      .update(chatMessages)
      .set({ deletedAt: now, body: null, eventPayload: null })
      .where(eq(chatMessages.id, row.id));
  }
  const [saved] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, row.id))
    .limit(1);
  return toMessageView(db, ctx, saved!, now);
}

export async function markChatRead(
  db: AppDb,
  ctx: AuthContext,
  input: { chatId: string; messageId: string }
): Promise<{ ok: true; unreadCount: number }> {
  requireRoles(ctx, ["student", "teacher"]);
  const chat = await loadChatInOrg(db, ctx, input.chatId);
  assertParticipant(ctx, chat);
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.id, input.messageId), eq(chatMessages.chatId, chat.id))
    )
    .limit(1);
  if (!message) throw notFound("Сообщение не найдено");
  const [cursor] = await db
    .select()
    .from(chatReadCursors)
    .where(
      and(
        eq(chatReadCursors.chatId, chat.id),
        eq(chatReadCursors.userId, ctx.userId)
      )
    )
    .limit(1);
  if (!cursor || message.createdAt.getTime() >= cursor.lastReadAt.getTime()) {
    await db
      .insert(chatReadCursors)
      .values({
        chatId: chat.id,
        userId: ctx.userId,
        lastReadAt: message.createdAt,
        lastReadMessageId: message.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [chatReadCursors.chatId, chatReadCursors.userId],
        set: {
          lastReadAt: message.createdAt,
          lastReadMessageId: message.id,
          updatedAt: new Date(),
        },
      });
  }
  const unread = await unreadCountsFor(db, ctx.userId, [chat.id]);
  return { ok: true, unreadCount: unread.get(chat.id) ?? 0 };
}

export async function getAttachmentForViewer(
  db: AppDb,
  ctx: AuthContext,
  attachmentId: string
): Promise<{
  bytes: Buffer;
  mimeType: string;
  originalName: string;
}> {
  requireRoles(ctx, ["student", "teacher"]);
  const [row] = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.id, attachmentId))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Вложение не найдено");
  }
  const chat = await loadChatInOrg(db, ctx, row.chatId);
  assertParticipant(ctx, chat);
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, row.messageId))
    .limit(1);
  if (!message || message.deletedAt) {
    throw notFound("Вложение недоступно");
  }
  const bytes = await getChatObject(row.objectKey);
  return {
    bytes,
    mimeType: row.mimeType,
    originalName: row.originalName,
  };
}

let lastCleanupAt = 0;

export async function cleanupPendingChatObjects(db: AppDb): Promise<number> {
  const cutoff = new Date(Date.now() - CHAT_PENDING_TTL_MS);
  const pending = await db
    .select()
    .from(chatPendingObjects)
    .where(sql`${chatPendingObjects.createdAt} < ${cutoff}`)
    .limit(50);
  let removed = 0;
  for (const row of pending) {
    const [used] = await db
      .select({ id: chatAttachments.id })
      .from(chatAttachments)
      .where(eq(chatAttachments.objectKey, row.objectKey))
      .limit(1);
    if (!used) {
      await deleteChatObject(row.objectKey).catch(() => undefined);
    }
    await db
      .delete(chatPendingObjects)
      .where(eq(chatPendingObjects.objectKey, row.objectKey));
    removed += 1;
  }
  return removed;
}

async function maybeCleanupPending(db: AppDb) {
  if (Date.now() - lastCleanupAt < 10 * 60 * 1000) return;
  lastCleanupAt = Date.now();
  await cleanupPendingChatObjects(db).catch((err) => {
    console.error("[chat-cleanup]", err);
  });
}

export async function ensureChatForViewer(
  db: AppDb,
  ctx: AuthContext,
  input: { studentId?: string; teacherId?: string }
) {
  requireRoles(ctx, ["student", "teacher"]);
  if (ctx.role === "student") {
    await ensureStudentCurrentChat(db, ctx);
    const teacherId = input.teacherId;
    if (teacherId) {
      const chat = await getOrCreateChatPair(db, {
        organizationId: ctx.organizationId,
        studentId: ctx.studentId!,
        teacherId,
      });
      assertParticipant(ctx, chat);
      return loadPeerMeta(db, ctx, chat);
    }
    throw badRequest("Укажите преподавателя");
  }
  const studentId = input.studentId;
  if (!studentId) throw badRequest("Укажите ученика");
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student) throw notFound("Ученик не найден");
  if (student.primaryTeacherId !== ctx.teacherId) {
    const [existing] = await db
      .select()
      .from(chats)
      .where(
        and(
          eq(chats.organizationId, ctx.organizationId),
          eq(chats.studentId, studentId),
          eq(chats.teacherId, ctx.teacherId!)
        )
      )
      .limit(1);
    if (!existing) throw forbidden();
    assertParticipant(ctx, existing);
    return loadPeerMeta(db, ctx, existing);
  }
  const chat = await getOrCreateChatPair(db, {
    organizationId: ctx.organizationId,
    studentId,
    teacherId: ctx.teacherId!,
  });
  assertParticipant(ctx, chat);
  return loadPeerMeta(db, ctx, chat);
}
