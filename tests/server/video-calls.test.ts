import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { DEMO_ORG_ID } from "@/server/db/seed";
import { lessonStudents, lessons } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  activateParticipant,
  closeParticipant,
  holdTeacher,
  createVideoCall,
  endVideoCall,
  getVideoCall,
  inviteStudents,
  issueCallTokens,
  listInviteCandidates,
  listVideoCalls,
} from "@/server/services/video-calls-service";
import { ApiError } from "@/server/errors";
import { setVideoLivekitSyncForTests } from "@/server/video/livekit-rooms";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

const LIVEKIT_PREV = {
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
};

describe("video calls", () => {
  let close: (() => Promise<void>) | undefined;
  const rooms: string[] = [];
  const removed: string[] = [];

  beforeEach(() => {
    rooms.length = 0;
    removed.length = 0;
    process.env.LIVEKIT_URL = "wss://video.neodinschool.ru";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "unit-test-secret-not-used-in-prod";
    setVideoLivekitSyncForTests({
      ensureRoom: async (roomName) => {
        rooms.push(roomName);
      },
      deleteRoom: async (roomName) => {
        rooms.push(`delete:${roomName}`);
      },
      removeParticipant: async (roomName, identity) => {
        removed.push(`${roomName}:${identity}`);
      },
    });
  });

  afterEach(async () => {
    setVideoLivekitSyncForTests(null);
    if (LIVEKIT_PREV.LIVEKIT_URL === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = LIVEKIT_PREV.LIVEKIT_URL;
    if (LIVEKIT_PREV.LIVEKIT_API_KEY === undefined) {
      delete process.env.LIVEKIT_API_KEY;
    } else process.env.LIVEKIT_API_KEY = LIVEKIT_PREV.LIVEKIT_API_KEY;
    if (LIVEKIT_PREV.LIVEKIT_API_SECRET === undefined) {
      delete process.env.LIVEKIT_API_SECRET;
    } else process.env.LIVEKIT_API_SECRET = LIVEKIT_PREV.LIVEKIT_API_SECRET;
    if (close) await close();
    close = undefined;
  });

  async function asUser(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("creates a parallel call, invites any school student, and isolates rooms", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, { mode: "parallel" });
    expect(created.mode).toBe("parallel");
    expect(created.participants).toEqual([]);

    const call = await inviteStudents(t.db, teacher, created.id, ["s1", "s5"]);
    expect(call.participants.map((p) => p.studentId).sort()).toEqual(["s1", "s5"]);
    expect(new Set(rooms.filter((name) => !name.startsWith("delete:"))).size).toBe(2);

    const alice = await asUser(t.db, "s1@demo.local");
    const aliceView = await getVideoCall(t.db, alice, created.id);
    expect(aliceView.role).toBe("student");
    if (aliceView.role !== "student") return;
    expect(aliceView.teacherWithMe).toBe(false);
    expect(aliceView.members).toBeNull();
    expect(JSON.stringify(aliceView)).not.toContain("Дарья");
    expect(JSON.stringify(aliceView)).not.toContain("s5");

    const aliceTokens = await issueCallTokens(t.db, alice, created.id);
    expect(aliceTokens).toHaveLength(1);
    const alicePayload = JSON.parse(
      Buffer.from(aliceTokens[0]!.participantToken.split(".")[1]!, "base64url").toString("utf8")
    ) as { video?: { room?: string } };
    const darya = await asUser(t.db, "s5@demo.local");
    const daryaTokens = await issueCallTokens(t.db, darya, created.id);
    const daryaPayload = JSON.parse(
      Buffer.from(daryaTokens[0]!.participantToken.split(".")[1]!, "base64url").toString("utf8")
    ) as { video?: { room?: string } };
    expect(alicePayload.video?.room).not.toBe(daryaPayload.video?.room);
    expect(aliceTokens[0]!.serverUrl).toBe("wss://video.neodinschool.ru");

    await expect(
      issueCallTokens(t.db, darya, created.id).then(async () => {
        const stolen = aliceTokens[0]!.roomName;
        expect(daryaTokens[0]!.roomName).not.toBe(stolen);
      })
    ).resolves.toBeUndefined();
  });

  it("sorts invite candidates by next lesson and searches by name", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, {});
    // Сид уже может содержать ближайшие уроки — отменяем их, чтобы порядок
    // зависел только от вставок ниже (иначе тест флапает по календарю сида).
    await t.db
      .update(lessons)
      .set({ status: "cancelled" })
      .where(eq(lessons.organizationId, DEMO_ORG_ID));
    const soon = new Date(Date.now() + 60 * 60_000);
    const later = new Date(Date.now() + 5 * 60 * 60_000);
    await t.db.insert(lessons).values({
      id: "l_soon",
      organizationId: DEMO_ORG_ID,
      teacherId: "t2",
      startsAt: soon,
      endsAt: new Date(soon.getTime() + 60 * 60_000),
      status: "planned",
      subject: "Физика",
    });
    await t.db.insert(lessonStudents).values({
      lessonId: "l_soon",
      studentId: "s5",
    });
    await t.db.insert(lessons).values({
      id: "l_later",
      organizationId: DEMO_ORG_ID,
      teacherId: "t1",
      startsAt: later,
      endsAt: new Date(later.getTime() + 60 * 60_000),
      status: "planned",
      subject: "Математика",
    });
    await t.db.insert(lessonStudents).values({
      lessonId: "l_later",
      studentId: "s1",
    });

    const candidates = await listInviteCandidates(t.db, teacher, created.id, "");
    const ids = candidates.map((row) => row.id);
    expect(ids.indexOf("s5")).toBeLessThan(ids.indexOf("s1"));
    expect(ids).not.toContain("s4");

    const search = await listInviteCandidates(t.db, teacher, created.id, "алис");
    expect(search.map((row) => row.id)).toEqual(["s1"]);

    await inviteStudents(t.db, teacher, created.id, ["s1"]);
    const after = await listInviteCandidates(t.db, teacher, created.id, "");
    expect(after.map((row) => row.id)).not.toContain("s1");
  });

  it("activates one student, closes a room, and ends the whole call", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, { mode: "parallel" });
    const invited = await inviteStudents(t.db, teacher, created.id, ["s1", "s2"]);
    const alice = invited.participants.find((p) => p.studentId === "s1")!;
    const boris = invited.participants.find((p) => p.studentId === "s2")!;

    const active = await activateParticipant(t.db, teacher, created.id, alice.id);
    expect(active.activeParticipantId).toBe(alice.id);
    const aliceCtx = await asUser(t.db, "s1@demo.local");
    const aliceView = await getVideoCall(t.db, aliceCtx, created.id);
    expect(aliceView.role === "student" && aliceView.teacherWithMe).toBe(true);
    const borisCtx = await asUser(t.db, "s2@demo.local");
    const borisView = await getVideoCall(t.db, borisCtx, created.id);
    expect(borisView.role === "student" && borisView.teacherWithMe).toBe(false);
    expect(JSON.stringify(borisView)).not.toContain("Алиса");

    const held = await holdTeacher(t.db, teacher, created.id);
    expect(held.activeParticipantId).toBeNull();
    const aliceAfterHold = await getVideoCall(t.db, aliceCtx, created.id);
    expect(aliceAfterHold.role === "student" && aliceAfterHold.teacherWithMe).toBe(
      false
    );

    const closed = await closeParticipant(t.db, teacher, created.id, alice.id);
    expect(closed.participants.find((p) => p.id === alice.id)?.status).toBe("closed");
    expect(closed.activeParticipantId).toBeNull();
    expect(closed.participants.find((p) => p.id === boris.id)?.status).toBe("invited");
    expect(removed.some((row) => row.endsWith(":s-s1"))).toBe(true);

    await expect(
      issueCallTokens(t.db, aliceCtx, created.id)
    ).rejects.toMatchObject({ status: 403 });

    const ended = await endVideoCall(t.db, teacher, created.id);
    expect(ended.status).toBe("ended");
    expect(ended.participants.every((p) => p.status === "closed")).toBe(true);
    await expect(
      issueCallTokens(t.db, borisCtx, created.id)
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inviteStudents(t.db, teacher, created.id, ["s3"])
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("lets the teacher enter an invited room before the student joins, but not a closed one", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, { mode: "parallel" });
    const invited = await inviteStudents(t.db, teacher, created.id, ["s1", "s2"]);
    const alice = invited.participants.find((p) => p.studentId === "s1")!;
    const boris = invited.participants.find((p) => p.studentId === "s2")!;

    const waiting = await activateParticipant(t.db, teacher, created.id, alice.id);
    expect(waiting.activeParticipantId).toBe(alice.id);
    expect(waiting.participants.find((p) => p.id === alice.id)?.isActive).toBe(
      true
    );

    await closeParticipant(t.db, teacher, created.id, alice.id);
    await expect(
      activateParticipant(t.db, teacher, created.id, alice.id)
    ).rejects.toMatchObject({ status: 409 });

    const other = await activateParticipant(t.db, teacher, created.id, boris.id);
    expect(other.activeParticipantId).toBe(boris.id);
    expect(other.participants.find((p) => p.id === boris.id)?.status).toBe(
      "invited"
    );
  });

  it("runs group mode as one shared room with a member list", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, { mode: "group" });
    const invited = await inviteStudents(t.db, teacher, created.id, ["s1", "s2"]);
    const roomNames = new Set(
      invited.participants.map((p) =>
        rooms.find((name) => name.includes(created.id))
      )
    );
    expect(roomNames.size).toBe(1);

    await expect(holdTeacher(t.db, teacher, created.id)).rejects.toMatchObject({
      status: 400,
    });

    const alice = await asUser(t.db, "s1@demo.local");
    const view = await getVideoCall(t.db, alice, created.id);
    expect(view.role).toBe("student");
    if (view.role !== "student") return;
    expect(view.members?.map((m) => m.name)).toEqual(
      expect.arrayContaining(["Анна Сергеева", "Алиса Иванова", "Борис Смирнов"])
    );

    await expect(
      activateParticipant(
        t.db,
        teacher,
        created.id,
        invited.participants[0]!.id
      )
    ).rejects.toMatchObject({ status: 400 });

    const teacherTokens = await issueCallTokens(t.db, teacher, created.id);
    const studentTokens = await issueCallTokens(t.db, alice, created.id);
    expect(teacherTokens[0]!.roomName).toBe(studentTokens[0]!.roomName);
  });

  it("forbids another teacher and a student from managing the call", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, {});
    await inviteStudents(t.db, teacher, created.id, ["s1"]);
    const other = await asUser(t.db, "igor@example.com");
    await expect(getVideoCall(t.db, other, created.id)).rejects.toMatchObject({
      status: 403,
    });
    const alice = await asUser(t.db, "s1@demo.local");
    await expect(endVideoCall(t.db, alice, created.id)).rejects.toMatchObject({
      status: 403,
    });
    const lists = await listVideoCalls(t.db, alice);
    expect(lists.map((row) => row.id)).toContain(created.id);
    const empty = await listVideoCalls(t.db, other);
    expect(empty.map((row) => row.id)).not.toContain(created.id);
  });

  it("lists a student's own call history without other students, including ended calls", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asUser(t.db, "anna@example.com");
    const created = await createVideoCall(t.db, teacher, { mode: "parallel" });
    const invited = await inviteStudents(t.db, teacher, created.id, ["s1", "s2"]);
    const alice = await asUser(t.db, "s1@demo.local");
    const boris = await asUser(t.db, "s2@demo.local");

    const live = await listVideoCalls(t.db, alice);
    expect(live.map((row) => row.id)).toContain(created.id);
    expect(live.find((row) => row.id === created.id)?.myStatus).toBe("invited");
    expect(JSON.stringify(live)).not.toContain("Борис");

    const aliceRow = invited.participants.find((p) => p.studentId === "s1")!;
    await closeParticipant(t.db, teacher, created.id, aliceRow.id);
    const afterClose = await listVideoCalls(t.db, alice);
    expect(afterClose.find((row) => row.id === created.id)?.myStatus).toBe(
      "closed"
    );
    const borisLive = await listVideoCalls(t.db, boris);
    expect(borisLive.find((row) => row.id === created.id)?.myStatus).toBe(
      "invited"
    );

    await endVideoCall(t.db, teacher, created.id);
    const history = await listVideoCalls(t.db, alice);
    const ended = history.find((row) => row.id === created.id);
    expect(ended?.status).toBe("ended");
    expect(ended?.teacherName).toBeTruthy();
    expect(JSON.stringify(history)).not.toContain("Борис");
  });
});
