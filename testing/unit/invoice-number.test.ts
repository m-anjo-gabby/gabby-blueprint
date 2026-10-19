import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInvoiceNumber } from '@gabby/lib/monthlyReport/buildInvoiceNumber';

/**
 * コーチ向けの請求書の番号。DB で採番せず、コーチと対象月から決まるため、
 * 同じ請求書を何度ダウンロードしても番号が変わらないこと（会計の記録として番号が変わると困る）。
 * 画面: docs/screens/admin/monthly-reports.md・docs/screens/coach/monthly-reports.md（請求書のPDF）
 */

const COACH_A = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const COACH_B = '9f8e7d6c-5b4a-4321-8fed-cba987654321';

test('請求書の番号: INV-年月-コーチIDの先頭8桁（大文字）', () => {
  assert.equal(buildInvoiceNumber(COACH_A, '2026-09-01'), 'INV-202609-1A2B3C4D');
  assert.equal(buildInvoiceNumber(COACH_B, '2026-12-01'), 'INV-202612-9F8E7D6C');
});

test('請求書の番号: 同じコーチ・同じ月なら常に同じ番号になる', () => {
  assert.equal(buildInvoiceNumber(COACH_A, '2026-09-01'), buildInvoiceNumber(COACH_A, '2026-09-01'));
  // 対象月は月の初日で渡すが、年月だけを使う（日・時刻が付いていても同じ番号）
  assert.equal(buildInvoiceNumber(COACH_A, '2026-09'), 'INV-202609-1A2B3C4D');
  assert.equal(buildInvoiceNumber(COACH_A, '2026-09-01T00:00:00+09:00'), 'INV-202609-1A2B3C4D');
});

test('請求書の番号: コーチか月が違えば番号も違う', () => {
  assert.notEqual(buildInvoiceNumber(COACH_A, '2026-09-01'), buildInvoiceNumber(COACH_B, '2026-09-01'));
  assert.notEqual(buildInvoiceNumber(COACH_A, '2026-09-01'), buildInvoiceNumber(COACH_A, '2026-10-01'));
});
