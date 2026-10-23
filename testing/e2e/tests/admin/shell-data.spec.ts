import { expect, test, type Page } from '@playwright/test';
import { ADMIN_BASE_URL, openAdminContext } from '../../support/adminApp.ts';
import { clickUntilVisible } from '../../support/hydration.ts';

/**
 * アドミンのシェル（ヘッダーの通知・サイドバーのチャット未読）の未読・件数は、レイアウトでサーバー取得して流し込み、
 * 画面を開いた後にブラウザからサーバーアクションで取りに行かない（docs/UI.md「ローディング表示」。apps/admin/lib/shellData.ts）。
 * 通知の画面は、アプリ内の移動で開くたびに最新を取り直す（useFetchOnMount）ため1回だけ呼ぶ。閲覧のみ（DBは変更しない）。
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'アドミンの画面は desktop のみ');
  test.slow();
});

/** 操作から通信が落ち着くまでに、ブラウザから呼ばれたサーバーアクション（Next-Action ヘッダー付きPOST）の数 */
async function countServerActions(page: Page, action: () => Promise<void>): Promise<number> {
  let count = 0;
  const onRequest = (request: { method(): string; headers(): Record<string, string> }) => {
    if (request.method() === 'POST' && request.headers()['next-action']) count += 1;
  };
  page.on('request', onRequest);
  await action();
  await page.waitForLoadState('networkidle');
  page.off('request', onRequest);
  return count;
}

const countServerActionsOnLoad = (page: Page, path: string): Promise<number> =>
  countServerActions(page, async () => {
    await page.goto(path, { waitUntil: 'networkidle' });
  });

test('主要画面を開いた時、シェルの未読・件数のためにブラウザからサーバーアクションを呼ばない', async ({ browser }) => {
  const { context, page } = await openAdminContext(browser);
  try {
    const counts: Record<string, number> = {};
    for (const path of ['/dashboard', '/clients', '/users', '/calendar-events']) {
      counts[path] = await countServerActionsOnLoad(page, path);
    }
    expect(counts).toEqual(Object.fromEntries(Object.keys(counts).map((path) => [path, 0])));

    // 通知の画面は、アプリ内の移動で開くとストアに残った一覧を使わず取り直す（1回）。取り直しが終わると一覧か「0件」の表示に置き換わる。
    // 直接開いた時は、ShellDataLoader が先にストアを取得中にしてサーバーで取得した通知を流し込むため、本番ビルドでは取り直さない
    // （dev では1回になることがあり、環境で回数が変わるため数えない）
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const viewAll = page.getByRole('menuitem', { name: /すべて見る/ });
    await clickUntilVisible(page.getByRole('button', { name: '通知', exact: true }), viewAll);
    const fetchCount = await countServerActions(page, async () => {
      await viewAll.click();
      await page.waitForURL('**/notification');
      await expect(page.locator('article').first().or(page.getByText('現在通知はありません'))).toBeVisible();
    });
    expect(fetchCount).toBe(1);
    await expect(page.getByRole('heading', { level: 1, name: '通知' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('サイドバーの権限で出し分けるメニューは、ハイドレーションを待たずに出る', async ({ browser }) => {
  const { context: loginContext } = await openAdminContext(browser);
  const storageState = await loginContext.storageState();
  await loginContext.close();
  // JavaScript を動かさないため、表示はサーバーの HTML のまま（後からストアで埋まる権限では通らない）
  const context = await browser.newContext({
    baseURL: ADMIN_BASE_URL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: false,
    storageState,
  });
  try {
    const page = await context.newPage();
    await page.goto('/dashboard');
    // 顧客はアドミンの権限が要るメニュー（apps/admin/lib/navigation.ts）
    await expect(page.locator('aside a[href="/clients"]')).toBeVisible();
  } finally {
    await context.close();
  }
});
