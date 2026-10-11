---------------------------------------------
-- DDL: com_m_coach_matching_suspension (コーチのマッチング休止) (2026-10-11 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- コーチにはライセンスの概念が無いため、休止するコーチを生徒の「専属コーチを探す」から外す手段として、
-- マッチング対象のON/OFFを持つ。ON/OFFは次の2つに分ける（どちらかがOFFなら一覧に出ない）。
--   - コーチ本人の受付: com_m_coach_profile.accepting_students（コーチがプロフィールで切り替える）
--   - アドミンの休止  : 本テーブル（行がある＝休止中）。コーチ本人は解除できない。
-- 休止の理由のメモは運営の内部メモのため、プロフィール（認証済みユーザーなら誰でも参照できる）とは
-- 別のテーブルにし、参照はアドミンだけにする（コーチ本人には get_coach_matching_status() で休止中かどうかだけを返す）。
--
-- 休止で止めるのは新しいマッチング（一覧への表示と申請）だけ。担当中の生徒・確定済みのセッション・
-- 回答待ちの申請（24時間で期限切れ）はそのまま続く。
--
-- 登録・解除は admin_set_coach_matching_suspension() のみ（休止＝行の登録・更新、解除＝行の削除）。
-- 判定は get_matchable_coach_ids() / get_coach_matching_status() で行う。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_matching_suspension (
    coach_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note text,
    suspended_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_coach_matching_suspension IS 'コーチのマッチング休止（アドミンが設定。行がある間は生徒のコーチ選択に出さない）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.coach_id IS 'コーチのユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.note IS '休止の理由（運営の内部メモ。アドミンのみ参照）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.suspended_by IS '最後に設定したアドミン (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.insert_date IS '休止した日時';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.update_date IS '更新日時（メモの変更）';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_matching_suspension ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view coach matching suspensions" ON public.com_m_coach_matching_suspension;

-- [参照] アドミンのみ。登録・更新・削除のポリシーは作らない（admin_set_coach_matching_suspension() 経由のみ）
CREATE POLICY "Admins can view coach matching suspensions" ON public.com_m_coach_matching_suspension
FOR SELECT TO authenticated USING (
    COALESCE(public.get_jwt_user_type(), '') = '0'
);
