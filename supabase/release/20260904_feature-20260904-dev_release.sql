-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260904-dev
-- 作成日: 2026-09-04
--
-- 【内容】
--   ライブセッション（Zoom Video SDK）ルームを com_t_session（個別レッスン
--   予約実体）に紐づけ、実施結果（completed/no_show/early_ended）の自動判定、
--   および宿題（コーチ→生徒への自由メッセージ＋添付ファイル）機能を追加する。
--
--   【背景】
--   従来のライブ通話ルームはコーチ⇔生徒の担当関係のみでアクセス可能で、
--   com_t_sessionとは一切紐づいていなかった。Zoomのsession name(topic)も
--   コーチ⇔生徒ペア単位で固定のため、同一ペアの複数レッスンが同一ルームを
--   再利用してしまう問題があった。本リリースでは session_id 単位にルームを
--   分離し、通話の入退室ログから実施結果を自動判定してcom_t_sessionへ反映する。
--
--   1. com_t_session に status_note カラムを追加し、status の CHECK 制約に
--      7(early_ended) を追加する。
--   2. com_t_session_call_log テーブルを新規作成
--      - 通話の入退室1回=1行。再接続を複数行として記録する。joined_at/left_at は
--        いずれもサーバー側(NOW())でのみ確定し、クライアントからの時刻指定経路を
--        持たない（record_session_call_join/record_session_call_leave経由のみ）。
--   3. com_t_session_homework / com_t_session_homework_attachment テーブルを新規作成
--      - レッスン終了後にコーチが投稿する宿題（自由メッセージ＋複数添付ファイル）。
--        com_t_coach_student_note と同様、投稿後の更新・削除は許可しない追記専用。
--        対象生徒本人も閲覧できる（com_t_chat/com_t_chat_attachmentと同型の
--        親子テーブル構成）。
--   4. Storage Bucket "homework" を新規作成（"chat"バケットと同方針の非公開バケット）。
--   5. record_session_call_join() / record_session_call_leave() (SECURITY DEFINER) を新規作成
--      - 通話の入退室記録専用RPC。時刻パラメータを一切受け取らず、常にNOW()で確定させる。
--   6. finalize_session() (SECURITY DEFINER) を新規作成
--      - 「レッスン終了」ボタンの本体。コーチ・生徒双方の在室区間の重複時間から
--        completed(20分以上)/early_ended(20分未満・要理由)/no_show(生徒未入室)を
--        自動判定してcom_t_session.statusへ反映する。completed確定時は
--        com_t_user_session_ticket.used_sessions の加算と
--        com_t_user_session_ticket_history への記録も行う。
--   7. resolve_stale_session() (SECURITY DEFINER) を新規作成
--      - 予定終了時刻を過ぎてもscheduledのまま残ったセッションの唯一の手動解決経路
--        （バッチ処理は導入しない）。理由必須。
--
--   アプリケーションコード側の変更（liveSessionRoomActions.ts のsession_id対応、
--   sessionActions.tsへのRPC呼び出し追加、レッスン結果画面・宿題投稿UI等）は
--   本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】生徒⇔コーチ予約管理（振替・キャンセル・未割当チケット予約）(2026-09-05)
--   ---------------------------------------------------------------------
--   キャンセル時のチケット返還ルール（開始12時間以上前の生徒キャンセルは返還、
--   12時間未満は返還なし、コーチキャンセルは常に返還）と、返還により未割当に戻った
--   チケットを担当コーチ限定で再予約するフローを追加する。
--
--   8. com_t_session に ticket_refunded カラムを追加する。
--   9. cancel_session() を更新し、上記ルールに基づき ticket_refunded を記録する。
--   10. reschedule_session() を更新し、開始12時間以内の振替を生徒・コーチ双方で
--       禁止する。
--   11. fn_schedule_shortfall() (STABLE) を新規作成する
--       - 定期スケジュール(com_m_lesson_schedule)単位で、契約上本来確保できたはずの
--         セッション回数(expected)と、消化済み扱いの回数(actual。ticket_refunded=false
--         のキャンセルは消化済み扱いに含め、trueは未割当として除外する)の差分
--         (shortfall)を算出する。Student Overview画面の未消化枠表示と、
--         book_makeup_session()の予約可否判定の両方がこの関数を単一の真実源として使う。
--   12. book_makeup_session() (SECURITY DEFINER) を新規作成する
--       - 未割当チケットを、そのコマ(schedule_id)の担当コーチ限定で新規に予約するRPC。
--         コーチは com_m_lesson_schedule.coach_id で既に確定しているため、
--         コーチ選択は受け付けない。
--
--   アプリケーションコード側の変更（生徒・コーチ両カレンダーの予約UI、
--   LiveSessionHistoryCardの操作化等）は本SQLの対象外（DB変更のみ）。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（CREATE TABLE IF NOT EXISTS /
--   CREATE OR REPLACE / DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS /
--   ON CONFLICT）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_t_session に status_note カラム追加、status CHECK制約の拡張
-- =========================================================================
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS status_note text DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.status_note IS '早期終了理由・停滞セッションの手動解決理由（cancel_reasonとは意味的に分離）';

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6, 7));

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show 7:early_ended(早期終了、status_noteに理由)';

-- =========================================================================
-- 2. com_t_session_call_log 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_call_log (
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

CREATE INDEX IF NOT EXISTS idx_session_call_log_session ON public.com_t_session_call_log (session_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_session_call_log_user ON public.com_t_session_call_log (user_id, joined_at);

ALTER TABLE public.com_t_session_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view call log" ON public.com_t_session_call_log;
CREATE POLICY "Involved users can view call log" ON public.com_t_session_call_log
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_call_log.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 3. com_t_session_homework / com_t_session_homework_attachment 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_homework (
    homework_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    homework_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_text_not_blank CHECK (btrim(homework_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework IS 'レッスンセッション単位の宿題（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework.homework_id IS '宿題ID';
COMMENT ON COLUMN public.com_t_session_homework.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_homework.coach_id IS '投稿したコーチのユーザID（com_t_session.coach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.student_id IS '対象の生徒のユーザID（非正規化。com_t_session.student_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.homework_text IS '宿題本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework.insert_date IS '登録日時';

CREATE INDEX IF NOT EXISTS idx_session_homework_session ON public.com_t_session_homework (session_id, insert_date DESC);
CREATE INDEX IF NOT EXISTS idx_session_homework_student ON public.com_t_session_homework (student_id, insert_date DESC);

ALTER TABLE public.com_t_session_homework ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view session homework" ON public.com_t_session_homework;
CREATE POLICY "Coach and student can view session homework" ON public.com_t_session_homework
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Coaches can post homework for their own sessions" ON public.com_t_session_homework;
CREATE POLICY "Coaches can post homework for their own sessions" ON public.com_t_session_homework
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework.session_id
        AND s.coach_id = auth.uid()
        AND s.student_id = com_t_session_homework.student_id
    )
);

CREATE TABLE IF NOT EXISTS public.com_t_session_homework_attachment (
    homework_attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_session_homework_attachment IS '宿題添付ファイル';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_id IS '宿題ID (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_path IS 'Storage上のパス ("homework"バケット)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.created_at IS 'アップロード日時';

CREATE INDEX IF NOT EXISTS idx_session_homework_attachment_homework ON public.com_t_session_homework_attachment (homework_id);

ALTER TABLE public.com_t_session_homework_attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment;
CREATE POLICY "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment;
CREATE POLICY "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND h.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 4. Storage Bucket "homework" 新規作成
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework',
  'homework',
  false,
  10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =========================================================================
-- 5. record_session_call_join() / record_session_call_leave() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_session_call_join(p_session_id uuid, p_zoom_session_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_role text;
    v_call_log_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id = auth.uid() THEN
        v_role := 'coach';
    ELSIF v_session.student_id = auth.uid() THEN
        v_role := 'student';
    ELSE
        RAISE EXCEPTION 'not authorized to join this session';
    END IF;

    INSERT INTO public.com_t_session_call_log (session_id, user_id, role, zoom_session_id)
    VALUES (p_session_id, auth.uid(), v_role, p_zoom_session_id)
    RETURNING call_log_id INTO v_call_log_id;

    RETURN v_call_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_session_call_leave(p_call_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.com_t_session_call_log
    SET left_at = NOW()
    WHERE call_log_id = p_call_log_id
      AND user_id = auth.uid()
      AND left_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_leave(uuid) TO authenticated;

-- =========================================================================
-- 6. finalize_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_new_status smallint;
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to finalize this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap_seconds
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT EXISTS(
      SELECT 1 FROM public.com_t_session_call_log WHERE session_id = p_session_id AND role = 'student'
    ) INTO v_student_joined;

    IF v_overlap_seconds >= 1200 THEN
        v_new_status := 2;
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_new_status := 7;
    ELSE
        v_new_status := 6;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status,
        status_note = CASE WHEN v_new_status = 7 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_new_status = 2 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, NULL, auth.uid());
        END IF;
    END IF;

    RETURN QUERY SELECT v_new_status, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;

-- =========================================================================
-- 7. resolve_stale_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_resolved_status smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_ticket RECORD;
BEGIN
    IF p_resolved_status NOT IN (2, 6, 7) THEN
        RAISE EXCEPTION 'invalid resolved status %', p_resolved_status;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to resolve this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = p_resolved_status, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_resolved_status = 2 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_reason, auth.uid());
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;

-- =========================================================================
-- 8. com_t_session に ticket_refunded カラム追加
-- =========================================================================
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS ticket_refunded boolean DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.ticket_refunded IS 'キャンセル(status 3/4)時のみ意味を持つ。true:チケット返還(未割当扱いに戻り担当コーチ限定で再予約可能) false:返還なし(消化済み扱い)。生徒キャンセルは開始12時間以上前ならtrue、未満ならfalse。コーチキャンセルは常にtrue。';

-- =========================================================================
-- 9. cancel_session() 更新（チケット返還ルール対応）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_session(p_session_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
    v_refunded boolean;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    IF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text) TO authenticated;

-- =========================================================================
-- 10. reschedule_session() 更新（開始12時間以内の振替を禁止）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reschedule_session(
    p_session_id uuid,
    p_new_date date,
    p_new_start_time time,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_tz text;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime - NOW() < interval '12 hours' THEN
        RAISE EXCEPTION 'cannot reschedule a session within 12 hours of its start time';
    END IF;

    SELECT timezone INTO v_coach_tz FROM public.com_m_user WHERE id = v_session.coach_id;
    v_coach_tz := COALESCE(v_coach_tz, 'Asia/Tokyo');

    v_duration := v_session.end_datetime - v_session.start_datetime;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_coach_tz;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_session.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_session.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_new_start, v_new_end, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) TO authenticated;

-- =========================================================================
-- 11. fn_schedule_shortfall() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_schedule_shortfall(p_schedule_id uuid)
RETURNS TABLE(expected_sessions integer, actual_sessions integer, shortfall integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_cursor_date date;
    v_expected integer := 0;
    v_actual integer;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date LOOP
        v_expected := v_expected + 1;
        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    SELECT COUNT(*) INTO v_actual
    FROM public.com_t_session s
    WHERE s.schedule_id = p_schedule_id
      AND (
        s.status IN (1, 2, 6, 7)
        OR (s.status IN (3, 4) AND s.ticket_refunded = false)
      );

    RETURN QUERY SELECT v_expected, v_actual, GREATEST(v_expected - v_actual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) TO authenticated;

-- =========================================================================
-- 12. book_makeup_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.book_makeup_session(
    p_schedule_id uuid,
    p_new_date date,
    p_new_start_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() AND v_schedule.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to book a session for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);
    IF v_shortfall <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    v_duration := v_schedule.end_time - v_schedule.start_time;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_schedule.coach_timezone;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_schedule.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_schedule.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_schedule.coach_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_schedule.student_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        v_new_start, v_new_end, 1
    )
    RETURNING session_id INTO v_new_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) TO authenticated;

COMMIT;
