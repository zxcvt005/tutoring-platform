import { isProductionRuntime } from "@/server/auth/env";
import { notFound } from "@/server/errors";

/**
 * Временный видео-лабораторный контур только для локальной разработки.
 * В production (включая Timeweb с NODE_ENV=production) маршрут и API скрыты.
 */
export function isVideoLabEnabled(): boolean {
  return !isProductionRuntime();
}

export function assertVideoLabEnabled(): void {
  if (!isVideoLabEnabled()) {
    throw notFound("Не найдено");
  }
}
