"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LANDING_GRADES,
  submitLandingLead,
  validateLandingStudentStep,
  type LandingLeadErrors,
} from "@/lib/landing/lead";

import { useLandingApply } from "./landing-apply-context";

const emptyErrors: LandingLeadErrors = {};

export function LeadForm() {
  const formId = useId();
  const { prefillNonce } = useLandingApply();
  const [step, setStep] = useState<1 | 2>(1);
  const [studentName, setStudentName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [level, setLevel] = useState("");
  const [parentName, setParentName] = useState("");
  const [contact, setContact] = useState("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<LandingLeadErrors>(emptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [seenNonce, setSeenNonce] = useState(prefillNonce);

  if (prefillNonce !== seenNonce) {
    setSeenNonce(prefillNonce);
    setStep(1);
    setDone(false);
    setSubmitError(null);
    setErrors(emptyErrors);
  }

  function payload() {
    return {
      studentName,
      gradeId,
      level,
      parentName,
      contact,
      comment,
    };
  }

  function onContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateLandingStudentStep({ studentName, gradeId, level });
    setErrors(next);
    setSubmitError(null);
    if (Object.keys(next).length === 0) setStep(2);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitLandingLead(payload());
    setSubmitting(false);

    if (result.status === "invalid") {
      setErrors(result.errors);
      setDone(false);
      if (
        result.errors.studentName ||
        result.errors.gradeId ||
        result.errors.level
      ) {
        setStep(1);
      }
      return;
    }

    if (result.status === "error") {
      setErrors(emptyErrors);
      setDone(false);
      setSubmitError(result.message);
      return;
    }

    setErrors(emptyErrors);
    setDone(true);
  }

  if (done) {
    return (
      <div
        className="panel-soft surface-sand px-4 py-5 text-sm leading-relaxed text-foreground"
        role="status"
      >
        <p className="font-display text-xl font-semibold tracking-tight">
          Заявка отправлена
        </p>
        <p className="mt-2">
          Мы получили данные и свяжемся, чтобы назначить диагностику. Ничего не
          списали и никого автоматически не зачислили.
        </p>
      </div>
    );
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
                setSubmitError(null);
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
                setSubmitError(null);
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
                setSubmitError(null);
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
                setSubmitError(null);
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={submitting}
              onClick={() => {
                setStep(1);
                setSubmitError(null);
              }}
            >
              Назад
            </Button>
            <Button
              type="submit"
              className="h-10 flex-1 rounded-xl"
              disabled={submitting}
            >
              {submitting ? "Отправляем…" : "Отправить заявку"}
            </Button>
          </div>
        </>
      )}

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Кнопка ничего не списывает. После отправки мы напишем, чтобы
            назначить диагностику.
          </p>
          <p>
            Отправляя заявку, вы оставляете контакт для связи по диагностике.
            Политика конфиденциальности на сайте пока не опубликована.
          </p>
        </div>
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
