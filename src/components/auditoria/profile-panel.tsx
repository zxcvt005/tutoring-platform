"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Calendar, Mail, MessageCircle, Pencil, Phone, Send } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOpenTeacherChat } from "@/lib/chat/student-teacher-chat";
import { formatDate, initialsFromName } from "@/lib/format";
import {
  lessonOrderStatusLabel,
  STUDENT_CHECKOUT_PATH,
  STUDENT_PAY_PATH,
} from "@/lib/payment-checkout";
import {
  gradeLabel,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";
import { lessonsCountLabel } from "@/lib/ru-plural";
import { useDemoStore } from "@/lib/store/demo-store";
import {
  useStudentCabinetHref,
  useStudentTour,
} from "@/lib/student-tour/paths";
import type { LessonOrder, Student, Teacher } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDERS_PREVIEW = 3;

function money(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function AuditoriaProfilePanel() {
  const { data } = useDemoStore();
  const student = data.students.find((s) => s.id === data.currentStudentId);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  return <ProfileSettingsForm key={student.id} student={student} />;
}

function ProfileSettingsForm({ student }: { student: Student }) {
  const { upsertStudent, data } = useDemoStore();
  const teacher = data.teachers.find((t) => t.id === student.teacherId) ?? null;
  const [editing, setEditing] = useState(false);
  const [telegram, setTelegram] = useState(student.telegram ?? "");
  const [phone, setPhone] = useState(student.phone ?? "");

  const directionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of data.learningDirections) {
      map.set(d.id, d.name);
    }
    return map;
  }, [data.learningDirections]);

  const directionBalances = useMemo(() => {
    return (data.studentDirectionBalances ?? [])
      .filter((row) => row.studentId === student.id)
      .map((row) => ({
        directionId: row.directionId,
        directionName: directionNameById.get(row.directionId) ?? "Направление",
        balance: row.remaining,
        used: row.used,
      }));
  }, [data.studentDirectionBalances, student.id, directionNameById]);

  const recentOrders = useMemo(() => {
    return [...(data.lessonOrders ?? [])]
      .filter((o) => o.studentId === student.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? b.paidAt ?? 0).getTime() -
          new Date(a.createdAt ?? a.paidAt ?? 0).getTime()
      )
      .slice(0, ORDERS_PREVIEW);
  }, [data.lessonOrders, student.id]);

  const pendingPayment = useMemo(
    () =>
      data.payments.find(
        (p) => p.studentId === student.id && p.status === "pending"
      ) ?? null,
    [data.payments, student.id]
  );

  const tgDisplay = telegramDisplay(student.telegram);
  const tgLink = telegramHref(student.telegram);
  const telLink = phoneHref(student.phone);
  const teacherMail = teacher?.email?.trim() || "";
  const accountMail = student.accountEmail?.trim() || "";
  const hasStudentContacts = Boolean(tgDisplay || student.phone?.trim() || accountMail);

  function openEditor() {
    setTelegram(student.telegram ?? "");
    setPhone(student.phone ?? "");
    setEditing(true);
  }

  function saveSettings() {
    void upsertStudent({
      ...student,
      telegram: telegram.trim() || null,
      phone: phone.trim() || null,
    });
    toast.success("Контакты сохранены");
    setEditing(false);
  }

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <section className="auditoria-home-card grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)] lg:items-center">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-pastel-blue/80 font-display text-lg font-semibold">
              {initialsFromName(student.fullName)}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold tracking-tight break-words sm:text-3xl">
                {student.fullName}
              </h2>
              {student.grade ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {gradeLabel(student.grade)}
                </p>
              ) : null}
              <span className="mt-2 inline-flex rounded-full bg-auditoria-surface px-2.5 py-1 text-xs">
                Ученик
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={openEditor}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm"
          >
            <Pencil className="size-4" />
            Редактировать профиль
          </button>
        </div>
        <div className="min-w-0 rounded-2xl border border-black/10 bg-auditoria-surface p-4">
          <p className="text-xs text-muted-foreground">Ваш преподаватель</p>
          {teacher ? (
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold break-words">
                  {teacher.fullName}
                </p>
                {teacher.subjects.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {teacher.subjects.join(", ")}
                  </p>
                ) : null}
              </div>
              <TeacherContacts teacher={teacher} email={teacherMail} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Преподаватель не назначен.
            </p>
          )}
        </div>
      </section>

      <ProfileLessonsCard
        balances={directionBalances}
        pending={Boolean(pendingPayment)}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BalanceDetails balances={directionBalances} />
        <OrdersPreview orders={recentOrders} />
      </div>

      {hasStudentContacts ? (
        <section className="auditoria-home-card">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Контакты
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {tgDisplay ? (
              <ContactTile
                icon={Send}
                label="Telegram"
                value={tgDisplay}
                href={tgLink}
              />
            ) : null}
            {student.phone?.trim() ? (
              <ContactTile
                icon={Phone}
                label="Телефон"
                value={student.phone.trim()}
                href={telLink}
              />
            ) : null}
            {accountMail ? (
              <ContactTile
                icon={Mail}
                label="Почта"
                value={accountMail}
                href={`mailto:${accountMail}`}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="rounded-3xl border border-white/70 bg-auditoria-surface sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Редактировать профиль
            </DialogTitle>
            <DialogDescription>
              Имя, класс и преподавателя меняет Дирекция. Здесь можно обновить
              Telegram и телефон.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-telegram">Telegram</Label>
              <Input
                id="profile-telegram"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Телефон</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 …"
              />
            </div>
          </div>
          <Button type="button" className="rounded-full" onClick={saveSettings}>
            Сохранить
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeacherContacts({
  teacher,
  email,
}: {
  teacher: Teacher;
  email: string;
}) {
  const tour = useStudentTour();
  const mail = email ? `mailto:${email}` : null;
  return (
    <div className="flex shrink-0 gap-2">
      {tour.active ? null : (
        <button
          type="button"
          aria-label={`Открыть чат с ${teacher.fullName}`}
          title="Чат с преподавателем"
          className="inline-flex size-11 items-center justify-center rounded-full border border-black/10 bg-pastel-blue/75"
          onClick={() => requestOpenTeacherChat(teacher.id)}
        >
          <MessageCircle className="size-4" />
        </button>
      )}
      {mail ? (
        <a
          href={mail}
          aria-label={`Написать ${teacher.fullName} на почту`}
          title={email}
          className="inline-flex size-11 items-center justify-center rounded-full border border-black/10 bg-pastel-blue/75"
        >
          <Mail className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

function ContactTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string | null;
}) {
  const body = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-pastel-blue/70">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-sm font-medium break-words">{value}</span>
      </span>
    </>
  );
  const className =
    "flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-2";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <a
      href={href}
      className={className}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {body}
    </a>
  );
}

function ProfileLessonsCard({
  balances,
  pending,
}: {
  balances: {
    directionId: string;
    directionName: string;
    balance: number;
  }[];
  pending: boolean;
}) {
  const href = useStudentCabinetHref();
  const minBalance =
    balances.length === 0
      ? null
      : Math.min(...balances.map((b) => b.balance));

  return (
    <section className="auditoria-home-card grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.7fr)]">
      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-pastel-mint/80 px-2.5 py-1 text-xs">
          Баланс занятий
        </span>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight break-words">
          {balances.length === 0
            ? "Пакет ещё не куплен"
            : balances.length === 1
              ? balances[0].directionName
              : "По направлениям"}
        </h2>
        {balances.length === 0 ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
            Купите пакет в разделе «Оплата», чтобы начать подготовку.
          </p>
        ) : (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {balances.map((b) => (
              <div key={b.directionId} className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {b.directionName}
                </dt>
                <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                  {b.balance}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-black/10 bg-auditoria-surface p-4">
        <div>
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-pastel-beige/80">
            <Calendar className="size-4" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">
            {minBalance != null && minBalance <= 0
              ? "Осталось мало занятий"
              : "Готовы к занятиям"}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">
            {minBalance == null ? "—" : minBalance}
          </p>
        </div>
        {pending ? (
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm text-muted-foreground"
          >
            Оплата ожидает подтверждения
          </button>
        ) : (
          <Link
            href={href(STUDENT_CHECKOUT_PATH)}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#e7dff6]/90 px-4 text-sm"
          >
            {minBalance != null && minBalance <= 2
              ? "Пополнить баланс →"
              : "Купить занятия →"}
          </Link>
        )}
      </div>
    </section>
  );
}

function BalanceDetails({
  balances,
}: {
  balances: { directionId: string; directionName: string; balance: number; used: number }[];
}) {
  return (
    <section className="auditoria-home-card min-w-0">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Остаток по направлениям
      </h2>
      {balances.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Показатели появятся после покупки пакета занятий.
        </p>
      ) : (
        <dl className="mt-4 space-y-3">
          {balances.map((row) => (
            <div
              key={row.directionId}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-sm text-muted-foreground">
                {row.directionName}
              </dt>
              <dd className="text-right text-sm font-medium tabular-nums">
                {row.balance} · списано {row.used}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const orderTone: Record<string, string> = {
  paid: "bg-pastel-mint/80",
  awaiting_payment: "bg-pastel-beige/80",
  cancelled: "bg-pastel-rose/80",
  expired: "bg-[#eceaf3]/85",
  refunded: "bg-pastel-rose/80",
  disputed: "bg-pastel-beige/80",
};

function OrdersPreview({ orders }: { orders: LessonOrder[] }) {
  const href = useStudentCabinetHref();
  return (
    <section className="auditoria-home-card min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Покупки занятий
        </h2>
        <Link
          href={href(STUDENT_PAY_PATH)}
          className="shrink-0 text-sm text-foreground/80"
        >
          Вся история →
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Покупок пока нет. Каждая оплата появится отдельной строкой.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="min-w-0 rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium break-words">
                  {order.tariffNameSnapshot}
                </p>
                <p className="shrink-0 text-sm tabular-nums">
                  {money(order.totalAmount)}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {lessonsCountLabel(order.lessonsCount)}
                {order.paidAt
                  ? ` · ${formatDate(order.paidAt)}`
                  : order.createdAt
                    ? ` · ${formatDate(order.createdAt)}`
                    : ""}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2.5 py-1 text-xs",
                  orderTone[order.status] ?? "bg-auditoria-surface"
                )}
              >
                {lessonOrderStatusLabel(order.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}