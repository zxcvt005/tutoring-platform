# Server API

Кабинеты ходят в API через `DemoStore` → `/api/bootstrap` + `/api/platform` (+ auth).  
Прямые маршруты assignments/tests остаются для точечных сценариев и DataProvider.

## Auth

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | email+password → httpOnly cookie `tp_session` |
| POST | `/api/auth/logout` | отзыв сессии + очистка cookie |
| GET | `/api/auth/me` | текущий user, role, teacherId/studentId |
| POST | `/api/auth/demo` | демо-вход по роли (только `ALLOW_DEMO_LOGIN=1` / non-production) |

Сессия: сырой токен в cookie, в БД — sha256; TTL 14 дней.

Демо-пароль seed: `DEMO_PASSWORD` в `src/server/db/seed.ts` (только разработка).

## Bootstrap / platform

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/bootstrap` | снимок `DemoData` для текущего пользователя (RBAC-фильтр) |
| POST | `/api/platform` | мутации кабинетов: `{ action, payload }`, см. ниже |

Действия `/api/platform`:  
`upsertTeacher`, `deleteTeacher`, `upsertStudent`, `deleteStudent`,  
`upsertLesson`, `deleteLesson`, `completeLesson`, `setAttendance`,  
`upsertTopicSection`, `deleteTopicSection`, `reorderTopicSections`,  
`upsertTopic`, `deleteTopic`, `moveTopic`, `reorderTopics`,  
`upsertHomework`, `deleteHomework`, `publishHomework`, `assignHomework`,  
`deleteHomeworkAssignment`, `saveHomeworkDraft`, `submitHomeworkAssignment`,  
`reviewHomeworkAssignment`.

Идемпотентность (`Idempotency-Key`): submit / review / assign / completeLesson.

## Assignments / tests

| Метод | Путь | Кто |
|-------|------|-----|
| GET | `/api/assignments/:id` | владелец-ученик / свой teacher / director |
| POST | `/api/assignments/:id/draft` | student-owner |
| POST | `/api/assignments/:id/submit` | student-owner; `Idempotency-Key` |
| POST | `/api/assignments/:id/review` | teacher-owner; `Idempotency-Key` |
| GET | `/api/tests/:id` | student: public questions; teacher/director: + keys |

Ключи ответов ученику не отдаются до статуса `reviewed`.

## Ошибки

```json
{ "error": { "code": "forbidden", "message": "...", "details": {} } }
```

## DataProvider

`src/lib/data` — `api` (по умолчанию) | `local` (legacy). Кабинеты используют API-backed `DemoStore`.
