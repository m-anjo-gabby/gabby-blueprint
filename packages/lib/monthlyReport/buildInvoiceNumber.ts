/**
 * コーチ向け請求書(INVOICE)PDFの請求書番号を、(coachId, reportMonth)から決定的に生成する。
 * DB側に採番カウンタを持たせず、常に同じ入力から同じ番号が再現されるようにすることで、
 * 再ダウンロードのたびに番号が変わってしまう事態を避ける（会計記録として同一取引の
 * 請求書番号が変動するのは望ましくないため）。
 * 例: coachId="1a2b3c4d-...", reportMonth="2026-09-01" → "INV-202609-1A2B3C4D"
 */
export function buildInvoiceNumber(coachId: string, reportMonth: string): string {
  const yearMonth = reportMonth.replace(/-/g, '').slice(0, 6);
  const coachSuffix = coachId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `INV-${yearMonth}-${coachSuffix}`;
}
