import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  TIMEWEB_NODE_CA_BUNDLE,
  buildNextProcessEnv,
  inspectCaBundleFile,
  resolveNodeExtraCaCerts,
} from "../../scripts/lib/russian-trusted-ca.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function projectValidBundle(): string {
  const file = path.join(repoRoot, "certs/russian-trusted-ca-bundle.crt");
  if (!fs.existsSync(file)) {
    throw new Error(
      "Нужен локальный certs/russian-trusted-ca-bundle.crt (npm run certs:russian-trusted)"
    );
  }
  return file;
}

function writeValidBundleCopy(dir: string, name: string): string {
  const dest = path.join(dir, name);
  fs.copyFileSync(projectValidBundle(), dest);
  return dest;
}

describe("inspectCaBundleFile", () => {
  it("rejects missing, empty and garbage files", () => {
    const dir = makeTempDir("ca-inspect-");
    const missing = path.join(dir, "missing.crt");
    const empty = path.join(dir, "empty.crt");
    const garbage = path.join(dir, "garbage.crt");
    fs.writeFileSync(empty, "");
    fs.writeFileSync(garbage, "NOT A CERT\n");

    expect(inspectCaBundleFile(missing).ok).toBe(false);
    expect(inspectCaBundleFile(empty).ok).toBe(false);
    expect(inspectCaBundleFile(garbage).ok).toBe(false);
  });

  it("accepts a readable PEM bundle with parseable X509 certs", () => {
    const inspected = inspectCaBundleFile(projectValidBundle());
    expect(inspected.ok).toBe(true);
    if (inspected.ok) {
      expect(inspected.certCount).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("resolveNodeExtraCaCerts", () => {
  it("1. keeps a valid NODE_EXTRA_CA_CERTS unchanged", async () => {
    const dir = makeTempDir("ca-env-valid-");
    const envBundle = writeValidBundleCopy(dir, "from-env.crt");
    const logs: string[] = [];

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: { NODE_EXTRA_CA_CERTS: envBundle },
      timewebPath: path.join(dir, "no-timeweb.crt"),
      ensureLocal: async () => {
        throw new Error("ensureLocal must not run when env is valid");
      },
      log: (msg) => logs.push(String(msg)),
    });

    expect(selection.source).toBe("env");
    expect(selection.path).toBe(path.resolve(envBundle));
    expect(selection.certCount).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.includes("source=env"))).toBe(true);
  });

  it("2. invalid NODE_EXTRA_CA_CERTS falls through to valid Timeweb bundle", async () => {
    const dir = makeTempDir("ca-env-invalid-");
    const badEnv = path.join(dir, "bad-env.crt");
    const timeweb = writeValidBundleCopy(dir, "tci_node_ca_bundle.crt");
    fs.writeFileSync(badEnv, "CORRUPT");

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: { NODE_EXTRA_CA_CERTS: badEnv },
      timewebPath: timeweb,
      ensureLocal: async () => {
        throw new Error("ensureLocal must not run when Timeweb is valid");
      },
      log: () => {},
    });

    expect(selection.source).toBe("timeweb");
    expect(selection.path).toBe(path.resolve(timeweb));
  });

  it("3. missing env uses Timeweb bundle when present", async () => {
    const dir = makeTempDir("ca-timeweb-");
    const timeweb = writeValidBundleCopy(dir, "tci_node_ca_bundle.crt");

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: {},
      timewebPath: timeweb,
      ensureLocal: async () => {
        throw new Error("ensureLocal must not run when Timeweb is valid");
      },
      log: () => {},
    });

    expect(selection.source).toBe("timeweb");
    expect(selection.path).toBe(path.resolve(timeweb));
  });

  it("4. Timeweb unavailable uses local fallback", async () => {
    const dir = makeTempDir("ca-local-");
    const local = writeValidBundleCopy(dir, "russian-trusted-ca-bundle.crt");

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: {},
      timewebPath: path.join(dir, "missing-timeweb.crt"),
      ensureLocal: async () => local,
      log: () => {},
    });

    expect(selection.source).toBe("local-fallback");
    expect(selection.path).toBe(path.resolve(local));
  });

  it("5. all sources unavailable fails the start resolution", async () => {
    const dir = makeTempDir("ca-none-");

    await expect(
      resolveNodeExtraCaCerts({
        cwd: dir,
        env: { NODE_EXTRA_CA_CERTS: path.join(dir, "missing.crt") },
        timewebPath: path.join(dir, "missing-timeweb.crt"),
        ensureLocal: async () => {
          throw new Error("download blocked");
        },
        log: () => {},
      })
    ).rejects.toThrow(/Нет валидного CA-бандла/);
  });

  it("6. invalid file is never selected when a valid alternative exists", async () => {
    const dir = makeTempDir("ca-skip-invalid-");
    const invalid = path.join(dir, "invalid.crt");
    const valid = writeValidBundleCopy(dir, "valid.crt");
    fs.writeFileSync(
      invalid,
      "-----BEGIN CERTIFICATE-----\nnot-real\n-----END CERTIFICATE-----\n"
    );

    expect(inspectCaBundleFile(invalid).ok).toBe(false);

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: { NODE_EXTRA_CA_CERTS: invalid },
      timewebPath: valid,
      ensureLocal: async () => {
        throw new Error("should use Timeweb");
      },
      log: () => {},
    });

    expect(selection.path).toBe(path.resolve(valid));
    expect(selection.source).toBe("timeweb");
  });

  it("7. selected path is passed to the child process env before Node starts", async () => {
    const dir = makeTempDir("ca-child-");
    const timeweb = writeValidBundleCopy(dir, "tci_node_ca_bundle.crt");

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: {
        NODE_EXTRA_CA_CERTS: path.join(dir, "should-not-win.crt"),
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        KEEP_ME: "1",
      },
      timewebPath: timeweb,
      ensureLocal: async () => {
        throw new Error("no local");
      },
      log: () => {},
    });

    const childEnv = buildNextProcessEnv(
      {
        NODE_EXTRA_CA_CERTS: "stale",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        KEEP_ME: "1",
      },
      selection.path
    );

    expect(childEnv.NODE_EXTRA_CA_CERTS).toBe(selection.path);
    expect(childEnv.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(childEnv.KEEP_ME).toBe("1");

    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify({ca:process.env.NODE_EXTRA_CA_CERTS||null,reject:process.env.NODE_TLS_REJECT_UNAUTHORIZED??null}))",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, ...childEnv } as NodeJS.ProcessEnv,
      }
    );

    expect(probe.status).toBe(0);
    const seen = JSON.parse(probe.stdout) as {
      ca: string | null;
      reject: string | null;
    };
    expect(seen.ca).toBe(selection.path);
    expect(seen.reject).toBeNull();
  });
});

describe("Production Timeweb priority", () => {
  it("prefers Timeweb path over local when env is unset", async () => {
    expect(TIMEWEB_NODE_CA_BUNDLE).toBe(
      "/usr/local/share/tci_node_ca_bundle.crt"
    );

    const dir = makeTempDir("ca-prod-sim-");
    const timeweb = writeValidBundleCopy(dir, "tci_node_ca_bundle.crt");
    const local = writeValidBundleCopy(dir, "russian-trusted-ca-bundle.crt");

    const selection = await resolveNodeExtraCaCerts({
      cwd: dir,
      env: {},
      timewebPath: timeweb,
      ensureLocal: async () => local,
      log: () => {},
    });

    expect(selection.source).toBe("timeweb");
    expect(selection.path).toBe(path.resolve(timeweb));
  });
});
