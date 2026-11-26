/**
 * Диагностика runtime Точка Банк (Timeweb / локаль).
 *
 * По умолчанию — только безопасная проверка (без создания платежа):
 *   npm run diagnose:tochka
 *   node scripts/diagnose-tochka-runtime.mjs
 *
 * Создание реального платежа в API — только с явным флагом:
 *   npm run diagnose:tochka -- --create-payment
 *   node scripts/diagnose-tochka-runtime.mjs --create-payment
 *
 * Не печатает JWT, полные URL оплаты, customerCode/merchantId, PII.
 */
import fs from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";

const TIMEWEB = "/usr/local/share/tci_node_ca_bundle.crt";
const CREATE_PAYMENT_FLAG = "--create-payment";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function causeOf(err) {
  return err instanceof Error && err.cause instanceof Error ? err.cause : err;
}

function errFields(err) {
  const cause = causeOf(err);
  return {
    code:
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "",
    message:
      cause instanceof Error
        ? cause.message.slice(0, 200)
        : String(cause).slice(0, 200),
  };
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  return {
    createPayment: flags.has(CREATE_PAYMENT_FLAG),
    help: flags.has("--help") || flags.has("-h"),
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/diagnose-tochka-runtime.mjs              # safe: CA, TLS, API reachability
  node scripts/diagnose-tochka-runtime.mjs --create-payment
      # WARNING: creates a real 1 RUB SBP payment link in the configured Tochka API

Safe mode never calls POST /acquiring/v1.0/payments.
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env.local"));
loadEnvFile(path.join(cwd, ".env"));

const caPath = process.env.NODE_EXTRA_CA_CERTS?.trim() || "";
let caInfo = { path: caPath || null, exists: false, certCount: 0, subjects: [] };
if (caPath && fs.existsSync(caPath)) {
  const text = fs.readFileSync(caPath, "utf8");
  const blocks = text
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .map((p) => p.trim())
    .filter((p) => p.includes("-----BEGIN CERTIFICATE-----"));
  const subjects = [];
  for (const block of blocks) {
    try {
      const cert = new X509Certificate(block);
      subjects.push(cert.subject.slice(0, 120));
    } catch {
      /* skip */
    }
  }
  caInfo = {
    path: path.resolve(caPath),
    exists: true,
    certCount: subjects.length,
    subjects: subjects.slice(0, 6),
  };
}

const isTimewebPath =
  caInfo.path === TIMEWEB || caInfo.path?.replace(/\\/g, "/") === TIMEWEB;

const jwt = process.env.TOCHKA_JWT?.trim() || "";
const customerCode = process.env.TOCHKA_CUSTOMER_CODE?.trim() || "";
const merchantId = process.env.TOCHKA_MERCHANT_ID?.trim() || "";
const sandbox = process.env.TOCHKA_SANDBOX === "1";
const apiBase = (
  process.env.TOCHKA_API_BASE?.trim() ||
  (sandbox
    ? "https://enter.tochka.com/sandbox/v2"
    : "https://enter.tochka.com/uapi")
).replace(/\/$/, "");
const appBase = (process.env.APP_BASE_URL || "").trim();

console.log(
  JSON.stringify({
    stage: "process",
    mode: args.createPayment ? "create-payment" : "safe",
    node: process.version,
    pid: process.pid,
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    ca: {
      ...caInfo,
      looksLikeTimeweb: isTimewebPath,
      timewebExists: fs.existsSync(TIMEWEB),
    },
    tochkaEnv: {
      hasJwt: Boolean(jwt),
      customerCodeLen: customerCode.length,
      merchantIdLen: merchantId.length,
      customerCodeLenOk: customerCode.length === 9,
      merchantIdLenOk: merchantId.length === 15,
      sandbox,
      apiBaseHost: (() => {
        try {
          return new URL(apiBase).host;
        } catch {
          return "invalid";
        }
      })(),
      appBaseHost: (() => {
        try {
          return new URL(appBase).host;
        } catch {
          return appBase ? "invalid" : null;
        }
      })(),
    },
  })
);

// --- Safe: TLS test endpoint (no payment) ---
try {
  const res = await fetch("https://tls-test.tochka.com/api");
  console.log(
    JSON.stringify({
      stage: "tls-test",
      status: res.status,
      body: (await res.text()).slice(0, 80),
    })
  );
} catch (err) {
  console.log(JSON.stringify({ stage: "tls-test", ok: false, ...errFields(err) }));
  process.exitCode = 1;
}

// --- Safe: TLS + reachability to API host (no auth body, no payment) ---
try {
  const res = await fetch(apiBase, { method: "GET", redirect: "manual" });
  console.log(
    JSON.stringify({
      stage: "api-host",
      ok: true,
      host: new URL(apiBase).host,
      httpStatus: res.status,
      note: "TLS to API base succeeded; status may be 401/404 without auth — that is OK",
    })
  );
} catch (err) {
  console.log(
    JSON.stringify({
      stage: "api-host",
      ok: false,
      host: (() => {
        try {
          return new URL(apiBase).host;
        } catch {
          return null;
        }
      })(),
      ...errFields(err),
    })
  );
  process.exitCode = 1;
}

// --- Safe: authenticated read-only retailers (no payment created) ---
if (jwt && customerCode.length === 9) {
  try {
    const url = `${apiBase}/acquiring/v1.0/retailers?customerCode=${encodeURIComponent(customerCode)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
    });
    const json = await res.json().catch(() => ({}));
    const list =
      json?.Data?.Retailer ||
      json?.Data?.retailer ||
      (Array.isArray(json?.Data) ? json.Data : null);
    const rows = Array.isArray(list) ? list : list ? [list] : [];
    console.log(
      JSON.stringify({
        stage: "api-auth-read",
        ok: res.ok,
        httpStatus: res.status,
        retailerCount: rows.length,
        summary: rows.slice(0, 5).map((r) => ({
          merchantIdLen:
            typeof r?.merchantId === "string" ? r.merchantId.length : null,
          status: r?.status,
          isActive: r?.isActive,
          hasSbp: Array.isArray(r?.paymentModes)
            ? r.paymentModes.includes("sbp")
            : null,
        })),
        note: "GET retailers only — no payment created",
      })
    );
    if (!res.ok) process.exitCode = process.exitCode || 2;
  } catch (err) {
    console.log(
      JSON.stringify({
        stage: "api-auth-read",
        ok: false,
        ...errFields(err),
      })
    );
    process.exitCode = process.exitCode || 3;
  }
} else {
  console.log(
    JSON.stringify({
      stage: "api-auth-read",
      skipped: true,
      reason: "JWT or customerCode (len=9) missing — skipped read-only API check",
    })
  );
}

if (!args.createPayment) {
  console.log(
    JSON.stringify({
      stage: "create_payment",
      skipped: true,
      reason: `Safe mode. To create a real test payment, pass ${CREATE_PAYMENT_FLAG}`,
      wouldCreate: {
        amountRub: 1,
        purpose: "Диагностика runtime Неодин",
        paymentMode: ["sbp"],
        ttlMinutes: 30,
        createsBankPaymentLink: true,
        createsLocalDbRecords: false,
      },
    })
  );
  process.exit(process.exitCode ?? 0);
}

// --- Explicit: create real payment (bank-side only; no local DB writes) ---
if (!jwt || !customerCode || !merchantId) {
  console.log(
    JSON.stringify({
      stage: "create_payment",
      ok: false,
      reason: "TOCHKA_JWT / CUSTOMER_CODE / MERCHANT_ID not set",
    })
  );
  process.exit(2);
}
if (customerCode.length !== 9 || merchantId.length !== 15) {
  console.log(
    JSON.stringify({
      stage: "create_payment",
      ok: false,
      reason: "OpenAPI length mismatch",
      customerCodeLen: customerCode.length,
      merchantIdLen: merchantId.length,
    })
  );
  process.exit(2);
}

const redirectBase = appBase.replace(/\/$/, "") || "http://127.0.0.1:3000";
console.log(
  JSON.stringify({
    stage: "create_payment",
    warning:
      "Creating a REAL payment operation in Tochka API (1 RUB, SBP). No local DB rows.",
    amountRub: 1,
    purpose: "Диагностика runtime Неодин",
    ttlMinutes: 30,
  })
);

try {
  const res = await fetch(`${apiBase}/acquiring/v1.0/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Data: {
        customerCode,
        amount: 1,
        purpose: "Диагностика runtime Неодин",
        paymentMode: ["sbp"],
        paymentLinkId: `diag_${Date.now().toString(36)}`.slice(0, 45),
        merchantId,
        redirectUrl: `${redirectBase}/auditoria/pay/complete`,
        failRedirectUrl: `${redirectBase}/auditoria/pay/checkout`,
        ttl: 30,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = Array.isArray(json.Errors) ? json.Errors[0] : null;
    console.log(
      JSON.stringify({
        stage: "create_payment",
        ok: false,
        httpStatus: res.status,
        category:
          typeof json.message === "string" ? json.message.slice(0, 200) : "",
        errorCode: first?.errorCode,
        errorMessage:
          typeof first?.message === "string"
            ? first.message.slice(0, 240)
            : undefined,
      })
    );
    process.exitCode = 2;
  } else {
    const link = json?.Data?.paymentLink;
    let host = "";
    let openStatus = null;
    if (typeof link === "string" && link) {
      try {
        host = new URL(link).host;
        const open = await fetch(link, { redirect: "manual" });
        openStatus = open.status;
      } catch (err) {
        openStatus = -1;
        console.log(
          JSON.stringify({
            stage: "open_payment_link",
            ok: false,
            ...errFields(err),
          })
        );
      }
    }
    console.log(
      JSON.stringify({
        stage: "create_payment",
        ok: true,
        httpStatus: res.status,
        hasOperationId: Boolean(json?.Data?.operationId),
        paymentLinkHost: host,
        paymentLinkOpenStatus: openStatus,
        localDbRecords: false,
      })
    );
  }
} catch (err) {
  console.log(
    JSON.stringify({
      stage: "create_payment",
      ok: false,
      transport: true,
      ...errFields(err),
    })
  );
  process.exitCode = 3;
}
