import { forbidden, jsonError } from "@/server/errors";

/** Публичная регистрация преподавателя закрыта. Аккаунт создаёт директор. */
export async function POST() {
  return jsonError(
    forbidden("Преподавателя создаёт директор в разделе «Доступ».")
  );
}
