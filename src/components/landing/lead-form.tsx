"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRub, tariffById } from "@/lib/landing/content";
import {
  LANDING_GRADES,
  LANDING_LEAD_DELIVERY,
  submitLandingLead,
  validateLandingStudentStep,
  type LandingLeadErrors,
} from "@/lib/landing/lead";

import { useLandingApply } from "./landing-apply-context";

const emptyErrors: LandingLeadErrors = {};

export function LeadForm() {
  const formId = useId();
  const { prefill } = useLandingApply();
  const [step, setStep] = useState<1 | 2>(1);
  const [studentName, setStudentName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [level, setLevel] = useState("");
  const [parentName, setParentName] = useState("");
  const [contact, setContact] = useState("");
  const [comment, setComment] = useState("");
  const [tariffId, setTariffId] = useState(prefill.tariffId ?? "");
  const [errors, setErrors] = useState<LandingLeadErrors>(emptyErrors);
  const [notDelivered, setNotDelivered] = useState(false);
  const [seenPrefill, setSeenPrefill] = useState(prefill);

  if (prefill !== seenPrefill) {
    setSeenPrefill(prefill);
    if (prefill.tariffId) setTariffId(prefill.tariffId);
    setStep(1);
    setNotDelivered(false);
    setErrors(emptyErrors);
  }

  const tariff = useMemo(() => tariffById(tariffId), [tariffId]);

  function payload() {
    return {
      studentName,
      gradeId,
      level,
      parentName,
      contact,
      comment,
      tariffId,
    };
  }

  function onContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateLandingStudentStep({ studentName, gradeId, level });
    setErrors(next);
    setNotDelivered(false);
    if (Object.keys(next).length === 0) setStep(2);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submitLandingLead(payload());
    if (result.status === "invalid") {
      setErrors(result.errors);
      setNotDelivered(false);
      if (
        result.errors.studentName ||
        result.errors.gradeId ||
        result.errors.level
      ) {
        setStep(1);
      }
      return;
    }
    setErrors(emptyErrors);
    setNotDelivered(true);
  }

  return (
    <form
      onSubmit={step === 1 ? onContinue : onSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Шаг {step} из 2
      </p>

      {tariff ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          {`Интересующий формат: ${tariff.name}, ${formatRub(tariff.price)} в месяц. Это не оплата и не бронь.`}
        </p>
      ) : null}

      {step === 1 ? (
        <>
          <Field
            id="lead-student-name"
            label="Имя ученика"
            error={errors.studentName}
          >
            <Input
              id="lead-student-name"
              name="studentName"
              autoComplete="name"
              value={studentName}
              onChange={(event) => {
                setStudentName(event.target.value);
                setNotDelivered(false);
              }}
              aria-invalid={Boolean(errors.studentName)}
              className="h-10 rounded-xl"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-grade`}>Класс</Label>
            <select
              id={`${formId}-grade`}
              name="grade"
              value={gradeId}
              onChange={(event) => {
                setGradeId(event.target.value);
                setNotDelivered(false);
              }}
              aria-invalid={Boolean(errors.gradeId)}
              className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Выберите класс</option>
              {LANDING_GRADES.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.label}
                </option>
              ))}
            </select>
            {errors.gradeId ? <ErrorText>{errors.gradeId}</ErrorText> : null}
          </div>

          <Field
            id={`${formId}-level`}
            label="Примерный балл или уровень, если известен"
            error={errors.level}
          >
            <Input
              id={`${formId}-level`}
              name="level"
              value={level}
              placeholder="Можно пропустить"
              onChange={(event) => setLevel(event.target.value)}
              aria-invalid={Boolean(errors.level)}
              className="h-10 rounded-xl"
            />
          </Field>

          <Button type="submit" className="h-10 rounded-xl">
            Дальше
          </Button>
        </>
      ) : (
        <>
          <Field
            id={`${formId}-parent`}
            label="Имя родителя"
            error={errors.parentName}
          >
            <Input
              id={`${formId}-parent`}
              name="parentName"
              autoComplete="name"
              value={parentName}
              onChange={(event) => {
                setParentName(event.target.value);
                setNotDelivered(false);
              }}
              aria-invalid={Boolean(errors.parentName)}
              className="h-10 rounded-xl"
            />
          </Field>

          <Field
            id={`${formId}-contact`}
            label="Телефон, email или Telegram"
            error={errors.contact}
          >
            <Input
              id={`${formId}-contact`}
              name="contact"
              autoComplete="tel"
              value={contact}
              onChange={(event) => {
                setContact(event.target.value);
                setNotDelivered(false);
              }}
              aria-invalid={Boolean(errors.contact)}
              className="h-10 rounded-xl"
            />
          </Field>

          <Field
            id={`${formId}-comment`}
            label="Комментарий, если нужно"
            error={errors.comment}
          >
            <Textarea
              id={`${formId}-comment`}
              name="comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="min-h-24 rounded-xl"
            />
          </Field>

          <input type="hidden" name="tariff" value={tariffId} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => {
                setStep(1);
                setNotDelivered(false);
              }}
            >
              Назад
            </Button>
            <Button type="submit" className="h-10 flex-1 rounded-xl">
              Проверить заявку
            </Button>
          </div>
        </>
      )}

      {notDelivered ? (
        <div
          className="panel-soft surface-sand px-3 py-3 text-sm leading-relaxed text-foreground"
          role="status"
        >
          <p className="font-medium">Заявка в школу не отправлена.</p>
          <p className="mt-1">
            Поля заполнены верно, но {LANDING_LEAD_DELIVERY.reason} Данные
            остаются только в этой вкладке и никуда не передаются.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Кнопка не создаёт ученика и не списывает оплату. Приём заявок с сайта
          ещё не подключён.
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

function ErrorText({ children }: { children: string }) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {children}
    </p>
  );
}
