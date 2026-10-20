# Tutoring platform: Дирекция / Кафедра / Аудитория

Платформа для онлайн-репетиторского бизнеса. Кабинеты работают через **PostgreSQL** и серверное API (не localStorage).

**Репозиторий:** [github.com/zxcvt005/tutoring-platform](https://github.com/zxcvt005/tutoring-platform)  
**Порт:** `43127`

## Быстрый старт

```bash
npm install
npm run db:up          # терминал 1 — PostgreSQL + migrate + seed
npm run dev:local      # терминал 2 — http://127.0.0.1:43127/
```

Подробно: [docs/local-run.md](docs/local-run.md). Timeweb (без автопубликации): [docs/timeweb-deploy.md](docs/timeweb-deploy.md).

| Кабинет | URL |
|---------|-----|
| Выбор | http://127.0.0.1:43127/ |
| Дирекция | http://127.0.0.1:43127/direkciya |
| Кафедра | http://127.0.0.1:43127/kafedra |
| Аудитория | http://127.0.0.1:43127/auditoria |

Демо-вход включается при открытии кабинета (`ALLOW_DEMO_LOGIN=1` в `.env.local`).

## Стек

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Drizzle · PostgreSQL

## Документация

- [docs/local-run.md](docs/local-run.md) — локальный запуск
- [docs/database.md](docs/database.md) — схема БД
- [docs/api.md](docs/api.md) — API
- [docs/timeweb-deploy.md](docs/timeweb-deploy.md) — подготовка к Timeweb

## Проверки

```bash
npm run lint
npm run build
npm test
npm run db:verify
npm run db:verify:pg
```

## Сброс демо

```bash
npm run db:seed
```
