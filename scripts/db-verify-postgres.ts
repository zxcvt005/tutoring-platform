/**
 * Проверка migrate / seed / FK / ключей ответов на настоящем PostgreSQL.
 *
 * По умолчанию поднимает временный кластер через embedded-postgres
 * (Docker на этой машине не требуется).
 *
 * Альтернатива: DATABASE_URL=... npm run db:verify:pg
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import {
  DEMO_ORG_ID,
  seedDemoOrganization,
} from "../src/server/db/seed";

loadEnv({ path: ".env.local" });
loadEnv();

// ASCII-путь: initdb UTF-8 падает, если databaseDir содержит кириллицу (Users\Пользователь\…)
const EMBEDDED_DIR =
  process.env.EMBEDDED_PG_DIR ??
  path.join(process.env.SystemDrive ?? "C:", "tutoring-pg-tmp");
const EMBEDDED_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const EMBEDDED_PASSWORD = "postgres";

type SqlClient = ReturnType<typeof postgres>;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function withDb(
  connectionString: string,
  fn: (db: ReturnType<typeof drizzle>, sqlClient: SqlClient) => Promise<void>
) {
  const sqlClient = postgres(connectionString, { max: 1 });
  const db = drizzle(sqlClient, { schema });
  try {
    await fn(db, sqlClient);
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function expectReject(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected failure: ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Expected failure:")) throw err;
    console.log(`  OK reject: ${label}`);
  }
}

async function detectWin1251(sqlClient: SqlClient): Promise<boolean> {
  const rows = await sqlClient<{ server_encoding: string }[]>`SHOW server_encoding`;
  const enc = String(rows[0]?.server_encoding ?? "").toUpperCase();
  console.log(`server_encoding=${enc}`);
  return enc.includes("WIN125") || enc === "SQL_ASCII";
}

async function runChecks(connectionString: string) {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  await withDb(connectionString, async (db, sqlClient) => {
    console.log("1) migrate (empty) …");
    await migrate(db, { migrationsFolder });

    console.log("2) migrate again (idempotent) …");
    await migrate(db, { migrationsFolder });

    const win1251Safe = await detectWin1251(sqlClient);
    const seedOpts = { win1251Safe };

    console.log("3) seed …");
    await seedDemoOrganization(db, seedOpts);

    console.log("4) seed again (re-seed demo org) …");
    await seedDemoOrganization(db, seedOpts);

    const [orgs] = await db.select({ n: count() }).from(schema.organizations);
    const [teachers] = await db.select({ n: count() }).from(schema.teachers);
    const [students] = await db.select({ n: count() }).from(schema.students);
    const [tests] = await db.select({ n: count() }).from(schema.tests);
    const [keys] = await db.select({ n: count() }).from(schema.testAnswerKeys);
    const [assignments] = await db
      .select({ n: count() })
      .from(schema.testAssignments);
    const [snapshots] = await db
      .select({ n: count() })
      .from(schema.assignmentSnapshots);

    console.log("Counts:", {
      organizations: Number(orgs?.n),
      teachers: Number(teachers?.n),
      students: Number(students?.n),
      tests: Number(tests?.n),
      answerKeys: Number(keys?.n),
      assignments: Number(assignments?.n),
      snapshots: Number(snapshots?.n),
    });

    assert(Number(orgs?.n) === 1, "expected 1 demo organization");
    assert(Number(teachers?.n) >= 1, "expected teachers");
    assert(Number(keys?.n) >= 1, "expected answer keys");
    assert(
      Number(assignments?.n) === Number(snapshots?.n),
      "each assignment needs a snapshot"
    );

    console.log("5) answer-key separation …");
    const publicRows = await db
      .select({
        id: schema.tests.id,
        questionsPublic: schema.tests.questionsPublic,
      })
      .from(schema.tests);

    for (const row of publicRows) {
      const raw = JSON.stringify(row.questionsPublic);
      assert(
        !raw.includes('"correctOptionIds"'),
        `tests.questions_public still has correctOptionIds (${row.id})`
      );
      assert(
        !raw.includes('"correctAnswers"'),
        `tests.questions_public still has correctAnswers (${row.id})`
      );
      assert(
        !raw.includes('"numericTolerance"'),
        `tests.questions_public still has numericTolerance (${row.id})`
      );
    }

    const keySample = await db
      .select()
      .from(schema.testAnswerKeys)
      .limit(3);
    assert(keySample.length > 0, "no answer key rows");
    for (const k of keySample) {
      const p = k.payload as Record<string, unknown>;
      const has =
        p.correctOptionIds != null ||
        p.correctAnswers != null ||
        p.matchingPairIds != null ||
        p.orderItemIds != null;
      assert(has, `empty answer key payload for ${k.id}`);
    }

    const snapSample = await db
      .select()
      .from(schema.assignmentSnapshots)
      .limit(2);
    for (const s of snapSample) {
      const qJson = JSON.stringify(s.questions);
      assert(
        !qJson.includes('"correctOptionIds"'),
        "snapshot.questions must not contain correctOptionIds"
      );
      assert(
        Object.keys(s.answerKeys as object).length > 0 ||
          (s.questions as unknown[]).length === 0,
        "snapshot should keep answerKeys separately"
      );
    }
    console.log("  OK public questions stripped; keys in test_answer_keys / snapshot.answer_keys");

    console.log("6) FK / CHECK constraints …");

    await expectReject("invalid membership role", () =>
      db.insert(schema.memberships).values({
        id: "mem_bad_role",
        organizationId: DEMO_ORG_ID,
        userId: "user_director_demo",
        role: "admin",
      })
    );

    await expectReject("lesson ends_at <= starts_at", () =>
      db.insert(schema.lessons).values({
        id: "l_bad_time",
        organizationId: DEMO_ORG_ID,
        teacherId: "t1",
        startsAt: new Date("2030-01-01T12:00:00Z"),
        endsAt: new Date("2030-01-01T11:00:00Z"),
        status: "planned",
      })
    );

    await expectReject("attendance invalid status", () =>
      db.insert(schema.attendances).values({
        lessonId: "l1",
        studentId: "s1",
        status: "late",
      })
    );

    await expectReject("FK: unknown teacher on topic", () =>
      db.insert(schema.topics).values({
        id: "tp_bad",
        organizationId: DEMO_ORG_ID,
        teacherId: "t_missing",
        title: "x",
        subject: "y",
        status: "active",
        sortOrder: 0,
      })
    );

    await expectReject("RESTRICT delete test with assignments", async () => {
      await db.delete(schema.tests).where(eq(schema.tests.id, "hw1"));
    });

    // orphan org delete should cascade demo subtree; recreate after
    console.log("7) CASCADE delete organization …");
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, DEMO_ORG_ID));
    const [after] = await db
      .select({ n: count() })
      .from(schema.teachers)
      .where(eq(schema.teachers.organizationId, DEMO_ORG_ID));
    assert(Number(after?.n) === 0, "teachers should cascade with org");

    const [assignLeft] = await db
      .select({ n: count() })
      .from(schema.testAssignments);
    assert(Number(assignLeft?.n) === 0, "assignments should cascade with org");

    console.log("8) re-seed after cascade …");
    await seedDemoOrganization(db, seedOpts);
    const [restored] = await db
      .select({ n: count() })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, DEMO_ORG_ID));
    assert(Number(restored?.n) === 1, "demo org restored");

    const migRows = await sqlClient<
      { n: number }[]
    >`select count(*)::int as n from drizzle.__drizzle_migrations`;
    assert(Number(migRows[0]?.n) >= 1, "drizzle migrations journal empty");

    console.log("Real PostgreSQL verify OK");
  });
}

async function startEmbedded(): Promise<{
  connectionString: string;
  stop: () => Promise<void>;
}> {
  fs.rmSync(EMBEDDED_DIR, { recursive: true, force: true });
  fs.mkdirSync(EMBEDDED_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: EMBEDDED_DIR,
    user: "postgres",
    password: EMBEDDED_PASSWORD,
    port: EMBEDDED_PORT,
    persistent: false,
    // На Windows с кириллическим username UTF8-initdb падает.
    // Кластер будет WIN1251; seed вызываем с win1251Safe.
  });

  console.log(`Starting embedded PostgreSQL on port ${EMBEDDED_PORT} …`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("tutoring_platform");

  const connectionString = `postgresql://postgres:${EMBEDDED_PASSWORD}@127.0.0.1:${EMBEDDED_PORT}/tutoring_platform`;

  return {
    connectionString,
    stop: async () => {
      // На Windows pg.stop() иногда зависает — гасим процессы по порту.
      try {
        if (process.platform === "win32") {
          execSync(
            `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${EMBEDDED_PORT} ^| findstr LISTENING') do taskkill /F /PID %a`,
            { stdio: "ignore", shell: "cmd.exe" }
          );
        }
      } catch {
        // ignore
      }
      try {
        await Promise.race([
          pg.stop(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch (err) {
        console.warn("pg.stop:", err instanceof Error ? err.message : err);
      }
      try {
        fs.rmSync(EMBEDDED_DIR, { recursive: true, force: true });
      } catch {
        // Windows may lock files briefly
      }
      console.log("Embedded PostgreSQL stopped");
    },
  };
}

async function main() {
  const externalUrl = process.env.DATABASE_URL;
  let stop: (() => Promise<void>) | undefined;
  let connectionString: string;

  if (externalUrl && process.env.USE_EMBEDDED_PG !== "1") {
    console.log("Using DATABASE_URL (external PostgreSQL)");
    connectionString = externalUrl;
  } else {
    console.log(
      "Docker not required: using embedded-postgres (real PostgreSQL binaries)"
    );
    const embedded = await startEmbedded();
    connectionString = embedded.connectionString;
    stop = embedded.stop;
  }

  try {
    await runChecks(connectionString);
  } finally {
    if (stop) await stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
