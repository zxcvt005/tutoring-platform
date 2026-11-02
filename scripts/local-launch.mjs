/**
 * Помощник однокнопочного запуска: порт 43127, HTTP, «свой / чужой» процесс.
 * Не завершает процессы других проектов.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_PORT = 43127;
const PG_PORT = 55432;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listeningPids(port) {
  let out = "";
  try {
    out = execSync("netstat -ano -p tcp", {
      encoding: "utf8",
      windowsHide: true,
    });
  } catch {
    return [];
  }
  const pids = new Set();
  const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) pids.add(Number(m[1]));
  }
  return [...pids];
}

function commandLine(pid) {
  const safePid = Number(pid);
  if (!Number.isInteger(safePid) || safePid <= 0) return "";
  const tmp = path.join(os.tmpdir(), `neodin-cmd-${safePid}.txt`);
  const tmpPs = tmp.replace(/'/g, "''");
  const ps = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${safePid}"`,
    `if ($p -and $p.CommandLine) { [System.IO.File]::WriteAllText('${tmpPs}', [string]$p.CommandLine, [System.Text.UTF8Encoding]::new($false)) }`,
  ].join("; ");
  try {
    execSync(`powershell -NoProfile -NonInteractive -Command ${JSON.stringify(ps)}`, {
      timeout: 12_000,
      windowsHide: true,
      stdio: "ignore",
    });
    if (fs.existsSync(tmp)) {
      const cmd = fs.readFileSync(tmp, "utf8").trim();
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return cmd;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function isOurProject(cmd) {
  if (!cmd) return false;
  const n = cmd.replace(/\//g, "\\").toLowerCase();
  const root = ROOT.replace(/\//g, "\\").toLowerCase();
  if (n.includes(root)) return true;
  const folder = path.basename(ROOT).toLowerCase();
  if (n.includes(`${folder}\\node_modules\\next`)) return true;
  if (n.includes(`${folder}\\scripts\\start-local`)) return true;
  if (n.includes(`${folder}\\node_modules\\tsx`) && n.includes("start-local")) {
    return true;
  }
  return false;
}

function isOurServerCmd(cmd) {
  if (!isOurProject(cmd)) return false;
  const n = cmd.replace(/\//g, "\\").toLowerCase();
  return (
    n.includes("start-local") ||
    n.includes("start:local") ||
    n.includes("dev:local") ||
    n.includes("node_modules\\next") ||
    n.includes(`-p ${APP_PORT}`) ||
    n.includes(`:${APP_PORT}`)
  );
}

function listProcessRows() {
  const tmp = path.join(os.tmpdir(), `neodin-procs-${process.pid}.txt`);
  const tmpPs = tmp.replace(/'/g, "''");
  const ps = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$rows = @()",
    "Get-CimInstance Win32_Process | ForEach-Object { if ($_.CommandLine) { $rows += ('{0}`t{1}' -f $_.ProcessId, $_.CommandLine) } }",
    `[System.IO.File]::WriteAllLines('${tmpPs}', $rows, [System.Text.UTF8Encoding]::new($false))`,
  ].join("; ");
  try {
    execSync(`powershell -NoProfile -NonInteractive -Command ${JSON.stringify(ps)}`, {
      timeout: 20_000,
      windowsHide: true,
      stdio: "ignore",
    });
    if (!fs.existsSync(tmp)) return [];
    const text = fs.readFileSync(tmp, "utf8");
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return text
      .split(/\r?\n/)
      .map((line) => {
        const tab = line.indexOf("\t");
        if (tab <= 0) return null;
        const pid = Number(line.slice(0, tab));
        const cmd = line.slice(tab + 1);
        if (!Number.isInteger(pid) || pid <= 0) return null;
        return { pid, cmd };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tcpOpen(port, host = "127.0.0.1") {
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

function httpProbe(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
  });
}

function printOwners(pids) {
  for (const pid of pids) {
    const cmd = commandLine(pid);
    console.log(`PID=${pid}`);
    console.log(`OURS=${isOurProject(cmd) ? "1" : "0"}`);
    console.log(`CMD=${cmd || "(нет командной строки)"}`);
  }
}

function killPid(pid) {
  try {
    execSync(`taskkill /PID ${Number(pid)} /T /F`, {
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function status() {
  const pids = listeningPids(APP_PORT);
  const httpCode = await httpProbe();
  console.log(`HTTP=${httpCode}`);
  console.log(`PG=${(await tcpOpen(PG_PORT)) ? "1" : "0"}`);

  if (pids.length === 0) {
    const tcp = await tcpOpen(APP_PORT);
    if (!tcp && httpCode === 0) {
      console.log("RESULT=PORT_FREE");
      return 0;
    }
    const ours = listProcessRows().filter((row) => isOurServerCmd(row.cmd));
    if (httpCode > 0 && ours.length) {
      printOwners(ours.map((row) => row.pid));
      console.log("RESULT=SITE_OK");
      return 0;
    }
    console.log("RESULT=PORT_FOREIGN");
    return 0;
  }

  printOwners(pids);
  const ours = pids.filter((pid) => isOurProject(commandLine(pid)));
  const foreign = pids.filter((pid) => !isOurProject(commandLine(pid)));

  if (foreign.length && !ours.length) {
    console.log("RESULT=PORT_FOREIGN");
    return 0;
  }
  if (httpCode > 0 && ours.length) {
    console.log("RESULT=SITE_OK");
    return 0;
  }
  if (ours.length && httpCode === 0) {
    console.log("RESULT=SITE_HUNG");
    return 0;
  }
  if (foreign.length && ours.length) {
    console.log("RESULT=PORT_MIXED");
    return 0;
  }
  console.log("RESULT=PORT_FOREIGN");
  return 0;
}

async function waitHttp(seconds) {
  const deadline = Date.now() + seconds * 1000;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    const code = await httpProbe(2000);
    if (code > 0) {
      console.log(`HTTP=${code}`);
      console.log("RESULT=READY");
      return 0;
    }
    if (Date.now() - startedAt > 12_000) {
      const ours = listProcessRows().filter((row) => isOurServerCmd(row.cmd));
      const listening = listeningPids(APP_PORT);
      if (ours.length === 0 && listening.length === 0) {
        console.log("RESULT=SERVER_EXITED");
        return 1;
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log("RESULT=TIMEOUT");
  return 1;
}

function killOurs() {
  const skip = new Set();
  for (const pid of listeningPids(APP_PORT)) {
    const cmd = commandLine(pid);
    if (!isOurProject(cmd)) {
      console.log(`SKIP_FOREIGN=${pid}`);
      skip.add(pid);
    }
  }
  const targets = new Set();
  for (const pid of listeningPids(APP_PORT)) {
    if (!skip.has(pid)) targets.add(pid);
  }
  for (const row of listProcessRows()) {
    if (skip.has(row.pid)) continue;
    if (isOurServerCmd(row.cmd)) targets.add(row.pid);
  }
  let killed = 0;
  for (const pid of targets) {
    if (killPid(pid)) {
      console.log(`KILLED=${pid}`);
      killed += 1;
    }
  }
  console.log(`KILLED_COUNT=${killed}`);
  return 0;
}

const action = process.argv[2] ?? "status";
const extra = Number(process.argv[3] ?? 180);

const run = async () => {
  if (action === "status") return status();
  if (action === "wait") return waitHttp(Number.isFinite(extra) ? extra : 180);
  if (action === "kill-ours") return killOurs();
  console.error(`Unknown action: ${action}`);
  return 1;
};

run().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
