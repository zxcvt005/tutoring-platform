# Развёртывание в Timeweb Cloud

**Не создавать платные ресурсы и не публиковать приложение без явного разрешения владельца репозитория.**

## Что готово в коде

- PostgreSQL + Drizzle (миграции в `drizzle/`, включая `login_attempts`)
- Cookie-сессии (`tp_session`, httpOnly, Secure в production, SameSite=Lax)
- CSRF (double-submit `tp_csrf` + `x-csrf-token`) и проверка Origin
- Ограничение попыток входа (rate limit в БД)
- bcrypt (12 rounds), политика пароля ≥10 + буквы и цифры
- Демо-вход в обычном production **невозможен** (даже с `ALLOW_DEMO_LOGIN=1`)
- Открытый тестовый сайт: `ALLOW_OPEN_TEST_LOGIN=1` включает существующий демо-вход и переключатель аккаунтов **без** смены `NODE_ENV`
- Страницы `/login` и `/setup` (первый администратор по `BOOTSTRAP_ADMIN_TOKEN`)
- Дирекция → «Доступ»: создание/отключение пользователей организации
- CLI: `npm run auth:bootstrap-admin`

## Рекомендуемая схема Timeweb

1. **Managed PostgreSQL** (UTF-8).
2. **App / Node** — `npm ci` (или `npm install`) → `npm run build` → `npm start`.
3. HTTPS-домен → укажите его в `APP_BASE_URL`.

**Важно:** `@tailwindcss/postcss`, `tailwindcss` и `typescript` находятся в `dependencies`, чтобы сборка работала при `npm ci --omit=dev` / `NODE_ENV=production` во время install. Не удаляйте их из dependencies.

**Миграции:** `npm run db:migrate` вызывает `node scripts/db-migrate.mjs` и зависит только от `drizzle-orm` + `postgres` (уже в `dependencies`). Пакет `tsx` в production-контейнере отсутствует — это ожидаемо.

**DATABASE_URL:** логин и пароль в URL должны быть **percent-encoded** (`encodeURIComponent`). Символы `@ # / : ? %` и пробел в пароле без кодирования ломают разбор (Invalid URL). Пример пароля `p@ss#1` → `p%40ss%231` в строке URL. Скрипт миграции передаёт в postgres.js объект опций, не склеивая URL заново; секреты в логах не печатаются.

## Переменные окружения (production)

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `DATABASE_URL` | да | URL Postgres (SSL по требованиям Timeweb) |
| `NODE_ENV` | да | `production` |
| `APP_BASE_URL` | да | `https://zxcvt005-tutoring-platform-302f.twc1.net` (без path; scheme+host) |
| `BOOTSTRAP_ADMIN_TOKEN` | при первом запуске | ≥24 символа; **удалить после создания директора** |
| `ALLOW_DEMO_LOGIN` | нет | не задавать / `0` в обычном production |
| `ALLOW_OPEN_TEST_LOGIN` | для открытого теста | `1` на тестовом Timeweb. Задать **до сборки**. Снимает обязательный `/login` и включает `DEV · ТЕСТОВЫЕ АККАУНТЫ`. Не использовать на будущем закрытом production |
| `ALLOWED_ORIGINS` | нет | только если нужен **доп.** Origin; для текущего домена Timeweb **не нужен** |
| `NEXT_PUBLIC_DATA_MODE` | нет | `api` |
| `CHAT_STORAGE_DRIVER` | для чата | `s3` в production. Локальный диск контейнера не хранит вложения после деплоя. |
| `S3_ENDPOINT` | для чата | Например `https://s3.twcstorage.ru` |
| `S3_REGION` | для чата | Обычно `ru-1` |
| `S3_BUCKET` | для чата | Имя бакета Object Storage |
| `S3_ACCESS_KEY_ID` | для чата | Ключ доступа бакета |
| `S3_SECRET_ACCESS_KEY` | для чата | Секрет бакета |
| `S3_FORCE_PATH_STYLE` | нет | `1` (path-style, по умолчанию) |

Секреты только в панели Timeweb. Не коммитить `.env.local` / реальные токены.

## Object Storage (вложения чата и теории)

Диск контейнера App Platform не сохраняет файлы. Локальный драйвер (`uploads/`) для Timeweb не подходит, кроме аварийного `CHAT_STORAGE_ALLOW_LOCAL=1`.

В панели Timeweb Cloud:

1. «Object Storage» → создать бакет (регион `ru-1`).
2. Создать ключ доступа к бакету (Access Key + Secret).
3. В env приложения задать переменные из таблицы выше. Секрет ключа в чат и git не копировать.
4. Перед первым открытым тестом загрузить существующие вложения с ключами как в локальной БД (`chats/org_school_qa/...`).
5. После редеплоя: открыть чат → скачать старое фото → загрузить новое → перезапустить приложение → оба файла открываются.

Локально `CHAT_STORAGE_DRIVER` не задавать (или `local` / `auto`): без S3-переменных код пишет в `uploads/chat`.

**Не** запускайте `npm run db:seed` на публичном проде (демо-пароли).

## Чеклист первого деплоя (когда будет разрешение)

1. Создать Postgres → сохранить `DATABASE_URL`.
2. Создать приложение, задать env (включая длинный `BOOTSTRAP_ADMIN_TOKEN`).
3. One-off / SSH / release command в каталоге `/app`:
   ```bash
   npm run db:migrate
   ```
   Скрипт — `node scripts/db-migrate.mjs` (без `tsx`; `tsx` в production не ставится).
   Обычный `npm run db:seed` / `db:seed:school` на Timeweb **не** запускать.
   Повторный `db:migrate` безопасен (журнал Drizzle).

## Тестовое наполнение школы на БД Timeweb

Платформа в разработке, реальных пользователей нет. Для заполнения **только** организации `org_school_qa` (остальные org и таблицы не дропаются) есть отдельный сценарий. Он **не** меняет `NODE_ENV` и **не** ослабляет локальный `db:seed:school`.

Нужен деплой коммита с `scripts/db-seed-school-timeweb.ts` (иначе `MODULE_NOT_FOUND`). В консоли `/app`:

```bash
cd /app
test -f scripts/db-seed-school-timeweb.ts || { echo "Нужен редеплой с GitHub main"; exit 1; }
npm run db:migrate
ALLOW_TIMEWEB_TEST_SEED=1 TIMEWEB_TEST_SEED_ORG=org_school_qa npm run db:seed:school:timeweb
```

Успех: строка `Timeweb school seed OK`. Пересоздаётся только `org_school_qa`. Вход: `/login` (демо-вход в production выключен).

4. Открыть `https://…/setup` **или** CLI:
   ```bash
   npm run auth:bootstrap-admin -- --email you@school.example --password '…' --name 'Директор' --org 'Школа'
   ```
5. Удалить / сменить `BOOTSTRAP_ADMIN_TOKEN` в env и перезапустить app.
6. Войти на `/login`, в Дирекции → «Доступ» создать преподавателей и учеников.
7. Проверить: чужой assignment id → 403; демо `/api/auth/demo` → 403; кабинеты без cookie → редирект на login.

## Чего документ не делает

- Не создаёт инстансы Timeweb
- Не публикует приложение
- Не содержит реальных учётных данных
