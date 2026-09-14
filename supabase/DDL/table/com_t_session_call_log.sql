---------------------------------------------
-- DDL: com_t_session_call_log (ライブセッション通話 入退室ログ) (2026-09-04 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- Zoom Video SDKのライブ通話ルームをcom_t_sessionに紐づけるにあたり、
-- 通信環境やマイク・カメラの都合でコーチ・生徒とも入退室を複数回繰り返す
-- 可能性があるため、1回の入室を1行として記録する（JSONBの単一カラムに
-- 複数インスタンスを詰め込む方式は、双方のブラウザが非同期に書き込む際の
-- 競合・取りこぼしリスクがあるため採用しない）。
--
-- 【時刻の真正性】
-- joined_at/left_atはいずれもDEFAULT NOW()およびSECURITY DEFINER関数内の
-- NOW()でのみ設定され、クライアントから値を指定する経路を持たない
-- （record_session_call_join/record_session_call_leave参照）。これは
-- finalize_session()が本テーブルの重複在室時間からcompleted/no_show/
-- early_endedを自動判定する際の基礎データであり、コーチの実施実績・
-- 人事評価・チケット消化に直結するため、クライアント側からの時刻偽装を
-- 構造的に不可能にする。
---------------------------------------------
CREATE TABLE public.com_t_session_call_log (
    call_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.com_m_user(id),
    role text NOT NULL,
    zoom_session_id text DEFAULT NULL,
    joined_at timestamp with time zone NOT NULL DEFAULT NOW(),
    left_at timestamp with time zone DEFAULT NULL,

    CONSTRAINT chk_call_log_role CHECK (role IN ('coach', 'student')),
    CONSTRAINT chk_call_log_left_after_join CHECK (left_at IS NULL OR left_at >= joined_at)
);

COMMENT ON TABLE public.com_t_session_call_log IS 'ライブセッション通話 入退室ログ（1入室=1行、再接続を複数行で表現）';
COMMENT ON COLUMN public.com_t_session_call_log.call_log_id IS '入退室ログID';
COMMENT ON COLUMN public.com_t_session_call_log.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_call_log.user_id IS '入室したユーザID（コーチまたは生徒）';
COMMENT ON COLUMN public.com_t_session_call_log.role IS '入室者の役割 (coach, student)';
COMMENT ON COLUMN public.com_t_session_call_log.zoom_session_id IS 'Zoom Video SDKのgetSessionInfo().sessionId（通話インスタンス単位、相関/デバッグ用途のみで判定には不使用）';
COMMENT ON COLUMN public.com_t_session_call_log.joined_at IS '入室日時（サーバー確定、クライアント指定不可）';
COMMENT ON COLUMN public.com_t_session_call_log.left_at IS '退室日時（サーバー確定、クライアント指定不可。NULLは未クローズ=在室中とみなす）';

CREATE INDEX idx_session_call_log_session ON public.com_t_session_call_log (session_id, joined_at);
CREATE INDEX idx_session_call_log_user ON public.com_t_session_call_log (user_id, joined_at);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view call log" ON public.com_t_session_call_log;

-- [参照] 対象セッションの生徒本人・担当コーチ・管理者のみ閲覧可能。
-- 書き込みは record_session_call_join()/record_session_call_leave() の
-- SECURITY DEFINER関数経由のみとし、authenticatedロールへの
-- INSERT/UPDATE/DELETE権限は一切付与しない（時刻の真正性を担保するため）。
CREATE POLICY "Involved users can view call log" ON public.com_t_session_call_log
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_call_log.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);
