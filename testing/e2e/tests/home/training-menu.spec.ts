import type { Page } from '@playwright/test';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantAppLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';

/**
 * ホームの今日のトレーニングメニュー（機能: e2e/specs/training/training-menu.md、画面: docs/screens/student/dashboard.md）。
 * 使い捨てのアプリのみ契約の生徒（ステージ0）で、標準メニューが作られること、やることから種別・レベルを選んだ状態で
 * スプリントを開けること、ビデオをその場で再生できること、各トレーニングの記録からやることが完了になることを確かめる。
 * トレーニングの実施は音声の入出力が必要なため、記録は DB に直接作る。desktop だけで実行する。
 */

const PASSWORD = 'TodayMenu2026a';

const menuCard = (page: Page) =>
  page.locator('section').filter({ has: page.getByText('今日のトレーニングメニュー', { exact: true }) });

test.describe('使い捨てのアプリのみ契約の生徒', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;

  test.afterEach(async () => {
    if (fixture) await fixture.admin.from('com_m_contents_access').delete().eq('client_id', fixture.clientId);
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  test('その日のメニューが作られ、スプリントを指定どおり開け、記録からやることが完了になる', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '使い捨てデータを作るため desktop だけで実行する');
    test.setTimeout(120_000);

    const f = await createAuthFixture('tmenu');
    fixture = f;
    const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
    const userId = await createDisposableStudent(f, { email, password: PASSWORD });
    await grantAppLicense(f, userId);

    // 汎用スプリント（限定公開）を使い捨ての顧客に公開する（後始末で消す）
    const { data: sprint, error } = await f.admin
      .from('com_m_contents')
      .select('content_id')
      .eq('content_type', 2)
      .eq('status', 1)
      .eq('content_scope', 1)
      .eq('metadata->sprint->>sprint_type', '0')
      .order('seq_no')
      .limit(1)
      .single();
    if (error || !sprint) throw new Error(`汎用スプリントが見つかりません: ${error?.message}`);
    const { error: accessError } = await f.admin
      .from('com_m_contents_access')
      .insert({ client_id: f.clientId, content_id: sprint.content_id });
    if (accessError) throw new Error(`教材の公開先の追加に失敗しました: ${accessError.message}`);

    await loginAsNewStudent(page, email, PASSWORD);
    // 規約の同意の後の再描画で作られたメニューを消し、メニューを作る描画そのもので出ることを確かめる
    await f.admin.from('student_t_training_menu').delete().eq('user_id', userId);
    await page.goto('/dashboard');

    const card = menuCard(page);
    await test.step('ステージ0の生徒には、Speed・Builders の Lv.1 のタイムアタックが出る', async () => {
      await expect(card.getByText('UG Speed Lv.1', { exact: true })).toBeVisible();
      await expect(card.getByText('UG Builders Lv.1', { exact: true })).toBeVisible();
      await expect(card.getByText('タイムアタック 0 / 2回')).toBeVisible();
    });

    const { data: menu } = await f.admin
      .from('student_t_training_menu')
      .select('menu_id, items:student_t_training_menu_item(item_type, video_id)')
      .eq('user_id', userId)
      .single();
    expect(menu, 'その日のメニューが1件作られる').not.toBeNull();
    const videoIds = menu!.items.flatMap((i) => (i.video_id ? [i.video_id] : []));

    if (videoIds.length > 0) {
      await test.step('ビデオを押すと画面を移らずにその場で再生し、端末の「戻る」でダイアログだけを閉じる', async () => {
        const dialog = page.getByRole('dialog');
        await clickUntilVisible(card.getByRole('listitem').getByRole('button').first(), dialog);
        await expect(dialog.locator('video')).toBeVisible();
        await page.goBack();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(card.getByText('UG Speed Lv.1', { exact: true })).toBeVisible();
      });
    }

    await test.step('やることを押すと、その種別・レベルを選んだ状態でスプリントの選択画面が開く', async () => {
      await clickUntilVisible(
        card.getByRole('link').filter({ hasText: 'UG Builders Lv.1' }),
        page.getByRole('heading', { level: 2, name: 'UG Builders Lv.1' }),
      );
      await expect(page).toHaveURL(/type=5&level=1/);
      await expect(page.getByRole('button', { name: 'タイムアタック', exact: true })).toBeVisible();
    });

    await test.step('その日の記録が回数に届いたやること・見終えたビデオは完了になる', async () => {
      const session = {
        user_id: userId,
        sprint_type: '0',
        content_id: sprint.content_id,
        question_type: '0',
        answer_type: '0',
        difficulty_level: 1,
        time_limit_sec: 60,
        total_answered: 0,
        total_assessments: 0,
      } as const;
      const { error: sprintError } = await f.admin.from('self_t_sprint').insert([session, session]);
      if (sprintError) throw new Error(`スプリントの記録の作成に失敗しました: ${sprintError.message}`);
      if (videoIds.length > 0) {
        const completedAt = new Date().toISOString();
        const { error: videoError } = await f.admin
          .from('student_m_video_progress')
          .insert(videoIds.map((video_id) => ({ user_id: userId, video_id, completed_at: completedAt })));
        if (videoError) throw new Error(`視聴の記録の作成に失敗しました: ${videoError.message}`);
      }

      await page.goto('/dashboard');
      await expect(card.getByText('あと1つで今日のメニューを達成')).toBeVisible();
      await expect(card.getByText('タイムアタック 2 / 2回')).toBeVisible();
      await expect
        .poll(async () => {
          const { data } = await f.admin
            .from('student_t_training_menu_item')
            .select('item_type, question_type, completed_at')
            .eq('menu_id', menu!.menu_id);
          return (data ?? []).filter((i) => i.completed_at !== null).length;
        })
        .toBe(1 + videoIds.length);
    });
  });
});
