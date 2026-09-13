---------------------------------------------
-- DDL: com_t_coach_monthly_report_approval (コーチ月次コーチングレポート承認) (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- コーチ毎・月次のライブセッション実施状況（Monthly Coaching Report）をアドミンが確認し、
-- その月のコーチの稼働を確定させるための承認記録。コーチ側から申請する概念は無く、
-- アドミンが一方的に「承認」または「承認取消し」（承認後に誤りへ気付いた場合の取消しのみ）を
-- 行うシンプルな2状態モデル（1:未承認 2:承認済み）とする。差し戻し履歴は保持せず、
-- (coach_id, report_month) に対して常に最新状態の1行のみを保持する。
--
-- 承認時点のセッション集計値は session_count_snapshot にJSONBで固定保存する。これにより、
-- 承認後に過去分セッションの終了処理漏れが事後解決される等でカウントが変動しても、
-- 承認済み表示（当時の数値）は影響を受けない。承認取消し時は次の承認まで意味を持たないため
-- NULLに戻す。
--
-- 【書き込み経路】
-- 本テーブルへの直接書き込みはRLSで許可しない。承認/承認取消しは
-- function/approve_coach_monthly_report.sql / function/revoke_coach_monthly_report_approval.sql
-- （いずれもSECURITY DEFINER、管理者専用）経由のみとする。
---------------------------------------------
CREATE TABLE public.com_t_coach_monthly_report_approval (
    approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    report_month date NOT NULL, -- 対象月の1日 (例: 2026-09-01)
    status smallint NOT NULL DEFAULT 1, -- 1:未承認 2:承認済み
    session_count_snapshot jsonb DEFAULT NULL, -- 承認時点の集計 {"total": n, "by_student": [{"student_id":"...", "count": n}]}
    approved_by uuid REFERENCES public.com_m_user(id),
    approved_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE (coach_id, report_month),
    CONSTRAINT chk_report_approval_status CHECK (status IN (1, 2))
);

COMMENT ON TABLE public.com_t_coach_monthly_report_approval IS 'コーチ月次コーチングレポートの承認状態（アドミンが承認/承認取消しを行う。コーチからの申請概念は無い）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approval_id IS '承認レコードID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.coach_id IS '対象コーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.report_month IS '対象年月（その月の1日で表現、例: 2026-09-01）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.status IS 'ステータス 1:未承認 2:承認済み';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.session_count_snapshot IS '承認時点のセッション集計スナップショット（承認取消し時にNULLへ戻す）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_by IS '承認を行った管理者のユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_at IS '承認日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.update_date IS '更新日時';

CREATE INDEX idx_coach_monthly_report_approval_coach ON public.com_t_coach_monthly_report_approval (coach_id, report_month);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_coach_monthly_report_approval ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and admin can view monthly report approval" ON public.com_t_coach_monthly_report_approval;

-- [参照] コーチ本人・管理者のみ閲覧可能。書き込みはSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE/DELETE権限は付与しない。
CREATE POLICY "Coach and admin can view monthly report approval" ON public.com_t_coach_monthly_report_approval
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);
