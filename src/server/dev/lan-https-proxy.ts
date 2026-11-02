import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import type { Duplex } from "node:stream";

import {
  DEV_LAN_HTTPS_HOST,
  DEV_LAN_HTTPS_PORT,
  DEV_LAN_HTTP_UPSTREAM_HOST,
  DEV_LAN_HTTP_UPSTREAM_PORT,
} from "@/lib/dev-lan-https";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export type UpstreamTarget = {
  host: string;
  port: number;
};

export function buildUpstreamHeaders(
  req: IncomingMessage,
  options: { forwardedProto: "http" | "https"; websocket?: boolean }
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [rawKey, value] of Object.entries(req.headers)) {
    const key = rawKey.toLowerCase();
    if (!options.websocket && HOP_BY_HOP.has(key)) continue;
    if (!options.websocket && key.startsWith("proxy-")) continue;
    headers[rawKey] = value;
  }
  const host = req.headers.host ?? `${DEV_LAN_HTTPS_HOST}:${DEV_LAN_HTTPS_PORT}`;
  headers.host = host;
  headers["x-forwarded-host"] = host;
  headers["x-forwarded-proto"] = options.forwardedProto;
  const forwardedFor = req.socket.remoteAddress;
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  return headers;
}

export function missingCertMessage(certPath: string, keyPath: string): string {
  return [
    `Нет файлов сертификата sidecar:`,
    `  ${certPath}`,
    `  ${keyPath}`,
    ``,
    `Сгенерировать их нужно вручную через mkcert (скрипт сам сертификаты не выпускает).`,
    `1. Установите mkcert: https://github.com/FiloSottile/mkcert/releases`,
    `2. Установку локального CA в хранилище Windows выполняйте сами, только если согласны:`,
    `     mkcert -install`,
    `3. Серверный сертификат (в каталоге проекта):`,
    `     mkdir certs`,
    `     mkcert -cert-file certs/lan-cert.pem -key-file certs/lan-key.pem ${DEV_LAN_HTTPS_HOST} 127.0.0.1 localhost`,
    `4. На Mac и iPhone копируйте ТОЛЬКО публичный rootCA.pem из каталога \`mkcert -CAROOT\`.`,
    `   Не копируйте rootCA-key.pem и certs/lan-key.pem ни на какие устройства.`,
  ].join("\n");
}

export function describeCertificateSans(certPem: string): string[] {
  const cert = new X509Certificate(certPem);
  const alt = cert.subjectAltName ?? "";
  return alt
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function certificateCoversLanHost(certPem: string, host = DEV_LAN_HTTPS_HOST): boolean {
  const sans = describeCertificateSans(certPem).join(" ").toLowerCase();
  return sans.includes(host.toLowerCase());
}

function writeUpgradeHead(
  socket: Duplex,
  proxyRes: IncomingMessage,
  proxyHead: Buffer
) {
  const status = proxyRes.statusCode ?? 101;
  const lines = [`HTTP/1.1 ${status} Switching Protocols`];
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) lines.push(`${key}: ${item}`);
  }
  socket.write(`${lines.join("\r\n")}\r\n\r\n`);
  if (proxyHead.length) socket.write(proxyHead);
}

export function attachLanProxy(
  server: HttpServer,
  target: UpstreamTarget,
  forwardedProto: "http" | "https"
) {
  const handleHttp = (req: IncomingMessage, res: ServerResponse) => {
    const headers = buildUpstreamHeaders(req, { forwardedProto, websocket: false });
    const proxyReq = httpRequest(
      {
        hostname: target.host,
        port: target.port,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(
        "LAN HTTPS proxy: Next.js на 127.0.0.1:43127 недоступен. Сначала запустите npm run start:local:keep или npm run dev:local."
      );
    });
    req.pipe(proxyReq);
  };

  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const headers = buildUpstreamHeaders(req, { forwardedProto, websocket: true });
    const proxyReq = httpRequest({
      hostname: target.host,
      port: target.port,
      path: req.url,
      method: req.method,
      headers,
    });
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      writeUpgradeHead(socket, proxyRes, proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxyReq.on("error", () => {
      socket.destroy();
    });
    if (head.length) proxyReq.write(head);
    proxyReq.end();
  };

  server.on("request", handleHttp);
  server.on("upgrade", handleUpgrade);
  return { handleHttp, handleUpgrade };
}

export function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function startLanHttpsSidecar(options?: {
  cwd?: string;
  listenHost?: string;
  listenPort?: number;
  target?: UpstreamTarget;
}): Promise<HttpsServer> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev:lan-https запрещён при NODE_ENV=production");
  }

  const cwd = options?.cwd ?? process.cwd();
  const certPath = path.join(cwd, "certs", "lan-cert.pem");
  const keyPath = path.join(cwd, "certs", "lan-key.pem");
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(missingCertMessage(certPath, keyPath));
  }

  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);
  const certPem = cert.toString("utf8");
  if (!certificateCoversLanHost(certPem)) {
    console.warn(
      `Предупреждение: в сертификате нет SAN ${DEV_LAN_HTTPS_HOST}. iPhone/Mac не примут адрес лаборатории, пока не перевыпустите сертификат.`
    );
  }

  const listenPort = options?.listenPort ?? DEV_LAN_HTTPS_PORT;
  const listenHost = options?.listenHost ?? "0.0.0.0";
  const target = options?.target ?? {
    host: DEV_LAN_HTTP_UPSTREAM_HOST,
    port: DEV_LAN_HTTP_UPSTREAM_PORT,
  };

  const upstreamOk = await isPortOpen(target.port, target.host);
  if (!upstreamOk) {
    console.warn(
      `Next.js на ${target.host}:${target.port} пока не отвечает. Sidecar всё равно слушаю; сначала поднимите npm run start:local:keep.`
    );
  }

  const server = createHttpsServer({ cert, key });
  attachLanProxy(server, target, "https");

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, () => resolve());
  });

  console.log(`LAN HTTPS sidecar → https://${DEV_LAN_HTTPS_HOST}:${listenPort}/`);
  console.log(
    `Прокси на ${target.host}:${target.port}. Преподаватель на Windows: http://127.0.0.1:${DEV_LAN_HTTP_UPSTREAM_PORT}/dev/video-lab?role=teacher`
  );
  console.log("Остановка sidecar: Ctrl+C в этом окне. Next.js на 43127 не гасится.");
  return server;
}

/** HTTP-вариант только для автотестов прокси (без TLS). */
export function startTestHttpProxy(target: UpstreamTarget, listenPort = 0) {
  const server = createHttpServer();
  attachLanProxy(server, target, "http");
  return new Promise<{ server: ReturnType<typeof createHttpServer>; port: number }>(
    (resolve, reject) => {
      server.once("error", reject);
      server.listen(listenPort, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Не удалось узнать порт тестового прокси"));
          return;
        }
        resolve({ server, port: address.port });
      });
    }
  );
}
