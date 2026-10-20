# База данных

PostgreSQL + Drizzle ORM. Кабинеты читают/пишут через серверное API (`/api/bootstrap`, `/api/platform`, …).

См. [local-run.md](local-run.md), [api.md](api.md), ADR-001.

## Требования

- Node.js 18+
- Для `db:migrate` / `db:seed`: PostgreSQL 14+ и `DATABASE_URL` (см. `.env.example`)
- Для `db:verify:pg` без Docker: пакет `embedded-postgres` (уже в devDependencies) — поднимает временный кластер PostgreSQL
- **Продовый / Timeweb кластер должен быть UTF-8.** На Windows embedded часто получается `WIN1251`; seed автоматически включает `win1251Safe` (нормализация ², Δ, π и т.п.). DemoStore / UI это не затрагивает.

## Быстрый старт (Docker)

```bash
docker run --name tutoring-pg ^
  -e POSTGRES_PASSWORD=postgres ^
  -e POSTGRES_DB=tutoring_platform ^
  -p 5432:5432 -d postgres:16
```

Скопируйте `.env.example` → `.env.local` и при необходимости поправьте URL.

## Команды

| Команда | Назначение |
|---------|------------|
| `npm run db:generate` | Сгенерировать SQL-миграцию из `src/server/db/schema.ts` |
| `npm run db:migrate` | Применить миграции к БД из `DATABASE_URL` |
| `npm run db:seed` | Залить демо-организацию `org_demo` (другие org не трогает) |
| `npm run db:verify` | Проверка migrate→migrate→seed на **PGlite** (без внешнего PG) |

```bash
npm run db:migrate
npm run db:seed
```

Повторный `db:migrate` безопасен (журнал Drizzle). Повторный `db:seed` пересоздаёт только `org_demo` и связанных demo-пользователей.

## Структура

- `src/server/db/schema.ts` — схема таблиц
- `src/server/db/seed.ts` — seed демо-школы из `createSeedData()`
- `src/server/db/question-split.ts` — отделение ключей ответов от публичных вопросов
- `drizzle/*.sql` — SQL-миграции в репозитории
- `scripts/db-*.ts` — CLI

## Правила удаления (кратко)

- Удаление `organizations` — CASCADE на большинство org-scoped данных
- `tests` / `topics` при назначениях — RESTRICT (сначала архивировать / разобрать assignments)
- Снимки и ответы назначения — CASCADE с `test_assignments`
- `grade_events` — CASCADE с assignment; `audit_log` сохраняет ссылки как SET NULL где уместно

## Проверка схемы

| Команда | Что проверяет |
|---------|----------------|
| `npm run db:verify` | PGlite (быстро, без установки PG) |
| `npm run db:verify:pg` | **Настоящий PostgreSQL** через embedded-postgres (миграции, повтор migrate/seed, FK/CHECK, разделение ключей ответов) |
| `npm test` | Auth/RBAC/ключи/идемпотентность на PGlite |

Серверный API (этап 3): `/api/auth/*`, `/api/assignments/*`, `/api/tests/*`. UI пока на DemoStore.

Docker на машине разработки **не обязателен** для `db:verify:pg`. Если уже есть свой PG:

```bash
# .env.local с DATABASE_URL
npm run db:migrate
npm run db:seed
# или полный прогон:
npm run db:verify:pg
```

Опционально Docker (на этой машине разработки может быть не установлен):

```bash
docker run --name tutoring-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tutoring_platform -p 5432:5432 -d postgres:16
```

Принудительно embedded вместо `DATABASE_URL`: `USE_EMBEDDED_PG=1 npm run db:verify:pg`.

Каталог данных embedded по умолчанию: `C:\tutoring-pg-tmp` (ASCII-путь; кириллица в `Users\…` ломает initdb). Переопределение: `EMBEDDED_PG_DIR`.
