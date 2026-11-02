import type { MonthlyFeedbackMetrics } from "@/lib/monthly-feedback";

function MetricBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

function percent(value: number | null): string {
  if (value == null) return "нет числовой оценки";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}%`;
}

export function FeedbackMetricsPanel({
  metrics,
  live,
}: {
  metrics: MonthlyFeedbackMetrics | null;
  live?: boolean;
}) {
  if (!metrics) {
    return (
      <div className="panel p-4 text-sm text-muted-foreground">
        Снимок показателей недоступен. Не выдумывайте посещаемость, домашние
        задания и оценки.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {live ? (
        <p className="text-xs text-muted-foreground">
          Показатели рассчитаны по текущим данным за выбранный месяц.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Показатели зафиксированы на момент отправки и больше не пересчитываются.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <MetricBlock title="Занятия и посещаемость">
          {metrics.lessons.available ? (
            <>
              <p>
                Посещено {metrics.lessons.present} из {metrics.lessons.occurred}{" "}
                проведённых занятий.
              </p>
              <p>
                Запланировано {metrics.lessons.scheduled}, отменено{" "}
                {metrics.lessons.cancelled}, перенесено{" "}
                {metrics.lessons.rescheduled}.
              </p>
              <p>
                Уважительных пропусков {metrics.lessons.absentExcused},
                неуважительных {metrics.lessons.absentUnexcused}, без отметки{" "}
                {metrics.lessons.unmarked}.
              </p>
              {metrics.lessons.plannedRemaining > 0 ? (
                <p>
                  Ещё запланировано до конца месяца:{" "}
                  {metrics.lessons.plannedRemaining}.
                </p>
              ) : null}
            </>
          ) : (
            <p>Недостаточно данных за этот месяц: занятий не найдено.</p>
          )}
        </MetricBlock>
        <MetricBlock title="Домашние задания">
          {metrics.homework.available ? (
            <>
              <p>
                Выполнено {metrics.homework.completed} из{" "}
                {metrics.homework.assigned} выданных.
              </p>
              <p>
                Просрочено {metrics.homework.overdue}, в работе{" "}
                {metrics.homework.inProgress}.
              </p>
              {metrics.homework.averagePercent != null ? (
                <p>
                  Средний результат домашних тестов:{" "}
                  {percent(metrics.homework.averagePercent)} по{" "}
                  {
                    metrics.homework.scores.filter((s) => s.usedPercent != null)
                      .length
                  }{" "}
                  работам с оценкой.
                </p>
              ) : (
                <p>Числовых оценок за домашние тесты нет.</p>
              )}
              {metrics.homework.previousComparable ? (
                <p>
                  Предыдущий месяц:{" "}
                  {percent(metrics.homework.previousAveragePercent)}.
                </p>
              ) : (
                <p>Сопоставимой динамики за предыдущий месяц нет.</p>
              )}
            </>
          ) : (
            <p>
              Недостаточно данных за этот месяц: домашние задания не найдены.
            </p>
          )}
        </MetricBlock>
        <MetricBlock title="Пройденные темы">
          {metrics.topics.available ? (
            <p>{metrics.topics.titles.join("; ")}</p>
          ) : (
            <p>
              Недостаточно данных за этот месяц: темы проведённых занятий не
              указаны.
            </p>
          )}
        </MetricBlock>
        <MetricBlock title="Теория">
          {metrics.theory.available ? (
            <p>
              Завершено {metrics.theory.completed} из {metrics.theory.assigned}{" "}
              назначенных материалов.
            </p>
          ) : (
            <p>
              Недостаточно данных за этот месяц: теоретические материалы не
              назначались.
            </p>
          )}
        </MetricBlock>
      </div>
    </div>
  );
}
