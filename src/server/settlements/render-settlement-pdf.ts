import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

export type SettlementPdfInput = {
  documentTitle: string;
  sequentialNumber: number;
  issuedAt: Date;
  settlementSign: "приход" | "возврат прихода";
  operatorLegalName: string;
  operatorFio: string;
  inn: string;
  ogrnip: string;
  taxSystem: string;
  siteUrl: string;
  serviceName: string;
  amount: number;
  currency: string;
  vatNote: string;
  paymentForm: string;
  settlerPosition: string;
  settlerSurname: string;
  /** Для возврата — номер исходного документа «приход». */
  originalSequentialNumber?: number | null;
};

function fontPaths(): { regular: string; bold: string } {
  const root = process.cwd();
  const assetsRegular = path.join(root, "assets", "fonts", "DejaVuSans.ttf");
  const assetsBold = path.join(root, "assets", "fonts", "DejaVuSans-Bold.ttf");
  if (fs.existsSync(assetsRegular) && fs.existsSync(assetsBold)) {
    return { regular: assetsRegular, bold: assetsBold };
  }
  const npmRegular = path.join(
    root,
    "node_modules",
    "dejavu-fonts-ttf",
    "ttf",
    "DejaVuSans.ttf"
  );
  const npmBold = path.join(
    root,
    "node_modules",
    "dejavu-fonts-ttf",
    "ttf",
    "DejaVuSans-Bold.ttf"
  );
  if (fs.existsSync(npmRegular) && fs.existsSync(npmBold)) {
    return { regular: npmRegular, bold: npmBold };
  }
  throw new Error(
    "Шрифты DejaVuSans не найдены (assets/fonts или dejavu-fonts-ttf)"
  );
}

function formatIssuedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}:${get("second")} (UTC+5)`;
}

function formatMoney(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === "RUB") return `${formatted} ₽`;
  return `${formatted} ${currency}`;
}

function row(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  fonts: { regular: string; bold: string }
) {
  doc.font(fonts.bold).fontSize(10).fillColor("#111").text(label, {
    continued: false,
  });
  doc.font(fonts.regular).fontSize(11).fillColor("#222").text(value, {
    indent: 12,
  });
  doc.moveDown(0.55);
}

export async function renderSettlementPdf(
  input: SettlementPdfInput
): Promise<{ bytes: Buffer; sha256: string }> {
  const fonts = fontPaths();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: {
      Title: `${input.documentTitle} № ${input.sequentialNumber}`,
      Author: input.operatorLegalName,
      Subject: input.settlementSign,
      /** Дублируем формулировку НДС в метаданных (для контроля; в теле — строка «НДС»). */
      Keywords: `НДС: ${input.vatNote}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font(fonts.bold).fontSize(16).fillColor("#111").text(input.documentTitle, {
    align: "center",
  });
  doc.moveDown(0.4);
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#444")
    .text(
      "Документ, подтверждающий факт расчёта (п. 2.1 ст. 2 Федерального закона № 54-ФЗ)",
      { align: "center" }
    );
  doc.moveDown(1.2);

  row(doc, "Номер документа", String(input.sequentialNumber), fonts);
  row(doc, "Дата и время расчёта", formatIssuedAt(input.issuedAt), fonts);
  row(doc, "Адрес осуществления расчёта", input.siteUrl, fonts);
  row(doc, "Пользователь", input.operatorLegalName, fonts);
  row(doc, "ФИО", input.operatorFio, fonts);
  row(doc, "ИНН", input.inn, fonts);
  row(doc, "ОГРНИП", input.ogrnip, fonts);
  row(doc, "Система налогообложения", input.taxSystem, fonts);
  row(doc, "Признак расчёта", input.settlementSign, fonts);
  row(doc, "Наименование услуги", input.serviceName, fonts);
  row(doc, "Сумма расчёта", formatMoney(input.amount, input.currency), fonts);
  row(doc, "НДС", input.vatNote, fonts);
  row(doc, "Форма расчёта", input.paymentForm, fonts);
  row(
    doc,
    "Лицо, осуществившее расчёт",
    `${input.settlerPosition} ${input.settlerSurname}`,
    fonts
  );

  if (
    input.settlementSign === "возврат прихода" &&
    input.originalSequentialNumber != null
  ) {
    row(
      doc,
      "Документ основания (приход)",
      `№ ${input.originalSequentialNumber}`,
      fonts
    );
  }

  doc.moveDown(1.2);
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor("#666")
    .text(
      "Документ сформирован автоматически и не подлежит изменению после создания. Хранится в личном кабинете плательщика / ученика и в Дирекции.",
      { align: "left" }
    );

  doc.end();
  const bytes = await done;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256 };
}
