"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { VideoLabNetworkCheck } from "@/components/dev/video-lab-network-check";
import { VideoLabStudent } from "@/components/dev/video-lab-student";
import { VideoLabTeacher } from "@/components/dev/video-lab-teacher";
import {
  deviceErrorMessage,
  fetchLabStatus,
  parseLabRole,
  parseLabTransportMode,
  type LabRole,
  type LabStatus,
} from "@/components/dev/video-lab-shared";
import { DEV_LAN_HTTPS_ORIGIN } from "@/lib/dev-lan-https";

function roleHref(role: LabRole, relay: boolean): string {
  const params = new URLSearchParams({ role });
  if (relay) params.set("relay", "1");
  return `/dev/video-lab?${params.toString()}`;
}

const ROLE_IDS: LabRole[] = ["teacher", "student-a", "student-b", "student"];
const ROLE_LABEL: Record<LabRole, string> = {
  teacher: "Преподаватель",
  "student-a": "Ученик А",
  "student-b": "Ученик Б",
  student: "Обычный звонок",
};

export function VideoLabClient() {
  const searchParams = useSearchParams();
  const role = parseLabRole(searchParams.get("role"));
  const transportMode = parseLabTransportMode(
    searchParams.get("relay") === "1" ? "relay" : searchParams.get("transport")
  );
  const relay = transportMode === "relay";
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchLabStatus();
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setStatusError(deviceErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const configured = Boolean(status?.configured);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Локальный эксперимент
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Видеолаборатория
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Временная страница для проверки LiveKit на нашем сервере
          (wss://video.neodinschool.ru). Не связана с расписанием, Кафедрой и
          Аудиторией. В production маршрут отключён. Cloud-конфиг сохранён в
          .env.local как LIVEKIT_CLOUD_* для отката.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {ROLE_IDS.map((id) => (
          <Link
            key={id}
            href={roleHref(id, relay)}
            aria-current={role === id ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              role === id
                ? "border-primary bg-card font-medium"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {ROLE_LABEL[id]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Транспорт:</span>
        <Link
          href={roleHref(role, false)}
          className={`rounded-full border px-3 py-1 ${
            !relay
              ? "border-primary bg-card font-medium"
              : "border-border text-muted-foreground"
          }`}
        >
          Авто (UDP → TURN/UDP → ICE/TCP → TURN/TLS)
        </Link>
        <Link
          href={roleHref(role, true)}
          className={`rounded-full border px-3 py-1 ${
            relay
              ? "border-primary bg-card font-medium"
              : "border-border text-muted-foreground"
          }`}
        >
          Диагностика: только TURN/relay
        </Link>
      </div>

      {relay ? (
        <p className="rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-xs dark:bg-amber-950/30">
          Включён <span className="font-medium">?relay=1</span>: браузеру задан
          только <span className="font-medium">iceTransportPolicy: relay</span>.
          Это запрещает прямые host/srflx-кандидаты, но не форсирует TURN/TLS
          через TCP 443 — браузер может остаться на TURN/UDP. В
          livekit-client@2.23.0 публичного способа выбрать только TURN/TLS нет.
        </p>
      ) : null}

      <VideoLabNetworkCheck />

      {statusError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {statusError}
        </p>
      ) : null}

      {status && !status.configured ? (
        <p className="rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
          LiveKit не настроен. Задайте в{" "}
          <span className="font-medium">.env.local</span> переменные{" "}
          {status.missing.join(", ")} и перезапустите{" "}
          <span className="font-medium">npm run start:local:keep</span>.
        </p>
      ) : null}

      {role === "teacher" ? (
        <TeacherInstructions />
      ) : (
        <StudentInstructions role={role} />
      )}

      {role === "teacher" ? (
        <VideoLabTeacher
          key={`teacher-${transportMode}`}
          configured={configured}
          transportMode={transportMode}
        />
      ) : (
        <VideoLabStudent
          key={`${role}-${transportMode}`}
          role={role}
          configured={configured}
          transportMode={transportMode}
        />
      )}
    </main>
  );
}

function TeacherInstructions() {
  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm leading-relaxed">
      <h2 className="font-medium">Параллельные комнаты — три вкладки</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          Три физических устройства: Windows — эта страница преподавателя (
          <code className="text-foreground">
            http://127.0.0.1:43127/dev/video-lab?role=teacher
          </code>
          ). MacBook — ученик А по HTTPS sidecar. iPhone (Safari) — ученик Б.
          На каждом устройстве — свои камера и микрофон; наушники обязательны.
        </li>
        <li>
          MacBook, ученик А:{" "}
          <code className="text-foreground">
            {DEV_LAN_HTTPS_ORIGIN}/dev/video-lab?role=student-a
          </code>
          . Нужен доверенный локальный CA. Нажмите «Подключиться» и разрешите
          камеру и микрофон.
        </li>
        <li>
          iPhone, ученик Б:{" "}
          <code className="text-foreground">
            {DEV_LAN_HTTPS_ORIGIN}/dev/video-lab?role=student-b
          </code>
          . Safari, после установки rootCA.pem и полного доверия CA. Ученики
          не должны видеть друг друга — это разные комнаты LiveKit.
        </li>
        <li>
          На Windows нажмите «Подключиться к комнатам A и B». Браузер один раз
          спросит устройства. Активной сразу станет комната А. Другие вкладки
          лаборатории на этом ПК не открывайте — камера будет занята.
        </li>
        <li>
          Скажите фразу. Ученик А должен слышать, у ученика Б бейдж
          «Преподаватель в эфире: нет (отошёл)».
        </li>
        <li>
          Нажмите «Сделать активной» у ученика Б. Дождитесь, пока в карточке А
          публикация микрофона станет «нет», и только потом говорите. Ученик Б
          слышит, ученик А — нет.
        </li>
        <li>
          Вернитесь к ученику А той же кнопкой. Комнаты не завершаются:
          счётчик «Учеников в комнате» у обеих карточек остаётся 1.
        </li>
      </ol>
    </section>
  );
}

function StudentInstructions({ role }: { role: LabRole }) {
  if (role === "student") {
    return (
      <p className="text-sm text-muted-foreground">
        Обычный 1:1: откройте эту же ссылку во втором браузере, укажите одно
        имя комнаты и разные имена участников.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Это вкладка {role === "student-a" ? "ученика А" : "ученика Б"} (
      <code className="text-foreground">
        {DEV_LAN_HTTPS_ORIGIN}/dev/video-lab?role={role}
      </code>
      ). Подключитесь и не закрывайте её, пока преподаватель переключается.
      Когда преподаватель уходит в другую комнату, бейдж «Преподаватель в
      эфире» должен стать «нет (отошёл)», а его голос — пропасть.
    </p>
  );
}
