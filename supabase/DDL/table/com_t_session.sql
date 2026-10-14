-- =========================================================================
-- com_t_session: ライブセッションの個々の実施回
-- =========================================================================
-- 【役割】
-- 定期スケジュール（com_m_lesson_schedule。毎週◯曜◯時）から契約期間分まとめて生成される、
-- 日時の決まった1回ずつのセッション。予定の確認・キャンセル・予約はすべて本テーブルの行に対して行い、
-- 定期スケジュールは変えない。
--
-- 【書き込み】
-- RLS は参照のみ許可し、追加・更新は SECURITY DEFINER の RPC だけで行う
-- （生成: fn_generate_sessions_for_schedule、キャンセル: cancel_session、結果の確定: record_session_outcome、
-- 結果の修正: admin_correct_session_outcome 等）。
--
-- 【参照できる範囲】
-- 生徒本人・担当コーチ・管理者に加え、その生徒とマッチングしたことのあるコーチ（現在・過去）も参照できる
-- （週2回契約で別のコーチが分担する場合や、担当が交代した場合に一覧で見せるため）。
-- そのため「自分の予定」を取得するコードは、RLS に任せず coach_id / student_id で明示的に絞り込むこと。
-- 結果の詳細（com_t_session_call_log / chat / homework）は担当者だけが見られる。
--
-- 【ステータス】
-- status は 1:予定 2:実施済み 3:キャンセル の3値。内訳は別の列で持つ。
--   実施済みの内訳 → completion_result（1:実施完了 2:早期終了 3:生徒の欠席）
--   キャンセルの起因 → cancel_category（1:生徒 2:コーチ 3:アドミン 4:ライセンス無効化 5:コーチ交代 6:通信トラブル等）
-- 実施結果はコーチの申告（End Session）を正とする。入退室ログから推定した結果は suggested_outcome に残し、
-- 申告と違う場合は outcome_mismatch を立ててアドミンの確認対象にする。
--
-- 【チケット】
-- 実施済み（completion_result 1〜3 のいずれも）でチケットを1回消化し、ticket_consumed を true にする。
-- キャンセルの返還有無は ticket_refunded（生徒: 開始12時間以上前なら返還、コーチ・通信トラブル等: 常に返還、
-- アドミン: 操作時に指定）。NULL の行（ライセンス無効化・コーチ交代等の自動キャンセル）は返還扱い。
--
-- 【一意制約】
-- uq_session_schedule_datetime は予定（status=1）の行だけが対象。キャンセル済みの行と同じ日時に
-- 予約し直せるようにするため、全行を対象にしない。
-- =========================================================================

-- @schema public.com_t_session
CREATE TABLE public.com_t_session (
    session_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id              uuid         NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    ticket_id                uuid         NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id),
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id),
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id),
    start_datetime           timestamp with time zone NOT NULL,
    end_datetime             timestamp with time zone NOT NULL,
    status                   smallint     NOT NULL DEFAULT 1,
    rescheduled_from         uuid         REFERENCES public.com_t_session(session_id),
    cancel_reason            text,
    cancelled_by             uuid         REFERENCES public.com_m_user(id),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    status_note              text,
    ticket_refunded          boolean,
    completion_result        smallint,
    cancel_category          smallint,
    conducted_via            smallint,
    suggested_outcome        smallint,
    outcome_mismatch         boolean      NOT NULL DEFAULT false,
    ticket_consumed          boolean      NOT NULL DEFAULT false,
    homework_not_needed      boolean      NOT NULL DEFAULT false,
    CONSTRAINT chk_session_cancel_category CHECK (status = 3 AND (cancel_category = ANY (ARRAY[1, 2, 3, 4, 5, 6])) OR status <> 3 AND cancel_category IS NULL),
    CONSTRAINT chk_session_completion_result CHECK (status = 2 AND (completion_result = ANY (ARRAY[1, 2, 3])) OR status <> 2 AND completion_result IS NULL),
    CONSTRAINT chk_session_conducted_via CHECK (conducted_via IS NULL OR status = 2 AND (conducted_via = ANY (ARRAY[1, 2]))),
    CONSTRAINT chk_session_status CHECK (status = ANY (ARRAY[1, 2, 3])),
    CONSTRAINT chk_session_suggested_outcome CHECK (suggested_outcome IS NULL OR (suggested_outcome = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT chk_session_time_range CHECK (end_datetime > start_datetime)
);

COMMENT ON TABLE public.com_t_session IS '個別レッスンセッション実体（定期スケジュールから自動生成される実施回）';
COMMENT ON COLUMN public.com_t_session.session_id IS 'セッションID';
COMMENT ON COLUMN public.com_t_session.schedule_id IS '生成元の定期スケジュール (com_m_lesson_schedule)';
COMMENT ON COLUMN public.com_t_session.ticket_id IS '対象のライブセッションチケット（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_session.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_t_session.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_t_session.start_datetime IS '実施開始日時（絶対時刻、UTC格納）';
COMMENT ON COLUMN public.com_t_session.end_datetime IS '実施終了日時（絶対時刻、UTC格納）';
COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed(内訳はcompletion_result参照) 3:cancelled(起因はcancel_category、返還有無はticket_refundedを参照)';
COMMENT ON COLUMN public.com_t_session.rescheduled_from IS '振替元セッションID（振替先の新規行から元の行を参照。同一schedule_id内に限定。制御はRPC側で担保）';
COMMENT ON COLUMN public.com_t_session.cancel_reason IS 'キャンセルの理由';
COMMENT ON COLUMN public.com_t_session.cancelled_by IS 'キャンセルを行ったユーザID（自動キャンセル・アドミンの代理操作では操作した運用者）';
COMMENT ON COLUMN public.com_t_session.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_session.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_session.status_note IS '実施結果の理由（早期終了・外部のZoomで実施・推定と違う結果にした理由、旧Resolve Manuallyの理由）。cancel_reasonとは意味的に分離';
COMMENT ON COLUMN public.com_t_session.ticket_refunded IS 'キャンセル(status=3)の行のみ。true:チケット返還(未割当に戻り再予約可能) false:返還なし(消化扱い)。生徒は開始12時間以上前ならtrue、コーチ・通信トラブル等は常にtrue、アドミンは操作時に指定。NULLの行(自動キャンセル等)は返還扱い';
COMMENT ON COLUMN public.com_t_session.completion_result IS 'status=2(completed)の内訳。1:normal(実施完了) 2:early_ended(生徒の都合で早く終了。理由はstatus_note) 3:no_show(生徒の欠席)。いずれもチケットを消化する（2026-10-14以前に確定した2・3は消化していない。ticket_consumed参照）。status<>2の行では常にNULL。';
COMMENT ON COLUMN public.com_t_session.cancel_category IS 'status=3(cancelled)の起因。1:student(生徒本人) 2:coach(コーチ本人。開始後に記録したコーチの欠席を含む) 3:admin(アドミン代理操作・旧reschedule含む) 4:license_ended(ライセンス無効化による自動キャンセル) 5:coach_reassigned(コーチ交代による自動キャンセル) 6:technical(通信トラブル等、こちら側の都合で実施できなかった)。status<>3の行では常にNULL。返還有無はticket_refundedを別途参照。';
COMMENT ON COLUMN public.com_t_session.conducted_via IS '実施方法 1:アプリ内の通話 2:外部のZoom（代替措置。理由はstatus_note）。status=2の行のみ。NULLは不明（旧経路で確定し、コーチの入室記録が無い行）';
COMMENT ON COLUMN public.com_t_session.suggested_outcome IS '確定時点の入退室ログから推定した結果 1:実施完了(重なり20分以上) 2:早期終了(20分未満・生徒の入室あり) 3:生徒の欠席。コーチの入室記録が無ければNULL';
COMMENT ON COLUMN public.com_t_session.outcome_mismatch IS 'アプリ内の通話で実施したと申告した結果が推定(suggested_outcome)と違う。アドミンが結果を修正するとfalseに戻る';
COMMENT ON COLUMN public.com_t_session.ticket_consumed IS 'このセッションでチケットを1回消化したか（used_sessionsに加算済みか）。アドミンの修正で消化・返還の差分を出すために使う';
COMMENT ON COLUMN public.com_t_session.homework_not_needed IS 'コーチが「今回は宿題なし」にした（Session Tasks の Homework not posted に出さない）';

CREATE INDEX idx_session_coach ON public.com_t_session (coach_id, start_datetime);
CREATE INDEX idx_session_schedule ON public.com_t_session (schedule_id);
CREATE INDEX idx_session_student ON public.com_t_session (student_id, start_datetime);
CREATE INDEX idx_session_ticket ON public.com_t_session (ticket_id);
CREATE UNIQUE INDEX uq_session_schedule_datetime ON public.com_t_session (schedule_id, start_datetime) WHERE status = 1;

ALTER TABLE public.com_t_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view sessions" ON public.com_t_session FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR coach_id = auth.uid() OR (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_session.student_id AND r.coach_id = auth.uid())) OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
