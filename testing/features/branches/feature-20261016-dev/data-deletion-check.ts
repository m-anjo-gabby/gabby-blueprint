/**
 * 削除の規約（docs/DATA-DELETION.md）の確認スクリプト。delete_flg の廃止・外部キーの付け替え・退会・顧客単位の一括削除。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261016-dev/data-deletion-check.ts --env=dev
 *
 * 確認すること:
 *   - 生徒の実JWTで、公開の教材は読め、非公開（status = 0）の教材は読めない（com_m_contents のポリシー）
 *   - 業務の記録がある行は物理削除できない（教材 → 学習の履歴、ライセンス → チケット。外部キーの RESTRICT）
 *   - 停止（認証のアカウントの ban）でログインできなくなり、再開でログインできる
 *   - 退会: 有効なライセンスがあると中断し、停止後は個人情報が消え「退会済みユーザー」として残る。再実行しても成功する
 *   - 顧客単位の一括削除: 予行は件数だけを返し何も消さない。固定の顧客は削除できない。実行で顧客・ユーザー・契約が消える
 *
 * 退会・一括削除の RPC は service_role 専用（admin のサーバーアクションが呼ぶ）のため service_role で呼ぶ。
 * 使い捨ての顧客・生徒を作り、最後に一括削除で消す（認証のアカウント・削除の記録もこのスクリプトが消す。データは残らない）。
 */
import { randomUUID } from 'node:crypto';
import { WEB_TRIAL_CLIENT_ID } from '../../../../packages/types/trialApplication.ts';
import { createAdminClient, signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import { loadTestEnv, resolveTestEnvFromArgs } from '../../../helpers/env.ts';
import { createFixtureKit } from '../../../helpers/fixture-accounts.ts';
import { termOf } from '../../../helpers/fixture-terms.ts';

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD = `Qa-${randomUUID()}`;
const STAMP = Date.now();
const CLIENT_NAME = `[QA] data-deletion-${STAMP}`;
const STUDENT_EMAIL = `qa-del-student-${STAMP}@gabby-qa-test.example`;
const SUSPEND_EMAIL = `qa-del-suspend-${STAMP}@gabby-qa-test.example`;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}`, detail ?? '');
  }
}

const admin = await createAdminClient();
const kit = createFixtureKit(admin, PASSWORD);
const createdAuthIds: string[] = [];
let clientId: string | undefined;

try {
  // ---- 準備 -------------------------------------------------------------
  clientId = await kit.ensureClient(CLIENT_NAME);
  const studentId = await kit.ensureUser({
    email: STUDENT_EMAIL,
    clientId,
    userType: '1',
    userName: 'QA Delete Student',
  });
  const suspendId = await kit.ensureUser({
    email: SUSPEND_EMAIL,
    clientId,
    userType: '1',
    userName: 'QA Suspend Student',
  });
  createdAuthIds.push(studentId, suspendId);
  const term = termOf(Math.max(0, Math.floor((Date.now() - Date.UTC(2026, 5, 1)) / (92 * 86400000))));
  const contractId = await kit.ensureContract(clientId, 'BLUEPRINT_ONLY', term, 5);
  const licenseId = await kit.ensureLicense(
    studentId,
    contractId,
    { label: term.label, startIso: term.startIso, endIso: term.endIso },
    1,
  );
  await admin.from('com_m_user_legal').insert({
    user_id: studentId,
    last_name: '山田',
    first_name: '太郎',
    last_name_latin: 'Yamada',
    first_name_latin: 'Taro',
  });

  // ---- 1. 教材のポリシー（生徒の実JWT）-----------------------------------
  console.log('\n[1] 教材の公開状態');
  const { data: hidden } = await admin
    .from('com_m_contents')
    .select('content_id')
    .eq('status', 0)
    .eq('content_scope', 0)
    .limit(1)
    .maybeSingle();
  const student = await signInAsRole(STUDENT_EMAIL, PASSWORD);
  const { count: visible } = await student.from('com_m_contents').select('content_id', { count: 'exact', head: true });
  check('公開の教材を読める', (visible ?? 0) > 0, visible);
  if (hidden) {
    const { data } = await student.from('com_m_contents').select('content_id').eq('content_id', hidden.content_id);
    check('非公開の共通教材は読めない', (data ?? []).length === 0, data);
  } else {
    console.log('  --   非公開の共通教材が無いため省略');
  }
  await signOutRole(student);

  // ---- 2. 外部キーの RESTRICT -------------------------------------------
  console.log('\n[2] 業務の記録がある行は物理削除できない');
  const { data: usedContent } = await admin.from('self_t_sprint').select('content_id').limit(1).maybeSingle();
  if (usedContent) {
    const { error } = await admin.from('com_m_contents').delete().eq('content_id', usedContent.content_id);
    check('学習の履歴がある教材は削除できない（23503）', error?.code === '23503', error);
  }
  const { data: usedLicense } = await admin
    .from('com_t_user_session_ticket')
    .select('license_id')
    .limit(1)
    .maybeSingle();
  if (usedLicense) {
    const { error } = await admin.from('com_t_user_license').delete().eq('license_id', usedLicense.license_id);
    check('チケットがあるライセンスは削除できない（23503）', error?.code === '23503', error);
  }

  // ---- 3. 停止・再開 -----------------------------------------------------
  console.log('\n[3] 停止・再開');
  await admin.auth.admin.updateUserById(suspendId, { ban_duration: '876000h' });
  await admin.from('com_m_user').update({ status: 0 }).eq('id', suspendId);
  const banned = await signInAsRole(SUSPEND_EMAIL, PASSWORD).then(
    () => false,
    () => true,
  );
  check('停止中はログインできない', banned);
  await admin.auth.admin.updateUserById(suspendId, { ban_duration: 'none' });
  await admin.from('com_m_user').update({ status: 1 }).eq('id', suspendId);
  const resumed = await signInAsRole(SUSPEND_EMAIL, PASSWORD).then(
    async (c) => {
      await signOutRole(c);
      return true;
    },
    () => false,
  );
  check('再開するとログインできる', resumed);

  // ---- 4. 退会 -----------------------------------------------------------
  console.log('\n[4] 退会');
  const blocked = await admin.rpc('fn_withdraw_user', { p_user_id: studentId, p_performed_by: null });
  check('有効なライセンスがあると中断する', blocked.error?.message?.includes('active_license') === true, blocked.error);
  await admin.from('com_t_user_license').update({ status: 0 }).eq('license_id', licenseId);
  const done = await admin.rpc('fn_withdraw_user', { p_user_id: studentId, p_performed_by: null });
  check('ライセンスの停止後は退会できる', !done.error, done.error);
  await admin.auth.admin.deleteUser(studentId);
  const { data: tomb } = await admin
    .from('com_m_user')
    .select('status, user_name, icon_path')
    .eq('id', studentId)
    .single();
  check('退会済みユーザーとして残る', tomb?.status === 9 && tomb?.user_name === '退会済みユーザー', tomb);
  const { count: legal } = await admin
    .from('com_m_user_legal')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', studentId);
  check('正式氏名が消える', legal === 0, legal);
  const { count: licenses } = await admin
    .from('com_t_user_license')
    .select('license_id', { count: 'exact', head: true })
    .eq('user_id', studentId);
  check('ライセンス（業務の記録）は残る', licenses === 1, licenses);
  const again = await admin.rpc('fn_withdraw_user', { p_user_id: studentId, p_performed_by: null });
  check('退会済みに再実行しても成功する', !again.error, again.error);
  const { count: logs } = await admin
    .from('com_t_data_deletion_log')
    .select('log_id', { count: 'exact', head: true })
    .eq('target_id', studentId);
  check('削除の記録が残る', (logs ?? 0) >= 1, logs);

  // ---- 5. 顧客単位の一括削除 ---------------------------------------------
  console.log('\n[5] 顧客単位の一括削除');
  const prot = await admin.rpc('fn_purge_client', {
    p_client_id: WEB_TRIAL_CLIENT_ID,
    p_dry_run: true,
    p_performed_by: null,
  });
  check('Webトライアルの顧客は削除できない', prot.error?.message?.includes('protected_client') === true, prot.error);
  const dry = await admin.rpc('fn_purge_client', { p_client_id: clientId, p_dry_run: true, p_performed_by: null });
  const counts = (dry.data as { counts?: Record<string, number> } | null)?.counts;
  check(
    '予行は件数を返す（生徒2・契約1・ライセンス1）',
    counts?.students === 2 && counts?.contracts === 1 && counts?.licenses === 1,
    dry.error ?? counts,
  );
  const { count: stillThere } = await admin
    .from('com_m_client')
    .select('client_id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  check('予行では何も消えない', stillThere === 1, stillThere);
  const purge = await admin.rpc('fn_purge_client', { p_client_id: clientId, p_dry_run: false, p_performed_by: null });
  check('一括削除が成功する', !purge.error, purge.error);
  const userIds = ((purge.data as { user_ids?: string[] } | null)?.user_ids ?? []).sort();
  check(
    '消したユーザーのIDを返す（認証のアカウントの削除用）',
    JSON.stringify(userIds) === JSON.stringify([studentId, suspendId].sort()),
    userIds,
  );
  const { count: users } = await admin
    .from('com_m_user')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  const { count: contracts } = await admin
    .from('com_m_contract')
    .select('contract_id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  const { count: client } = await admin
    .from('com_m_client')
    .select('client_id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  check('顧客・ユーザー・契約が消える', users === 0 && contracts === 0 && client === 0, { users, contracts, client });
  if (!purge.error) clientId = undefined;
} finally {
  // ---- 後始末（一括削除が失敗した場合も含めて、作ったものを消す）--------
  if (clientId) {
    const { error } = await admin.rpc('fn_purge_client', {
      p_client_id: clientId,
      p_dry_run: false,
      p_performed_by: null,
    });
    if (error) console.log('  ⚠ 後始末の一括削除に失敗しました:', error.message);
  }
  for (const id of createdAuthIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await admin.from('com_t_data_deletion_log').delete().in('target_id', createdAuthIds);
  await admin
    .from('com_t_data_deletion_log')
    .delete()
    .eq('kind', 'purge_client')
    .gte('performed_at', new Date(STAMP).toISOString())
    .is('performed_by', null);
}

console.log(failures === 0 ? '\nすべて OK' : `\nNG: ${failures} 件`);
process.exit(failures === 0 ? 0 : 1);
