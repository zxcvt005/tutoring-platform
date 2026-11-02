/**
 * Локальный HTTPS sidecar видеолаборатории.
 * Не для production. Не туннель и не публикация в интернет.
 */
import { startLanHttpsSidecar } from "../src/server/dev/lan-https-proxy";

const serverPromise = startLanHttpsSidecar();

function shutdown() {
  void serverPromise.then((server) => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void serverPromise.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Не удалось запустить sidecar";
  console.error(message);
  process.exit(1);
});
