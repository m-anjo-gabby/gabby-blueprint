-- =========================================================================
-- com_t_matching_request: 専属コーチのマッチング申請
-- =========================================================================
-- 【役割】
-- ライブセッション付き契約の生徒が、希望するコーチに「毎週◯曜◯時」の枠を申請する。
-- 週n回契約では枠（slot_no）ごとに申請する（枠ごとに別のコーチでもよい）。
-- 承認されると approve_matching_request() が com_m_lesson_schedule（定期スケジュール）と
-- com_t_session（個々の回）を作る。同じチケット・同じ枠で承認待ち・承認済みの申請は1件だけ。
--
-- 【書き込み】
-- 生徒は自分のチケットへの申請の登録だけを直接行える。承認・否認・取り下げ・コーチ交代による終了・
-- 期限切れは SECURITY DEFINER の RPC で行う（approve / reject / withdraw_matching_request、
-- release_lesson_schedule_slot、expire_matching_requests）。
--
-- 【ステータス】
-- 1:承認待ち 2:承認済み 3:否認 4:取り下げ（一度も成立しなかった申請） 5:コーチ交代で終了（承認後に運用で終了） 6:期限切れ
-- 4 と 5 は「成立しなかった」か「成立して稼働した後に終了した」かを区別するために分けている。
--
-- 【時刻】
-- requested_day_of_week / start_time / end_time は生徒の現地時刻で持ち、そのタイムゾーン（申請時の
-- com_m_user.timezone）を requested_timezone に持つ。承認時に com_m_lesson_schedule.schedule_timezone へ
-- 引き継ぎ、夏時間の切り替えの前後でも生徒側の時刻を変えない。アドミンの直接マッチングも同じ扱い。
--
-- 【予約できる回数・回答期限】
-- 契約期間の全回を予約できなくても、割合（matching_min_bookable_rate()）以上なら申請できる。
-- 申請時に生徒が了承した回数を requested_bookable_sessions に残し、承認画面で現在の回数と比べる
-- （アドミンの直接マッチングでは NULL）。
-- 承認待ちは申請から24時間（matching_request_ttl()）で期限切れにする。expires_at は登録時のトリガーが入れ、
-- 期限切れの処理とコーチへの通知は function/expire_matching_requests.sql（pg_cron で毎分）。
-- =========================================================================

-- @schema public.com_t_matching_request
CREATE TABLE public.com_t_matching_request (
    request_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id                uuid         NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE RESTRICT,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    slot_no                  smallint     NOT NULL,
    requested_day_of_week    smallint     NOT NULL,
    requested_start_time     time without time zone NOT NULL,
    requested_end_time       time without time zone NOT NULL,
    status                   smallint     NOT NULL DEFAULT 1,
    reject_reason            text,
    responded_by             uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    responded_at             timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    requested_timezone       text         NOT NULL REFERENCES public.com_m_timezone(timezone) ON DELETE RESTRICT,
    requested_bookable_sessions smallint,
    expires_at               timestamp with time zone,
    CONSTRAINT chk_matching_request_day CHECK (requested_day_of_week >= 0 AND requested_day_of_week <= 6),
    CONSTRAINT chk_matching_request_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_matching_request_status CHECK (status = ANY (ARRAY[1, 2, 3, 4, 5, 6])),
    CONSTRAINT chk_matching_request_status_fields CHECK (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL OR status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL OR status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL OR status = 4 OR status = 5 AND responded_by IS NOT NULL AND responded_at IS NOT NULL OR status = 6 AND responded_by IS NULL AND responded_at IS NULL),
    CONSTRAINT chk_matching_request_time_range CHECK (requested_end_time > requested_start_time)
);

COMMENT ON TABLE public.com_t_matching_request IS '専属コーチマッチングリクエスト（生徒→コーチ。承認でlesson_schedule/sessionを自動生成）';
COMMENT ON COLUMN public.com_t_matching_request.request_id IS 'リクエストID';
COMMENT ON COLUMN public.com_t_matching_request.ticket_id IS '対象のライブセッションチケット (com_t_user_session_ticket)';
COMMENT ON COLUMN public.com_t_matching_request.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_t_matching_request.coach_id IS '希望コーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.slot_no IS '週n回契約のうち何枠目か（1始まり。枠ごとに別コーチも可）';
COMMENT ON COLUMN public.com_t_matching_request.requested_day_of_week IS '希望曜日 0:日 ... 6:土（requested_timezone基準）';
COMMENT ON COLUMN public.com_t_matching_request.requested_start_time IS '希望レッスン開始時刻（requested_timezoneの現地時刻）';
COMMENT ON COLUMN public.com_t_matching_request.requested_end_time IS '希望レッスン終了時刻（requested_timezoneの現地時刻、通常25分）';
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取り下げ。withdraw_matching_request) 5:ended(コーチ交代等によりアドミンが終了) 6:expired(回答期限切れ。fn_expire_matching_requests)';
COMMENT ON COLUMN public.com_t_matching_request.reject_reason IS '否認理由（コーチ入力必須）';
COMMENT ON COLUMN public.com_t_matching_request.responded_by IS '承認/否認を行ったコーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.responded_at IS '承認/否認日時';
COMMENT ON COLUMN public.com_t_matching_request.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_matching_request.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_matching_request.requested_timezone IS '希望曜日・時刻の解釈に使うIANAタイムゾーン（申請時の生徒のcom_m_user.timezone。2026-10-06より前の行はコーチのタイムゾーン）。承認時にcom_m_lesson_schedule.schedule_timezoneへ引き継ぐ';
COMMENT ON COLUMN public.com_t_matching_request.requested_bookable_sessions IS '申請時に予約できた回数（生徒が了承した回数。fn_matching_slot_availability の bookable_sessions）。2026-10-09より前の行・アドミンの直接マッチングはNULL';
COMMENT ON COLUMN public.com_t_matching_request.expires_at IS '回答期限（承認待ちの申請のみ。登録時にトリガーが NOW()+matching_request_ttl() を入れる）。過ぎると期限切れ(status=6)';

CREATE INDEX idx_matching_request_coach ON public.com_t_matching_request (coach_id, status);
CREATE INDEX idx_matching_request_coach_insert_date ON public.com_t_matching_request (coach_id, insert_date DESC);
CREATE INDEX idx_matching_request_pending_expires ON public.com_t_matching_request (expires_at) WHERE status = 1;
CREATE INDEX idx_matching_request_student ON public.com_t_matching_request (student_id, status);
CREATE UNIQUE INDEX uq_matching_request_active_slot ON public.com_t_matching_request (ticket_id, slot_no) WHERE status = ANY (ARRAY[1, 2]);

CREATE TRIGGER trg_matching_request_after_insert AFTER INSERT ON public.com_t_matching_request FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_after_insert();
CREATE TRIGGER trg_matching_request_before_insert BEFORE INSERT ON public.com_t_matching_request FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_before_insert();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_matching_request FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_matching_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view matching requests" ON public.com_t_matching_request FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Students can create their own matching requests" ON public.com_t_matching_request FOR INSERT TO authenticated
WITH CHECK (
    student_id = auth.uid() AND (ticket_id IN ( SELECT com_t_user_session_ticket.ticket_id
       FROM public.com_t_user_session_ticket
      WHERE com_t_user_session_ticket.user_id = auth.uid()))
);
-- @end-schema
