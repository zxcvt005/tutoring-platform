# Прототип: Дирекция / Кафедра / Аудитория

Локальный прототип платформы для онлайн-репетиторского бизнеса.

**Один Next.js-приложение · один порт `43127` · три кабинета.** Hot reload — штатный `next dev`.

## Кабинеты

| Кабинет | URL |
|---------|-----|
| Выбор | http://127.0.0.1:43127/ |
| Дирекция | http://127.0.0.1:43127/direkciya |
| Кафедра | http://127.0.0.1:43127/kafedra |
| Аудитория | http://127.0.0.1:43127/auditoria |

Данные общие (DemoStore / localStorage v4). Без БД, auth и видеозвонков.

## Стек

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · npm

## GitHub

- Репозиторий: https://github.com/zxcvt005/tutoring-platform  
- Рабочая ветка: **`main`** (Дирекция + Кафедра + Аудитория + Windows-скрипты)  
- Подробная инструкция: Project Context → [local-windows-setup](/cursor/stores/self/docs/local-windows-setup.md)

## На вашем Windows

1. Node.js LTS (18+) с [nodejs.org](https://nodejs.org/).
2. Cursor Desktop → Clone → `https://github.com/zxcvt005/tutoring-platform` → Open Folder (ветка **`main`**).
3. Двойной щелчок **`start.bat`** (или `.\start.ps1`).  
   Проверит Node и порт, при необходимости сделает `npm install`, поднимет сервер и попробует открыть браузер.
4. Правите код → смотрите `:43127` → `tools\windows\save-my-work.bat` → `tools\windows\send-to-github.bat`.

Остановка: `Ctrl+C` в окне `start.bat`.

### Вспомогательные bat (безопасно)

| Скрипт | Действие |
|--------|----------|
| `tools\windows\use-latest-branch.bat` | checkout **`main`** + pull (отказ при грязном дереве) |
| `tools\windows\get-updates.bat` | `git pull` без force |
| `tools\windows\save-my-work.bat` | commit локально, **без** push |
| `tools\windows\send-to-github.bat` | обычный `git push` без `--force` |

## Запуск вручную (любая ОС)

```bash
npm install
npm run dev:local
```

`dev:local` = `next dev -H 0.0.0.0 -p 43127`.

## Демо ДЗ

Кафедра назначает / уже в seed → Аудитория сдаёт → Кафедра проверяет → Аудитория видит балл. «Сбросить демо» в сайдбаре.

## Проверки

```bash
npm run lint
npm run build
```
