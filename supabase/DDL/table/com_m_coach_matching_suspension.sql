-- =========================================================================
-- com_m_coach_matching_suspension: コーチのマッチングの休止（アドミンによる）
-- =========================================================================
-- 【役割】
-- 休止するコーチを生徒の「専属コーチを探す」から外す。マッチングの対象の ON/OFF は次の2つで、どちらかが OFF なら一覧に出ない。
--   コーチ本人の受付: com_m_coach_profile.accepting_students（コーチがプロフィールで切り替える）
--   アドミンの休止  : 本テーブル（行がある＝休止中）。コーチ本人は解除できない。
-- 休止で止めるのは新しいマッチング（一覧への表示と申請）だけで、担当中の生徒・確定済みのセッション・回答待ちの申請は続く。
--
-- 【書き込み・参照】
-- 休止の理由は運営の内部メモのため、誰でも読めるプロフィールとは別のテーブルにし、参照はアドミンだけにする
-- （コーチ本人には get_coach_matching_status() で休止中かどうかだけを返す）。
-- 登録・解除は admin_set_coach_matching_suspension() だけ（休止＝行の登録・更新、解除＝行の削除）。
-- 一覧に出るかの判定は get_matchable_coach_ids()。
-- =========================================================================

-- @schema public.com_m_coach_matching_suspension
CREATE TABLE public.com_m_coach_matching_suspension (
    coach_id                 uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note                     text,
    suspended_by             uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_coach_matching_suspension IS 'コーチのマッチング休止（アドミンが設定。行がある間は生徒のコーチ選択に出さない）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.coach_id IS 'コーチのユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.note IS '休止の理由（運営の内部メモ。アドミンのみ参照）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.suspended_by IS '最後に設定したアドミン (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.insert_date IS '休止した日時';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.update_date IS '更新日時（メモの変更）';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_coach_matching_suspension FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_coach_matching_suspension ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view coach matching suspensions" ON public.com_m_coach_matching_suspension FOR SELECT TO authenticated
USING (
    COALESCE(public.get_jwt_user_type(), ''::text) = '0'::text
);
-- @end-schema
