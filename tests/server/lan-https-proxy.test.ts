import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { DEV_LAN_HTTPS_ORIGIN } from "@/lib/dev-lan-https";
import {
  buildUpstreamHeaders,
  missingCertMessage,
  startTestHttpProxy,
} from "@/server/dev/lan-https-proxy";

describe("LAN HTTPS sidecar proxy", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
  });

  it("forwards method, origin, cookies, CSRF header and JSON body", async () => {
    const seen: {
      method?: string;
      origin?: string;
      cookie?: string;
      csrf?: string;
      body?: string;
      forwardedProto?: string;
      forwardedHost?: string;
    } = {};

    const upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        seen.method = req.method;
        seen.origin = String(req.headers.origin ?? "");
        seen.cookie = String(req.headers.cookie ?? "");
        seen.csrf = String(req.headers["x-csrf-token"] ?? "");
        seen.forwardedProto = String(req.headers["x-forwarded-proto"] ?? "");
        seen.forwardedHost = String(req.headers["x-forwarded-host"] ?? "");
        seen.body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: req.url }));
      });
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    servers.push(upstream);
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("no upstream port");
    }

    const proxy = await startTestHttpProxy({
      host: "127.0.0.1",
      port: upstreamAddress.port,
    });
    servers.push(proxy.server);

    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/video/lab-token`, {
      method: "POST",
      headers: {
        origin: DEV_LAN_HTTPS_ORIGIN,
        cookie: "tp_csrf=test-csrf",
        "x-csrf-token": "test-csrf",
        "content-type": "application/json",
        host: "192.168.1.116:43128",
      },
      body: JSON.stringify({
        roomName: "student-a",
        identity: "pupil-a",
        displayName: "A",
      }),
    });
    const json = (await res.json()) as { ok?: boolean; path?: string };

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.path).toBe("/api/video/lab-token");
    expect(seen.method).toBe("POST");
    expect(seen.origin).toBe(DEV_LAN_HTTPS_ORIGIN);
    expect(seen.cookie).toBe("tp_csrf=test-csrf");
    expect(seen.csrf).toBe("test-csrf");
    expect(seen.body).toContain("student-a");
    expect(seen.forwardedHost).toBeTruthy();
  });

  it("forwards /_next asset paths", async () => {
    const upstream = createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`asset:${req.url}`);
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    servers.push(upstream);
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("no upstream port");
    }
    const proxy = await startTestHttpProxy({
      host: "127.0.0.1",
      port: upstreamAddress.port,
    });
    servers.push(proxy.server);

    const res = await fetch(
      `http://127.0.0.1:${proxy.port}/_next/static/chunks/test.js`
    );
    expect(await res.text()).toBe("asset:/_next/static/chunks/test.js");
  });

  it("strips hop-by-hop headers but keeps origin for ordinary HTTP", () => {
    const req = {
      headers: {
        origin: DEV_LAN_HTTPS_ORIGIN,
        connection: "keep-alive",
        upgrade: "websocket",
        cookie: "tp_csrf=abc",
        host: "192.168.1.116:43128",
      },
      socket: { remoteAddress: "192.168.1.20" },
    } as unknown as import("node:http").IncomingMessage;

    const httpHeaders = buildUpstreamHeaders(req, { forwardedProto: "https" });
    expect(httpHeaders.origin).toBe(DEV_LAN_HTTPS_ORIGIN);
    expect(httpHeaders.cookie).toBe("tp_csrf=abc");
    expect(httpHeaders.connection).toBeUndefined();
    expect(httpHeaders.upgrade).toBeUndefined();
    expect(httpHeaders["x-forwarded-proto"]).toBe("https");

    const wsHeaders = buildUpstreamHeaders(req, {
      forwardedProto: "https",
      websocket: true,
    });
    expect(wsHeaders.upgrade).toBe("websocket");
    expect(wsHeaders.connection).toBe("keep-alive");
  });

  it("explains how to create certs without printing keys", () => {
    const message = missingCertMessage("certs/lan-cert.pem", "certs/lan-key.pem");
    expect(message).toContain("mkcert");
    expect(message).toContain("rootCA.pem");
    expect(message).toContain("Не копируйте rootCA-key.pem");
    expect(message).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });
});
