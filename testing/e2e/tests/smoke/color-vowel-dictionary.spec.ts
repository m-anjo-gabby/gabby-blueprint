import { storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";
import { openSprintResultFromHistory } from "../../support/sprintHistory.ts";

/**
 * スモーク: Color Vowel 辞書のシート（docs/screens/student/training/sprint-result.md「辞書シートの表示」）。
 * スプリント結果の英文の単語をタップ →「Color Vowelを検索」→ 下から出るシートに見出し・音素表記・音声ボタン・Color Vowel の説明が出る。
 * 発音記号（IPA）は表示しない。閲覧のみ（DBは変更しない）。
 */

// 辞書に必ず登録されている機能語（教材の英文にほぼ必ず含まれる）
const COMMON_WORD = /^(the|to|a|for|you|of|and)$/i;

test.describe("Color Vowel 辞書", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("単語をタップして検索すると、シートに音素表記と Color Vowel が表示される", async ({ page }) => {
    await openSprintResultFromHistory(page);

    const word = page.locator("[data-lookup-word]").filter({ hasText: COMMON_WORD }).first();
    await word.click();
    await page.getByRole("button", { name: "Color Vowelを検索" }).click();

    const sheet = page.getByRole("dialog", { name: "Color Vowel辞書" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(sheet.getByText("音素", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "単語を再生" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "母音を再生" })).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 4, name: /の発音$/ })).toBeVisible();
    // 発音記号（IPA）の /…/ は出さない
    await expect(sheet.getByText(/^\/.+\/$/)).toHaveCount(0);

    await sheet.getByRole("button", { name: "閉じる" }).click();
    await expect(sheet).toBeHidden();
  });
});
