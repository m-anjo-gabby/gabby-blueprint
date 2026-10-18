import type { Locator, Page } from '@playwright/test';
import { QA_ADMIN_EMAIL, openAdminContext, openDialogBy } from '../../support/adminApp.ts';
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createDisposableStudent,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { expect, test } from '../../support/studentApp.ts';

/**
 * 無効化したライセンスはライセンスの期間の重複チェックに含めない（仕様書: e2e/specs/admin/license-assignment.md #1〜#3）。
 * 画面からの無効化で、ライセンスが停止し、無効化前の内容が変更履歴に残り、割当数（枠）は戻らないことも確かめる。
 *
 * テナントを間違えて作った生徒を正しい顧客へ付け替え、元の顧客のライセンスを無効化した後に、
 * 同じ期間の正しい顧客の契約を割り当てられることを、ユーザー管理・契約管理の両方の画面で確かめる。
 * 有効なライセンスと期間が重なる場合は、従来どおり理由を示して割当・変更できないことも確かめる。
 * 使い捨ての顧客を2つ（付け替え前 = A、付け替え後 = B）作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'LicOverlap2026a';
const DAY_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MESSAGE = /このユーザーは既に期間が重なるライセンス「.+」（.+〜.+）を保有しているため割当できません/;

let fixtures: AuthFixture[] = [];
let movedUserIds: string[] = [];

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  const [a, ...others] = fixtures;
  // 付け替えた生徒を元の顧客へ戻してから消す（生徒が所属したままだと付け替え後の顧客を消せない）
  if (a && movedUserIds.length > 0) {
    await a.admin.from('com_m_user').update({ client_id: a.clientId }).in('id', movedUserIds);
  }
  for (const f of others) await cleanupAuthFixture(f);
  await cleanupAuthFixture(a);
  fixtures = [];
  movedUserIds = [];
});

/** 日本時間で今日から days 日後の日付（YYYY-MM-DD） */
const jstDate = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(Date.now() + days * DAY_MS));
/** 契約・ライセンスの期間（アプリと同じく、開始日の 0:00〜終了日の 23:59:59.999、日本時間） */
const jstPeriod = (startDays: number, endDays: number) => ({
  start: new Date(`${jstDate(startDays)}T00:00:00+09:00`),
  end: new Date(`${jstDate(endDays)}T23:59:59.999+09:00`),
});
const contractName = (f: AuthFixture, label: string) => `【QAテスト】認証E2E（${f.tag}）${label}`;

/**
 * 顧客A・Bを作り、Aの契約のライセンス（無効化済み）を持つ生徒をBへ付け替えた状態にする。
 * Aのライセンスの期間（30日前〜90日後）は、Bの契約（今日〜60日後）と重なる。
 */
async function prepareMovedStudents(kinds: string[]) {
  const a = await createAuthFixture('licmovea');
  fixtures.push(a);
  const b = await createAuthFixture('licmoveb');
  fixtures.push(b);

  const oldPeriod = jstPeriod(-30, 90);
  const { contractId: oldContractId } = await createDisposableContract(a, {
    planCode: 'BLUEPRINT_ONLY',
    label: '誤り',
    maxLicenses: kinds.length,
    ...oldPeriod,
  });
  const students = await Promise.all(
    kinds.map(async (kind) => {
      const userName = `E2E付け替え（${kind}・${a.tag}）`;
      const userId = await createDisposableStudent(a, {
        email: `${a.tag}-${kind}@${DISPOSABLE_EMAIL_DOMAIN}`,
        password: PASSWORD,
        userName,
      });
      const { error } = await a.admin.from('com_t_user_license').insert({
        contract_id: oldContractId,
        user_id: userId,
        status: 0,
        start_date: oldPeriod.start.toISOString(),
        end_date: oldPeriod.end.toISOString(),
      });
      if (error) throw new Error(`無効化済みライセンスの作成に失敗しました: ${error.message}`);
      const { error: moveError } = await a.admin.from('com_m_user').update({ client_id: b.clientId }).eq('id', userId);
      if (moveError) throw new Error(`顧客の付け替えに失敗しました: ${moveError.message}`);
      movedUserIds.push(userId);
      return { userId, userName };
    }),
  );
  return { a, b, students };
}

/** 生徒のライセンス（契約ID・状態・期間）を開始日順に取得する */
async function licensesOf(f: AuthFixture, userId: string) {
  const { data, error } = await f.admin
    .from('com_t_user_license')
    .select('license_id, contract_id, status, start_date, end_date')
    .eq('user_id', userId)
    .order('start_date');
  if (error) throw new Error(`ライセンスの取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/** ライセンス管理ダイアログ（ユーザー管理）の「一覧・履歴」の1件 */
const historyItem = (dialog: Locator, page: Page, name: string) =>
  dialog
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button') })
    .last();

test('ユーザー管理: 無効化済みのライセンスと期間が重なる別の顧客の契約を割り当てられ、有効なライセンスと重なる変更は理由を示して拒否する', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const {
    b,
    students: [student],
  } = await prepareMovedStudents(['user']);
  const newPeriod = jstPeriod(0, 60);
  const { contractId: newContractId } = await createDisposableContract(b, {
    planCode: 'BLUEPRINT_ONLY',
    label: '正しい',
    maxLicenses: 2,
    ...newPeriod,
  });
  const { context, page } = await openAdminContext(browser);

  try {
    await test.step('1. 無効化済みのライセンスと期間が重なる契約が選択肢に出て、割り当てられる', async () => {
      await page.goto(`/users/${student.userId}`);
      const dialog = await openDialogBy(page, page.getByRole('button', { name: '管理' }));
      // 読み込みが終わるとダイアログが「一覧・履歴」タブに切り替えるため、一覧が出てからタブを移る
      await expect(dialog.getByText('無効化済み')).toBeVisible();
      await dialog.getByRole('tab', { name: '新規割当' }).click();
      await dialog.getByRole('combobox').click();
      await page
        .getByRole('option')
        .filter({ hasText: contractName(b, '正しい') })
        .click();
      await dialog.getByRole('button', { name: 'ライセンスを割当' }).click();
      await expect(page.getByText('ライセンスを割当しました')).toBeVisible();

      const licenses = await licensesOf(b, student.userId);
      const assigned = licenses.find((l) => l.contract_id === newContractId);
      expect(assigned?.status).toBe(1);
      expect(new Date(assigned!.start_date).getTime()).toBe(newPeriod.start.getTime());
      expect(new Date(assigned!.end_date).getTime()).toBe(newPeriod.end.getTime());
      // 無効化済みのライセンスはそのまま残る
      expect(licenses.filter((l) => l.status === 0)).toHaveLength(1);
    });

    await test.step('2. 有効なライセンスと期間が重なる変更は、重なる契約名を示して拒否する', async () => {
      // 次期のライセンス（61日後〜120日後）を別の契約で持たせる
      const nextPeriod = jstPeriod(61, 120);
      const { contractId: nextContractId } = await createDisposableContract(b, {
        planCode: 'BLUEPRINT_ONLY',
        label: '次期',
        ...nextPeriod,
      });
      const { error } = await b.admin.from('com_t_user_license').insert({
        contract_id: nextContractId,
        user_id: student.userId,
        status: 1,
        start_date: nextPeriod.start.toISOString(),
        end_date: nextPeriod.end.toISOString(),
      });
      if (error) throw new Error(`次期のライセンスの作成に失敗しました: ${error.message}`);

      await page.reload();
      const dialog = await openDialogBy(page, page.getByRole('button', { name: '管理' }));
      await historyItem(dialog, page, contractName(b, '正しい')).getByRole('button').first().click();
      await dialog.locator('input[type=date]').nth(1).fill(jstDate(90));
      await dialog.getByRole('button', { name: '更新を保存' }).click();
      await expect(page.getByText(OVERLAP_MESSAGE)).toBeVisible();
      await expect(page.getByText(OVERLAP_MESSAGE)).toContainText(contractName(b, '次期'));
      await expect(page.getByText('ライセンス情報を更新しました')).toHaveCount(0);

      const current = (await licensesOf(b, student.userId)).find((l) => l.contract_id === newContractId);
      expect(new Date(current!.end_date).getTime()).toBe(newPeriod.end.getTime());
    });
  } finally {
    await context.close();
  }
});

test('契約管理: 無効化済みのライセンスだけを持つ生徒は追加でき、有効なライセンスと期間が重なる生徒は理由を示して拒否する', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const {
    b,
    students: [inactiveOnly, activeOverlap],
  } = await prepareMovedStudents(['inactive', 'active']);
  const newPeriod = jstPeriod(0, 60);
  const { contractId: newContractId } = await createDisposableContract(b, {
    planCode: 'BLUEPRINT_ONLY',
    label: '正しい',
    maxLicenses: 2,
    ...newPeriod,
  });
  // 2人目は付け替え後の顧客で、期間の重なる有効なライセンスも持つ
  const otherPeriod = jstPeriod(-10, 30);
  const { contractId: otherContractId } = await createDisposableContract(b, {
    planCode: 'BLUEPRINT_ONLY',
    label: '有効',
    ...otherPeriod,
  });
  const { error } = await b.admin.from('com_t_user_license').insert({
    contract_id: otherContractId,
    user_id: activeOverlap.userId,
    status: 1,
    start_date: otherPeriod.start.toISOString(),
    end_date: otherPeriod.end.toISOString(),
  });
  if (error) throw new Error(`有効なライセンスの作成に失敗しました: ${error.message}`);

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/contracts?clientId=${b.clientId}`);
    const row = page.getByRole('row').filter({ hasText: contractName(b, '正しい') });
    // 追加に成功すると一覧が再描画されてダイアログが閉じるため、手順ごとに開き直す
    const openAddMode = async () => {
      const dialog = await openDialogBy(page, row.getByText('/ 2', { exact: true }));
      await dialog.getByRole('button', { name: 'ユーザーを追加' }).click();
      return dialog;
    };
    const candidate = (dialog: Locator, userName: string) =>
      dialog
        .locator('div')
        .filter({ has: page.getByText(userName, { exact: true }) })
        .filter({ has: page.getByRole('button', { name: '追加' }) })
        .last();

    await test.step('1. 無効化済みのライセンスだけを持つ生徒は追加できる', async () => {
      await candidate(await openAddMode(), inactiveOnly.userName)
        .getByRole('button', { name: '追加' })
        .click();
      await expect(page.getByText('ユーザーを追加しました')).toBeVisible();
      const licenses = await licensesOf(b, inactiveOnly.userId);
      expect(licenses.find((l) => l.contract_id === newContractId)?.status).toBe(1);
    });

    await test.step('2. 有効なライセンスと期間が重なる生徒は、重なる契約名を示して拒否する', async () => {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await candidate(await openAddMode(), activeOverlap.userName)
        .getByRole('button', { name: '追加' })
        .click();
      await expect(page.getByText(OVERLAP_MESSAGE)).toBeVisible();
      await expect(page.getByText(OVERLAP_MESSAGE)).toContainText(contractName(b, '有効'));
      const licenses = await licensesOf(b, activeOverlap.userId);
      expect(licenses.some((l) => l.contract_id === newContractId)).toBe(false);
    });
  } finally {
    await context.close();
  }
});

test('ユーザー管理: 無効化するとライセンスが停止し、無効化前の内容が変更履歴に残り、枠は戻らない', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('licinvalidate');
  fixtures.push(f);
  const period = jstPeriod(-10, 60);
  const { contractId } = await createDisposableContract(f, { planCode: 'BLUEPRINT_ONLY', label: '無効化', ...period });
  const userId = await createDisposableStudent(f, {
    email: `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: `E2E無効化（${f.tag}）`,
  });
  const { data: license, error } = await f.admin
    .from('com_t_user_license')
    .insert({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: period.start.toISOString(),
      end_date: period.end.toISOString(),
      note: 'E2E備考',
    })
    .select('license_id')
    .single();
  if (error) throw new Error(`ライセンスの作成に失敗しました: ${error.message}`);

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/users/${userId}`);
    const dialog = await openDialogBy(page, page.getByRole('button', { name: '管理' }));
    // 有効なライセンスの操作は「編集」「無効化」の順に並ぶ
    await historyItem(dialog, page, contractName(f, '無効化')).getByRole('button').nth(1).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '無効化する' }).click();
    await expect(page.getByText('ライセンスを無効化しました')).toBeVisible();
    await expect(dialog.getByText('無効化済み')).toBeVisible();

    const [current] = await licensesOf(f, userId);
    expect(current.status).toBe(0);

    // 無効化前の内容（有効・期間・備考）が、操作した管理者とともに残る
    const { data: history } = await f.admin
      .from('com_t_user_license_history')
      .select('action, status, start_date, end_date, note, performed_by')
      .eq('license_id', license.license_id);
    expect(history).toHaveLength(1);
    const [entry] = history!;
    expect(entry).toMatchObject({ action: 'invalidated', status: 1, note: 'E2E備考' });
    expect(new Date(entry.start_date).getTime()).toBe(period.start.getTime());
    expect(new Date(entry.end_date).getTime()).toBe(period.end.getTime());
    const { data: performer } = await f.admin.auth.admin.getUserById(entry.performed_by!);
    expect(performer.user?.email).toBe(QA_ADMIN_EMAIL);

    // 無効化しても割当数（枠）は戻らない
    const { data: contract } = await f.admin
      .from('vw_contract_details')
      .select('remaining_licenses')
      .eq('contract_id', contractId)
      .single();
    expect(contract?.remaining_licenses).toBe(0);
  } finally {
    await context.close();
  }
});
