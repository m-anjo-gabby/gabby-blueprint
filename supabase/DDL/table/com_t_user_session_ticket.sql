---------------------------------------------
-- DDL: com_t_user_session_ticket (ライブセッションチケット実体) (2026-08-13 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- Blueprint契約に付帯するライブセッション（オンラインレッスン）の消化数を
-- 生徒個人単位で管理する。com_t_user_license（Blueprintアクセス権・期間の
-- 有効/無効を扱う）とは関心を分離し、本テーブルは「回数を消費するストック」
-- のみを扱う。ライブセッションは常にBlueprint契約に付帯し、有効期間も
-- 付帯元の com_t_user_license と一致する前提のため、独立した期間カラムは
-- 持たず license_id に1:1で紐づける。
--
-- 【消化ルール】
-- used_sessions は「予約（仮押さえ）」ではなく「実施完了」の都度、
-- 将来実装する予約管理機能が加算する想定。事前キャンセルや、コーチ都合による
-- 別日への振替は、実施完了前であれば used_sessions を変更しないため
-- 自然にチケットを消費しない（＝振替として扱える）。既にconsumedとして
-- 記録した後の取り消し（コーチ都合の実施不能等）が必要な場合は、
-- com_t_user_session_ticket_history に 'restored' として記録した上で
-- used_sessions を減算する運用とする。
---------------------------------------------
CREATE TABLE public.com_t_user_session_ticket (
    ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id uuid NOT NULL UNIQUE REFERENCES public.com_t_user_license(license_id) ON DELETE CASCADE,
    contract_id uuid NOT NULL REFERENCES public.com_m_contract(contract_id), -- 集計高速化用の非正規化参照（com_t_user_licenseと同パターン）
    user_id uuid NOT NULL REFERENCES public.com_m_user(id),
    weekly_frequency smallint NOT NULL,
    total_sessions smallint NOT NULL,
    used_sessions smallint NOT NULL DEFAULT 0,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ticket_weekly_frequency CHECK (weekly_frequency IN (1, 2)),
    CONSTRAINT chk_ticket_used_sessions_range CHECK (used_sessions >= 0 AND used_sessions <= total_sessions)
);

COMMENT ON TABLE public.com_t_user_session_ticket IS 'ライブセッションチケット実体（生徒単位の消化管理。com_t_user_licenseと1:1）';
COMMENT ON COLUMN public.com_t_user_session_ticket.ticket_id IS 'チケットID';
COMMENT ON COLUMN public.com_t_user_session_ticket.license_id IS '紐づくBlueprintライセンス（1:1、有効期間はこちらに準じる）';
COMMENT ON COLUMN public.com_t_user_session_ticket.contract_id IS '契約ID（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_user_session_ticket.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_session_ticket.weekly_frequency IS '週あたりのライブセッション回数（1 or 2）';
COMMENT ON COLUMN public.com_t_user_session_ticket.total_sessions IS '契約期間内の総チケット数';
COMMENT ON COLUMN public.com_t_user_session_ticket.used_sessions IS '消化済み数（将来の予約管理がセッション実施完了時に加算）';
COMMENT ON COLUMN public.com_t_user_session_ticket.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_session_ticket.update_date IS '更新日時';

CREATE INDEX idx_session_ticket_user ON public.com_t_user_session_ticket (user_id);
CREATE INDEX idx_session_ticket_contract ON public.com_t_user_session_ticket (contract_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_session_ticket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant session tickets" ON public.com_t_user_session_ticket;

CREATE POLICY "Users can view relevant session tickets" ON public.com_t_user_session_ticket
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract
        WHERE client_id = public.get_jwt_client_id()
    )
);

---------------------------------------------
-- 追加パッチ: 週3回以上のカスタムプランに対応 (2026-08-15)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
ALTER TABLE public.com_t_user_session_ticket DROP CONSTRAINT IF EXISTS chk_ticket_weekly_frequency;
ALTER TABLE public.com_t_user_session_ticket ADD CONSTRAINT chk_ticket_weekly_frequency CHECK (weekly_frequency >= 1);

COMMENT ON COLUMN public.com_t_user_session_ticket.weekly_frequency IS '週あたりのライブセッション回数（1以上）';

---------------------------------------------
-- 追加パッチ: 担当コーチ向けの参照許可 (2026-09-03)
-- 既存環境に対しては、このCREATE POLICY文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- [参照] Student Overview画面で、契約セッション数に対する未消化枠（申請タイミングにより
-- 全回数を予約しきれないケース）を検知・表示するため、担当コーチ(com_m_coach_student_relationship
-- で結びついたコーチ。status不問。コーチ交代後の引き継ぎ閲覧を想定)がticketのtotal_sessions/
-- weekly_frequencyを参照できるようにする。既存の本人・契約先クライアント向けポリシーはそのまま
-- 残るため、本人のアクセスは変わらない（追加の許可のみ）。
DROP POLICY IF EXISTS "Coaches can view session tickets of their students" ON public.com_t_user_session_ticket;
CREATE POLICY "Coaches can view session tickets of their students" ON public.com_t_user_session_ticket
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_user_session_ticket.user_id AND r.coach_id = auth.uid()
    )
);
