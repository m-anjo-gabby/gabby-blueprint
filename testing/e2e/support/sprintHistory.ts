import type { Page } from "@playwright/test";
import { expect } from "./studentApp.ts";

/** 固定アカウントの学習履歴は毎月10日(JST)に投入されるため、確実に履歴がある前月を使う */
export function previousMonthInJst(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** スプリントの履歴から最初のスプリント結果（シェル画面）を開き、その self_sprint_id を返す */
export async function openSprintResultFromHistory(page: Page, month: string = previousMonthInJst()): Promise<string> {
  await page.goto(`/training/sprint/history?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: "スプリントの履歴" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`^${month.replace("-", "/")}/\\d{2}`) }).first().click();
  const sprintItem = page.locator('button[id^="session-"]').first();
  await sprintItem.click();

  await page.waitForURL(/\/training\/sprint\/history\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}
