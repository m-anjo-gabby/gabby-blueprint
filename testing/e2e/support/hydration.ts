import { expect, type Locator } from "@playwright/test";

/**
 * 押すと何かが表示される操作（ダイアログ・確認画面・次の段階の画面）を、表示されるまで押す。
 * 本番ビルド（ステージングの Vercel）はサーバーで描いた画面が先に表示されるため、画面の部品が動き出す前（ハイドレーション前）に
 * 押すと操作が無視される（KJ-2026-1003-03）。表示されたことを確かめ、表示されなければ押し直す。
 * 押した結果が別の画面への移動など「押し直すと二重になる」操作には使わない。
 */
export async function clickUntilVisible(trigger: Locator, target: Locator, timeout = 30_000): Promise<void> {
  await expect(async () => {
    // 押した後に表示までの処理（通信）が長いと、押し直しの時点でボタンが無効・消えていることがある。待ち続けず次の確認へ進む
    if (!(await target.isVisible())) await trigger.click({ timeout: 2_000 });
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
}
