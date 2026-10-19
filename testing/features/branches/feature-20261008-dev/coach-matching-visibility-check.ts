/**
 * コーチのマッチング対象（必須項目・本人の受付・アドミンの休止）の確認スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/coach-matching-visibility-check.ts --env=dev
 *
 * 固定アカウント qa-coach-us-01 の受付・休止・保有資格を書き換えて確認し、最後に実行前の状態へ戻す（データは残らない）。
 * RPC・テーブルの操作は各ロール（qa-admin / qa-coach-us-01 / qa-student-01）の実JWTで行う。
 * 前提: qa-coach-us-01 はプロフィール・アイコン・空き時間がそろっている（features/fixtures/seed-fixed-accounts.ts）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import { loadTestEnv, resolveTestEnvFromArgs } from '../../../helpers/env.ts';

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error('QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。');
}

const ADMIN_EMAIL = 'qa-admin@gabby-qa-test.example';
const COACH_EMAIL = 'qa-coach-us-01@gabby-qa-test.example';
const STUDENT_EMAIL = 'qa-student-01@gabby-qa-test.example';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}`, detail ?? '');
  }
}

interface StatusRow {
  missing_items: string[];
  accepting_students: boolean;
  is_suspended: boolean;
  suspended_note: string | null;
}

async function userId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('ユーザーを取得できませんでした');
  return data.user.id;
}

/** 生徒自身のライブセッションのチケット（get_matchable_coach_ids はチケットごとに対象を返す） */
async function ownTicketId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.from('com_t_user_session_ticket').select('ticket_id').limit(1).single();
  if (error) throw new Error(`生徒のチケットが見つかりません: ${error.message}`);
  return data.ticket_id as string;
}

async function isListed(student: SupabaseClient, coachId: string): Promise<boolean> {
  const { data, error } = await student.rpc('get_matchable_coach_ids', { p_ticket_id: await ownTicketId(student) });
  if (error) throw error;
  return ((data ?? []) as { coach_id: string }[]).some((r) => r.coach_id === coachId);
}

async function statusOf(client: SupabaseClient, coachId: string): Promise<StatusRow> {
  const { data, error } = await client.rpc('get_coach_matching_status', { p_coach_id: coachId }).single<StatusRow>();
  if (error) throw error;
  return data;
}

async function main(): Promise<void> {
  const service = await createAdminClient();
  const admin = await signInAsRole(ADMIN_EMAIL, PASSWORD!);
  const coach = await signInAsRole(COACH_EMAIL, PASSWORD!);
  const student = await signInAsRole(STUDENT_EMAIL, PASSWORD!);
  const coachId = await userId(coach);

  const { data: original, error: originalError } = await service
    .from('com_m_coach_profile')
    .select('accepting_students, qualifications')
    .eq('user_id', coachId)
    .single();
  if (originalError) throw originalError;
  const { data: originalSuspension } = await service
    .from('com_m_coach_matching_suspension')
    .select('note')
    .eq('coach_id', coachId)
    .maybeSingle();
  console.log(
    `[${env}] 対象コーチ ${COACH_EMAIL}（受付: ${original.accepting_students} / 休止: ${!!originalSuspension}）`,
  );

  try {
    await coach.from('com_m_coach_profile').update({ accepting_students: true }).eq('user_id', coachId);
    await admin.rpc('admin_set_coach_matching_suspension', { p_coach_id: coachId, p_suspended: false, p_note: null });

    console.log('そろっている状態');
    {
      const status = await statusOf(coach, coachId);
      check('足りない項目が無い', status.missing_items.length === 0, status.missing_items);
      check('生徒の一覧に出る', await isListed(student, coachId));
    }

    console.log('必須項目が欠けている');
    {
      await coach.from('com_m_coach_profile').update({ qualifications: '   ' }).eq('user_id', coachId);
      const status = await statusOf(coach, coachId);
      check(
        '空白だけの保有資格は未設定とみなす',
        status.missing_items.join() === 'qualifications',
        status.missing_items,
      );
      check('生徒の一覧に出ない', !(await isListed(student, coachId)));
      await coach
        .from('com_m_coach_profile')
        .update({ qualifications: original.qualifications })
        .eq('user_id', coachId);
      check('戻すと一覧に出る', await isListed(student, coachId));
    }

    console.log('コーチ本人の受付');
    {
      const { error } = await coach
        .from('com_m_coach_profile')
        .update({ accepting_students: false })
        .eq('user_id', coachId);
      check('コーチ本人がOFFにできる', !error, error);
      check('OFFの間は一覧に出ない', !(await isListed(student, coachId)));
      const status = await statusOf(admin, coachId);
      check('アドミンから受付OFFが見える', status.accepting_students === false, status);
      await coach.from('com_m_coach_profile').update({ accepting_students: true }).eq('user_id', coachId);
      check('ONに戻すと一覧に出る', await isListed(student, coachId));
    }

    console.log('アドミンによる休止');
    {
      const { error } = await admin.rpc('admin_set_coach_matching_suspension', {
        p_coach_id: coachId,
        p_suspended: true,
        p_note: 'QA確認用のメモ',
      });
      check('アドミンが休止にできる', !error, error);
      check('休止中は一覧に出ない', !(await isListed(student, coachId)));
      const asAdmin = await statusOf(admin, coachId);
      check(
        'アドミンには休止の理由のメモが返る',
        asAdmin.is_suspended && asAdmin.suspended_note === 'QA確認用のメモ',
        asAdmin,
      );
      const asCoach = await statusOf(coach, coachId);
      check(
        'コーチ本人には休止中だけが返り、メモは返らない',
        asCoach.is_suspended && asCoach.suspended_note === null,
        asCoach,
      );

      const { data: coachRows } = await coach
        .from('com_m_coach_matching_suspension')
        .select('note')
        .eq('coach_id', coachId);
      check('コーチ本人は休止のテーブルを参照できない', (coachRows ?? []).length === 0, coachRows);
      const { data: studentRows } = await student.from('com_m_coach_matching_suspension').select('note');
      check('生徒は休止のテーブルを参照できない', (studentRows ?? []).length === 0, studentRows);
      await coach.from('com_m_coach_matching_suspension').delete().eq('coach_id', coachId);
      const { data: stillSuspended } = await service
        .from('com_m_coach_matching_suspension')
        .select('coach_id')
        .eq('coach_id', coachId);
      check('コーチ本人はテーブルから直接解除できない', (stillSuspended ?? []).length === 1, stillSuspended);
      const { error: coachRpcError } = await coach.rpc('admin_set_coach_matching_suspension', {
        p_coach_id: coachId,
        p_suspended: false,
        p_note: null,
      });
      check(
        'コーチ本人は RPC で解除できない（NOT_AUTHORIZED）',
        !!coachRpcError?.message.includes('NOT_AUTHORIZED'),
        coachRpcError,
      );

      const { error: resumeError } = await admin.rpc('admin_set_coach_matching_suspension', {
        p_coach_id: coachId,
        p_suspended: false,
        p_note: null,
      });
      check('アドミンが解除できる', !resumeError, resumeError);
      check('解除すると一覧に出る', await isListed(student, coachId));
    }

    console.log('参照の権限');
    {
      const { error } = await student.rpc('get_coach_matching_status', { p_coach_id: coachId });
      check('生徒はコーチの内訳を取得できない（NOT_AUTHORIZED）', !!error?.message.includes('NOT_AUTHORIZED'), error);
      const { error: notCoachError } = await admin.rpc('admin_set_coach_matching_suspension', {
        p_coach_id: await userId(student),
        p_suspended: true,
        p_note: null,
      });
      check('コーチ以外は COACH_NOT_FOUND で拒否', !!notCoachError?.message.includes('COACH_NOT_FOUND'), notCoachError);
    }
  } finally {
    await service
      .from('com_m_coach_profile')
      .update({ accepting_students: original.accepting_students, qualifications: original.qualifications })
      .eq('user_id', coachId);
    await admin.rpc('admin_set_coach_matching_suspension', {
      p_coach_id: coachId,
      p_suspended: !!originalSuspension,
      p_note: originalSuspension?.note ?? null,
    });
    const restored = await statusOf(admin, coachId);
    check(
      '実行前の状態へ戻す',
      restored.accepting_students === original.accepting_students && restored.is_suspended === !!originalSuspension,
      restored,
    );
    await Promise.all([signOutRole(admin), signOutRole(coach), signOutRole(student)]);
  }

  console.log(failures === 0 ? 'すべて成功' : `${failures}件 失敗`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
