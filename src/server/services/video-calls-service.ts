import { and, asc, desc, eq, ilike, inArray, notInArray, sql } from "drizzle-orm";

import { newId } from "@/lib/format";
import {
  groupLivekitRoomName,
  parallelLivekitRoomName,
  studentLivekitIdentity,
  teacherLivekitIdentity,
} from "@/lib/video/identities";
import type {
  VideoCallMode,
  VideoCallStudentView,
  VideoCallSummary,
  VideoCallTeacherView,
  VideoCallView,
  VideoInviteCandidate,
  VideoLivekitToken,
  VideoParticipantStatus,
} from "@/lib/video/types";
import type { AuthContext } from "@/server/authz/context";
import {
  requireRoles,
  requireStudentProfile,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  lessons,
  lessonStudents,
  students,
  teachers,
  videoCallParticipants,
  videoCalls,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@/server/errors";
import { mintCallLivekitToken } from "@/server/video/create-call-token";
import { videoLivekitSync } from "@/server/video/livekit-rooms";

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

async function loadCall(db: AppDb, organizationId: string, callId: string) {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(
      and(
        eq(videoCalls.id, callId),
        eq(videoCalls.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Звонок не найден");
  return row;
}

async function loadTeacherName(db: AppDb, teacherId: string) {
  const [row] = await db
    .select({ fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.id, teacherId))
    .limit(1);
  return row?.fullName ?? "Преподаватель";
}

async function listParticipantRows(db: AppDb, callId: string) {
  return db
    .select({
      id: videoCallParticipants.id,
      studentId: videoCallParticipants.studentId,
      studentName: students.fullName,
      status: videoCallParticipants.status,
      livekitRoomName: videoCallParticipants.livekitRoomName,
      closedAt: videoCallParticipants.closedAt,
    })
    .from(videoCallParticipants)
    .innerJoin(students, eq(students.id, videoCallParticipants.studentId))
    .where(eq(videoCallParticipants.callId, callId))
    .orderBy(asc(students.fullName));
}

function assertCallActive(call: { status: string }) {
  if (call.status !== "active") {
    throw conflict("Звонок уже завершён");
  }
}

async function requireOwnedCall(
  db: AppDb,
  ctx: AuthContext,
  callId: string
) {
  const teacherId = await requireTeacherProfile(ctx);
  const call = await loadCall(db, ctx.organizationId, callId);
  if (call.teacherId !== teacherId) throw forbidden();
  return { call, teacherId };
}

function toTeacherView(
  call: typeof videoCalls.$inferSelect,
  teacherName: string,
  rows: Awaited<ReturnType<typeof listParticipantRows>>
): VideoCallTeacherView {
  return {
    role: "teacher",
    id: call.id,
    mode: call.mode as VideoCallMode,
    status: call.status as VideoCallTeacherView["status"],
    createdAt: call.createdAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    activeParticipantId: call.activeParticipantId,
    teacherName,
    participants: rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: row.studentName,
      status: row.status as VideoParticipantStatus,
      isActive:
        call.mode === "parallel" &&
        call.activeParticipantId === row.id &&
        row.status === "invited",
    })),
  };
}

function toStudentView(
  call: typeof videoCalls.$inferSelect,
  teacherName: string,
  mine: Awaited<ReturnType<typeof listParticipantRows>>[number],
  rows: Awaited<ReturnType<typeof listParticipantRows>>
): VideoCallStudentView {
  const teacherWithMe =
    call.mode === "parallel" &&
    call.status === "active" &&
    mine.status === "invited" &&
    call.activeParticipantId === mine.id;
  return {
    role: "student",
    id: call.id,
    mode: call.mode as VideoCallMode,
    status: call.status as VideoCallStudentView["status"],
    createdAt: call.createdAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    teacherName,
    myParticipantId: mine.id,
    myStatus: mine.status as VideoParticipantStatus,
    teacherWithMe,
    members:
      call.mode === "group"
        ? [
            {
              id: `teacher:${call.teacherId}`,
              name: teacherName,
              role: "teacher" as const,
              status: "active" as const,
            },
            ...rows
              .filter((row) => row.status === "invited")
              .map((row) => ({
                id: row.id,
                name: row.studentName,
                role: "student" as const,
                status: row.status as VideoParticipantStatus,
              })),
          ]
        : null,
  };
}

export async function createVideoCall(
  db: AppDb,
  ctx: AuthContext,
  input: { mode?: VideoCallMode }
): Promise<VideoCallTeacherView> {
  const teacherId = await requireTeacherProfile(ctx);
  const mode: VideoCallMode = input.mode === "group" ? "group" : "parallel";
  const id = newId("vc");
  const now = new Date();
  await db.insert(videoCalls).values({
    id,
    organizationId: ctx.organizationId,
    teacherId,
    mode,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return getVideoCall(db, ctx, id) as Promise<VideoCallTeacherView>;
}

export async function listVideoCalls(
  db: AppDb,
  ctx: AuthContext
): Promise<VideoCallSummary[]> {
  requireRoles(ctx, ["teacher", "student"]);
  if (ctx.role === "teacher") {
    const teacherId = await requireTeacherProfile(ctx);
    const rows = await db
      .select({
        id: videoCalls.id,
        mode: videoCalls.mode,
        status: videoCalls.status,
        createdAt: videoCalls.createdAt,
        endedAt: videoCalls.endedAt,
        teacherName: teachers.fullName,
        participantCount: sql<number>`count(${videoCallParticipants.id})::int`,
      })
      .from(videoCalls)
      .innerJoin(teachers, eq(teachers.id, videoCalls.teacherId))
      .leftJoin(
        videoCallParticipants,
        eq(videoCallParticipants.callId, videoCalls.id)
      )
      .where(
        and(
          eq(videoCalls.organizationId, ctx.organizationId),
          eq(videoCalls.teacherId, teacherId)
        )
      )
      .groupBy(
        videoCalls.id,
        videoCalls.mode,
        videoCalls.status,
        videoCalls.createdAt,
        videoCalls.endedAt,
        teachers.fullName
      )
      .orderBy(
        sql`case when ${videoCalls.status} = 'active' then 0 else 1 end`,
        desc(videoCalls.createdAt)
      )
      .limit(40);
    return rows.map((row) => ({
      id: row.id,
      mode: row.mode as VideoCallMode,
      status: row.status as VideoCallSummary["status"],
      createdAt: row.createdAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      teacherName: row.teacherName,
      participantCount: Number(row.participantCount) || 0,
    }));
  }

  const studentId = await requireStudentProfile(ctx);
  const rows = await db
    .select({
      id: videoCalls.id,
      mode: videoCalls.mode,
      status: videoCalls.status,
      createdAt: videoCalls.createdAt,
      endedAt: videoCalls.endedAt,
      teacherName: teachers.fullName,
      myStatus: videoCallParticipants.status,
    })
    .from(videoCallParticipants)
    .innerJoin(videoCalls, eq(videoCalls.id, videoCallParticipants.callId))
    .innerJoin(teachers, eq(teachers.id, videoCalls.teacherId))
    .where(
      and(
        eq(videoCallParticipants.studentId, studentId),
        eq(videoCallParticipants.organizationId, ctx.organizationId)
      )
    )
    .orderBy(
      sql`case when ${videoCalls.status} = 'active' and ${videoCallParticipants.status} = 'invited' then 0 else 1 end`,
      desc(videoCalls.createdAt)
    )
    .limit(40);
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode as VideoCallMode,
    status: row.status as VideoCallSummary["status"],
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    teacherName: row.teacherName,
    participantCount: 0,
    myStatus: row.myStatus as VideoParticipantStatus,
  }));
}

export async function getVideoCall(
  db: AppDb,
  ctx: AuthContext,
  callId: string
): Promise<VideoCallView> {
  requireRoles(ctx, ["teacher", "student"]);
  const call = await loadCall(db, ctx.organizationId, callId);
  const teacherName = await loadTeacherName(db, call.teacherId);
  const rows = await listParticipantRows(db, call.id);

  if (ctx.role === "teacher") {
    if (call.teacherId !== ctx.teacherId) throw forbidden();
    return toTeacherView(call, teacherName, rows);
  }

  const studentId = await requireStudentProfile(ctx);
  const mine = rows.find((row) => row.studentId === studentId);
  if (!mine) throw notFound("Звонок не найден");
  return toStudentView(call, teacherName, mine, rows);
}

export async function listInviteCandidates(
  db: AppDb,
  ctx: AuthContext,
  callId: string,
  query: string
): Promise<VideoInviteCandidate[]> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  assertCallActive(call);

  const already = await db
    .select({ studentId: videoCallParticipants.studentId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.callId, call.id));
  const exclude = already.map((row) => row.studentId);

  const nextLesson = sql<Date | null>`(
    select min(${lessons.startsAt})
    from ${lessonStudents}
    inner join ${lessons} on ${lessons.id} = ${lessonStudents.lessonId}
    where ${lessonStudents.studentId} = ${students.id}
      and ${lessons.organizationId} = ${students.organizationId}
      and ${lessons.status} = 'planned'
      and ${lessons.startsAt} > now()
  )`;

  const filters = [
    eq(students.organizationId, ctx.organizationId),
    eq(students.status, "active"),
  ];
  if (exclude.length > 0) {
    filters.push(notInArray(students.id, exclude));
  }
  const q = query.trim();
  if (q) {
    filters.push(ilike(students.fullName, `%${escapeIlike(q)}%`));
  }

  const rows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      nextLessonAt: nextLesson,
    })
    .from(students)
    .where(and(...filters))
    .orderBy(sql`${nextLesson} asc nulls last`, asc(students.fullName))
    .limit(60);

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    nextLessonAt: row.nextLessonAt
      ? new Date(row.nextLessonAt).toISOString()
      : null,
  }));
}

export async function inviteStudents(
  db: AppDb,
  ctx: AuthContext,
  callId: string,
  studentIds: string[]
): Promise<VideoCallTeacherView> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  assertCallActive(call);
  const uniqueIds = [...new Set(studentIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw badRequest("Выберите хотя бы одного ученика");
  }

  const found = await db
    .select({
      id: students.id,
      status: students.status,
    })
    .from(students)
    .where(
      and(
        eq(students.organizationId, ctx.organizationId),
        inArray(students.id, uniqueIds)
      )
    );
  if (found.length !== uniqueIds.length) {
    throw notFound("Ученик не найден");
  }
  if (found.some((row) => row.status !== "active")) {
    throw badRequest("Можно пригласить только активных учеников");
  }

  const existing = await db
    .select({ studentId: videoCallParticipants.studentId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.callId, call.id));
  const existingSet = new Set(existing.map((row) => row.studentId));
  const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
  if (toAdd.length === 0) {
    throw conflict("Эти ученики уже приглашены");
  }

  const now = new Date();
  const sync = videoLivekitSync();
  for (const studentId of toAdd) {
    const participantId = newId("vcp");
    const livekitRoomName =
      call.mode === "group"
        ? groupLivekitRoomName(call.id)
        : parallelLivekitRoomName(call.id, participantId);
    await db.insert(videoCallParticipants).values({
      id: participantId,
      organizationId: ctx.organizationId,
      callId: call.id,
      studentId,
      livekitRoomName,
      status: "invited",
      createdAt: now,
      updatedAt: now,
    });
    await sync.ensureRoom(
      livekitRoomName,
      call.mode === "group" ? 50 : 2
    );
  }

  return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
}

export async function activateParticipant(
  db: AppDb,
  ctx: AuthContext,
  callId: string,
  participantId: string
): Promise<VideoCallTeacherView> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  assertCallActive(call);
  if (call.mode !== "parallel") {
    throw badRequest("Переключение комнат есть только в параллельном режиме");
  }
  const [row] = await db
    .select()
    .from(videoCallParticipants)
    .where(
      and(
        eq(videoCallParticipants.id, participantId),
        eq(videoCallParticipants.callId, call.id)
      )
    )
    .limit(1);
  if (!row) throw notFound("Комната не найдена");
  if (row.status !== "invited") {
    throw conflict("Комната закрыта");
  }
  const now = new Date();
  await db
    .update(videoCalls)
    .set({ activeParticipantId: row.id, updatedAt: now })
    .where(eq(videoCalls.id, call.id));
  return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
}

/** Параллельный режим: преподаватель уходит в личную комнату, эфир ученикам не идёт. */
export async function holdTeacher(
  db: AppDb,
  ctx: AuthContext,
  callId: string
): Promise<VideoCallTeacherView> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  assertCallActive(call);
  if (call.mode !== "parallel") {
    throw badRequest("Личная комната есть только в параллельном режиме");
  }
  const now = new Date();
  await db
    .update(videoCalls)
    .set({ activeParticipantId: null, updatedAt: now })
    .where(eq(videoCalls.id, call.id));
  return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
}

export async function closeParticipant(
  db: AppDb,
  ctx: AuthContext,
  callId: string,
  participantId: string
): Promise<VideoCallTeacherView> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  assertCallActive(call);
  const [row] = await db
    .select()
    .from(videoCallParticipants)
    .where(
      and(
        eq(videoCallParticipants.id, participantId),
        eq(videoCallParticipants.callId, call.id)
      )
    )
    .limit(1);
  if (!row) throw notFound("Комната не найдена");
  if (row.status === "closed") {
    return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
  }

  const now = new Date();
  await db
    .update(videoCallParticipants)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(eq(videoCallParticipants.id, row.id));
  if (call.activeParticipantId === row.id) {
    await db
      .update(videoCalls)
      .set({ activeParticipantId: null, updatedAt: now })
      .where(eq(videoCalls.id, call.id));
  }

  const sync = videoLivekitSync();
  const identity = studentLivekitIdentity(row.studentId);
  await sync.removeParticipant(row.livekitRoomName, identity);
  if (call.mode === "parallel") {
    await sync.deleteRoom(row.livekitRoomName);
  }

  return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
}

export async function endVideoCall(
  db: AppDb,
  ctx: AuthContext,
  callId: string
): Promise<VideoCallTeacherView> {
  const { call } = await requireOwnedCall(db, ctx, callId);
  if (call.status === "ended") {
    return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
  }
  const now = new Date();
  const rows = await db
    .select()
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.callId, call.id));
  await db
    .update(videoCallParticipants)
    .set({
      status: "closed",
      closedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(videoCallParticipants.callId, call.id),
        eq(videoCallParticipants.status, "invited")
      )
    );
  await db
    .update(videoCalls)
    .set({
      status: "ended",
      endedAt: now,
      activeParticipantId: null,
      updatedAt: now,
    })
    .where(eq(videoCalls.id, call.id));

  const sync = videoLivekitSync();
  const rooms = [...new Set(rows.map((row) => row.livekitRoomName))];
  for (const roomName of rooms) {
    await sync.deleteRoom(roomName);
  }

  return getVideoCall(db, ctx, call.id) as Promise<VideoCallTeacherView>;
}

export async function issueCallTokens(
  db: AppDb,
  ctx: AuthContext,
  callId: string
): Promise<VideoLivekitToken[]> {
  requireRoles(ctx, ["teacher", "student"]);
  const call = await loadCall(db, ctx.organizationId, callId);
  if (call.status !== "active") {
    throw conflict("Звонок уже завершён");
  }
  const teacherName = await loadTeacherName(db, call.teacherId);
  const rows = await listParticipantRows(db, call.id);
  const open = rows.filter((row) => row.status === "invited");

  if (ctx.role === "teacher") {
    if (call.teacherId !== ctx.teacherId) throw forbidden();
    const identity = teacherLivekitIdentity(call.teacherId);
    if (call.mode === "group") {
      const roomName = groupLivekitRoomName(call.id);
      const minted = await mintCallLivekitToken({
        roomName,
        identity,
        displayName: teacherName,
      });
      return [
        {
          participantId: null,
          roomName,
          serverUrl: minted.serverUrl,
          participantToken: minted.participantToken,
          identity,
        },
      ];
    }
    const tokens: VideoLivekitToken[] = [];
    for (const row of open) {
      const minted = await mintCallLivekitToken({
        roomName: row.livekitRoomName,
        identity,
        displayName: teacherName,
      });
      tokens.push({
        participantId: row.id,
        roomName: row.livekitRoomName,
        serverUrl: minted.serverUrl,
        participantToken: minted.participantToken,
        identity,
      });
    }
    return tokens;
  }

  const studentId = await requireStudentProfile(ctx);
  const mine = open.find((row) => row.studentId === studentId);
  if (!mine) throw forbidden("Нет доступа к этой комнате");
  const [student] = await db
    .select({ fullName: students.fullName })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  const identity = studentLivekitIdentity(studentId);
  const minted = await mintCallLivekitToken({
    roomName: mine.livekitRoomName,
    identity,
    displayName: student?.fullName ?? "Ученик",
  });
  return [
    {
      participantId: mine.id,
      roomName: mine.livekitRoomName,
      serverUrl: minted.serverUrl,
      participantToken: minted.participantToken,
      identity,
    },
  ];
}
