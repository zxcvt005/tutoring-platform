export function OnboardingShell({
  step,
  title,
  description,
  children,
}: {
  step: 1 | 2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-full flex-1 overflow-hidden bg-[#F7F1EA]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 size-80 rounded-full bg-[#E9DFF0] opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 size-72 rounded-full bg-[#F3E0E4] opacity-60 blur-3xl"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#8A7A88] uppercase">
            Неодин · регистрация
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={
                step === 1
                  ? "rounded-full bg-[#D9C7E8] px-3 py-1 text-xs font-medium text-[#4A3B55]"
                  : "rounded-full bg-white/70 px-3 py-1 text-xs text-[#8A7A88]"
              }
            >
              1. Анкета
            </span>
            <span
              className={
                step === 2
                  ? "rounded-full bg-[#D9C7E8] px-3 py-1 text-xs font-medium text-[#4A3B55]"
                  : "rounded-full bg-white/70 px-3 py-1 text-xs text-[#8A7A88]"
              }
            >
              2. Свободное время
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#3F3345] sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm text-[#7A6B78] sm:text-base">
            {description}
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-[#E8DFD4] bg-[#FFFbf7]/95 p-5 shadow-[0_12px_40px_rgba(80,60,40,0.06)] sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
