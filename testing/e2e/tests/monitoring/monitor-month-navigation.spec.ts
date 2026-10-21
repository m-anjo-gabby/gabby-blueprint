import type { Page } from '@playwright/test';
import { clickUntilVisible } from '../../support/hydration.ts';
import { storageStatePath } from '../../support/personas.ts';
import { expect, test } from '../../support/studentApp.ts';

/**
 * モニターの月の移動（仕様: e2e/specs/monitoring/student-monitor-dashboard.md フロー5・異常系 #3）
 * - 年月ピッカーで別の年月へ直接移動し、「今月に戻る」で当月へ戻る
 * - 受講生が0人の年月でも、月切替・年月選択・CSVボタンは表示されたまま
 *
 * 固定アカウントのモニター担当（生徒02）で閲覧だけを行う。受講生の件数には依存させず、
 * 受講生が確実にいない5年前の1月を「0人の月」として使う。月は日本時間（集計期間のタイムゾーン）で数える。
 */

test.use({ storageState: storageStatePath('monitorStudent') });

/** 日本時間の今月（YYYY-MM） */
function currentMonthInJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** 月切替に出る年月の表示（例: 2026年10月） */
const monthLabel = (page: Page, month: string) =>
  page.getByText(new RegExp(`^${month.slice(0, 4)}年\\s*${Number(month.slice(5, 7))}月$`));

const EMPTY_MESSAGE = 'この年月に該当する受講生が見つかりません';

/** 月切替・年月選択・CSVボタンが出ているか */
async function expectMonthControls(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '前月' })).toBeVisible();
  await expect(page.getByRole('button', { name: '翌月' })).toBeVisible();
  await expect(page.getByRole('button', { name: '年月を選択' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSVエクスポート' })).toBeVisible();
}

test('年月ピッカーで受講生のいない年月へ移っても月切替・年月選択・CSVボタンが残り、「今月に戻る」で当月へ戻る', async ({
  page,
}) => {
  const current = currentMonthInJst();
  const emptyYear = Number(current.slice(0, 4)) - 5;

  await page.goto('/monitor');
  await expect(monthLabel(page, current)).toBeVisible();
  await expectMonthControls(page);
  // 当月では「今月に戻る」は出ない
  await expect(page.getByRole('button', { name: '今月に戻る' })).toHaveCount(0);

  await test.step('年月ピッカーで5年前の1月を選ぶと、その月へ移る', async () => {
    const picker = page.getByRole('dialog');
    const prevYear = picker.getByRole('button', { name: '前年' });
    await clickUntilVisible(page.getByRole('button', { name: '年月を選択' }), prevYear);
    // 開いた時は表示中の年・月が選ばれている
    await expect(picker.getByText(`${current.slice(0, 4)}年`, { exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: `${Number(current.slice(5, 7))}月`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    for (let i = 0; i < 5; i++) await prevYear.click();
    await expect(picker.getByText(`${emptyYear}年`, { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '1月', exact: true }).click();
    await expect(prevYear).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`startDate=${emptyYear}-01-01`));
    await expect(monthLabel(page, `${emptyYear}-01`)).toBeVisible();
  });

  await test.step('受講生が0人でも、月切替・年月選択・CSVボタンは表示されたまま（CSVは押せない）', async () => {
    await expect(page.getByText(EMPTY_MESSAGE, { exact: false })).toBeVisible();
    await expectMonthControls(page);
    await expect(page.getByRole('button', { name: 'CSVエクスポート' })).toBeDisabled();
  });

  await test.step('「今月に戻る」で当月へ戻る', async () => {
    await page.getByRole('button', { name: '今月に戻る' }).click();
    await expect(monthLabel(page, current)).toBeVisible();
    await expect(page.getByText(EMPTY_MESSAGE, { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '今月に戻る' })).toHaveCount(0);
    await expectMonthControls(page);
  });
});
