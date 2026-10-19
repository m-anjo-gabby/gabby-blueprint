-- =========================================================================
-- com_t_session_outcome_history: ライブセッションの実施結果の記録・修正の履歴
-- =========================================================================
-- 実施結果はコーチの申告で確定し（record_session_outcome）、アドミンが後から修正できる（admin_correct_session_outcome）。
-- 誰がいつ、どの結果からどの結果に変えたか・チケットを消化・返還したかを追記して残す（監査の履歴はログではなく DB に残す）。
-- 書き込みは fn_apply_session_outcome() だけ。参照はアドミンだけ。
--
-- outcome の値（SESSION_OUTCOME。packages/types/session.ts）:
--   1:実施完了 2:生徒の都合で早く終了 3:生徒の欠席 4:コーチの欠席 5:通信トラブル等で実施できなかった
-- 変更前の状態は status / completion_result / cancel_category の組で持つ（未確定（status=1）からの記録もあるため）。
-- =========================================================================

-- @schema public.com_t_session_outcome_history
CREATE TABLE public.com_t_session_outcome_history (
    history_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id               uuid         NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    action                   text         NOT NULL,
    outcome                  smallint     NOT NULL,
    conducted_via            smallint,
    suggested_outcome        smallint,
    previous_status          smallint     NOT NULL,
    previous_completion_result smallint,
    previous_cancel_category smallint,
    previous_conducted_via   smallint,
    ticket_action            text,
    reason                   text,
    performed_by             uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at             timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_session_outcome_history_action_check CHECK (action = ANY (ARRAY['recorded'::text, 'corrected'::text])),
    CONSTRAINT com_t_session_outcome_history_conducted_via_check CHECK (conducted_via = ANY (ARRAY[1, 2])),
    CONSTRAINT com_t_session_outcome_history_outcome_check CHECK (outcome >= 1 AND outcome <= 5),
    CONSTRAINT com_t_session_outcome_history_suggested_outcome_check CHECK (suggested_outcome = ANY (ARRAY[1, 2, 3])),
    CONSTRAINT com_t_session_outcome_history_ticket_action_check CHECK (ticket_action = ANY (ARRAY['consumed'::text, 'restored'::text]))
);

COMMENT ON TABLE public.com_t_session_outcome_history IS 'ライブセッションの実施結果の記録・修正の履歴（追記専用）';
COMMENT ON COLUMN public.com_t_session_outcome_history.action IS 'recorded:コーチが記録 corrected:アドミンが修正';
COMMENT ON COLUMN public.com_t_session_outcome_history.outcome IS '記録・修正後の結果 1:実施完了 2:生徒の都合で早く終了 3:生徒の欠席 4:コーチの欠席 5:通信トラブル等で実施できなかった';
COMMENT ON COLUMN public.com_t_session_outcome_history.conducted_via IS '記録・修正後の実施方法 1:アプリ内の通話 2:外部のZoom（結果が4・5の場合はNULL）';
COMMENT ON COLUMN public.com_t_session_outcome_history.suggested_outcome IS 'その時点の入退室ログから推定した結果（コーチの入室記録が無ければNULL）';
COMMENT ON COLUMN public.com_t_session_outcome_history.previous_status IS '変更前のstatus（1:未確定 2:completed 3:cancelled）';
COMMENT ON COLUMN public.com_t_session_outcome_history.ticket_action IS 'この操作でのチケットの変化 consumed:消化 restored:返還 NULL:変化なし';
COMMENT ON COLUMN public.com_t_session_outcome_history.reason IS 'コーチ・アドミンが入力した理由';
COMMENT ON COLUMN public.com_t_session_outcome_history.performed_by IS '操作したユーザー（コーチまたはアドミン）';

CREATE INDEX idx_session_outcome_history_session ON public.com_t_session_outcome_history (session_id, performed_at DESC);

ALTER TABLE public.com_t_session_outcome_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view session outcome history" ON public.com_t_session_outcome_history FOR SELECT TO authenticated
USING (
    public.is_system_admin()
);
-- @end-schema
