import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getPrivateSession } from "@/app/api/private-calls/session/route";
import { ApiError } from "@/server/errors";
import {
  loginPrivateHost,
  openPrivateGuest,
  openPrivateHost,
  requirePrivateHost,
  sealPrivateGuest,
  sealPrivateHost,
} from "@/server/private-calls/access";
import {
  PRIVATE_CALL_MAX_OPEN_ROOMS,
  PRIVATE_JOIN_LIMIT,
  activatePrivateRoom,
  closePrivateRoom,
  endPrivateSession,
  getPrivateGuestCall,
  getPrivateHost,
  getPrivateJoinInfo,
  holdPrivateTeacher,
  issuePrivateGuestTokens,
  issuePrivateHostTokens,
  joinPrivateCall,
  leavePrivateGuest,
  pulsePrivateGuest,
  setPrivateAccepting,
  startPrivateSession,
} from "@/server/services/private-calls-service";
import { setVideoLivekitSyncForTests } from "@/server/video/livekit-rooms";
import { createTestDb } from "../helpers/pg-test";

const PASSWORD = "unit-test-private-calls-password";
const SECRET = "unit-test-private-calls-secret-value";

const PREV = {
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  PRIVATE_CALLS_PASSWORD: process.env.PRIVATE_CALLS_PASSWORD,
  PRIVATE_CALLS_SECRET: process.env.PRIVATE_CALLS_SECRET,
};

function roomOf(token: string): string | undefined {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")
  ) as { video?: { room?: string } };
  return payload.video?.room;
}

describe("private calls", () => {
  let close: (() => Promise<void>) | undefined;
  const ensured: Array<{ name: string; max: number; empty?: number }> = [];
  const deleted: string[] = [];

  beforeEach(() => {
    ensured.length = 0;
    deleted.length = 0;
    process.env.LIVEKIT_URL = "wss://video.neodinschool.ru";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "unit-test-secret-not-used-in-prod";
    process.env.PRIVATE_CALLS_PASSWORD = PASSWORD;
    process.env.PRIVATE_CALLS_SECRET = SECRET;
    setVideoLivekitSyncForTests({
      ensureRoom: async (name, max, empty) => {
        ensured.push({ name, max, empty });
      },
      deleteRoom: async (name) => {
        deleted.push(name);
      },
      removeParticipant: async () => undefined,
    });
  });

  afterEach(async () => {
    setVideoLivekitSyncForTests(null);
    for (const [key, value] of Object.entries(PREV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (close) await close();
    close = undefined;
  });

  async function db() {
    const t = await createTestDb();
    close = t.close;
    return t.db;
  }

  it("rejects the teacher page without a private cookie", async () => {
    const res = await getPrivateSession(
      new Request("http://localhost/api/private-calls/session")
    );
    expect(res.status).toBe(401);
    await expect(
      requirePrivateHost(new Request("http://localhost/private-calls"))
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("checks the private password and rejects a tampered cookie", async () => {
    const database = await db();
    await expect(
      loginPrivateHost(database, "not-the-private-password", "10.0.0.8")
    ).rejects.toMatchObject({ status: 401 });
    const { expiresAt } = await loginPrivateHost(database, PASSWORD, "10.0.0.8");
    const token = sealPrivateHost(expiresAt);
    expect(openPrivateHost(token)?.kind).toBe("host");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(openPrivateHost(tampered)).toBeNull();

    delete process.env.PRIVATE_CALLS_PASSWORD;
    await expect(
      loginPrivateHost(database, PASSWORD, "10.0.0.9")
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rate-limits private password attempts", async () => {
    const database = await db();
    for (let index = 0; index < 8; index += 1) {
      await expect(
        loginPrivateHost(database, "wrong-private-password", "10.1.0.1")
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      loginPrivateHost(database, PASSWORD, "10.1.0.1")
    ).rejects.toMatchObject({ status: 429 });
  });

  it("gives each joiner an isolated room and hides the other name", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    const anna = await joinPrivateCall(database, {
      code: session.code,
      name: "Анна",
      ip: "10.2.0.1",
    });
    const boris = await joinPrivateCall(database, {
      code: session.code,
      name: "Борис",
      ip: "10.2.0.2",
    });
    expect(anna.roomId).not.toBe(boris.roomId);
    expect(ensured).toHaveLength(2);
    expect(ensured.every((room) => room.max === 2 && room.empty === 90)).toBe(
      true
    );
    expect(new Set(ensured.map((room) => room.name)).size).toBe(2);
    expect(ensured.every((room) => room.name.startsWith("pc-"))).toBe(true);

    const annaTokens = await issuePrivateGuestTokens(database, {
      roomId: anna.roomId,
      sessionId: anna.sessionId,
      exp: 0,
    });
    const borisTokens = await issuePrivateGuestTokens(database, {
      roomId: boris.roomId,
      sessionId: boris.sessionId,
      exp: 0,
    });
    expect(roomOf(annaTokens[0]!.participantToken)).toBe(ensured[0]!.name);
    expect(roomOf(borisTokens[0]!.participantToken)).toBe(ensured[1]!.name);
    expect(roomOf(annaTokens[0]!.participantToken)).not.toBe(
      roomOf(borisTokens[0]!.participantToken)
    );
    const annaView = await getPrivateGuestCall(database, {
      roomId: anna.roomId,
      sessionId: anna.sessionId,
      exp: 0,
    });
    expect(JSON.stringify(annaView)).not.toContain("Борис");
    expect(annaView.members).toBeNull();
    expect(annaView.teacherWithMe).toBe(false);

    await expect(
      issuePrivateGuestTokens(database, {
        roomId: boris.roomId,
        sessionId: "pcs_foreign",
        exp: 0,
      })
    ).rejects.toMatchObject({ status: 403 });
    const guest = sealPrivateGuest(
      { roomId: anna.roomId, sessionId: anna.sessionId },
      new Date(Date.now() + 60_000)
    );
    expect(openPrivateGuest(guest)?.roomId).toBe(anna.roomId);
    expect(openPrivateGuest(`${guest.slice(0, -1)}x`)).toBeNull();
  });

  it("blocks new joins when intake is paused or the session has ended", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    const first = await joinPrivateCall(database, {
      code: session.code,
      name: "Анна",
      ip: "10.3.0.1",
    });
    await setPrivateAccepting(database, false);
    await expect(
      joinPrivateCall(database, {
        code: session.code,
        name: "Борис",
        ip: "10.3.0.2",
      })
    ).rejects.toMatchObject({ status: 409 });
    const paused = await getPrivateHost(database);
    expect(paused?.accepting).toBe(false);
    expect(paused?.call.participants.filter((row) => row.status === "invited")).toHaveLength(
      1
    );
    expect(deleted).toHaveLength(0);

    await endPrivateSession(database);
    expect(deleted).toContain(ensured[0]!.name);
    await expect(
      joinPrivateCall(database, {
        code: session.code,
        name: "Анна",
        ip: "10.3.0.3",
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(await getPrivateJoinInfo(database, session.code)).toEqual({
      available: false,
      accepting: false,
    });
    const next = await startPrivateSession(database);
    expect(next.code).not.toBe(session.code);
    await expect(
      getPrivateGuestCall(database, {
        roomId: first.roomId,
        sessionId: first.sessionId,
        exp: 0,
      })
    ).resolves.toMatchObject({ myStatus: "closed", status: "ended" });
  });

  it("keeps a room through a short gap and closes it after 30 seconds", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    const start = new Date("2026-11-02T10:00:00.000Z");
    const joined = await joinPrivateCall(database, {
      code: session.code,
      name: "Анна",
      ip: "10.4.0.1",
      now: start,
    });
    const claims = {
      roomId: joined.roomId,
      sessionId: joined.sessionId,
      exp: 0,
    };
    const soon = new Date(start.getTime() + 20_000);
    const soonHost = await getPrivateHost(database, soon);
    expect(soonHost?.call.participants[0]).toMatchObject({
      status: "invited",
      presenceLabel: "переподключение",
    });
    expect(deleted).toHaveLength(0);

    await pulsePrivateGuest(database, claims, soon);
    const afterPulse = await getPrivateHost(
      database,
      new Date(soon.getTime() + 20_000)
    );
    expect(afterPulse?.call.participants[0]?.status).toBe("invited");
    expect(deleted).toHaveLength(0);

    const expired = await getPrivateHost(
      database,
      new Date(soon.getTime() + 30_000)
    );
    expect(expired?.call.participants[0]?.status).toBe("closed");
    expect(deleted).toContain(ensured[0]!.name);
  });

  it("closes a room immediately on the explicit leave button", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    const start = new Date("2026-11-02T12:00:00.000Z");
    const joined = await joinPrivateCall(database, {
      code: session.code,
      name: "Анна",
      ip: "10.5.0.1",
      now: start,
    });
    await leavePrivateGuest(
      database,
      { roomId: joined.roomId, sessionId: joined.sessionId, exp: 0 },
      new Date(start.getTime() + 5_000)
    );
    const host = await getPrivateHost(
      database,
      new Date(start.getTime() + 5_000)
    );
    expect(host?.call.participants[0]?.status).toBe("closed");
    expect(deleted).toContain(ensured[0]!.name);
  });

  it("lets the teacher switch one room at a time and close the rest with the session", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    const anna = await joinPrivateCall(database, {
      code: session.code,
      name: "Анна",
      ip: "10.6.0.1",
    });
    const boris = await joinPrivateCall(database, {
      code: session.code,
      name: "Борис",
      ip: "10.6.0.2",
    });
    const active = await activatePrivateRoom(database, anna.roomId);
    expect(active.activeParticipantId).toBe(anna.roomId);
    expect(active.participants.find((row) => row.id === anna.roomId)?.presenceLabel).toBe(
      "в эфире"
    );
    expect(active.participants.find((row) => row.id === boris.roomId)?.presenceLabel).toBe(
      "ожидает"
    );
    const annaView = await getPrivateGuestCall(database, {
      roomId: anna.roomId,
      sessionId: anna.sessionId,
      exp: 0,
    });
    const borisView = await getPrivateGuestCall(database, {
      roomId: boris.roomId,
      sessionId: boris.sessionId,
      exp: 0,
    });
    expect(annaView.teacherWithMe).toBe(true);
    expect(borisView.teacherWithMe).toBe(false);
    expect(JSON.stringify(borisView)).not.toContain("Анна");

    const held = await holdPrivateTeacher(database);
    expect(held.activeParticipantId).toBeNull();
    const closed = await closePrivateRoom(database, boris.roomId);
    expect(closed.participants.find((row) => row.id === boris.roomId)?.status).toBe(
      "closed"
    );
    const tokens = await issuePrivateHostTokens(database);
    expect(tokens.map((token) => token.participantId)).toEqual([anna.roomId]);

    await endPrivateSession(database);
    expect(deleted).toEqual(
      expect.arrayContaining([ensured[0]!.name, ensured[1]!.name])
    );
    expect(await getPrivateHost(database)).toBeNull();
  });

  it("limits how many people can open the same link", async () => {
    const database = await db();
    const session = await startPrivateSession(database);
    for (let index = 0; index < PRIVATE_JOIN_LIMIT; index += 1) {
      await joinPrivateCall(database, {
        code: session.code,
        name: `Ученик ${index + 1}`,
        ip: "10.7.0.1",
      });
    }
    await expect(
      joinPrivateCall(database, {
        code: session.code,
        name: "Лишний",
        ip: "10.7.0.1",
      })
    ).rejects.toMatchObject({ status: 429 });

    const full = await startPrivateSession(database);
    for (let index = 0; index < PRIVATE_CALL_MAX_OPEN_ROOMS; index += 1) {
      await joinPrivateCall(database, {
        code: full.code,
        name: `Комната ${index + 1}`,
        ip: `10.8.0.${index + 1}`,
      });
    }
    await expect(
      joinPrivateCall(database, {
        code: full.code,
        name: "Сверх",
        ip: "10.8.1.1",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("does not close a private room from page hide", () => {
    const student = readFileSync(
      "src/components/video-calls/student-call-session.tsx",
      "utf8"
    );
    const join = readFileSync(
      "src/components/private-calls/join-desk.tsx",
      "utf8"
    );
    expect(student).not.toContain("pagehide");
    expect(student).not.toContain("beforeunload");
    expect(join).not.toContain("pagehide");
    expect(join).not.toContain("beforeunload");
    expect(student).toContain("pulse");
  });
});
