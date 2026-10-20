import Link from "next/link";

export function RegisterShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full surface-sky opacity-80 blur-2xl"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Умба
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        <p className="text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="underline-offset-4 hover:underline">
            Войти
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            На главную
          </Link>
        </p>
      </div>
    </main>
  );
}
