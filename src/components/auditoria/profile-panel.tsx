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
import { STUDENT_CHECKOUT_PATH, STUDENT_PAY_PATH } from "@/lib/payment-checkout";
import {
  gradeLabel,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";
import {
  buildTariffHistoryItems,
  pendingReviewPaymentForStudent,
  tariffDaysLeftLabel,
  tariffHistoryStatusLabel,
  tariffTermView,
  type TariffHistoryDisplayStatus,
  type TariffHistoryItem,
  type TariffTermView,
} from "@/lib/tariff-history";
import { currentAssignmentForStudent } from "@/lib/tariff-package";
import { useDemoStore } from "@/lib/store/demo-store";
import {
  useStudentCabinetHref,
  useStudentTour,
} from "@/lib/student-tour/paths";
import type { Student, StudentTariffAssignment, Teacher } from "@/lib/types";
import { cn } from "@/lib/utils";

const HISTORY_PREVIEW = 3;

const rowLabel: Record<TariffHistoryDisplayStatus, string> = {
  current: "Активен",
  expired: "Завершён",
  review: tariffHistoryStatusLabel.review,
  queued: tariffHistoryStatusLabel.queued,
  rejected: tariffHistoryStatusLabel.rejected,
};

const rowTone: Record<TariffHistoryDisplayStatus, string> = {
  current: "bg-pastel-mint/80",
  expired: "bg-[#eceaf3]/85",
  review: "bg-pastel-beige/80",
  queued: "bg-pastel-beige/80",
  rejected: "bg-pastel-rose/80",
};

const rowStripe: Record<TariffHistoryDisplayStatus, string> = {
  current: "border-l-[#8fbfa0]",
  expired: "border-l-[#c5c2d4]",
  review: "border-l-[#e4c48a]",
  queued: "border-l-[#e4c48a]",
  rejected: "border-l-[#e3a4aa]",
};

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

  const items = useMemo(
    () => buildTariffHistoryItems(data.tariffAssignments, data.payments, student.id),
    [data.tariffAssignments, data.payments, student.id]
  );
  const assignment = useMemo(
    () => currentAssignmentForStudent(data.tariffAssignments, student.id),
    [data.tariffAssignments, student.id]
  );
  const pending = useMemo(
    () => pendingReviewPaymentForStudent(data.payments, student.id),
    [data.payments, student.id]
  );
  const featuredStatus =
    assignment == null
      ? null
      : (items.find((item) => item.id === assignment.id)?.displayStatus ?? null);

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

      <ProfileTariffCard
        assignment={assignment}
        status={featuredStatus}
        pending={Boolean(pending)}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <TariffDetails assignment={assignment} />
        <TariffHistoryPreview items={items} />
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

function ProfileTariffCard({
  assignment,
  status,
  pending,
}: {
  assignment: StudentTariffAssignment | null;
  status: TariffHistoryDisplayStatus | null;
  pending: boolean;
}) {
  const href = useStudentCabinetHref();
  if (!assignment) {
    return (
      <section className="auditoria-home-card">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Тариф пока не назначен
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Когда администратор назначит тариф, здесь появятся срок и занятия.
        </p>
      </section>
    );
  }

  const isCurrent = status === "current";
  const term = tariffTermView({
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  });
  const facts = [
    assignment.lessonsLimitSnapshot != null
      ? `${assignment.lessonsLimitSnapshot} занятий`
      : null,
    money(assignment.priceSnapshot),
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="auditoria-home-card grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.7fr)]">
      <div className="min-w-0">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs",
            isCurrent ? "bg-pastel-mint/80" : status ? rowTone[status] : "bg-auditoria-surface"
          )}
        >
          {isCurrent ? "Текущий тариф" : status ? rowLabel[status] : "Тариф"}
        </span>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight break-words">
          {assignment.tariffName ?? "Тариф"}
        </h2>
        {assignment.includesText ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
            {assignment.includesText}
          </p>
        ) : null}
        {facts.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{facts.join(" · ")}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-black/10 bg-auditoria-surface p-4">
        <TermSummary term={term} isCurrent={isCurrent} />
        {pending ? (
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm text-muted-foreground"
          >
            Заявка на проверке
          </button>
        ) : (
          <Link
            href={href(STUDENT_CHECKOUT_PATH)}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#e7dff6]/90 px-4 text-sm"
          >
            Продлить тариф →
          </Link>
        )}
      </div>
    </section>
  );
}

function TermSummary({
  term,
  isCurrent,
}: {
  term: TariffTermView;
  isCurrent: boolean;
}) {
  const fill =
    term.state === "unknown"
      ? null
      : term.tone === "ended"
        ? "bg-[#e3a4aa]"
        : term.tone === "soon"
          ? "bg-[#e4c48a]"
          : "bg-[#c9b7e6]";
  const value =
    term.state === "unknown"
      ? "Срок по датам не указан"
      : term.state === "ended"
        ? "Срок истёк"
        : tariffDaysLeftLabel(term.daysLeft, term.endsToday);
  return (
    <div>
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-pastel-beige/80">
        <Calendar className="size-4" />
      </span>
      <p className="mt-3 text-sm text-muted-foreground">
        {term.state === "ended" || !isCurrent ? "Срок тарифа" : "Тариф действует ещё"}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{value}</p>
      {term.state === "unknown" ? null : (
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(term.progress * 100)}
          aria-label="Срок действия тарифа"
        >
          <div
            className={cn("h-full rounded-full", fill)}
            style={{ width: `${Math.round(term.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TariffDetails({
  assignment,
}: {
  assignment: StudentTariffAssignment | null;
}) {
  const rows = assignment
    ? [
        { label: "Начало", value: formatDate(assignment.startsAt) },
        assignment.endsAt
          ? { label: "Окончание (прогноз)", value: formatDate(assignment.endsAt) }
          : null,
        assignment.lessonsLimitSnapshot != null
          ? { label: "Всего занятий", value: String(assignment.lessonsLimitSnapshot) }
          : null,
        assignment.lessonsUsed != null
          ? { label: "Использовано занятий", value: String(assignment.lessonsUsed) }
          : null,
        assignment.lessonsRemaining != null
          ? { label: "Осталось занятий", value: String(assignment.lessonsRemaining) }
          : null,
        { label: "Стоимость", value: money(assignment.priceSnapshot) },
      ].filter((row): row is { label: string; value: string } => Boolean(row))
    : [];

  return (
    <section className="auditoria-home-card min-w-0">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Детали тарифа
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Показатели появятся, когда тариф будет назначен.
        </p>
      ) : (
        <dl className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-right text-sm font-medium break-words tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function TariffHistoryPreview({ items }: { items: TariffHistoryItem[] }) {
  const href = useStudentCabinetHref();
  const preview = items.slice(0, HISTORY_PREVIEW);
  return (
    <section className="auditoria-home-card min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          История тарифов
        </h2>
        {items.length > 0 ? (
          <Link href={href(STUDENT_PAY_PATH)} className="shrink-0 text-sm text-foreground/80">
            Вся история →
          </Link>
        ) : null}
      </div>
      {preview.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Покупок пока нет. Каждая оплата появится отдельной строкой.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {preview.map((item) => (
            <li
              key={item.id}
              className={cn(
                "min-w-0 rounded-2xl border border-black/10 border-l-[3px] bg-auditoria-surface px-3 py-3",
                rowStripe[item.displayStatus]
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium break-words">{item.title}</p>
                <p className="shrink-0 text-sm tabular-nums">{money(item.price)}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.endsAt
                  ? `${formatDate(item.startsAt)} — ${formatDate(item.endsAt)}`
                  : formatDate(item.startsAt)}
                {item.lessonsLimit != null ? ` · ${item.lessonsLimit}` : ""}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2.5 py-1 text-xs",
                  rowTone[item.displayStatus]
                )}
              >
                {rowLabel[item.displayStatus]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
