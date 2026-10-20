import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full surface-sky opacity-80 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full surface-mint opacity-70 blur-2xl"
      />

      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-16">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Tutoring platform
          </p>
          <h1 className="font-display max-w-xl text-4xl leading-[1.1] font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
            Выберите кабинет
          </h1>
          <p className="max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
            Дирекция, Кафедра и Аудитория работают через сервер и PostgreSQL.
            Войдите по email и паролю или откройте кабинет (в dev возможен
            демо-вход).
          </p>
          <p className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Войти →
            </Link>
            <Link
              href="/setup"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Первичная настройка
            </Link>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/direkciya"
            className="group panel flex flex-col gap-3 p-5 transition-colors hover:border-foreground/20"
          >
            <span className="inline-flex w-fit rounded-full surface-sky px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide text-foreground/80 uppercase">
              Владелец
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight">
              Дирекция
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              Ученики, преподаватели, контроль заданий и проблемных ситуаций.
            </span>
            <span className="mt-auto pt-2 text-sm font-medium text-foreground group-hover:underline">
              Открыть →
            </span>
          </Link>

          <Link
            href="/kafedra"
            className="group panel flex flex-col gap-3 p-5 transition-colors hover:border-foreground/20"
          >
            <span className="inline-flex w-fit rounded-full surface-sand px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide text-foreground/80 uppercase">
              Преподаватель
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight">
              Кафедра
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              Свои ученики, расписание, посещаемость, проверка работ.
            </span>
            <span className="mt-auto pt-2 text-sm font-medium text-foreground group-hover:underline">
              Открыть →
            </span>
          </Link>

          <Link
            href="/auditoria"
            className="group panel flex flex-col gap-3 p-5 transition-colors hover:border-foreground/20"
          >
            <span className="inline-flex w-fit rounded-full surface-mint px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide text-foreground/80 uppercase">
              Ученик
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight">
              Аудитория
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              Расписание, обучение, сдача ДЗ и свои результаты.
            </span>
            <span className="mt-auto pt-2 text-sm font-medium text-foreground group-hover:underline">
              Открыть →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
