-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260925-dev
-- 作成日: 2026-09-25
--
-- 【内容】
--   ColorVowel辞書の一括登録改善（アプリケーションコード側の変更が主、本SQLはそれに伴う
--   DBの変更のみ）。
--
--   1. com_m_color_vowel_dictionary に lemma 列を追加
--      - 語形変化した見出し語（launched 等）の原形（launch）を持たせる任意項目。
--        見出し語が原形そのものの場合はNULL。既存データはNULLのまま（表示されないだけで
--        動作に影響なし）。
--
-- 対応ファイル: DDL/table/com_m_color_vowel_dictionary.sql（末尾の追加パッチ節）
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_color_vowel_dictionary: lemma列の追加
---------------------------------------------
ALTER TABLE public.com_m_color_vowel_dictionary
  ADD COLUMN IF NOT EXISTS lemma TEXT DEFAULT NULL;

COMMENT ON COLUMN public.com_m_color_vowel_dictionary.lemma IS '原形（例: launched → launch）。見出し語が原形そのものの場合はNULL';

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチ検索からデモコーチを除外
-- 追加日: 2026-09-28
--
-- 【内容】
--   本番検証・顧客プレゼン用のデモコーチが、通常の生徒からマッチング申請を受けないようにする。
--   デモの生徒からは、従来どおり全コーチ（デモコーチを含む）を対象とする。
--
--   1. com_m_role: demo_user を共通ロール（target_user_type = NULL）に変更
--      - 管理画面のユーザー編集で、コーチにも demo_user を付与できるようにする。
--        モニター集計（private.get_monitor_target_users）は受講生のみを対象としているため影響なし。
--   2. get_matchable_coach_ids() を新規作成
--      - 呼び出した生徒から見たマッチング対象コーチIDを返す（生徒アプリのコーチ一覧・申請時に使用）。
--
-- 対応ファイル: DDL/function/get_matchable_coach_ids.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_role: demo_user を共通ロールに変更
---------------------------------------------
UPDATE public.com_m_role
SET target_user_type = NULL
WHERE role_id = 'demo_user';

---------------------------------------------
-- 2. get_matchable_coach_ids(): マッチング対象コーチID取得
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids()
RETURNS TABLE (coach_id uuid) AS $$
  SELECT p.user_id
  FROM public.com_m_coach_profile p
  WHERE p.delete_flg = '0'
    AND (
      -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids() TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】マッチング成立時のチャットルーム自動開設・挨拶メッセージ
-- 追加日: 2026-09-28
--
-- 【内容】
--   マッチング成立（コーチの承認・アドミンの直接マッチング）のたびに、生徒×コーチの1対1チャット
--   ルームを用意し（開設済みならそれを使う）、コーチから生徒へ挨拶メッセージを自動送信する。
--
--   1. fn_ensure_one_on_one_chat_room() を新規作成（1対1ルームの取得・開設。アドミンの手動開設と共通）
--   2. fn_send_matching_greeting() を新規作成（ルームの用意と挨拶メッセージ送信）
--   3. fn_commit_matching_schedule() から 2 を呼ぶよう変更（シグネチャ変更なし）
--
-- 対応ファイル: DDL/function/fn_ensure_one_on_one_chat_room.sql, DDL/function/fn_send_matching_greeting.sql,
--               DDL/function/fn_commit_matching_schedule.sql
-- 【注意】アプリ側（admin のチャットルーム手動開設）が 1 を呼ぶため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1対1チャットルームの取得・開設ヘルパー関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- 2人の間の有効な1対1チャットルームを返し、無ければ開設する処理を1か所に集約する。
-- 呼び出し元は次の2つ。
--   - fn_send_matching_greeting() ... マッチング成立時の自動開設（生徒×コーチ）
--   - packages/lib/chat/actions/roomActions.ts の createOneOnOneChatRoom ... アドミンの手動開設
--     （参加者の種別チェック等の入力検証はアプリ側で行い、検索・開設だけを本関数に任せる）
--
-- 【既存ルームの判定】
-- 閉じられておらず（closed_at IS NULL）、2人とも在室中（left_at IS NULL）で、在室者がちょうど
-- 2人のルームを「2人の1対1ルーム」とみなす。該当が複数ある場合は最も古いルームを返す。
--
-- 【同時実行】
-- 同じ2人に対する開設が同時に走ると（週2回契約の2コマを続けて承認した等）、どちらも
-- 「ルーム無し」と判定して2つ開設し得る。2人のIDの組ごとのアドバイザリロックで直列化する
-- （IDを昇順に並べてキーにするため、引数の順序に関わらず同じロックになる）。
-- fn_commit_matching_schedule() から呼ばれる場合は「コーチ×曜日」のロックの後に取得するが、
-- 本ロックの後に別のロックを取る処理は無いため、デッドロックは起こらない。
--
-- 参加者行の user_type には com_m_user.user_type（0:管理者 / 1:生徒 / 2:コーチ）をそのまま保存する
-- （アドミンの手動開設と同じ値）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ensure_one_on_one_chat_room(p_user_a uuid, p_user_b uuid)
RETURNS TABLE (room_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_room_id uuid;
BEGIN
    IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
        RAISE EXCEPTION 'two different users are required';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'chat_1on1:' || LEAST(p_user_a, p_user_b)::text || ':' || GREATEST(p_user_a, p_user_b)::text, 0
    ));

    SELECT r.room_id INTO v_room_id
    FROM public.com_t_chat_room r
    WHERE r.closed_at IS NULL
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_a AND u.left_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_b AND u.left_at IS NULL)
      AND (SELECT count(*) FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.left_at IS NULL) = 2
    ORDER BY r.created_at
    LIMIT 1;

    IF v_room_id IS NOT NULL THEN
        RETURN QUERY SELECT v_room_id, false;
        RETURN;
    END IF;

    INSERT INTO public.com_t_chat_room (room_type) VALUES ('1ON1') RETURNING com_t_chat_room.room_id INTO v_room_id;

    INSERT INTO public.com_t_chat_room_user (room_id, user_id, user_type)
    SELECT v_room_id, m.id, m.user_type
    FROM public.com_m_user m
    WHERE m.id IN (p_user_a, p_user_b);

    RETURN QUERY SELECT v_room_id, true;
END;
$$;

-- 内部処理（fn_send_matching_greeting）とアドミンの手動開設（service_role）専用
REVOKE EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) TO service_role;

---------------------------------------------
-- マッチング成立時のチャット開設・挨拶メッセージ送信ヘルパー関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- マッチング成立（コーチの承認・アドミンの直接マッチング。コーチ交代後の再マッチングも含む）の
-- たびに、生徒とコーチの1対1チャットルームを用意し（fn_ensure_one_on_one_chat_room。開設済みなら
-- それを使う）、コーチから生徒へ挨拶メッセージを送る。fn_commit_matching_schedule() から、
-- 担当枠（com_m_lesson_schedule）の作成直後に呼ばれる。
--
-- 【文面】送信者はコーチ、種別は通常の TEXT（既存トリガー notify_chat_new_message により生徒に
-- チャット新着の通知が届く）。同じ2人の過去の担当枠（終了済みを含む）の有無で出し分ける。
--   1. 初めての担当             ... 専属コーチに選んでくれたことへのお礼と、初回セッションの案内
--   2. 同じ契約で別のコマも担当  ... 週の別のコマにも選んでくれたことへのお礼
--   3. 前の契約でも担当していた  ... 継続してくれたことへのお礼（契約更新）
-- 生徒名は com_m_user.user_name をそのまま使う（未設定の場合は名前を省く）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_send_matching_greeting(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_room_id uuid;
    v_greeting text;
    v_body text;
BEGIN
    SELECT schedule_id, ticket_id, student_id, coach_id INTO v_schedule
    FROM public.com_m_lesson_schedule
    WHERE schedule_id = p_schedule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    SELECT e.room_id INTO v_room_id
    FROM public.fn_ensure_one_on_one_chat_room(v_schedule.student_id, v_schedule.coach_id) e;

    SELECT 'Hi' || COALESCE(', ' || NULLIF(btrim(user_name), ''), '') || '!' INTO v_greeting
    FROM public.com_m_user
    WHERE id = v_schedule.student_id;

    IF EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = v_schedule.student_id AND s.coach_id = v_schedule.coach_id
          AND s.schedule_id <> v_schedule.schedule_id AND s.ticket_id = v_schedule.ticket_id
    ) THEN
        v_body := 'Thank you for choosing me for another weekly session! See you in the live Coaching session.';
    ELSIF EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = v_schedule.student_id AND s.coach_id = v_schedule.coach_id
          AND s.schedule_id <> v_schedule.schedule_id
    ) THEN
        v_body := 'Thank you for continuing your live Coaching sessions with me! See you in the next session.';
    ELSE
        v_body := 'Thank you for choosing me as your Gabby Coach! See you in the first live Coaching session.';
    END IF;

    INSERT INTO public.com_t_chat (room_id, sender_user_id, message, message_type)
    VALUES (v_room_id, v_schedule.coach_id, COALESCE(v_greeting, 'Hi!') || ' ' || v_body, 'TEXT');
END;
$$;

-- 内部処理専用（fn_commit_matching_schedule 経由以外での直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_send_matching_greeting(uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- マッチング成立処理 共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- approve_matching_request()（生徒申請→コーチ承認の通常フロー）と
-- admin_match_student_with_coach()（アドミンによる代理即時マッチング）は、
-- 「承認済みのcom_t_matching_requestが既に存在する前提で、target_sessionsを算出し、
-- コーチの空き状況をロック付きで再チェックし、com_m_lesson_scheduleを作成し、
-- com_t_sessionを一括生成する」という承認後ロジックがほぼ丸ごと重複していた
-- （admin_match_student_with_coachのファイル冒頭コメントで「approve_matching_requestの
-- 承認後ロジックをそのまま踏襲」と明記されていた通り）。本関数にその共通部分を集約し、
-- 両者はそれぞれ「com_t_matching_requestの確定方法（既存pending行をUPDATE／新規に
-- approved行をINSERT）」と「通知内容（コーチへの通知要否）」だけを担当する薄いラッパーとする。
--
-- 【呼び出し元の責務分担】
-- 本関数は対象のcom_t_matching_request行(p_request_id)を一切読み書きしない
-- （既に存在する前提で、source_request_idとしてFK参照するのみ）。呼び出し元が
-- 承認フロー(UPDATE status=2)・代理作成フロー(INSERT status=2)いずれの場合も、
-- 本関数を呼ぶ前後で自身の責務としてリクエスト行を確定させること。
--
-- 【24時間ルールとの関係】
-- p_min_start_datetimeはfn_generate_sessions_for_schedule()にそのまま渡すのみで、
-- 「アドミンかどうかで下限を変えるか」の判断自体は呼び出し元(approve_matching_request/
-- admin_match_student_with_coach)の責務のままとする。
--
-- 【チャットルーム開設・挨拶メッセージ (2026-09-28追加)】
-- 成立のたびにfn_send_matching_greeting()で生徒×コーチの1対1チャットルームを用意し（開設済みなら
-- それを使う）、コーチから生徒へ挨拶メッセージを送る。成立処理と同じトランザクションで行う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_commit_matching_schedule(
    p_request_id uuid,
    p_ticket_id uuid,
    p_student_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)と、target_sessions算出用の
    -- total_sessions/weekly_frequencyを取得
    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- このコマ(slot_no)が契約上持つべき目標セッション数。商をbaseとし、余りはslot_no昇順に
    -- 1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    -- 同一コーチ×同一曜日への成立処理を直列化し、重複チェックのレース条件を防ぐ
    -- （この後にfn_send_matching_greeting()内で生徒×コーチのロックを取るが、そちらの後に
    -- 別のロックを取る処理は無いため、デッドロックは起こらない）
    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    -- day_of_week/start_time/end_timeの解釈基準として、成立時点のコーチtimezoneを固定保持する
    -- （以後コーチがプロフィールのtimezoneを変更しても、この契約の意味は変わらない）
    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, p_student_id, p_coach_id, p_slot_no,
        p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, p_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, p_min_start_datetime);

    PERFORM public.fn_send_matching_greeting(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】1対1チャットルーム開設ヘルパーの参加者存在チェック
-- 追加日: 2026-09-28
--
-- 【内容】
--   fn_ensure_one_on_one_chat_room() に「指定した2人がどちらも存在すること」の検証を追加する
--   （存在しないIDを渡すと参加者のいないルームが作られてしまうため）。シグネチャ変更なし。
--
-- 対応ファイル: DDL/function/fn_ensure_one_on_one_chat_room.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1対1チャットルームの取得・開設ヘルパー関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- 2人の間の有効な1対1チャットルームを返し、無ければ開設する処理を1か所に集約する。
-- 呼び出し元は次の2つ。
--   - fn_send_matching_greeting() ... マッチング成立時の自動開設（生徒×コーチ）
--   - packages/lib/chat/actions/roomActions.ts の createOneOnOneChatRoom ... アドミンの手動開設
--     （参加者の種別チェック等の入力検証はアプリ側で行い、検索・開設だけを本関数に任せる）
--
-- 【既存ルームの判定】
-- 閉じられておらず（closed_at IS NULL）、2人とも在室中（left_at IS NULL）で、在室者がちょうど
-- 2人のルームを「2人の1対1ルーム」とみなす。該当が複数ある場合は最も古いルームを返す。
--
-- 【同時実行】
-- 同じ2人に対する開設が同時に走ると（週2回契約の2コマを続けて承認した等）、どちらも
-- 「ルーム無し」と判定して2つ開設し得る。2人のIDの組ごとのアドバイザリロックで直列化する
-- （IDを昇順に並べてキーにするため、引数の順序に関わらず同じロックになる）。
-- fn_commit_matching_schedule() から呼ばれる場合は「コーチ×曜日」のロックの後に取得するが、
-- 本ロックの後に別のロックを取る処理は無いため、デッドロックは起こらない。
--
-- 参加者行の user_type には com_m_user.user_type（0:管理者 / 1:生徒 / 2:コーチ）をそのまま保存する
-- （アドミンの手動開設と同じ値）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ensure_one_on_one_chat_room(p_user_a uuid, p_user_b uuid)
RETURNS TABLE (room_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_room_id uuid;
BEGIN
    IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
        RAISE EXCEPTION 'two different users are required';
    END IF;
    IF (SELECT count(*) FROM public.com_m_user WHERE id IN (p_user_a, p_user_b)) <> 2 THEN
        RAISE EXCEPTION 'user not found: % / %', p_user_a, p_user_b;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'chat_1on1:' || LEAST(p_user_a, p_user_b)::text || ':' || GREATEST(p_user_a, p_user_b)::text, 0
    ));

    SELECT r.room_id INTO v_room_id
    FROM public.com_t_chat_room r
    WHERE r.closed_at IS NULL
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_a AND u.left_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_b AND u.left_at IS NULL)
      AND (SELECT count(*) FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.left_at IS NULL) = 2
    ORDER BY r.created_at
    LIMIT 1;

    IF v_room_id IS NOT NULL THEN
        RETURN QUERY SELECT v_room_id, false;
        RETURN;
    END IF;

    INSERT INTO public.com_t_chat_room (room_type) VALUES ('1ON1') RETURNING com_t_chat_room.room_id INTO v_room_id;

    INSERT INTO public.com_t_chat_room_user (room_id, user_id, user_type)
    SELECT v_room_id, m.id, m.user_type
    FROM public.com_m_user m
    WHERE m.id IN (p_user_a, p_user_b);

    RETURN QUERY SELECT v_room_id, true;
END;
$$;

-- 内部処理（fn_send_matching_greeting）とアドミンの手動開設（service_role）専用
REVOKE EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】1対1チャットの既読表示（既読位置のRealtime配信）
-- 追加日: 2026-09-28
--
-- 【内容】
--   1対1チャットで、相手が読んだ自分の最新の発言に「既読」を表示する（グループは対象外）。
--   相手がルームを開いた時点で表示を進めるため、com_t_chat_room_user（last_read_chat_id を持つ）を
--   Realtime の配信対象に追加する。受信できる行はRLS（同じルームの参加者のみ閲覧可）の範囲に限られる。
--   テーブル・RLSの変更は無し。再実行しても安全なように、未登録の場合だけ追加する。
--
-- 対応ファイル: DDL/table/com_t_chat_room_user.sql（末尾の Realtime 節）
-- =========================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'com_t_chat_room_user'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_chat_room_user;
  END IF;
END $$;

COMMIT;

-- =========================================================================
-- 【追加セクション】契約名（アドミン管理用）の追加
-- 追加日: 2026-09-30
--
-- 【内容】
--   生徒・コーチに表示するプラン名（plan_name）と、アドミンが契約を区別するための
--   契約名（contract_name）を分ける。
--
--   1. com_m_contract に contract_name 列を追加（NOT NULL・顧客内で一意）
--      - 既存契約は「{顧客名} {開始年月}〜 {プラン名}」で埋める（重複時は連番を付与）。
--   2. vw_contract_details を再作成（SELECT c.* のため列追加後は DROP → CREATE が必要）
--   3. private.vw_user_list の末尾に contract_name を追加
--
-- 対応ファイル: DDL/table/com_m_contract.sql（末尾の追加パッチ節）
--               DDL/view/vw_contract_details.sql / DDL/view/vw_user_list.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_contract: contract_name列の追加
---------------------------------------------
ALTER TABLE public.com_m_contract
  ADD COLUMN IF NOT EXISTS contract_name text;

-- 既存契約は「{顧客名} {開始年月(JST)}〜 {プラン名}」で埋める。
-- 同じ顧客で同じ名前になる契約（同月開始・同プラン）は、2件目以降に「 (2)」等の連番を付けて
-- 後続の一意制約に違反しないようにする。
WITH named AS (
  SELECT
    c.contract_id,
    cl.client_name || ' ' || to_char(c.start_date AT TIME ZONE 'Asia/Tokyo', 'YYYY/MM') || '〜 ' || c.plan_name AS base_name,
    c.client_id
  FROM public.com_m_contract c
  JOIN public.com_m_client cl ON cl.client_id = c.client_id
  WHERE c.contract_name IS NULL
), numbered AS (
  SELECT
    contract_id,
    base_name,
    ROW_NUMBER() OVER (PARTITION BY client_id, base_name ORDER BY contract_id) AS seq
  FROM named
)
UPDATE public.com_m_contract c
SET contract_name = CASE WHEN n.seq = 1 THEN n.base_name ELSE n.base_name || ' (' || n.seq || ')' END
FROM numbered n
WHERE c.contract_id = n.contract_id;

ALTER TABLE public.com_m_contract ALTER COLUMN contract_name SET NOT NULL;

-- 同じ顧客内で契約名を一意にする（ライセンス割当時の契約選択・削除確認で契約を取り違えないため）
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_client_contract_name
  ON public.com_m_contract (client_id, contract_name);

COMMENT ON COLUMN public.com_m_contract.contract_name IS '契約名（アドミン管理用。例: 顧客A 2026年度上期）。生徒・コーチには表示しない。顧客内で一意';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用。生徒アプリ等に表示される商品名）';

---------------------------------------------
-- 2. vw_contract_details の再作成
---------------------------------------------
DROP VIEW IF EXISTS public.vw_contract_details;
CREATE VIEW public.vw_contract_details AS
SELECT
    c.*,
    cl.client_name,
    COALESCE(stats.total_assigned_count, 0) AS current_assigned_count,
    -- 終了済み契約は「終了時点の有効数」、稼働中は「現在の有効数」を返す
    COALESCE(stats.active_snapshot_count, 0) AS current_active_count,
    c.max_licenses - COALESCE(stats.total_assigned_count, 0) AS remaining_licenses
FROM
    public.com_m_contract c
JOIN
    public.com_m_client cl ON c.client_id = cl.client_id
LEFT JOIN (
    SELECT
        contract_id,
        COUNT(license_id) AS total_assigned_count,
        -- ステータス1 かつ「現在その期間内」のものだけを有効数としてカウントする
        COUNT(CASE WHEN status = 1 AND NOW() BETWEEN start_date AND end_date THEN 1 END) AS active_snapshot_count
    FROM
        public.com_t_user_license
    GROUP BY
        contract_id
) stats ON c.contract_id = stats.contract_id;

COMMENT ON VIEW public.vw_contract_details IS '統計情報・顧客名を含む契約詳細ビュー';

-- RLS設定：ビューの定義を維持しつつ、RLSを透過させる設定
ALTER VIEW public.vw_contract_details SET (security_invoker = on);

---------------------------------------------
-- 3. private.vw_user_list に contract_name を追加
---------------------------------------------
CREATE OR REPLACE VIEW private.vw_user_list 
WITH (security_invoker = false) -- 定義者権限を維持
AS
-- =============================================================
-- ① 本登録済みアクティブユーザー
-- =============================================================
SELECT 
  u.id,                     -- auth.users の UUID
  u.user_id,                -- com_m_user の BIGSERIAL
  u.user_name,
  u.user_type,
  u.client_id,
  c.client_name,
  au.email,
  au.last_sign_in_at,
  au.confirmed_at,
  r.roles,                  -- ロール情報の集約配列
  l.contract_id,
  l.license_id,
  l.status AS license_status,
  l.start_date AS license_start_date,
  l.end_date AS license_end_date,
  con.plan_name,
  NULL AS mail_sent_at,
  NULL AS last_mail_error,
  CASE 
    WHEN l.license_id IS NULL THEN 'none'
    WHEN l.start_date > NOW() THEN 'future'
    WHEN l.end_date < NOW() THEN 'expired'
    ELSE 'active'
  END AS license_state,
  u.insert_date,            -- ソート等に使用する登録日時
  -- 2026-09-30追加: アドミン管理用の契約名（CREATE OR REPLACE で列を足すため末尾に置く）
  con.contract_name
FROM 
  public.com_m_user u
  INNER JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
  LEFT JOIN LATERAL (
    SELECT array_agg(role_id) AS roles
    FROM public.com_t_user_role
    WHERE user_id = u.id
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.com_t_user_license 
    WHERE user_id = u.id 
    ORDER BY 
      (status = 1 AND NOW() BETWEEN start_date AND end_date) DESC,
      (status = 1 AND start_date > NOW()) DESC,
      end_date DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN public.com_m_contract con ON l.contract_id = con.contract_id

UNION ALL

-- =============================================================
-- ② 招待中・承認待ちユーザー (com_t_invitation からマージ)
-- =============================================================
SELECT 
  i.id AS id,                  -- 招待レコードのUUID（フロントの仮キーとして利用）
  NULL AS user_id,             -- まだ本登録がないため採番IDは NULL
  i.user_name,
  i.user_type,
  i.client_id,
  c.client_name,
  i.email,
  NULL AS last_sign_in_at,     -- ログイン前のため NULL
  NULL AS confirmed_at,        -- メール承認前のため NULL
  i.roles AS roles,            -- 招待時に設定したロールの配列をそのまま適用
  NULL AS contract_id,
  NULL AS license_id,
  NULL AS license_status,
  NULL AS license_start_date,
  NULL AS license_end_date,
  NULL AS plan_name,
  i.mail_sent_at,
  i.last_mail_error,
  -- 💡 フロントエンドが「招待状態」を識別するためのステータスを生成
  CASE 
    -- メール送信失敗を最優先で表示
    WHEN i.last_mail_error IS NOT NULL THEN 'mail_failed'
    WHEN i.expires_at < NOW() THEN 'expired_invite' -- 招待の有効期限切れ(7日経過)
    ELSE 'inviting'                                 -- 招待中（リンク有効期間内）
  END AS license_state,
  i.insert_date,               -- 招待日時を登録日時としてマージ
  NULL AS contract_name
FROM 
  public.com_t_invitation i
  LEFT JOIN public.com_m_client c ON i.client_id = c.client_id
WHERE 
  i.accepted_at IS NULL        -- 本登録が完了していない（仮発行状態）のものだけを抽出
;

COMMENT ON VIEW private.vw_user_list IS 'ユーザー管理用一覧ビュー (本登録＆招待中ユーザー統合版)';

-- 🔒 セキュリティ権限の再設定
REVOKE ALL ON private.vw_user_list FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.vw_user_list TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】お気に入りフレーズのRLS修正（同じ顧客の他ユーザーからの参照を禁止）
-- 追加日: 2026-09-30
--
-- 【内容】
--   com_t_favorite_phrase のポリシー「Managers can view client's favorites」は、閲覧者のロールを
--   見ずに同じ顧客（client_id）の全ユーザーへSELECTを許していたため、同じ法人の他の生徒からも
--   お気に入りフレーズが読めた。参照しているアプリ・関数は無いため廃止する。
--   本人のみ参照・更新できるポリシー（Users can manage their own favorites）は変更しない。
--   管理画面から参照する場合は service_role（RLS対象外）のサーバー処理で取得する。
--
-- 対応ファイル: DDL/table/com_t_favorite_phrase.sql
-- =========================================================================

BEGIN;

DROP POLICY IF EXISTS "Managers can view client's favorites" ON public.com_t_favorite_phrase;

COMMIT;

-- =========================================================================
-- 【追加セクション】スプリント問題のお気に入り
-- 追加日: 2026-09-30
--
-- 【内容】
--   生徒がスプリントの結果・履歴画面で問題をお気に入り登録し、お気に入り画面で復習できるようにする。
--
--   1. com_t_favorite_sprint_question を新規作成（ユーザー×スプリント問題、本人のみのRLS）
--      - 問題（com_m_sprint_questions）・ユーザーの削除時はお気に入りも削除される（ON DELETE CASCADE）。
--
-- 対応ファイル: DDL/table/com_t_favorite_sprint_question.sql
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.com_t_favorite_sprint_question (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.com_m_sprint_questions(question_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, question_id)
);

COMMENT ON TABLE public.com_t_favorite_sprint_question IS 'お気に入りスプリント問題';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.question_id IS 'スプリント問題ID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.insert_date IS '登録日時';

ALTER TABLE public.com_t_favorite_sprint_question ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question;

CREATE POLICY "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

COMMIT;

-- =========================================================================
-- 【追加セクション】お気に入りの性能対策と登録上限（1人・種別ごと1000件）
-- 追加日: 2026-09-30
--
-- 【内容】
--   利用者・登録件数が増えても性能と表示の正しさを保つための対応。
--
--   1. fn_check_favorite_limit() を新規作成し、お気に入り3テーブルに BEFORE INSERT トリガーを付与
--      - ユーザーごと・種別ごとに1000件まで（Supabase APIの1回の取得上限 max_rows=1000 と揃え、
--        一覧の取りこぼしを防ぐ）。超える登録は SQLSTATE 'GBF01' で拒否する。
--   2. 対象側の列（content_id / phrase_id / question_id）に索引を追加
--      - 教材・フレーズ・問題の削除（一括登録の洗い替えを含む）時の ON DELETE CASCADE で、
--        お気に入り全体を走査しないようにする。
--   3. RLSを auth.uid() → (SELECT auth.uid()) に変更（行ごとの評価を避ける。Supabase推奨）
--   4. com_t_favorite_phrase の重複索引 idx_com_t_favorite_phrase_user_phrase を削除
--      （UNIQUE(user_id, phrase_id) の索引と同じ内容）
--
-- 対応ファイル: DDL/function/fn_check_favorite_limit.sql
--               DDL/table/com_t_favorite_contents.sql / com_t_favorite_phrase.sql / com_t_favorite_sprint_question.sql
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_check_favorite_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_limit CONSTANT integer := 1000;
  v_target_column text := TG_ARGV[0];
  v_exists boolean;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || NEW.user_id::text));

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE user_id = $1 AND %I::text = $2)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_target_column
  )
  INTO v_exists
  USING NEW.user_id, to_jsonb(NEW) ->> v_target_column;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM %I.%I WHERE user_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
  INTO v_count
  USING NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'favorite limit exceeded (% rows) on %', v_limit, TG_TABLE_NAME
      USING ERRCODE = 'GBF01';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_check_favorite_limit() IS 'お気に入りの登録上限チェック（BEFORE INSERTトリガー。引数=対象の列名）';


DROP POLICY IF EXISTS "Users can manage their own favorite contents" ON public.com_t_favorite_contents;
CREATE POLICY "Users can manage their own favorite contents" ON public.com_t_favorite_contents
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_com_t_favorite_contents_content_id
ON public.com_t_favorite_contents (content_id);

DROP TRIGGER IF EXISTS trg_com_t_favorite_contents_limit ON public.com_t_favorite_contents;
CREATE TRIGGER trg_com_t_favorite_contents_limit
BEFORE INSERT ON public.com_t_favorite_contents
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('content_id');

DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.com_t_favorite_phrase;
CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_com_t_favorite_phrase_phrase_id
ON public.com_t_favorite_phrase (phrase_id);

DROP TRIGGER IF EXISTS trg_com_t_favorite_phrase_limit ON public.com_t_favorite_phrase;
CREATE TRIGGER trg_com_t_favorite_phrase_limit
BEFORE INSERT ON public.com_t_favorite_phrase
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('phrase_id');

DROP INDEX IF EXISTS public.idx_com_t_favorite_phrase_user_phrase;

DROP POLICY IF EXISTS "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question;
CREATE POLICY "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_com_t_favorite_sprint_question_question_id
ON public.com_t_favorite_sprint_question (question_id);

DROP TRIGGER IF EXISTS trg_com_t_favorite_sprint_question_limit ON public.com_t_favorite_sprint_question;
CREATE TRIGGER trg_com_t_favorite_sprint_question_limit
BEFORE INSERT ON public.com_t_favorite_sprint_question
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('question_id');

COMMIT;

-- =========================================================================
-- 【追加セクション】生徒モニターの受講生サマリーが0件になる不具合の修正
-- 追加日: 2026-09-30
--
-- 【内容】
--   private.vw_user_list の末尾に contract_name を追加した（本ファイルの契約名セクション）ことで、
--   RETURNS SETOF private.vw_user_list の get_monitor_user_list が列数不一致の実行時エラー
--   （structure of query does not match function result type）となり、生徒のモニター画面の
--   受講生サマリーが常に0件になっていた。
--   戻り値を RETURNS TABLE（列を明示）に変更し、アドミン用ビューの列構成に依存しないようにする。
--   ※ 戻り値型が変わるため DROP してから再作成する（本セクションは契約名セクションより後に適用すること）。
--
-- 対応ファイル: DDL/function/get_monitor_user_list.sql
-- =========================================================================

BEGIN;

-- 🚨 シグネチャ・戻り値型の変更のため、旧シグネチャを明示的に削除してから再作成する
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN);
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN, DATE, DATE);
DROP FUNCTION IF EXISTS public.get_monitor_user_list(DATE, DATE, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_monitor_user_list(
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    user_id BIGINT,
    user_name TEXT,
    user_type TEXT,
    client_id UUID,
    client_name TEXT,
    email VARCHAR,
    last_sign_in_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    roles TEXT[],
    contract_id UUID,
    license_id UUID,
    license_status SMALLINT,
    license_start_date TIMESTAMPTZ,
    license_end_date TIMESTAMPTZ,
    plan_name TEXT,
    mail_sent_at TIMESTAMPTZ,
    last_mail_error TEXT,
    license_state TEXT,
    insert_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    -- =============================================================
    -- 対象期間に有効な契約を持っていた本登録済みユーザー
    -- （招待中・承認待ちユーザーは com_t_invitation にのみ存在しライセンス未発行のため、
    --   「対象期間に有効な生徒」には該当しない＝本関数の対象外とする）
    -- =============================================================
    SELECT
      u.id AS id,
      u.user_id AS user_id,
      u.user_name AS user_name,
      u.user_type AS user_type,
      u.client_id AS client_id,
      c.client_name AS client_name,
      au.email AS email,
      au.last_sign_in_at AS last_sign_in_at,
      au.confirmed_at AS confirmed_at,
      r.roles AS roles,
      t.contract_id AS contract_id,
      t.license_id AS license_id,
      t.license_status AS license_status,
      t.license_start_date AS license_start_date,
      t.license_end_date AS license_end_date,
      t.plan_name AS plan_name,
      NULL::timestamptz AS mail_sent_at,
      NULL::text AS last_mail_error,
      CASE
        WHEN t.license_start_date > NOW() THEN 'future'
        WHEN t.license_end_date < NOW() THEN 'expired'
        ELSE 'active'
      END AS license_state,
      u.insert_date AS insert_date
    FROM
      private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
      INNER JOIN public.com_m_user u ON u.id = t.user_id
      INNER JOIN auth.users au ON u.id = au.id
      LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
      LEFT JOIN LATERAL (
        SELECT array_agg(ur.role_id) AS roles
        FROM public.com_t_user_role ur
        WHERE ur.user_id = u.id
      ) r ON true

    ORDER BY u.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) TO authenticated;

COMMIT;
