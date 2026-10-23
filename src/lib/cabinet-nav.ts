export type CabinetNavItem = {
  href: string;
  label: string;
};

export const direkciyaNavItems: CabinetNavItem[] = [
  { href: "/direkciya", label: "Обзор" },
  { href: "/direkciya/students", label: "Ученики" },
  { href: "/direkciya/teachers", label: "Преподаватели" },
  { href: "/direkciya/tariffs", label: "Тарифы" },
  { href: "/direkciya/payments", label: "Доходы" },
  { href: "/direkciya/users", label: "Доступ" },
  { href: "/direkciya/schedule", label: "Расписание" },
  { href: "/direkciya/results", label: "Результаты" },
];

export const kafedraNavItems: CabinetNavItem[] = [
  { href: "/kafedra", label: "Сегодня" },
  { href: "/kafedra/students", label: "Ученики" },
  { href: "/kafedra/schedule", label: "Расписание" },
  { href: "/kafedra/topics", label: "Темы" },
  { href: "/kafedra/theory", label: "Теория" },
  { href: "/kafedra/tests", label: "Тесты" },
  { href: "/kafedra/grades", label: "Оценки" },
  { href: "/kafedra/profile", label: "Мой профиль" },
];

export const auditoriaNavItems: CabinetNavItem[] = [
  { href: "/auditoria", label: "Главная" },
  { href: "/auditoria/homework", label: "Домашние задания" },
  { href: "/auditoria/theory", label: "Теория" },
  { href: "/auditoria/history", label: "История занятий" },
  { href: "/auditoria/profile", label: "Мой профиль" },
];
