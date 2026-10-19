/**
 * DB の admin の権利がシステム管理者（is_system_admin()）に限られているかの確認スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261016-dev/admin-role-db-guard-check.ts --env=dev
 *
 * 確認すること:
 *   - 教材担当（user_type '0'・roles ['content_manager']）は、システム管理者だけの RPC・表を自分の JWT で使えない
 *   - 教材担当も、チャットの表（com_t_chat_room）は従来どおり admin として読める
 *   - システム管理者（qa-admin）は従来どおり使える
 *
 * 使い捨ての教材担当を作り、最後に削除する。RPC・表は各アカウントの実JWTで呼ぶ（書き込みはしない）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from '../../../helpers/env.ts';
import { createAdminClient, signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error('QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。');
}

const ADMIN_EMAIL = 'qa-admin@gabby-qa-test.example';
const COACH_EMAIL = 'qa-coach-us-01@gabby-qa-test.example';
const CONTENT_MANAGER_EMAIL = `cm-guard-${Date.now()}@gabby-qa-test.example`;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}`, detail ?? '');
  }
}

/** 表を読めた行の数（RLS で見えない行は数えられない） */
async function visibleRows(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main(): Promise<void> {
  const service = await createAdminClient();
  const coach = await signInAsRole(COACH_EMAIL, PASSWORD!);
  const { data: coachUser } = await coach.auth.getUser();
  await signOutRole(coach);
  const coachId = coachUser.user!.id;

  const admin = await signInAsRole(ADMIN_EMAIL, PASSWORD!);
  let contentManagerId: string | undefined;
  let contentManager: SupabaseClient | undefined;
  try {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: CONTENT_MANAGER_EMAIL,
      password: PASSWORD!,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error('教材担当を作れませんでした');
    contentManagerId = created.user.id;
    // com_m_user の行は auth のユーザー作成時に自動で作られる。ロールは com_t_user_role から JWT の roles へ写される
    const { error: userError } = await service
      .from('com_m_user')
      .upsert({ id: contentManagerId, user_type: '0', user_name: 'QA Content Manager Guard' });
    if (userError) throw userError;
    const { error: roleError } = await service
      .from('com_t_user_role')
      .insert({ user_id: contentManagerId, role_id: 'content_manager' });
    if (roleError) throw roleError;
    contentManager = await signInAsRole(CONTENT_MANAGER_EMAIL, PASSWORD!);
    const { data: claims } = await contentManager.auth.getClaims();
    check(
      '教材担当の JWT: user_type が 0、roles が content_manager だけ',
      claims?.claims.app_metadata?.user_type === '0' &&
        JSON.stringify(claims?.claims.app_metadata?.roles) === '["content_manager"]',
      claims?.claims.app_metadata,
    );

    console.log(`[${env}] RPC`);
    for (const [label, client, shouldPass] of [
      ['システム管理者', admin, true],
      ['教材担当', contentManager, false],
    ] as const) {
      const ratings = await client.rpc('admin_get_coach_ratings', { p_coach_id: coachId });
      check(`${label}: admin_get_coach_ratings（直接の判定）`, !ratings.error === shouldPass, ratings.error?.message);
      const records = await client.rpc('admin_get_session_records', { p_limit: 1 });
      check(
        `${label}: admin_get_session_records（fn_assert_actor_or_admin）`,
        !records.error === shouldPass,
        records.error?.message,
      );
      const status = await client.rpc('get_coach_matching_status', { p_coach_id: coachId });
      check(`${label}: 他人の get_coach_matching_status`, !status.error === shouldPass, status.error?.message);
    }

    console.log(`[${env}] RLS`);
    for (const table of ['com_t_session', 'com_t_invitation', 'com_m_session_pay_rate']) {
      const adminRows = await visibleRows(admin, table);
      check(`システム管理者: ${table} を読める（${adminRows} 行）`, adminRows > 0);
      const cmRows = await visibleRows(contentManager, table);
      check(`教材担当: ${table} を読めない`, cmRows === 0, cmRows);
    }
    const adminRooms = await visibleRows(admin, 'com_t_chat_room');
    const cmRooms = await visibleRows(contentManager, 'com_t_chat_room');
    check(
      `教材担当: チャットのルームはシステム管理者と同じく読める（${cmRooms} / ${adminRooms} 行）`,
      cmRooms > 0 && cmRooms === adminRooms,
    );
  } finally {
    if (contentManager) await signOutRole(contentManager);
    await signOutRole(admin);
    if (contentManagerId) {
      await service.from('com_t_user_role').delete().eq('user_id', contentManagerId);
      await service.from('com_m_user').delete().eq('id', contentManagerId);
      const { error } = await service.auth.admin.deleteUser(contentManagerId);
      if (error) console.warn(`教材担当の削除に失敗: ${contentManagerId} ${error.message}`);
    }
  }

  console.log(failures === 0 ? '\nすべて OK' : `\nNG: ${failures} 件`);
  if (failures > 0) process.exit(1);
}

await main();
