export type CabinetNavItem = {
  href: string;
  label: string;
};

export const direkciyaNavItems: CabinetNavItem[] = [
  { href: "/direkciya", label: "Обзор" },
  { href: "/direkciya/students", label: "Ученики" },
  { href: "/direkciya/teachers", label: "Преподаватели" },
  { href: "/direkciya/salaries", label: "Зарплаты" },
  { href: "/direkciya/knowledge", label: "База знаний" },
  { href: "/direkciya/zayavki", label: "Заявки" },
  { href: "/direkciya/baza", label: "База" },
  { href: "/direkciya/probnye-uroki", label: "Пробные уроки" },
  { href: "/direkciya/rnp-avito", label: "РНП Авито" },
  { href: "/direkciya/rashody", label: "Расходы" },
  { href: "/direkciya/quick-access", label: "Быстрый доступ" },
  { href: "/direkciya/tariffs", label: "Тарифы" },
  { href: "/direkciya/products", label: "Продукты" },
  { href: "/direkciya/payments", label: "Доходы" },
  { href: "/direkciya/users", label: "Доступ" },
  { href: "/direkciya/schedule", label: "Расписание" },
  { href: "/direkciya/results", label: "Результаты" },
];

export const kafedraNavItems: CabinetNavItem[] = [
  { href: "/kafedra", label: "Сегодня" },
  { href: "/kafedra/calls", label: "Звонки" },
  { href: "/kafedra/students", label: "Ученики" },
  { href: "/kafedra/schedule", label: "Расписание" },
  { href: "/kafedra/topics", label: "Темы" },
  { href: "/kafedra/theory", label: "Теория" },
  { href: "/kafedra/tests", label: "Домашние задания" },
  { href: "/kafedra/intensivy", label: "Интенсивы" },
  { href: "/kafedra/grades", label: "Оценки" },
  { href: "/kafedra/probniki", label: "Пробники" },
  { href: "/kafedra/feedback", label: "Обратная связь" },
  { href: "/kafedra/profile", label: "Мой профиль" },
];

export const auditoriaNavItems: CabinetNavItem[] = [
  { href: "/auditoria", label: "Главная" },
  { href: "/auditoria/calls", label: "Звонки" },
  { href: "/auditoria/homework", label: "Домашние задания" },
  { href: "/auditoria/theory", label: "Теория" },
  { href: "/auditoria/intensivy", label: "Интенсивы" },
  { href: "/auditoria/history", label: "История занятий" },
  { href: "/auditoria/pay", label: "Оплата" },
  { href: "/auditoria/profile", label: "Мой профиль" },
];

export const assistentNavItems: CabinetNavItem[] = [
  { href: "/assistent/knowledge", label: "База знаний" },
];

export const pressaNavItems: CabinetNavItem[] = [
  { href: "/pressa", label: "Обзор" },
  { href: "/pressa/reminders", label: "Напоминания" },
  { href: "/pressa/feedback", label: "Обратная связь" },
  { href: "/pressa/ratings", label: "Отметки учеников" },
  { href: "/pressa/students", label: "Ученики" },
  { href: "/pressa/teachers", label: "Преподаватели" },
  { href: "/pressa/trials", label: "Пробные уроки" },
  { href: "/pressa/analytics", label: "Аналитика" },
];
