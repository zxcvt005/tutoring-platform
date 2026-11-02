/**
 * Копирует WASM MediaPipe из node_modules в public/video-processors/wasm.
 * Модель selfie_segmenter.tflite уже лежит в public/video-processors/.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const from = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join(root, "public", "video-processors", "wasm");

if (!fs.existsSync(from)) {
  throw new Error("Нет @mediapipe/tasks-vision. Сначала npm install.");
}

fs.mkdirSync(to, { recursive: true });
for (const name of fs.readdirSync(from)) {
  fs.copyFileSync(path.join(from, name), path.join(to, name));
}
console.log(`WASM скопирован в ${to}`);
