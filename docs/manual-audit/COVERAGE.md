# Сверка полноты инвентаризации

Проверка, что страницы, навигация, API, сервисы и тесты попали в документы. Это сверка по коду, не прогон UI.

## Страницы (`page.tsx`) → SITE_MAP + MANUAL_TEST_PLAN

| Путь | Документ | Пункт чек-листа |
|---|---|---|
| `/` | SITE_MAP публичные | MT-001 |
| `/login` | SITE_MAP | MT-005, MT-006 |
| `/setup` | SITE_MAP | MT-004 |
| `/register/teacher` | SITE_MAP | MT-002 |
| `/register/student` | SITE_MAP | MT-003 |
| `/direkciya` | SITE_MAP §3 | MT-010, MT-020 |
| `/direkciya/students` | §3 | MT-021–029 |
| `/direkciya/students/[id]` | §3 | MT-025 |
| `/direkciya/teachers` | §3 | MT-030–032 |
| `/direkciya/teachers/[id]` | §3 | MT-030 |
| `/direkciya/salaries` | §3 | MT-033–034 |
| `/direkciya/knowledge` | §3 | MT-035–036 |
| `/direkciya/knowledge/theory/new` | §3 | MT-035 |
| `/direkciya/knowledge/theory/[id]` | §3 | MT-035 |
| `/direkciya/tariffs` | §3 | MT-037–038 |
| `/direkciya/payments` | §3 | MT-039–040 |
| `/direkciya/users` | §3 | MT-041–042, MT-160 |
| `/direkciya/schedule` | §3 | MT-043–046 |
| `/direkciya/results` | §3 | MT-047 |
| `/kafedra` | §4 | MT-060–063 |
| `/kafedra/students` | §4 | MT-064–065 |
| `/kafedra/students/[id]` | §4 | MT-064 |
| `/kafedra/schedule` | §4 | MT-066 |
| `/kafedra/topics` | §4 | MT-067 |
| `/kafedra/topics/[id]` | §4 | MT-067 |
| `/kafedra/theory` + new + `[id]` + results | §4 | MT-068–069 |
| `/kafedra/tests` | §4 | MT-070–071 |
| `/kafedra/grades` | §4 | MT-072 |
| `/kafedra/feedback` + `[studentId]` | §4 | MT-073–077 |
| `/kafedra/profile` | §4 | MT-078–079 |
| `/kafedra/results` редирект | SITE_MAP §7 | MT-190 |
| `/auditoria` | §5 | MT-090–091 |
| `/auditoria/homework` + `[id]` | §5 | MT-092–093 |
| `/auditoria/theory` + `[id]` | §5 | MT-094 |
| `/auditoria/history` + `[id]` | §5 | MT-095–100 |
| `/auditoria/pay` | §5 | MT-101–102 |
| `/auditoria/pay/checkout` | скрытый | MT-191 |
| `/auditoria/pay/complete` | скрытый | MT-191 |
| `/auditoria/profile` | §5 | MT-103–104 |
| `/auditoria/results`, `schedule`, `learning` | редиректы | MT-190 |
| `/pressa` | §6 | MT-110–111, MT-117 |
| `/pressa/reminders` | §6 | MT-112–118 |
| `/pressa/feedback` + `[id]` | §6 | MT-119–120 |
| `/pressa/ratings` | §6 | MT-121 |
| `/pressa/students` + `[id]` | §6 | MT-122–123 |
| `/pressa/teachers` + `[id]` | §6 | MT-124 |
| `/pressa/trials` + `[id]` | §6 | MT-125–126 |
| `/pressa/analytics` | §6 | MT-127 |

61 файловый маршрут учтён. Карточки `[id]` проверяются вместе со списками.

## Навигация (`cabinet-nav.ts`) → чек-лист

| Кабинет | Пункты | MT |
|---|---|---|
| Дирекция 10 | Обзор…Результаты | MT-010 |
| Кафедра 9 | Сегодня…Мой профиль | MT-060 |
| Аудитория 6 | Главная…Мой профиль | MT-090 |
| Пресса 8 | Обзор…Аналитика | MT-110 |

RoleSwitcher и Dev-аккаунты: MT-011, MT-006, AUTH-*.

## Platform actions → реестр

| action | ID |
|---|---|
| upsertTeacher / deleteTeacher | DIR-TCH-003…007, KAF-PRF-002 |
| upsertStudent / deleteStudent / archive / restore | DIR-STU-007…013, KAF-STU, AUD-PRF-002 |
| upsertLesson / recurring / delete / complete / attendance / topics | DIR-SCH, KAF-TOD, KAF-SCH |
| topic sections / topics CRUD | KAF-TPC |
| homework upsert/delete/restore/publish/assign/draft/submit/review | KAF-TST, KAF-GRD, AUD-HW, DIR-RES |
| tariffs / assign / purchase / payments / income | DIR-TRF, DIR-PAY, AUD-PAY, DIR-STU-010 |
| payroll rates/overview/detail/payout/backfill | DIR-SAL, DIR-TCH-005 |
| test grades stats | KAF-GRD-004 |
| theory upsert/delete/assign/view/files | KAF-THY, AUD-THY |
| transferKnowledge / saveToSchoolLibrary | DIR-KNW |

## Press / feedback / ratings API → реестр

| API | ID |
|---|---|
| press GET students/student/trials/trial/events/notes/reminders/reminder/analytics | PRS-STU, PRS-TRL, PRS-REM, PRS-ANL |
| press POST saveStudentInfo, notes, trial CRUD, reminders | PRS-STU-003/004, PRS-TRL, PRS-REM |
| feedback GET/POST | KAF-FBK, PRS-FBK |
| lesson-ratings GET/POST | AUD-RAT, PRS-RAT |

## Прочие API

| API | Где |
|---|---|
| auth login/logout/me/csrf/features/register/demo | AUTH, PUB |
| bootstrap | все кабинеты (загрузка store) |
| admin users / impersonate / teacher photo | AUTH-008…011, DIR-TCH-006 |
| chats* | SHR-CHAT |
| notes* | SHR-NOTE |
| assignments*, tests/[id] | AUD-HW, KAF-GRD |
| theory files | KAF-THY |
| media | вложения чата/фото |

Нет UI: `press-notifications-service` → KNOWN_GAPS GAP-NTF-001.  
Нет press-route: `setStudentNextContact` → GAP-NXT-001.

## Тесты → MANUAL_TEST_PLAN

| Тест | Пункты |
|---|---|
| auth-rbac, csrf, demo-accounts, middleware-open-test, auth-production | MT-005–006, 160–163, 174 |
| registration-impersonation | MT-002–003, 048 |
| cabinet-nav | MT-010, 060, 090, 110 |
| student-search, student-profile-fields, student-contacts | MT-021–026 |
| tariff-debt-archive, tariff-balance, tariffs-calendar, payment-queue, income-* | MT-024, 039–040, 101–102, 147 |
| teacher-payroll, money-kopecks | MT-033–034 |
| knowledge-base, save-to-school-library, theory-* | MT-035, 068–069, 094, 143 |
| schedule-service, recurring, independent-lessons, kafedra-today, attendance-mark, lesson-topics | MT-043–046, 061–063, 141 |
| homework-*, attempts, test-archive, test-grades, grades-sort | MT-047, 070–072, 092–093, 142 |
| chat-*, notes-* | MT-013–015, 080–081, 105 |
| press-cabinet, press-students, press-analytics, trial-occupancy | MT-122–127, 146, 148 |
| press-reminders | MT-111–118 |
| monthly-feedback, feedback-prompt | MT-073–077, 119–120, 144 |
| lesson-ratings lib+server | MT-096–100, 121, 145 |
| lesson-history, auditoria-calendar | MT-091, 095 |
| school-seed, seed-safety, database-url | не UI; контекст локального сида в README |
| db-unavailable-error | нет отдельного MT (инфра) |
| confirm-action, chat-delete-confirm | MT-081, диалоги confirm |
| homework-missed, homework-list | MT-092, DIR-OVR-002 |
| app-time | все даты Москвы |

## Сервисы без отдельной функции в реестре

- `idempotency` — упомянут у complete/pay/assign.
- `audit_log` — таблица есть; отдельного UI журнала аудита **нет** (не выдуман как функция).
- `login_attempts` — AUTH-002.
- `material_origins` / theory versions — внутри KAF-THY/DIR-KNW.

## Итог сверки

Незакрытых **страниц** нет. Незакрытых **пунктов навигации** нет. Platform/press/feedback/ratings actions отражены. Тесты привязаны. Незавершённое — в `KNOWN_GAPS.md`.
