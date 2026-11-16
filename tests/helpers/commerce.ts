import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { TariffFeatureKey } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  learningDirections,
  students,
  tariffPurchaseOptions,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  insertPendingLessonOrder,
} from "@/server/db/seed-commerce";
import {
  confirmPaidFromBank,
  type CommerceActor,
} from "@/server/services/lesson-orders-service";
import { upsertTariff } from "@/server/services/tariffs-service";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export async function physicsDirectionId(
  db: AppDb,
  organizationId: string
): Promise<string> {
  const [row] = await db
    .select({ id: learningDirections.id })
    .from(learningDirections)
    .where(
      and(
        eq(learningDirections.organizationId, organizationId),
        eq(learningDirections.slug, "physics")
      )
    )
    .limit(1);
  if (!row) {
    throw new Error(
      "Направление physics не найдено; вызовите ensureDefaultDirections в сиде"
    );
  }
  return row.id;
}

export type SeedPaidLessonsInput = {
  directionId: string;
  lessons: number;
  features?: TariffFeatureKey[];
  tariffName?: string;
  totalPrice?: number;
  tariffId?: string;
  productIds?: string[];
};

export type SeedPaidLessonsResult = {
  tariffId: string;
  optionId: string;
  orderId: string;
  paymentId: string;
  directionId: string;
  lessonsCount: number;
  totalAmount: number;
};

export async function seedPaidLessons(
  db: AppDb,
  directorCtx: AuthContext,
  studentId: string,
  input: SeedPaidLessonsInput
): Promise<SeedPaidLessonsResult> {
  const lessonsCount = input.lessons;
  const totalAmount = input.totalPrice ?? lessonsCount * 1000;
  const features = input.features ?? ["individual_lessons", "homework"];
  const tariffName = input.tariffName ?? `Тест ${lessonsCount} занятий`;

  const tariff = await upsertTariff(db, directorCtx, {
    id: input.tariffId,
    directionId: input.directionId,
    name: tariffName,
    features,
    purchaseOptions: [
      {
        lessonsCount,
        totalPrice: totalAmount,
        sortOrder: 0,
        isActive: true,
      },
    ],
  });

  const [option] = await db
    .select()
    .from(tariffPurchaseOptions)
    .where(
      and(
        eq(tariffPurchaseOptions.organizationId, directorCtx.organizationId),
        eq(tariffPurchaseOptions.tariffId, tariff.id)
      )
    )
    .limit(1);
  if (!option) {
    throw new Error("Вариант покупки не создан");
  }

  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, directorCtx.organizationId)
      )
    )
    .limit(1);
  const payerUserId = student?.userId ?? directorCtx.userId;
  if (!payerUserId) {
    throw new Error(`Не удалось определить payerUserId для ${studentId}`);
  }

  const orderId = newId("lord_test");
  const paymentId = newId("pay_test");
  const now = new Date();

  await insertPendingLessonOrder(db, {
    orderId,
    organizationId: directorCtx.organizationId,
    studentId,
    payerUserId,
    tariffId: tariff.id,
    optionId: option.id,
    directionId: input.directionId,
    tariffName,
    lessonsCount,
    totalAmount: String(totalAmount),
    features,
    productIds: input.productIds ?? [],
    createdAt: now,
    paymentId,
    paymentProvider: "stub",
  });

  const actor: CommerceActor = {
    organizationId: directorCtx.organizationId,
    userId: directorCtx.userId,
  };
  await confirmPaidFromBank(db, actor, {
    paymentId,
    amount: totalAmount,
    raw: { test: true },
  });

  return {
    tariffId: tariff.id,
    optionId: option.id,
    orderId,
    paymentId,
    directionId: input.directionId,
    lessonsCount,
    totalAmount,
  };
}

export async function makePlannedLesson(
  db: AppDb,
  teacher: AuthContext,
  input: {
    studentIds: string[];
    directionId: string;
    slotHour?: number;
    subject?: string;
    teacherId?: string;
  }
) {
  const { upsertLesson } = await import(
    "@/server/services/platform-mutations"
  );
  const startsAt = new Date(Date.now() + 2 * 86_400_000);
  startsAt.setHours(input.slotHour ?? 16, 15, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
  const created = await upsertLesson(db, teacher, {
    teacherId: input.teacherId ?? "t1",
    studentIds: input.studentIds,
    directionId: input.directionId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: "planned",
    subject: input.subject ?? "Тест",
  });
  return created.id;
}