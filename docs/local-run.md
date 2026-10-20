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

Демо-вход включается автоматически при смене кабинета (`ALLOW_DEMO_LOGIN=1`). Пароль seed-пользователей: см. `DEMO_PASSWORD` в `src/server/db/seed.ts` (только для разработки).

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
