import { expect, test, type Page } from '@playwright/test';
import { openAdminContext } from '../../support/adminApp.ts';

/**
 * アドミンのシェル（ヘッダーの通知・サイドバーのチャット未読）の未読・件数は、レイアウトでサーバー取得して流し込み、
 * 画面を開いた後にブラウザからサーバーアクションで取りに行かない（CLAUDE.md「ローディング表示」。apps/admin/lib/shellData.ts）。
 * 通知の画面は、開くたびに最新を取り直す（useFetchOnMount）ため1回だけ呼ぶ。閲覧のみ（DBは変更しない）。
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'アドミンの画面は desktop のみ');
  test.slow();
});

/** ページを直接開き、通信が落ち着くまでにブラウザから呼ばれたサーバーアクション（Next-Action ヘッダー付きPOST）の数 */
async function countServerActionsOnLoad(page: Page, path: string): Promise<number> {
  let count = 0;
  const onRequest = (request: { method(): string; headers(): Record<string, string> }) => {
    if (request.method() === 'POST' && request.headers()['next-action']) count += 1;
  };
  page.on('request', onRequest);
  await page.goto(path, { waitUntil: 'networkidle' });
  page.off('request', onRequest);
  return count;
}

test('主要画面を開いた時、シェルの未読・件数のためにブラウザからサーバーアクションを呼ばない', async ({ browser }) => {
  const { context, page } = await openAdminContext(browser);
  try {
    const counts: Record<string, number> = {};
    for (const path of ['/dashboard', '/clients', '/users', '/calendar-events']) {
      counts[path] = await countServerActionsOnLoad(page, path);
    }
    expect(counts).toEqual(Object.fromEntries(Object.keys(counts).map((path) => [path, 0])));

    // 通知の画面は開くたびに最新を取り直す（1回）。取り直しが終わると一覧か「0件」の表示に置き換わる。
    // dev サーバーでは初めて開いた時の画面のコンパイルで読み込み直しが起き、取り直しが重なるため、一度開いてから数える
    await page.goto('/notification', { waitUntil: 'networkidle' });
    expect(await countServerActionsOnLoad(page, '/notification')).toBe(1);
    await expect(page.getByRole('heading', { level: 1, name: '通知' })).toBeVisible();
    await expect(page.locator('article').first().or(page.getByText('現在通知はありません'))).toBeVisible();
  } finally {
    await context.close();
  }
});
