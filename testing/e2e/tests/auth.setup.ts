import { test as setup, expect } from "@playwright/test";
import { PERSONAS, getPersonaPassword, storageStatePath, type PersonaKey } from "../support/personas.ts";
import { agreeToPendingTerms } from "../support/studentApp.ts";

/**
 * 各ペルソナで1回だけログインし、ログイン状態を保存する（各テストでのログイン処理を省く）。
 * 未同意の最新規約があれば、この時点で同意しておく。
 */
for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
  setup(`ログイン: ${key}`, async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name=email]").fill(PERSONAS[key].email);
    await page.locator("input[name=password]").fill(getPersonaPassword());
    await page.locator("input[name=password]").press("Enter");
    await page.waitForURL("**/dashboard");

    await expect(page.locator("main")).toBeVisible();
    const agreed = await agreeToPendingTerms(page);
    if (agreed) console.log(`[setup] ${key}: 最新規約に同意しました`);

    await page.context().storageState({ path: storageStatePath(key) });
  });
}
