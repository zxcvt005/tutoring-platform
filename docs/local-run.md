# Локальный запуск (PostgreSQL + кабинеты)

Кабинеты работают через серверное API и PostgreSQL. localStorage больше не является источником данных UI.

## Требования

- Node.js 18+
- npm

Docker **не обязателен**: `npm run db:up` поднимает embedded PostgreSQL в `C:\tutoring-pg-data`.

## Быстрый старт (Windows)

**Терминал 1 — база:**

```bash
npm install
npm run db:up
```

Скрипт:

1. Создаёт/переиспользует кластер PostgreSQL
2. Пишет `.env.local` (`DATABASE_URL`, `ALLOW_DEMO_LOGIN=1`)
3. Применяет миграции и демо-seed
4. Держит процесс живым (Ctrl+C — остановка БД)

**Терминал 2 — приложение:**

```bash
npm run dev:local
```

Откройте http://127.0.0.1:43127/

| Кабинет | URL |
|---------|-----|
| Выбор | http://127.0.0.1:43127/ |
| Дирекция | http://127.0.0.1:43127/direkciya |
| Кафедра | http://127.0.0.1:43127/kafedra |
| Аудитория | http://127.0.0.1:43127/auditoria |

Демо-вход в development при `ALLOW_DEMO_LOGIN=1` (по умолчанию в dev). В **production демо-вход невозможен**.

Production-вход: http://127.0.0.1:43127/login  
Первый администратор (пустая БД): http://127.0.0.1:43127/setup + `BOOTSTRAP_ADMIN_TOKEN` в `.env.local`.

Пароль seed-пользователей: `DEMO_PASSWORD` в `src/server/db/seed.ts` (только разработка).

## Свой PostgreSQL / Docker

```bash
docker run --name tutoring-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tutoring_platform -p 5432:5432 -d postgres:16
```

Скопируйте `.env.example` → `.env.local`, поправьте `DATABASE_URL`, затем:

```bash
npm run db:migrate
npm run db:seed
npm run dev:local
```

## Сброс демо-данных

```bash
npm run db:seed
```

Затем обновите страницу в браузере. Кнопка «Сбросить демо» в сайдбаре только напоминает об этой команде.

## Реалистичный QA-набор «школа Умба»

Отдельная организация `org_school_qa` (1 директор, 3 преподавателя, 20 учеников, регулярные расписания, тарифы). **Не затирает** `org_demo`.

Только локальная БД. Скрипт откажется при `NODE_ENV=production`, без `ALLOW_TEST_SEED=1`, при хосте не-localhost или при hostname вроде Timeweb.

Для тестовой БД Timeweb (без подмены `NODE_ENV`) см. отдельный сценарий в [timeweb-deploy.md](timeweb-deploy.md): `npm run db:seed:school:timeweb`.

PowerShell:

```powershell
$env:ALLOW_TEST_SEED="1"
npm run db:seed:school
```

Учётные записи (пароль как у demo-seed, см. `DEMO_PASSWORD` / `SCHOOL_PASSWORD` в коде):

| Роль | Email |
|------|-------|
| Директор | director@umba-school.test |
| Преподаватель | morozova@umba-school.test |
| Ученик | student01@umba-school.test |

Перед запуском: миграции применены (`npm run db:migrate`), в т.ч. `0005_lesson_schedules`.

## Проверки

```bash
npm run lint
npm run build
npm test
npm run db:verify
npm run db:verify:pg
```

## Важно для Windows

Если путь пользователя содержит кириллицу, data dir кластера — ASCII-путь (`C:\tutoring-pg-data`). Encoding кластера может быть WIN1251; seed нормализует проблемные символы. Прод / Timeweb — только UTF-8.
