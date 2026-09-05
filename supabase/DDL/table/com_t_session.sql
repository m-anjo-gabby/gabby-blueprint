---------------------------------------------
-- DDL: com_t_session (個別レッスンセッション実体) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_m_lesson_schedule.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_lesson_schedule（毎週◯曜◯時の定期パターン）から契約期間分まとめて
-- 自動生成される、実際の日時を持つ個々のレッスン実施回（フロー図の③Session）。
-- 「9/1 19:00」「9/8 19:00」のような個別回はここで管理し、生徒・コーチ双方の
-- カレンダー（予定確認・キャンセル・振替・日時変更）はcom_m_lesson_scheduleではなく
-- 本テーブルの個別行に対して行う。それにより定期スケジュールの基本パターンを
-- 変更せずに個別回だけを動かせる。
--
-- 【消化ルール】
-- com_t_user_session_ticket.used_sessions は「実施完了(status=2:completed)」の
-- 都度、将来実装する完了処理（バッチ/コーチ操作）が加算する想定。
-- 事前キャンセル・振替は実施完了前の状態変更のため、自然にチケットを消費しない。
--
-- 【ビデオ通話URL】
-- セッション毎の個別URLは持たず、com_m_coach_profile.zoom_meeting_url
-- （コーチ固定のZoom URL）を都度参照する。
--
-- 【Phase1スコープについて】
-- 本テーブルへのINSERTは fn_generate_sessions_for_schedule()（SECURITY DEFINER）
-- 経由のみ。キャンセル・振替・日時変更用のUPDATE手段（RPC/画面）はPhase3で追加する。
---------------------------------------------
CREATE TABLE public.com_t_session (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id),
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    start_datetime timestamp with time zone NOT NULL, -- 実施開始日時（絶対時刻）
    end_datetime timestamp with time zone NOT NULL,   -- 実施終了日時（絶対時刻）
    status smallint NOT NULL DEFAULT 1, -- 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled 6:no_show
    rescheduled_from uuid REFERENCES public.com_t_session(session_id), -- 振替元セッション（同一schedule_id内に限定。制御はRPC側で担保）
    cancel_reason text DEFAULT NULL,
    cancelled_by uuid REFERENCES public.com_m_user(id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_time_range CHECK (end_datetime > start_datetime),
    CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6))
);

COMMENT ON TABLE public.com_t_session IS '個別レッスンセッション実体（定期スケジュールから自動生成される実施回）';
COMMENT ON COLUMN public.com_t_session.session_id IS 'セッションID';
COMMENT ON COLUMN public.com_t_session.schedule_id IS '生成元の定期スケジュール (com_m_lesson_schedule)';
COMMENT ON COLUMN public.com_t_session.ticket_id IS '対象のライブセッションチケット（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_session.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_t_session.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_t_session.start_datetime IS '実施開始日時（絶対時刻、UTC格納）';
COMMENT ON COLUMN public.com_t_session.end_datetime IS '実施終了日時（絶対時刻、UTC格納）';
COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show';
COMMENT ON COLUMN public.com_t_session.rescheduled_from IS '振替元セッションID（振替先の新規行から元の行を参照。同一schedule_id内に限定）';
COMMENT ON COLUMN public.com_t_session.cancel_reason IS 'キャンセル・振替理由';
COMMENT ON COLUMN public.com_t_session.cancelled_by IS 'キャンセル・振替を行ったユーザID';
COMMENT ON COLUMN public.com_t_session.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_session.update_date IS '更新日時';

-- fn_generate_sessions_for_schedule() の冪等性担保用（同一スケジュール・同一開始日時の重複生成を防止）
CREATE UNIQUE INDEX uq_session_schedule_datetime ON public.com_t_session (schedule_id, start_datetime);

CREATE INDEX idx_session_schedule ON public.com_t_session (schedule_id);
CREATE INDEX idx_session_student ON public.com_t_session (student_id, start_datetime);
CREATE INDEX idx_session_coach ON public.com_t_session (coach_id, start_datetime);
CREATE INDEX idx_session_ticket ON public.com_t_session (ticket_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view sessions" ON public.com_t_session;

-- [参照] 生徒本人・担当コーチ・管理者のみ閲覧可能。
-- 書き込みは fn_generate_sessions_for_schedule() 等のSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE権限は付与しない
-- （キャンセル・振替用RPCはPhase3で別途追加する）。
CREATE POLICY "Involved users can view sessions" ON public.com_t_session
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 追加パッチ: ライブセッション実施結果の連携 (2026-09-04)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- Zoom Video SDKのライブ通話ルームをsession_id単位に紐づけ、コーチが押す
-- 「レッスン終了」ボタンでの自動判定（completed/no_show/early_ended）、および
-- 予定時刻超過後もscheduledのまま残ったセッションの手動解決に対応するため、
-- ステータス値を追加し、理由テキストの保存先を新設する。
-- cancel_reasonは事前キャンセル専用の意味で使われているため流用せず、
-- 早期終了・手動解決の理由は本カラムに分離して保持する。
---------------------------------------------
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS status_note text DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.status_note IS '早期終了理由・停滞セッションの手動解決理由（cancel_reasonとは意味的に分離）';

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6, 7));

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show 7:early_ended(早期終了、status_noteに理由)';

---------------------------------------------
-- 追加パッチ: キャンセル時のチケット返還可否 (2026-09-05)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 生徒による事前キャンセルは、開始12時間以上前なら「チケット返還（未割当扱いに戻し、
-- 担当コーチ限定で再予約可能）」、12時間未満は「返還なし（消化済み扱い、再予約不可）」。
-- コーチによるキャンセルは時間帯を問わず常に返還する。status IN (1,2,6,7)の行は
-- そもそも本カラムを使わないため常にNULLのまま（cancel_session側でのみセットする）。
---------------------------------------------
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS ticket_refunded boolean DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.ticket_refunded IS 'キャンセル(status 3/4)時のみ意味を持つ。true:チケット返還(未割当扱いに戻り担当コーチ限定で再予約可能) false:返還なし(消化済み扱い)。生徒キャンセルは開始12時間以上前ならtrue、未満ならfalse。コーチキャンセルは常にtrue。';
