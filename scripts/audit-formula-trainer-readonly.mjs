/**
 * Только чтение локальной статистики тренажёра.
 * Не выполняет UPDATE, DELETE и миграции.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import {
  parseDatabaseUrl,
  sanitizeDbError,
  toPostgresOptions,
} from "./lib/database-url.mjs";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const parsed = parseDatabaseUrl(url);
const host = parsed.hostname ?? parsed.host ?? "";
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error("Отказ: аудит разрешён только для локальной базы");
  process.exit(1);
}

const sql = postgres(toPostgresOptions(parsed, { max: 1 }));

function trailingStreak(flags) {
  let streak = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (!flags[i]) break;
    streak += 1;
  }
  return streak;
}

try {
const summary = await sql`
  select
    count(*)::int as rows,
    coalesce(sum(attempts), 0)::int as attempts,
    coalesce(sum(correct_count), 0)::int as correct_count,
    coalesce(sum(wrong_count), 0)::int as wrong_count,
    count(*) filter (where status = 'mastered')::int as mastered,
    count(*) filter (where status = 'mastered' and streak < 3)::int as mastered_short_streak,
    count(*) filter (where attempts <> correct_count + wrong_count)::int as attempt_mismatch
  from formula_trainer_progress
`;

const questions = await sql`
  select count(*)::int as rows,
         count(*) filter (where answered_at is not null)::int as answered
  from formula_trainer_questions
`;

const answers = await sql`
  select student_id, formula_id, is_correct
  from formula_trainer_questions
  where answered_at is not null
  order by student_id, formula_id, answered_at, created_at
`;

const progress = await sql`
  select student_id, formula_id, attempts, correct_count, wrong_count, streak, status
  from formula_trainer_progress
`;

const byFormula = new Map();
for (const row of answers) {
  const key = `${row.student_id}:${row.formula_id}`;
  const list = byFormula.get(key) ?? [];
  list.push(Boolean(row.is_correct));
  byFormula.set(key, list);
}

let comparable = 0;
let streakMatches = 0;
let incompleteHistory = 0;
let streakDiffers = 0;
for (const row of progress) {
  const key = `${row.student_id}:${row.formula_id}`;
  const flags = byFormula.get(key) ?? [];
  if (flags.length !== row.attempts) {
    incompleteHistory += 1;
    continue;
  }
  comparable += 1;
  if (trailingStreak(flags) === row.streak) streakMatches += 1;
  else streakDiffers += 1;
}

console.log(
  JSON.stringify(
    {
      host,
      database: parsed.database ?? parsed.pathname?.replace(/^\//, "") ?? "",
      progress: summary[0],
      questions: questions[0],
      history: {
        comparable,
        streakMatches,
        streakDiffers,
        incompleteHistory,
        progressWithoutQuestionLog: progress.filter((row) => {
          const flags = byFormula.get(`${row.student_id}:${row.formula_id}`) ?? [];
          return flags.length !== row.attempts;
        }).length,
      },
    },
    null,
    2
  )
);

await sql.end();
} catch (err) {
  try {
    await sql.end({ timeout: 1 });
  } catch {
    // соединение уже закрыто
  }
  console.error(sanitizeDbError(err).message);
  process.exit(1);
}
