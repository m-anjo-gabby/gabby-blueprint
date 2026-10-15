-- =========================================================================
-- com_t_session_call_log: ライブセッションの通話の入退室の記録
-- =========================================================================
-- 【役割】
-- 通信やマイク・カメラの都合で入退室を繰り返すことがあるため、1回の入室を1行で記録する。
-- 実施結果を確定するとき、ここでの重なりから推定した結果（com_t_session.suggested_outcome）を出し、
-- コーチの申告と比べる材料にする。
--
-- 【時刻を偽れないようにする】
-- joined_at / left_at はサーバーの NOW() だけで入れ、クライアントから値を渡す経路を持たない。
-- 書き込みは record_session_call_join() / record_session_call_leave()（SECURITY DEFINER）だけで、
-- authenticated に INSERT / UPDATE / DELETE の権限は与えない。
-- 参照はセッションの生徒本人・担当コーチ・管理者。
-- =========================================================================

-- @schema public.com_t_session_call_log
CREATE TABLE public.com_t_session_call_log (
    call_log_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id               uuid         NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id),
    role                     text         NOT NULL,
    zoom_session_id          text,
    joined_at                timestamp with time zone NOT NULL DEFAULT now(),
    left_at                  timestamp with time zone,
    CONSTRAINT chk_call_log_left_after_join CHECK (left_at IS NULL OR left_at >= joined_at),
    CONSTRAINT chk_call_log_role CHECK (role = ANY (ARRAY['coach'::text, 'student'::text]))
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

ALTER TABLE public.com_t_session_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view call log" ON public.com_t_session_call_log FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = com_t_session_call_log.session_id AND (s.coach_id = auth.uid() OR s.student_id = auth.uid()))) OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
