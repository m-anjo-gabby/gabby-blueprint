---------------------------------------------
-- DDL: com_t_matching_request (専属コーチマッチングリクエスト) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_user_session_ticket.sql, table/com_m_coach_availability.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- ライブセッション付き契約の生徒が、希望コーチに対して「毎週◯曜◯時」の
-- 専属レッスン枠をリクエストし、コーチが承認/否認するためのテーブル。
-- 週n回契約の場合、生徒は枠の数だけ（slot_noごとに）リクエストを行う
-- （週2回契約で別々のコーチにリクエストすることも許容する）。
-- 承認されると public.approve_matching_request() が呼ばれ、
-- com_m_lesson_schedule（定期スケジュール）とcom_t_session（個別回）が
-- 自動生成される。ステータス変更（承認/否認）はRLSでの直接UPDATEを許可せず、
-- 常に approve_matching_request() / reject_matching_request() （いずれもSECURITY DEFINER）
-- 経由に限定する。
---------------------------------------------
CREATE TABLE public.com_t_matching_request (
    request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    slot_no smallint NOT NULL, -- 週n回契約のうち何枠目のリクエストか（1始まり）
    requested_day_of_week smallint NOT NULL, -- 0:日 ... 6:土（coach_idのローカル時刻基準）
    requested_start_time time NOT NULL,
    requested_end_time time NOT NULL,
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:approved 3:rejected 4:cancelled
    reject_reason text DEFAULT NULL,
    responded_by uuid REFERENCES public.com_m_user(id),
    responded_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_matching_request_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_matching_request_day CHECK (requested_day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_matching_request_time_range CHECK (requested_end_time > requested_start_time),
    CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_matching_request_status_fields CHECK (
        (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
        OR
        (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
        OR
        (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
        OR
        (status = 4)
    )
);

COMMENT ON TABLE public.com_t_matching_request IS '専属コーチマッチングリクエスト（生徒→コーチ。承認でlesson_schedule/sessionを自動生成）';
COMMENT ON COLUMN public.com_t_matching_request.request_id IS 'リクエストID';
COMMENT ON COLUMN public.com_t_matching_request.ticket_id IS '対象のライブセッションチケット (com_t_user_session_ticket)';
COMMENT ON COLUMN public.com_t_matching_request.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_t_matching_request.coach_id IS '希望コーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.slot_no IS '週n回契約のうち何枠目か（1始まり。枠ごとに別コーチも可）';
COMMENT ON COLUMN public.com_t_matching_request.requested_day_of_week IS '希望曜日 0:日 ... 6:土（コーチのローカル時刻基準）';
COMMENT ON COLUMN public.com_t_matching_request.requested_start_time IS '希望レッスン開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_t_matching_request.requested_end_time IS '希望レッスン終了時刻（コーチのローカル時刻、通常25分）';
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取消)';
COMMENT ON COLUMN public.com_t_matching_request.reject_reason IS '否認理由（コーチ入力必須）';
COMMENT ON COLUMN public.com_t_matching_request.responded_by IS '承認/否認を行ったコーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.responded_at IS '承認/否認日時';
COMMENT ON COLUMN public.com_t_matching_request.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_matching_request.update_date IS '更新日時';

-- 同一チケット・同一枠について、承認待ち/承認済みのリクエストは同時に1件のみ許容する
CREATE UNIQUE INDEX uq_matching_request_active_slot ON public.com_t_matching_request (ticket_id, slot_no)
    WHERE status IN (1, 2);

CREATE INDEX idx_matching_request_student ON public.com_t_matching_request (student_id, status);
CREATE INDEX idx_matching_request_coach ON public.com_t_matching_request (coach_id, status);
-- コーチ側「申請一覧」画面のHistoryタブ(getMatchingRequestHistoryPageAsCoachCore)は
-- coach_id絞り込み + insert_date降順のカーソルページングのため必要 (2026-09-14 追加)
CREATE INDEX idx_matching_request_coach_insert_date ON public.com_t_matching_request (coach_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_matching_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view matching requests" ON public.com_t_matching_request;
DROP POLICY IF EXISTS "Students can create their own matching requests" ON public.com_t_matching_request;
DROP POLICY IF EXISTS "Students can cancel their own pending requests" ON public.com_t_matching_request;

-- [参照] 生徒本人・宛先コーチ・管理者のみ閲覧可能
CREATE POLICY "Involved users can view matching requests" ON public.com_t_matching_request
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 生徒本人が、自身のチケットに対してのみリクエストを作成可能
CREATE POLICY "Students can create their own matching requests" ON public.com_t_matching_request
FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid()
    AND ticket_id IN (
        SELECT ticket_id FROM public.com_t_user_session_ticket WHERE user_id = auth.uid()
    )
);

-- [取消] 生徒本人がpending状態の自身のリクエストのみ取消（status=4）可能。承認/否認はRPC経由のみ。
CREATE POLICY "Students can cancel their own pending requests" ON public.com_t_matching_request
FOR UPDATE TO authenticated
USING (student_id = auth.uid() AND status = 1)
WITH CHECK (student_id = auth.uid() AND status = 4);

-- 承認/否認（status: 1→2, 1→3）は approve_matching_request() / reject_matching_request()
-- （SECURITY DEFINER）からのみ実行可能。コーチによる直接UPDATEは許可しない。

---------------------------------------------
-- 追加パッチ: コーチ交代によるリクエスト終了ステータス追加 (2026-09-08)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 契約途中でのコーチ交代（アドミンのライブセッション管理画面から実行）は、承認済み
-- (status=2)のリクエストを終了させ、同じ(ticket_id, slot_no)に対して生徒が新しいコーチへ
-- 再度リクエストできるようにする必要がある。既存のstatus=4(cancelled)は「一度も
-- 成立しなかった申請を生徒が取り消した」ことを表す値のため、「一度承認されて稼働した後、
-- 運用都合で終了した」ケースに流用すると、過去の記録から両者を区別できなくなり監査上
-- 好ましくない。そのため専用の値を新設する。
ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4, 5));

ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status_fields;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status_fields CHECK (
    (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
    OR
    (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
    OR
    (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
    OR
    (status = 4)
    OR
    (status = 5 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
);

COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取消) 5:ended(コーチ交代等によりアドミンが終了)';

---------------------------------------------
-- 追加パッチ: 申請時の生徒のタイムゾーン (2026-10-06)
-- 既存環境に対しては、このブロックのみを実行してください（何度実行しても安全）。
-- 前提: table/com_m_lesson_schedule.sql の schedule_timezone への列名変更パッチが適用済みであること。
---------------------------------------------
-- 【背景】
-- requested_day_of_week/requested_start_time/requested_end_time をコーチの現地時刻で持っていたため、
-- コーチ側の夏時間の切り替えで、生徒から見たセッションの時刻が1時間ずれていた。
-- 以後は、生徒が選んだ曜日・時刻を生徒の現地時刻のまま持ち、そのタイムゾーン（申請時の
-- com_m_user.timezone のスナップショット）を requested_timezone に保存する。承認時は
-- com_m_lesson_schedule.schedule_timezone に引き継ぎ、契約期間中の全回を生徒側で同じ時刻にする
-- （例: 20:00 に申請したら、夏時間の切り替えの前後どちらの回も 20:00）。
-- アドミンの直接マッチング（admin_match_student_with_coach）も、入力された曜日・時刻を生徒の時刻として扱う。
--
-- 【既存行】
-- 従来の解釈基準（コーチのタイムゾーン）を入れる。承認済みは成立した定期スケジュールの値、
-- それ以外は宛先コーチの現在のタイムゾーン。
---------------------------------------------
ALTER TABLE public.com_t_matching_request
  ADD COLUMN IF NOT EXISTS requested_timezone text REFERENCES public.com_m_timezone(timezone);

UPDATE public.com_t_matching_request r
SET requested_timezone = s.schedule_timezone
FROM public.com_m_lesson_schedule s
WHERE s.source_request_id = r.request_id AND r.requested_timezone IS NULL;

UPDATE public.com_t_matching_request r
SET requested_timezone = COALESCE(u.timezone, 'Asia/Tokyo')
FROM public.com_m_user u
WHERE u.id = r.coach_id AND r.requested_timezone IS NULL;

ALTER TABLE public.com_t_matching_request ALTER COLUMN requested_timezone SET NOT NULL;

COMMENT ON COLUMN public.com_t_matching_request.requested_day_of_week IS '希望曜日 0:日 ... 6:土（requested_timezone基準）';
COMMENT ON COLUMN public.com_t_matching_request.requested_start_time IS '希望レッスン開始時刻（requested_timezoneの現地時刻）';
COMMENT ON COLUMN public.com_t_matching_request.requested_end_time IS '希望レッスン終了時刻（requested_timezoneの現地時刻、通常25分）';
COMMENT ON COLUMN public.com_t_matching_request.requested_timezone IS '希望曜日・時刻の解釈に使うIANAタイムゾーン（申請時の生徒のcom_m_user.timezone。2026-10-06より前の行はコーチのタイムゾーン）。承認時にcom_m_lesson_schedule.schedule_timezoneへ引き継ぐ';
