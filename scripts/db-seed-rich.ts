/**
 * Расширенное наполнение demo-организации (только локально / development).
 * Не запускать на production: скрипт откажется при NODE_ENV=production.
 *
 * Идемпотентно: вызывает seedDemoOrganization (пересоздаёт только demo-org),
 * затем добавляет занятия для календаря и истёкший тариф.
 */
import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";

import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import * as t from "../src/server/db/schema";
import {
  DEMO_ORG_ID,
  DEMO_ORG_SLUG,
  seedDemoOrganization,
} from "../src/server/db/seed";

loadEnv({ path: ".env.local" });
loadEnv();

function atDay(offset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Отказ: db:seed:rich нельзя запускать при NODE_ENV=production"
    );
  }

  const url = requireDatabaseUrl();
  const { db, sql } = createDb(url);

  console.log(`Rich seed → org ${DEMO_ORG_ID} (${DEMO_ORG_SLUG}) …`);
  await seedDemoOrganization(db, { win1251Safe: false });

  for (let o = -40; o <= 40; o += 3) {
    const id = `l_rich_${o}_${randomBytes(2).toString("hex")}`;
    const status: "planned" | "done" | "cancelled" =
      o < -1 ? "done" : o > 28 ? "cancelled" : "planned";
    const startsAt = atDay(o, 16 + (Math.abs(o) % 3));
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    await db.insert(t.lessons).values({
      id,
      organizationId: DEMO_ORG_ID,
      teacherId: "t1",
      subject: "Математика",
      startsAt,
      endsAt,
      status,
      topicId: status === "done" ? "tp1" : null,
    });
    await db.insert(t.lessonStudents).values({
      lessonId: id,
      studentId: "s1",
    });
    if (status === "done") {
      await db.insert(t.attendances).values({
        lessonId: id,
        studentId: "s1",
        status: o % 9 === 0 ? "absent" : "present",
      });
    }
  }

  await db.insert(t.studentTariffAssignments).values({
    id: "sta_s5_expired",
    organizationId: DEMO_ORG_ID,
    studentId: "s5",
    tariffId: "tariff_basic",
    startsAt: atDay(-60, 0),
    endsAt: atDay(-30, 23),
    priceSnapshot: "12000",
    currency: "RUB",
    status: "expired",
    paymentStatus: "paid",
  });
  await db.insert(t.payments).values({
    id: "pay_s5_old",
    organizationId: DEMO_ORG_ID,
    studentId: "s5",
    assignmentId: "sta_s5_expired",
    amount: "12000",
    currency: "RUB",
    status: "paid",
    provider: "manual",
    idempotencyKey: "seed:pay_s5_old",
    paidAt: atDay(-60, 12),
  });

  console.log(
    "Rich seed OK. Локальные demo-пароли: Demo-Pass-Change-Me1!",
    "director@demo.local / anna@example.com / s1@demo.local / s2@demo.local"
  );
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
