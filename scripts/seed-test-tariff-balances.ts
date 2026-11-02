/**
 * Локальные QA-ученики с остатком 2 / 1 / 0 / −1.
 * Только 127.0.0.1:55432 / tutoring_platform, организация Неодин (org_school_qa).
 * Идемпотентен по фиксированным id и ФИО. Не трогает чужие остатки.
 *
 *   npx tsx scripts/seed-test-tariff-balances.ts
 */
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";

import { parseDatabaseUrl } from "../src/server/db/database-url";
import { sanitizeDbError } from "../src/server/db/database-url";
import {
  students,
  tariffLessonLedger,
  users,
} from "../src/server/db/schema";
import { SCHOOL_ORG_ID } from "../src/server/db/seed-school";
import {
  ensureSchoolTariffQaFixtures,
  SCHOOL_TARIFF_QA_SPECS,
} from "../src/server/db/seed-school-tariff-qa";
import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import { resolveLearningAccess } from "../src/server/services/learning-access";
import {
  findDebitAssignment,
  getAssignmentBalance,
} from "../src/server/services/lesson-balance";
import { assertSafeTestDatabase } from "./lib/seed-safety";

loadEnv({ path: ".env.local" });
loadEnv();

const REQUIRED_PORT = 55432;

async function main() {
  const url = requireDatabaseUrl();
  const parsed = parseDatabaseUrl(url);
  const safety = assertSafeTestDatabase(url);
  if (safety.hostname !== "127.0.0.1" && safety.hostname !== "localhost") {
    throw new Error("Отказ: нужен хост 127.0.0.1");
  }
  if (parsed.port !== REQUIRED_PORT) {
    throw new Error(`Отказ: нужен порт ${REQUIRED_PORT}, получен ${parsed.port ?? "default"}`);
  }
  if (safety.database !== "tutoring_platform") {
    throw new Error("Отказ: имя БД должно быть tutoring_platform");
  }

  const { db, sql } = createDb(url);
  try {
    await sql`select 1 as ok`;
    const encRows = await sql<{ server_encoding: string }[]>`SHOW server_encoding`;
    console.log(`server_encoding=${encRows[0]?.server_encoding ?? "?"}`);

    const results = await ensureSchoolTariffQaFixtures(db);
    console.log(
      `\nПроверка остатков (${results.filter((r) => r.restored).length} восстановлено, ${results.filter((r) => !r.restored).length} уже были):`
    );

    for (const spec of SCHOOL_TARIFF_QA_SPECS) {
      const [row] = await db
        .select()
        .from(students)
        .where(eq(students.id, spec.id))
        .limit(1);
      const assignment = await findDebitAssignment(db, SCHOOL_ORG_ID, spec.id);
      if (!row || !assignment) {
        throw new Error(`Нет ученика или активного пакета: ${spec.fullName}`);
      }
      const balance = await getAssignmentBalance(
        db,
        assignment.id,
        assignment.lessonsLimitSnapshot
      );
      const access = await resolveLearningAccess(
        db,
        SCHOOL_ORG_ID,
        spec.id,
        "homework"
      );
      if (balance.remaining !== spec.targetRemaining) {
        throw new Error(
          `${spec.fullName}: ожидался остаток ${spec.targetRemaining}, журнал дал ${balance.remaining}`
        );
      }
      if (access.remaining !== spec.targetRemaining) {
        throw new Error(
          `${spec.fullName}: серверная логика доступа дала ${access.remaining}`
        );
      }

      const ledger = await db
        .select()
        .from(tariffLessonLedger)
        .where(eq(tariffLessonLedger.assignmentId, assignment.id))
        .orderBy(tariffLessonLedger.createdAt);
      const debits = ledger.filter((r) => r.delta < 0);

      if (spec.targetRemaining === -1) {
        if (debits.length !== 3) {
          throw new Error(
            `${spec.fullName}: для −1 ожидалось 3 списания, в журнале ${debits.length}`
          );
        }
        if (!debits.every((r) => r.reason === "present")) {
          throw new Error(`${spec.fullName}: списания должны быть present`);
        }
      }

      const [account] = row.userId
        ? await db.select().from(users).where(eq(users.id, row.userId)).limit(1)
        : [];

      console.log(
        [
          `• ${row.fullName}`,
          `  id=${row.id}`,
          `  login=${account?.email ?? "нет входа"}`,
          `  org=${row.organizationId}`,
          `  teacher=${row.primaryTeacherId}`,
          `  remaining=${balance.remaining}`,
          `  assignment=${assignment.id}`,
          `  ledger_debits=${debits.length}`,
          spec.targetRemaining === -1
            ? `  debt_lesson=${debits[2]?.lessonId ?? "?"}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const anyErr = err as { cause?: { message?: string; code?: string } };
  if (anyErr.cause?.message) {
    console.error(anyErr.cause.code ?? "", anyErr.cause.message);
  }
  console.error(sanitizeDbError(err).message);
  process.exit(1);
});
