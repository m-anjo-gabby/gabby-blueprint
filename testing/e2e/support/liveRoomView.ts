import type { Locator, Page } from "@playwright/test";
import { expect } from "./studentApp.ts";

/**
 * 生徒のライブセッションホーム（`/live-room`）の確認と、日本時間の日時の組み立て
 * （ライブセッションのジャーニー〔日程変更・アドミンの運用対応〕で共有する）。
 * 生徒・コーチ・アドミンのブラウザはいずれも日本時間で開く前提。
 */

const TZ = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;
const LESSON_MS = 25 * 60 * 1000;

export interface JstSlot {
  /** 日付入力の値（YYYY-MM-DD） */
  date: string;
  /** 時刻の選択肢（HH:MM） */
  time: string;
  startIso: string;
  endIso: string;
}

/** 日本時間の date（YYYY-MM-DD）の hh:mm から25分の枠 */
export function jstSlotOn(date: string, time: string): JstSlot {
  const start = new Date(`${date}T${time}:00+09:00`);
  return { date, time, startIso: start.toISOString(), endIso: new Date(start.getTime() + LESSON_MS).toISOString() };
}

/** 日本時間で今日から days 日後の hh:mm から25分の枠 */
export function jstSlot(days: number, time: string): JstSlot {
  return jstSlotOn(jstDateOf(new Date(Date.now() + days * DAY_MS).toISOString()), time);
}

/** 日時（ISO）の日本時間の日付（YYYY-MM-DD） */
export function jstDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

/** 生徒の画面の予定の表記（apps/student/lib/sessionFormat.ts の formatSessionSlot と同じ。日付と時刻は別の要素のため続けて書く） */
export function studentSlotText(startIso: string, endIso: string): string {
  const date = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" }).format(new Date(startIso));
  const time = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${date}${time.format(new Date(startIso))}〜${time.format(new Date(endIso))}`;
}

/** 契約の状況の回数の内訳（バーの読み上げ名。省いた区分は0回） */
export function liveRoomBreakdown(
  page: Page,
  counts: { completed?: number; lateCancelled?: number; scheduled: number; adjusting?: number; unbooked?: number; coachUnselected?: number }
): Locator {
  const { completed = 0, lateCancelled = 0, scheduled, adjusting = 0, unbooked = 0, coachUnselected = 0 } = counts;
  return page.getByRole("img", {
    name: `実施済み${completed}回、直前キャンセル${lateCancelled}回、予約済み${scheduled}回、調整中${adjusting}回、未予約${unbooked}回、コーチ未選択${coachUnselected}回`,
  });
}

/** 「次回のセッション」の区画（見出しと本文のカードを包む要素） */
export const nextSessionSection = (page: Page): Locator =>
  page.getByRole("heading", { level: 2, name: "次回のセッション" }).locator("xpath=../..");

export async function openLiveRoom(page: Page): Promise<void> {
  await page.goto("/live-room");
  await expect(page.getByRole("heading", { level: 1, name: "ライブセッション" })).toBeVisible();
}

/**
 * キャンセル・予約リクエストのダイアログ（生徒・コーチ共通の部品）で、n 番目の候補の日付・時刻を入れ、
 * 相手の予定との重なりの確認が終わるのを待つ
 */
export async function fillSlot(dialog: Locator, index: number, slot: { date: string; time: string }): Promise<void> {
  await dialog.locator("input[type=date]").nth(index).fill(slot.date);
  await dialog.locator("select").nth(index).selectOption(slot.time);
  await expect(dialog.getByText(/確認中…|Checking…/)).toHaveCount(0);
}
