import {
  formatFeedbackPeriod,
  type MonthlyFeedbackMetrics,
} from "@/lib/monthly-feedback";

export const FEEDBACK_PROMPT_INSTRUCTIONS = `Ты готовишь индивидуальную ежемесячную обратную связь родителю ученика онлайн-школы.

Используй исключительно переданные факты и числа. Не придумывай отсутствующие показатели, причины ошибок, поведение ученика, результаты экзамена, прогноз баллов, выполненные или невыполненные домашние задания, посещаемость и оценки.

Разделяй объективные метрики и профессиональные наблюдения преподавателя. Комментарий преподавателя — источник профессиональных наблюдений. Метрики — источник объективных числовых данных. Если они кажутся противоречивыми, не скрывай противоречие и не придумывай объяснение.

Объясняй динамику результатов только при наличии сопоставимых измерений. Если выборка небольшая или данных нет, не делай уверенных выводов. Не путай отсутствие данных с нулевым результатом.

Не превращай отчёт в сухую таблицу и не перечисляй все цифры без объяснения. Не упоминай каждую переданную цифру: важны смысл, точность и понятность.

Не используй канцелярит, шаблонные похвалы и искусственный позитив. Не преувеличивай прогресс и не драматизируй трудности. Не делай выводов о причинах низкого результата, если причина не указана в исходных данных.

Формулируй рекомендации на следующий месяц на основе выявленных затруднений и комментария преподавателя.

Пиши естественным, спокойным, профессиональным языком, понятным родителю. Избегай чрезмерно длинного текста и повторений.

Рекомендуемая структура:
1. Краткий итог месяца.
2. Сильные стороны и заметный прогресс.
3. Трудности и зоны развития.
4. Рекомендации и план работы на следующий месяц.

Если данных для отдельного раздела недостаточно, не заполняй его выдуманным содержанием. При необходимости аккуратно укажи, что объективных данных недостаточно.`;

function percentLabel(value: number | null): string {
  if (value == null) return "нет числовой оценки";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}%`;
}

export function formatFeedbackMetricsForPrompt(
  metrics: MonthlyFeedbackMetrics | null
): string {
  if (!metrics) {
    return "Объективные показатели: снимок метрик недоступен. Не выдумывай посещаемость, домашние задания, темы и результаты.";
  }

  const lines: string[] = [];
  const { lessons, homework, topics, theory } = metrics;

  if (!lessons.available) {
    lines.push(
      "Занятия: недостаточно данных за этот месяц (занятий ученика с этим преподавателем в периоде не найдено)."
    );
  } else {
    lines.push(
      `Занятия: запланировано ${lessons.scheduled}; проведено ${lessons.occurred}; посещено ${lessons.present} из ${lessons.occurred} проведённых.`
    );
    lines.push(
      `Пропуски и отмены: отменено ${lessons.cancelled}; перенесено ${lessons.rescheduled}; уважительных пропусков ${lessons.absentExcused}; неуважительных пропусков ${lessons.absentUnexcused}; без отметки посещаемости ${lessons.unmarked}; ещё запланировано ${lessons.plannedRemaining}.`
    );
  }

  if (!homework.available) {
    lines.push(
      "Домашние задания: недостаточно данных за этот месяц (выданных домашних заданий за период не найдено)."
    );
  } else {
    lines.push(
      `Домашние задания: выдано ${homework.assigned}; выполнено ${homework.completed}; просрочено ${homework.overdue}; в работе ${homework.inProgress}.`
    );
    const scored = homework.scores.filter((s) => s.usedPercent != null);
    if (scored.length === 0) {
      lines.push(
        "Результаты домашних тестов: числовых оценок за этот месяц нет. Не придумывай проценты и баллы."
      );
    } else {
      lines.push(
        `Результаты домашних тестов: средний процент ${percentLabel(homework.averagePercent)} по ${scored.length} работам с оценкой.`
      );
      for (const score of scored) {
        const attempts = [
          score.attempt1Percent != null
            ? `попытка 1 — ${percentLabel(score.attempt1Percent)}`
            : null,
          score.attempt2Percent != null
            ? `попытка 2 — ${percentLabel(score.attempt2Percent)}`
            : null,
        ].filter(Boolean);
        lines.push(`- ${score.title}: ${attempts.join("; ")}.`);
      }
    }
    if (homework.previousComparable) {
      lines.push(
        `Динамика домашних тестов: предыдущий месяц ${percentLabel(homework.previousAveragePercent)}, текущий месяц ${percentLabel(homework.averagePercent)}. Это сопоставимые измерения.`
      );
    } else {
      lines.push(
        "Динамика домашних тестов: сопоставимых измерений за предыдущий месяц нет. Не описывай прогресс или спад по баллам."
      );
    }
  }

  if (!topics.available) {
    lines.push(
      "Пройденные темы: недостаточно данных за этот месяц (темы проведённых занятий не указаны)."
    );
  } else {
    lines.push(`Пройденные темы: ${topics.titles.join("; ")}.`);
  }

  if (!theory.available) {
    lines.push(
      "Теория: недостаточно данных за этот месяц (назначенных теоретических материалов не найдено)."
    );
  } else {
    lines.push(
      `Теория: завершено ${theory.completed} из ${theory.assigned} назначенных материалов.`
    );
  }

  lines.push(
    "Отдельных контрольных, пробников и экзаменов в исходных данных нет. Не добавляй их."
  );

  return lines.join("\n");
}

export function buildFeedbackPrompt(input: {
  studentName: string;
  periodYear: number;
  periodMonth: number;
  teacherComment: string;
  metrics: MonthlyFeedbackMetrics | null;
}): string {
  const period = formatFeedbackPeriod(input.periodYear, input.periodMonth);
  const comment = input.teacherComment.trim() || "Комментарий преподавателя не передан.";
  const metricsBlock = formatFeedbackMetricsForPrompt(input.metrics);

  return `${FEEDBACK_PROMPT_INSTRUCTIONS}

---
Данные ученика
Имя ученика: ${input.studentName}
Отчётный месяц: ${period}

${metricsBlock}

Комментарий преподавателя:
${comment}
`;
}
