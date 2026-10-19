import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantAppLicense,
  prepareContent,
  prepareWordContent,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';

/**
 * 自主トレーニングの通算値・連続日数・達成の通知（仕様: e2e/specs/training/training-stats.md 異常系 #1〜#6・#8）
 *
 * - 通算値（データ主体テスト）: 使い捨ての生徒（タイムゾーンは既定の日本時間）の本人のJWTで、
 *   単語帳・ドリルの記録（`increment_word_summary`・`increment_sprint_summary`）とタイムアタックの記録（`self_t_sprint`）を作り、
 *   `student_m_training_lifetime_stats` を確かめる。RPC は現在の日付で記録するため、過去の日付・日付の境界は
 *   実施日時を指定できるタイムアタックの記録で作る（INSERT トリガーが生徒のタイムゾーンの日付で通算値を更新する）。
 * - ホームの連続日数（#5）: 通算値を直接作り、「n日連続」の有無を画面で確かめる。
 * - 記録・通算値・通知はユーザーの削除で消える。
 */

const PASSWORD = 'Lifetime2026a';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 日本時間の今日から offset 日ずらした日付（YYYY-MM-DD） */
function jstDate(offset: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + offset * DAY_MS).toISOString().slice(0, 10);
}

interface LifetimeStats {
  total_active_days: number;
  current_streak_days: number;
  first_training_date: string | null;
  last_training_date: string | null;
  total_words: number;
  total_phrases: number;
  total_assessments: number;
  total_sprint_sessions: number;
  total_sprint_answers: number;
}

test.describe('使い捨てのアプリのみ契約の生徒', () => {
  let fixture: AuthFixture | undefined;
  let studentClient: SupabaseClient | undefined;

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '使い捨てデータを作るため desktop だけで実行する');
    test.setTimeout(120_000);
  });

  test.afterEach(async () => {
    if (studentClient) await signOutRole(studentClient);
    studentClient = undefined;
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  async function createStudent(prefix: string): Promise<{ f: AuthFixture; userId: string; email: string }> {
    const f = await createAuthFixture(prefix);
    fixture = f;
    const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
    const userId = await createDisposableStudent(f, { email, password: PASSWORD });
    await grantAppLicense(f, userId);
    return { f, userId, email };
  }

  test('通算値は生徒のタイムゾーンの日付で、同じ日は1日分・日付の境界で2日分・空くと連続が1に戻り・過去の日付では日数が変わらない', async () => {
    const { f, userId, email } = await createStudent('lifest');
    const word = await prepareWordContent(f);
    const sprint = await prepareContent(f, 2);
    const student = await signInAsRole(email, PASSWORD);
    studentClient = student;

    const readStats = async (): Promise<LifetimeStats> => {
      const { data, error } = await f.admin
        .from('student_m_training_lifetime_stats')
        .select(
          'total_active_days, current_streak_days, first_training_date, last_training_date, total_words, total_phrases, total_assessments, total_sprint_sessions, total_sprint_answers',
        )
        .eq('user_id', userId)
        .single();
      if (error) throw new Error(`通算値の取得に失敗しました: ${error.message}`);
      return data as LifetimeStats;
    };

    /** タイムアタック1回分の記録を、日本時間の日時を指定して本人のJWTで作る */
    const insertSession = async (jstDateTime: string, answered: number, assessments: number) => {
      const { error } = await student.from('self_t_sprint').insert({
        user_id: userId,
        sprint_type: '0',
        content_id: sprint.content_id,
        question_type: '0',
        answer_type: '0',
        difficulty_level: 1,
        time_limit_sec: 60,
        total_answered: answered,
        total_assessments: assessments,
        insert_date: new Date(`${jstDateTime}+09:00`).toISOString(),
      });
      if (error) throw new Error(`タイムアタックの記録の作成に失敗しました: ${error.message}`);
    };

    const countRows = async (table: 'self_t_word_summary' | 'self_t_sprint_summary') => {
      const { count } = await f.admin
        .from(table)
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count;
    };

    const d10 = jstDate(-10);
    const d9 = jstDate(-9);
    const d6 = jstDate(-6);
    const d12 = jstDate(-12);
    const today = jstDate(0);

    await test.step('初回: 実施日数・連続日数が1日になる', async () => {
      await insertSession(`${d10}T23:30:00`, 5, 2);
      expect(await readStats()).toMatchObject({
        total_active_days: 1,
        current_streak_days: 1,
        first_training_date: d10,
        last_training_date: d10,
        total_sprint_sessions: 1,
        total_sprint_answers: 5,
        total_assessments: 2,
      });
    });

    await test.step('#2: 日本時間の23:30の次に翌0:30に実施すると、2日に分かれて連続日数が2日になる', async () => {
      await insertSession(`${d9}T00:30:00`, 3, 1);
      expect(await readStats()).toMatchObject({
        total_active_days: 2,
        current_streak_days: 2,
        last_training_date: d9,
        total_sprint_sessions: 2,
        total_sprint_answers: 8,
        total_assessments: 3,
      });
    });

    await test.step('#1・#8: 同じ日のタイムアタックの2回目は日数を増やさず、本数・回答数だけを加算する。日次の記録は作られない', async () => {
      await insertSession(`${d9}T12:00:00`, 4, 0);
      expect(await readStats()).toMatchObject({
        total_active_days: 2,
        current_streak_days: 2,
        last_training_date: d9,
        total_sprint_sessions: 3,
        total_sprint_answers: 12,
        total_assessments: 3,
      });
      expect(await countRows('self_t_sprint_summary')).toBe(0);
      expect(await countRows('self_t_word_summary')).toBe(0);
    });

    await test.step('#3: 2日以上空けて実施すると、連続日数が1に戻り、実施日数・通算値は減らない', async () => {
      await insertSession(`${d6}T10:00:00`, 2, 1);
      expect(await readStats()).toMatchObject({
        total_active_days: 3,
        current_streak_days: 1,
        last_training_date: d6,
        total_sprint_sessions: 4,
        total_sprint_answers: 14,
        total_assessments: 4,
      });
    });

    await test.step('#4: 最終実施日より前の日付の記録は、日数・連続日数・最終実施日を変えず、通算の数を加算し、初回の日付を古い方にする', async () => {
      await insertSession(`${d12}T10:00:00`, 1, 0);
      expect(await readStats()).toMatchObject({
        total_active_days: 3,
        current_streak_days: 1,
        first_training_date: d12,
        last_training_date: d6,
        total_sprint_sessions: 5,
        total_sprint_answers: 15,
        total_assessments: 4,
      });
    });

    await test.step('#1: 今日、単語帳を2回とドリルを1回記録すると、日数は1日分だけ増え、通算の数と日次の記録は回数分加算される', async () => {
      for (let i = 0; i < 2; i++) {
        const { error } = await student.rpc('increment_word_summary', {
          p_content_id: word.content_id,
          p_word_count: 3,
          p_phrase_count: 6,
          p_assessment_count: 2,
        });
        if (error) throw new Error(`increment_word_summary が失敗しました: ${error.message}`);
      }
      const { error } = await student.rpc('increment_sprint_summary', {
        p_content_id: sprint.content_id,
        p_question_count: 5,
        p_assessment_count: 1,
        p_question_type: '0',
      });
      if (error) throw new Error(`increment_sprint_summary が失敗しました: ${error.message}`);

      expect(await readStats()).toMatchObject({
        total_active_days: 4,
        current_streak_days: 1,
        first_training_date: d12,
        last_training_date: today,
        total_words: 6,
        total_phrases: 12,
        total_assessments: 9,
        total_sprint_sessions: 5,
        total_sprint_answers: 15,
      });

      const { data: wordRows } = await f.admin
        .from('self_t_word_summary')
        .select('training_date, word_count, phrase_count, assessment_count')
        .eq('user_id', userId);
      expect(wordRows).toEqual([{ training_date: today, word_count: 6, phrase_count: 12, assessment_count: 4 }]);
      const { data: drillRows } = await f.admin
        .from('self_t_sprint_summary')
        .select('training_date, question_count, assessment_count, speed_count')
        .eq('user_id', userId);
      expect(drillRows).toEqual([{ training_date: today, question_count: 5, assessment_count: 1, speed_count: 5 }]);
    });
  });

  test('#6: 達成の通知は初回トレーニングと連続5日の初回到達で1回ずつ作られ、途切れて再び5日続いても作られない', async () => {
    const { f, userId, email } = await createStudent('milest');
    const sprint = await prepareContent(f, 2);
    const student = await signInAsRole(email, PASSWORD);
    studentClient = student;

    /** 日本時間 offset 日の正午に、タイムアタック1回分の記録を本人のJWTで作る */
    const trainOn = async (offset: number) => {
      const { error } = await student.from('self_t_sprint').insert({
        user_id: userId,
        sprint_type: '0',
        content_id: sprint.content_id,
        question_type: '0',
        answer_type: '0',
        difficulty_level: 1,
        time_limit_sec: 60,
        total_answered: 1,
        total_assessments: 0,
        insert_date: new Date(`${jstDate(offset)}T12:00:00+09:00`).toISOString(),
      });
      if (error) throw new Error(`タイムアタックの記録の作成に失敗しました: ${error.message}`);
    };
    const notifications = async () => {
      const { data, error } = await f.admin
        .from('com_t_notification')
        .select('notification_type, dedup_key, payload, link_path')
        .eq('user_id', userId)
        .in('notification_type', ['TRAINING_FIRST', 'TRAINING_STREAK'])
        .order('notification_type');
      if (error) throw new Error(`通知の取得に失敗しました: ${error.message}`);
      return data;
    };
    const streak = async () => {
      const { data } = await f.admin
        .from('student_m_training_lifetime_stats')
        .select('current_streak_days')
        .eq('user_id', userId)
        .single();
      return data?.current_streak_days;
    };
    const first = {
      notification_type: 'TRAINING_FIRST',
      dedup_key: 'FIRST_TRAINING',
      payload: { days: 1 },
      link_path: '/dashboard',
    };
    const streak5 = {
      notification_type: 'TRAINING_STREAK',
      dedup_key: 'STREAK_5',
      payload: { days: 5 },
      link_path: '/dashboard',
    };

    await test.step('初回トレーニングで「初回」の通知が作られる', async () => {
      await trainOn(-15);
      expect(await notifications()).toEqual([first]);
    });

    await test.step('4日連続では連続の通知は作られず、5日目に1回作られる', async () => {
      for (const offset of [-14, -13, -12]) await trainOn(offset);
      expect(await streak()).toBe(4);
      expect(await notifications()).toEqual([first]);

      await trainOn(-11);
      expect(await streak()).toBe(5);
      expect(await notifications()).toEqual([first, streak5]);

      // 同じ日の2回目（連続日数が変わらない）でも増えない
      await trainOn(-11);
      expect(await notifications()).toEqual([first, streak5]);
    });

    await test.step('途切れた後に再び5日続いても、通知は増えない', async () => {
      await trainOn(-9);
      expect(await streak()).toBe(1);
      for (const offset of [-8, -7, -6, -5]) await trainOn(offset);
      expect(await streak()).toBe(5);
      expect(await notifications()).toEqual([first, streak5]);
    });
  });

  test.describe('ホームの連続日数', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('#5: 最終実施日が昨日なら「n日連続」を出し、一昨日以前なら出さない', async ({ page }) => {
      const { f, userId, email } = await createStudent('streak');
      const streakBadge = page.getByText(/^\d+日連続$/);

      const setStats = async (lastTrainingDate: string) => {
        const { error } = await f.admin.from('student_m_training_lifetime_stats').upsert({
          user_id: userId,
          total_active_days: 3,
          current_streak_days: 3,
          first_training_date: jstDate(-5),
          last_training_date: lastTrainingDate,
        });
        if (error) throw new Error(`通算値の作成に失敗しました: ${error.message}`);
      };

      await setStats(jstDate(-1));
      await loginAsNewStudent(page, email, PASSWORD);

      await test.step('最終実施日が昨日: 今日まだ実施していなくても継続中として「3日連続」を出す', async () => {
        await expect(page.getByText('日 実施しました')).toBeVisible();
        await expect(streakBadge).toHaveText('3日連続');
      });

      await test.step('最終実施日が一昨日: 途切れたものとして出さない（DBの連続日数は残る）', async () => {
        await setStats(jstDate(-2));
        await page.reload();
        await expect(page.getByText('日 実施しました')).toBeVisible();
        await expect(streakBadge).toHaveCount(0);
      });
    });
  });
});
