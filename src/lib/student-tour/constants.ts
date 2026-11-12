/** Публичный демо-кабинет ученика. Без сессии и без записи в БД. */
export const STUDENT_TOUR_BASE_PATH = "/demo/student";

/** Изолированный ключ localStorage — не пересекается с production-store. */
export const STUDENT_TOUR_STORAGE_KEY = "neodin.student-tour.v2";
/** Отдельное состояние для мини-кабинета на лендинге. */
export const STUDENT_TOUR_EMBED_STORAGE_KEY = "neodin.student-tour.embed.v2";
export const STUDENT_TOUR_STORAGE_VERSION = 2 as const;

export const STUDENT_TOUR_STUDENT_ID = "tour_student_artem";
export const STUDENT_TOUR_TEACHER_ID = "tour_teacher_physics";
