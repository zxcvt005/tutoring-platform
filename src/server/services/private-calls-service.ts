import { randomBytes } from "node:crypto";

import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { newId } from "@/lib/format";
import {
  PRIVATE_HOST_LIVEKIT_IDENTITY,
  privateGuestLivekitIdentity,
  privateLivekitRoomName,
} from "@/lib/video/identities";
import type {
  VideoCallStudentView,
  VideoCallTeacherView,
  VideoLivekitToken,
} from "@/lib/video/types";
import type { PrivateGuestClaims } from "@/server/private-calls/access";
import { loginAttempts, privateCallRooms, privateCallSessions } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@/server/errors";
import { rateLimited } from "@/server/auth/rate-limit";
import { mintCallLivekitToken } from "@/server/video/create-call-token";
import { videoLivekitSync } from "@/server/video/livekit-rooms";

export const PRIVATE_CALL_RECONNECT_GRACE_MS = 30_000;
export const PRIVATE_CALL_FRESH_MS = 15_000;
export const PRIVATE_CALL_MAX_OPEN_ROOMS = 30;
export const PRIVATE_JOIN_LIMIT = 10;
export const PRIVATE_JOIN_WINDOW_MS = 10 * 60_000;
const PRIVATE_EMPTY_TIMEOUT_SECONDS = 90;
const HOST_NAME = "Преподаватель";

type SessionRow = typeof privateCallSessions.$inferSelect;
type RoomRow = typeof privateCallRooms.$inferSelect;

export type PrivateHostSession = {
  id: string;
  code: string;
  accepting: boolean;
  call: VideoCallTeacherView;
};

export type PrivateJoinInfo = {
  available: boolean;
  accepting: boolean;
};

function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 40);
  if (name.length < 1) throw badRequest("Введите имя");
  return name;
}

function presenceLabel(room: RoomRow, session: SessionRow, now: Date): string {
  const age = now.getTime() - room.lastSeenAt.getTime();
  if (age >= PRIVATE_CALL_FRESH_MS) return "переподключение";
  if (session.activeRoomId === room.id) return "в эфире";
  return "ожидает";
}

function toTeacherCall(
  session: SessionRow,
  rooms: RoomRow[],
  now: Date
): VideoCallTeacherView {
  const open = rooms
    .filter((room) => room.status === "open")
    .sort((a, b) => a.connectedAt.getTime() - b.connectedAt.getTime());
  const closed = rooms
    .filter((room) => room.status !== "open")
    .sort((a, b) => a.connectedAt.getTime() - b.connectedAt.getTime());
  return {
    role: "teacher",
    id: session.id,
    mode: "parallel",
    status: session.status === "active" ? "active" : "ended",
    createdAt: session.createdAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    activeParticipantId:
      session.status === "active" ? session.activeRoomId : null,
    teacherName: HOST_NAME,
    participants: [...open, ...closed].map((room) => ({
      id: room.id,
      studentId: room.id,
      studentName: room.displayName,
      status: room.status === "open" ? "invited" : "closed",
      isActive:
        session.status === "active" &&
        session.activeRoomId === room.id &&
        room.status === "open",
      presenceLabel:
        room.status === "open" ? presenceLabel(room, session, now) : undefined,
      connectedAt: room.connectedAt.toISOString(),
    })),
  };
}

function toStudentCall(
  session: SessionRow,
  room: RoomRow
): VideoCallStudentView {
  const open = room.status === "open" && session.status === "active";
  return {
    role: "student",
    id: session.id,
    mode: "parallel",
    status: session.status === "active" ? "active" : "ended",
    createdAt: session.createdAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    teacherName: HOST_NAME,
    myParticipantId: room.id,
    myStatus: open ? "invited" : "closed",
    teacherWithMe: open && session.activeRoomId === room.id,
    members: null,
  };
}

async function listRooms(db: AppDb, sessionId: string): Promise<RoomRow[]> {
  return db
    .select()
    .from(privateCallRooms)
    .where(eq(privateCallRooms.sessionId, sessionId))
    .orderBy(asc(privateCallRooms.connectedAt));
}

async function loadActiveSession(db: AppDb): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(privateCallSessions)
    .where(eq(privateCallSessions.status, "active"))
    .limit(1);
  return row ?? null;
}

async function requireActiveSession(db: AppDb): Promise<SessionRow> {
  const session = await loadActiveSession(db);
  if (!session) throw conflict("Сначала запустите приём");
  return session;
}

async function loadSession(db: AppDb, sessionId: string): Promise<SessionRow> {
  const [row] = await db
    .select()
    .from(privateCallSessions)
    .where(eq(privateCallSessions.id, sessionId))
    .limit(1);
  if (!row) throw notFound("Сессия не найдена");
  return row;
}

async function loadRoom(db: AppDb, roomId: string): Promise<RoomRow | null> {
  const [row] = await db
    .select()
    .from(privateCallRooms)
    .where(eq(privateCallRooms.id, roomId))
    .limit(1);
  return row ?? null;
}

async function closeRoom(db: AppDb, room: RoomRow, now: Date): Promise<void> {
  if (room.status === "closed") return;
  await db
    .update(privateCallRooms)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(eq(privateCallRooms.id, room.id));
  const session = await loadSession(db, room.sessionId);
  if (session.activeRoomId === room.id) {
    await db
      .update(privateCallSessions)
      .set({ activeRoomId: null, updatedAt: now })
      .where(eq(privateCallSessions.id, session.id));
  }
  const sync = videoLivekitSync();
  await sync.removeParticipant(
    room.livekitRoomName,
    privateGuestLivekitIdentity(room.id)
  );
  await sync.deleteRoom(room.livekitRoomName);
}

export async function sweepPrivateRooms(
  db: AppDb,
  now = new Date()
): Promise<void> {
  const rooms = await db
    .select()
    .from(privateCallRooms)
    .where(eq(privateCallRooms.status, "open"));
  for (const room of rooms) {
    const age = now.getTime() - room.lastSeenAt.getTime();
    if (age >= PRIVATE_CALL_RECONNECT_GRACE_MS) {
      await closeRoom(db, room, now);
    }
  }
}

async function hostPayload(
  db: AppDb,
  session: SessionRow,
  now: Date
): Promise<PrivateHostSession> {
  const rooms = await listRooms(db, session.id);
  return {
    id: session.id,
    code: session.code,
    accepting: session.accepting,
    call: toTeacherCall(session, rooms, now),
  };
}

async function endSession(db: AppDb, session: SessionRow, now: Date): Promise<void> {
  const rooms = await listRooms(db, session.id);
  await db
    .update(privateCallRooms)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(
      and(
        eq(privateCallRooms.sessionId, session.id),
        eq(privateCallRooms.status, "open")
      )
    );
  await db
    .update(privateCallSessions)
    .set({
      status: "ended",
      accepting: false,
      activeRoomId: null,
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(privateCallSessions.id, session.id));
  const sync = videoLivekitSync();
  for (const room of rooms) {
    await sync.deleteRoom(room.livekitRoomName);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

export async function getPrivateHost(
  db: AppDb,
  now = new Date()
): Promise<PrivateHostSession | null> {
  await sweepPrivateRooms(db, now);
  const session = await loadActiveSession(db);
  if (!session) return null;
  return hostPayload(db, session, now);
}

export async function startPrivateSession(
  db: AppDb,
  now = new Date()
): Promise<PrivateHostSession> {
  const active = await db
    .select()
    .from(privateCallSessions)
    .where(eq(privateCallSessions.status, "active"));
  for (const session of active) {
    await endSession(db, session, now);
  }

  const id = newId("pcs");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomBytes(9).toString("base64url");
    try {
      await db.insert(privateCallSessions).values({
        id,
        code,
        status: "active",
        accepting: true,
        createdAt: now,
        updatedAt: now,
      });
      const session = await loadSession(db, id);
      return hostPayload(db, session, now);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new Error("Не удалось создать сессию");
}

export async function setPrivateAccepting(
  db: AppDb,
  accepting: boolean,
  now = new Date()
): Promise<PrivateHostSession> {
  const session = await requireActiveSession(db);
  await db
    .update(privateCallSessions)
    .set({ accepting, updatedAt: now })
    .where(eq(privateCallSessions.id, session.id));
  return hostPayload(db, { ...session, accepting }, now);
}

export async function endPrivateSession(
  db: AppDb,
  now = new Date()
): Promise<VideoCallTeacherView> {
  const session = await loadActiveSession(db);
  if (!session) {
    throw conflict("Приём уже завершён");
  }
  const rooms = await listRooms(db, session.id);
  await endSession(db, session, now);
  return toTeacherCall(
    {
      ...session,
      status: "ended",
      accepting: false,
      activeRoomId: null,
      endedAt: now,
    },
    rooms.map((room) =>
      room.status === "open"
        ? { ...room, status: "closed", closedAt: now }
        : room
    ),
    now
  );
}

async function requireOpenRoom(
  db: AppDb,
  session: SessionRow,
  roomId: string
): Promise<RoomRow> {
  const room = await loadRoom(db, roomId);
  if (!room || room.sessionId !== session.id) throw notFound("Комната не найдена");
  if (room.status !== "open") throw conflict("Комната закрыта");
  return room;
}

export async function activatePrivateRoom(
  db: AppDb,
  roomId: string,
  now = new Date()
): Promise<VideoCallTeacherView> {
  await sweepPrivateRooms(db, now);
  const session = await requireActiveSession(db);
  const room = await requireOpenRoom(db, session, roomId);
  await db
    .update(privateCallSessions)
    .set({ activeRoomId: room.id, updatedAt: now })
    .where(eq(privateCallSessions.id, session.id));
  return (await hostPayload(db, { ...session, activeRoomId: room.id }, now)).call;
}

export async function holdPrivateTeacher(
  db: AppDb,
  now = new Date()
): Promise<VideoCallTeacherView> {
  const session = await requireActiveSession(db);
  await db
    .update(privateCallSessions)
    .set({ activeRoomId: null, updatedAt: now })
    .where(eq(privateCallSessions.id, session.id));
  return (await hostPayload(db, { ...session, activeRoomId: null }, now)).call;
}

export async function closePrivateRoom(
  db: AppDb,
  roomId: string,
  now = new Date()
): Promise<VideoCallTeacherView> {
  await sweepPrivateRooms(db, now);
  const session = await requireActiveSession(db);
  const room = await loadRoom(db, roomId);
  if (!room || room.sessionId !== session.id) throw notFound("Комната не найдена");
  await closeRoom(db, room, now);
  const fresh = await loadSession(db, session.id);
  return (await hostPayload(db, fresh, now)).call;
}

export async function issuePrivateHostTokens(
  db: AppDb,
  now = new Date()
): Promise<VideoLivekitToken[]> {
  await sweepPrivateRooms(db, now);
  const session = await requireActiveSession(db);
  const rooms = (await listRooms(db, session.id)).filter(
    (room) => room.status === "open"
  );
  const tokens: VideoLivekitToken[] = [];
  for (const room of rooms) {
    const minted = await mintCallLivekitToken({
      roomName: room.livekitRoomName,
      identity: PRIVATE_HOST_LIVEKIT_IDENTITY,
      displayName: HOST_NAME,
    });
    tokens.push({
      participantId: room.id,
      roomName: room.livekitRoomName,
      serverUrl: minted.serverUrl,
      participantToken: minted.participantToken,
      identity: PRIVATE_HOST_LIVEKIT_IDENTITY,
    });
  }
  return tokens;
}

export async function getPrivateJoinInfo(
  db: AppDb,
  code: string
): Promise<PrivateJoinInfo> {
  const [row] = await db
    .select()
    .from(privateCallSessions)
    .where(eq(privateCallSessions.code, code))
    .limit(1);
  if (!row || row.status !== "active") {
    return { available: false, accepting: false };
  }
  return { available: true, accepting: row.accepting };
}

async function assertJoinAllowed(db: AppDb, ip: string | null, now: Date) {
  const key = `private-join:${ip ?? "none"}`;
  const since = new Date(now.getTime() - PRIVATE_JOIN_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(eq(loginAttempts.key, key), gte(loginAttempts.attemptedAt, since))
    );
  if (Number(row?.n ?? 0) >= PRIVATE_JOIN_LIMIT) {
    throw rateLimited("Слишком много подключений. Подождите несколько минут.");
  }
  await db.insert(loginAttempts).values({
    id: newId("la"),
    key,
    email: null,
    ip,
    success: true,
    attemptedAt: now,
  });
}

export async function joinPrivateCall(
  db: AppDb,
  input: { code: string; name: string; ip?: string | null; now?: Date }
): Promise<{ call: VideoCallStudentView; roomId: string; sessionId: string }> {
  const now = input.now ?? new Date();
  await assertJoinAllowed(db, input.ip ?? null, now);
  const name = cleanName(input.name);
  const [session] = await db
    .select()
    .from(privateCallSessions)
    .where(eq(privateCallSessions.code, input.code))
    .limit(1);
  if (!session || session.status !== "active") {
    throw notFound("Ссылка недействительна");
  }
  if (!session.accepting) {
    throw conflict("Преподаватель сейчас не принимает новые подключения");
  }
  const open = await db
    .select({ id: privateCallRooms.id })
    .from(privateCallRooms)
    .where(
      and(
        eq(privateCallRooms.sessionId, session.id),
        eq(privateCallRooms.status, "open")
      )
    );
  if (open.length >= PRIVATE_CALL_MAX_OPEN_ROOMS) {
    throw conflict("Сейчас слишком много открытых комнат. Подождите немного.");
  }

  const roomId = newId("pcr");
  const livekitRoomName = privateLivekitRoomName(roomId);
  await db.insert(privateCallRooms).values({
    id: roomId,
    sessionId: session.id,
    displayName: name,
    livekitRoomName,
    status: "open",
    connectedAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
  // Первый гость автоматически в эфире: иначе хост не видит/не слышит,
  // пока вручную не нажмёт «Активировать» (асимметрия исходящих потоков).
  // Условный UPDATE исключает гонку двух одновременных join.
  let nextSession = session;
  if (!session.activeRoomId) {
    const claimed = await db
      .update(privateCallSessions)
      .set({ activeRoomId: roomId, updatedAt: now })
      .where(
        and(
          eq(privateCallSessions.id, session.id),
          isNull(privateCallSessions.activeRoomId)
        )
      )
      .returning();
    if (claimed.length > 0) {
      nextSession = { ...session, activeRoomId: roomId };
    } else {
      nextSession = await loadSession(db, session.id);
    }
  }
  await videoLivekitSync().ensureRoom(
    livekitRoomName,
    2,
    PRIVATE_EMPTY_TIMEOUT_SECONDS
  );
  const room = await loadRoom(db, roomId);
  if (!room) throw notFound("Комната не найдена");
  return {
    call: toStudentCall(nextSession, room),
    roomId,
    sessionId: session.id,
  };
}

async function guestRoom(
  db: AppDb,
  claims: PrivateGuestClaims
): Promise<{ session: SessionRow; room: RoomRow }> {
  const room = await loadRoom(db, claims.roomId);
  if (!room || room.sessionId !== claims.sessionId) {
    throw forbidden("Нет доступа к этой комнате");
  }
  const session = await loadSession(db, room.sessionId);
  return { session, room };
}

export async function getPrivateGuestCall(
  db: AppDb,
  claims: PrivateGuestClaims,
  now = new Date()
): Promise<VideoCallStudentView> {
  await sweepPrivateRooms(db, now);
  const { session, room } = await guestRoom(db, claims);
  const freshRoom = (await loadRoom(db, room.id)) ?? room;
  const freshSession = await loadSession(db, session.id);
  return toStudentCall(freshSession, freshRoom);
}

export async function pulsePrivateGuest(
  db: AppDb,
  claims: PrivateGuestClaims,
  now = new Date()
): Promise<void> {
  const { room } = await guestRoom(db, claims);
  if (room.status !== "open") throw conflict("Комната закрыта");
  const age = now.getTime() - room.lastSeenAt.getTime();
  if (age >= PRIVATE_CALL_RECONNECT_GRACE_MS) {
    await closeRoom(db, room, now);
    throw conflict("Подключение закрыто");
  }
  await db
    .update(privateCallRooms)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(
      and(eq(privateCallRooms.id, room.id), eq(privateCallRooms.status, "open"))
    );
  await sweepPrivateRooms(db, now);
}

export async function leavePrivateGuest(
  db: AppDb,
  claims: PrivateGuestClaims,
  now = new Date()
): Promise<void> {
  const { room } = await guestRoom(db, claims);
  await closeRoom(db, room, now);
}

export async function issuePrivateGuestTokens(
  db: AppDb,
  claims: PrivateGuestClaims,
  now = new Date()
): Promise<VideoLivekitToken[]> {
  await sweepPrivateRooms(db, now);
  const { session, room } = await guestRoom(db, claims);
  const fresh = await loadRoom(db, room.id);
  if (
    !fresh ||
    fresh.status !== "open" ||
    session.status !== "active" ||
    fresh.sessionId !== claims.sessionId
  ) {
    throw forbidden("Нет доступа к этой комнате");
  }
  const identity = privateGuestLivekitIdentity(fresh.id);
  const minted = await mintCallLivekitToken({
    roomName: fresh.livekitRoomName,
    identity,
    displayName: fresh.displayName,
  });
  return [
    {
      participantId: fresh.id,
      roomName: fresh.livekitRoomName,
      serverUrl: minted.serverUrl,
      participantToken: minted.participantToken,
      identity,
    },
  ];
}
