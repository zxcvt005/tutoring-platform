import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Выбор кабинета</h1>
        <p className="text-sm text-muted-foreground">
          Локальный прототип без входа. Данные хранятся в браузере и общие для
          обоих кабинетов.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button render={<Link href="/direkciya" />} className="sm:flex-1">
          Дирекция
        </Button>
        <Button
          variant="outline"
          render={<Link href="/kafedra" />}
          className="sm:flex-1"
        >
          Кафедра
        </Button>
      </div>
    </main>
  );
}
