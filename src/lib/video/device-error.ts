import { HttpStatusError } from "@/lib/store/api-client";

export function deviceErrorMessage(err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  if (name === "NotAllowedError") {
    return "Браузер запретил доступ к камере или микрофону. Разрешите устройства для этого сайта.";
  }
  if (name === "NotFoundError") {
    return "Камера или микрофон не найдены. Проверьте, что устройство подключено.";
  }
  if (name === "NotReadableError") {
    return "Устройство занято другим приложением. Закройте другие программы и повторите.";
  }
  if (err instanceof HttpStatusError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Не удалось выполнить действие.";
}
