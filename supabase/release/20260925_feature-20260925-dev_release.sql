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

-- =========================================================================
-- 【追加セクション】学習実績サマリーに初回トレーニング日を追加
-- 追加日: 2026-10-01
--
-- 【内容】
--   生徒ホームの「これまでの歩み」に学習の開始日（初回トレーニング日）を表示するため、
--   student_m_training_lifetime_stats に first_training_date を追加する。
--   insert_date は初期バックフィル（20260823リリース）の実行日時になっている既存ユーザーがいるため使えない。
--   以降の更新は update_training_lifetime_stats() が担い、既存ユーザーは学習履歴の最古日で埋める。
--   バックフィルは履歴から再計算するため、再実行しても冪等。
--
-- 対応ファイル: DDL/table/student_m_training_lifetime_stats.sql,
--               DDL/function/update_training_lifetime_stats.sql
-- =========================================================================

BEGIN;

ALTER TABLE public.student_m_training_lifetime_stats
  ADD COLUMN IF NOT EXISTS first_training_date DATE;

COMMENT ON COLUMN public.student_m_training_lifetime_stats.first_training_date IS '初回トレーニング実施日（ユーザーのタイムゾーン基準のローカル日付。生徒ホームの「これまでの歩み」の開始日）';

CREATE OR REPLACE FUNCTION public.update_training_lifetime_stats(
  p_user_id UUID,
  p_training_date DATE,
  p_word_delta INT DEFAULT 0,
  p_phrase_delta INT DEFAULT 0,
  p_assessment_delta INT DEFAULT 0,
  p_sprint_session_delta INT DEFAULT 0,
  p_sprint_answer_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.student_m_training_lifetime_stats (
    user_id, total_active_days, current_streak_days, first_training_date, last_training_date,
    total_words, total_phrases, total_assessments,
    total_sprint_sessions, total_sprint_answers
  )
  VALUES (
    p_user_id, 1, 1, p_training_date, p_training_date,
    p_word_delta, p_phrase_delta, p_assessment_delta,
    p_sprint_session_delta, p_sprint_answer_delta
  )
  ON CONFLICT (user_id) DO UPDATE SET
    -- 日付起点の項目は、過去日付での呼び出し（クロックずれ等の異常系）を無視して安全側に倒す
    total_active_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      ELSE student_m_training_lifetime_stats.total_active_days + 1
    END,
    current_streak_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date - 1
        THEN student_m_training_lifetime_stats.current_streak_days + 1
      ELSE 1
    END,
    -- 初回日は最も古い日付を保持する（NULLの行は LEAST が NULL を無視するため今回の日付になる）
    first_training_date = LEAST(student_m_training_lifetime_stats.first_training_date, p_training_date),
    last_training_date = GREATEST(student_m_training_lifetime_stats.last_training_date, p_training_date),
    -- 通算カウンタ系は呼び出し順序に依存しない単純加算のため、日付の前後に関わらず常に加算する
    total_words = student_m_training_lifetime_stats.total_words + p_word_delta,
    total_phrases = student_m_training_lifetime_stats.total_phrases + p_phrase_delta,
    total_assessments = student_m_training_lifetime_stats.total_assessments + p_assessment_delta,
    total_sprint_sessions = student_m_training_lifetime_stats.total_sprint_sessions + p_sprint_session_delta,
    total_sprint_answers = student_m_training_lifetime_stats.total_sprint_answers + p_sprint_answer_delta,
    update_date = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 呼び出し元の内部関数群からのみ呼び出される内部関数のため、
-- authenticated を含め、外部からの直接実行権限は付与しない
REVOKE EXECUTE ON FUNCTION public.update_training_lifetime_stats(UUID, DATE, INT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;

-- 既存ユーザーの初回トレーニング日を学習履歴（単語ドリル・スプリントドリル・スプリントセッション）の最古日で埋める
WITH first_dates AS (
  SELECT user_id, MIN(d) AS first_training_date
  FROM (
    SELECT user_id, training_date AS d FROM public.self_t_word_summary
    UNION ALL
    SELECT user_id, training_date AS d FROM public.self_t_sprint_summary
    UNION ALL
    SELECT s.user_id, (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date AS d
    FROM public.self_t_sprint s
    JOIN public.com_m_user u ON u.id = s.user_id
  ) dates
  GROUP BY user_id
)
UPDATE public.student_m_training_lifetime_stats ls
SET first_training_date = fd.first_training_date
FROM first_dates fd
WHERE ls.user_id = fd.user_id;

COMMIT;

-- =========================================================================
-- 【追加セクション】会社情報の法人ごと化（日本法人の追加）
-- 追加日: 2026-10-01
--
-- 【内容】
--   生徒向けトレーニングレポートを日本法人名義で発行するため、com_m_company_profile の
--   シングルトン運用（1行のみ）をやめ、法人コード(company_code)で法人ごとに1行を持つ。
--   既存行はバンクーバー法人(GVT_CA)とし、日本法人(GABBY_JP)の行を追加する。
--   日本法人の行は既に存在する場合は上書きしない（アドミン画面で編集済みの内容を守るため）。
--
-- 【注意】旧アプリの支払通知書・請求書PDFは会社情報を条件なしで1行取得しているため、
--   本セクション適用後は旧アプリでPDFが作れなくなる。アプリのデプロイと同時に適用すること。
--
-- 対応ファイル: DDL/table/com_m_company_profile.sql, DML/com_m_company_profile.sql
-- =========================================================================

BEGIN;

ALTER TABLE public.com_m_company_profile
  ADD COLUMN IF NOT EXISTS company_code text,
  ADD COLUMN IF NOT EXISTS company_name_ja text DEFAULT NULL;

UPDATE public.com_m_company_profile
SET company_code = 'GVT_CA'
WHERE company_profile_id = '00000000-0000-0000-0000-000000000001' AND company_code IS NULL;

ALTER TABLE public.com_m_company_profile ALTER COLUMN company_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_profile_code ON public.com_m_company_profile (company_code);

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（法人ごとに1行。書面の発行元として使用。コーチ向け支払通知書・請求書=GVT_CA、生徒向けトレーニングレポート=GABBY_JP）';
COMMENT ON COLUMN public.com_m_company_profile.company_code IS '法人コード（GVT_CA: バンクーバー法人 / GABBY_JP: 日本法人）。一意';
COMMENT ON COLUMN public.com_m_company_profile.company_name IS '会社名（英語。例: Gabby Academy Co., Ltd.）';
COMMENT ON COLUMN public.com_m_company_profile.company_name_ja IS '会社名（日本語。例: 株式会社ギャビーアカデミー）。日本法人の書面で英語名と併記する。任意';

INSERT INTO public.com_m_company_profile (company_profile_id, company_code, company_name, company_name_ja, address, logo_path, tax_registration_number)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'GABBY_JP',
  'Gabby Academy Co., Ltd.',
  '株式会社ギャビーアカデミー',
  '〒101-0041' || E'\n' || '東京都千代田区神田須田町2-25 GYB秋葉原2F',
  'logo-01.png',
  NULL
)
ON CONFLICT (company_profile_id) DO NOTHING;

COMMIT;

-- =========================================================================
-- 【追加セクション】スプリント到達レベルの変更履歴
-- 追加日: 2026-10-01
--
-- 【内容】
--   トレーニングレポートに契約期間の開始時点・終了時点のレベルを載せるため、
--   student_m_sprint_progress のレベル変更をトリガーで履歴テーブルに記録する。
--   管理者による引き下げは「誤った引き上げの修正」として扱い、修正後より高い直近の記録を取り消す。
--   既存の生徒は、本セクション適用時点のレベルを起点として記録する（適用前の時点のレベルは不明扱い）。
--   起点の記録は、履歴が無い生徒だけを対象にするため、再実行しても重複しない。
--
-- 対応ファイル: DDL/table/student_t_sprint_level_history.sql,
--               DDL/function/record_sprint_level_history.sql, DDL/function/get_sprint_level_as_of.sql
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_t_sprint_level_history (
    history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    question_type smallint NOT NULL, -- 0:Speed 4:Structure 5:Builders 6:Mastery（packages/types/sprint.ts の SprintQuestionType）
    old_level smallint,               -- 変更前のレベル（起点の行はNULL）
    new_level smallint NOT NULL,
    change_kind smallint NOT NULL,    -- 0:起点 1:引き上げ 2:修正（管理者による引き下げ）
    effective_at timestamp with time zone NOT NULL, -- このレベルになったとみなす日時（修正の行は取り消した行の日時）
    changed_by uuid,                  -- 操作したユーザー（コーチはauth.uid()。管理者画面はservice_role経由のためNULL）
    voided_at timestamp with time zone,              -- 管理者の修正で取り消された日時（取り消されていなければNULL）
    voided_by_history_id bigint REFERENCES public.student_t_sprint_level_history(history_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sprint_level_history_question_type CHECK (question_type IN (0, 4, 5, 6)),
    CONSTRAINT chk_sprint_level_history_change_kind CHECK (change_kind IN (0, 1, 2))
);

COMMENT ON TABLE public.student_t_sprint_level_history IS 'スプリント到達レベルの変更履歴（問題種別ごと。任意の時点のレベル算出に使う。管理者の修正で誤った引き上げは取消済みにする）';
COMMENT ON COLUMN public.student_t_sprint_level_history.history_id IS '履歴ID（同じeffective_atの行の前後関係にも使う）';
COMMENT ON COLUMN public.student_t_sprint_level_history.user_id IS '生徒のユーザID';
COMMENT ON COLUMN public.student_t_sprint_level_history.question_type IS '問題種別 0:Speed 4:Structure 5:Builders 6:Mastery';
COMMENT ON COLUMN public.student_t_sprint_level_history.old_level IS '変更前のレベル（起点の行はNULL）';
COMMENT ON COLUMN public.student_t_sprint_level_history.new_level IS '変更後のレベル';
COMMENT ON COLUMN public.student_t_sprint_level_history.change_kind IS '記録の種類 0:起点 1:引き上げ 2:修正（管理者による引き下げ）';
COMMENT ON COLUMN public.student_t_sprint_level_history.effective_at IS 'このレベルになったとみなす日時。引き上げ・起点は操作日時、修正は取り消した行のうち最も古い行の日時';
COMMENT ON COLUMN public.student_t_sprint_level_history.changed_by IS '操作したユーザーID（コーチ操作はauth.uid()。管理者画面・システム処理はNULL）';
COMMENT ON COLUMN public.student_t_sprint_level_history.voided_at IS '管理者の修正で取り消された日時（取消済みの行はレベルの算出に使わない）';
COMMENT ON COLUMN public.student_t_sprint_level_history.voided_by_history_id IS 'この行を取り消した修正の行のhistory_id';
COMMENT ON COLUMN public.student_t_sprint_level_history.insert_date IS '記録日時';

CREATE INDEX IF NOT EXISTS idx_sprint_level_history_lookup
  ON public.student_t_sprint_level_history (user_id, question_type, effective_at DESC, history_id DESC)
  WHERE voided_at IS NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.student_t_sprint_level_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view sprint level history" ON public.student_t_sprint_level_history;
CREATE POLICY "Admins can view sprint level history" ON public.student_t_sprint_level_history
FOR SELECT TO authenticated
USING (public.get_jwt_user_type() = '0');

-- 問題種別1つ分の変更を履歴に追記する（トリガー専用の内部関数）
CREATE OR REPLACE FUNCTION public.append_sprint_level_history(
    p_user_id uuid,
    p_question_type smallint,
    p_old_level smallint,
    p_new_level smallint,
    p_changed_by uuid
)
RETURNS void AS $$
DECLARE
    v_row record;
    v_void_ids bigint[] := '{}';
    v_effective_at timestamp with time zone;
    v_history_id bigint;
BEGIN
    IF p_old_level IS NOT DISTINCT FROM p_new_level THEN
        RETURN;
    END IF;

    -- 起点（進捗行の作成時）・引き上げ
    IF p_old_level IS NULL OR p_new_level > p_old_level THEN
        INSERT INTO public.student_t_sprint_level_history
            (user_id, question_type, old_level, new_level, change_kind, effective_at, changed_by)
        VALUES
            (p_user_id, p_question_type, p_old_level, p_new_level,
             CASE WHEN p_old_level IS NULL THEN 0 ELSE 1 END, NOW(), p_changed_by);
        RETURN;
    END IF;

    -- 引き下げ（管理者による修正）: 直近から遡り、修正後のレベルより高い値の行を取り消し対象にする
    FOR v_row IN
        SELECT history_id, new_level, effective_at
        FROM public.student_t_sprint_level_history
        WHERE user_id = p_user_id AND question_type = p_question_type AND voided_at IS NULL
        ORDER BY effective_at DESC, history_id DESC
    LOOP
        EXIT WHEN v_row.new_level <= p_new_level;
        v_void_ids := v_void_ids || v_row.history_id;
        v_effective_at := v_row.effective_at;
    END LOOP;

    INSERT INTO public.student_t_sprint_level_history
        (user_id, question_type, old_level, new_level, change_kind, effective_at, changed_by)
    VALUES
        (p_user_id, p_question_type, p_old_level, p_new_level, 2, COALESCE(v_effective_at, NOW()), p_changed_by)
    RETURNING history_id INTO v_history_id;

    IF cardinality(v_void_ids) > 0 THEN
        UPDATE public.student_t_sprint_level_history
        SET voided_at = NOW(), voided_by_history_id = v_history_id
        WHERE history_id = ANY(v_void_ids);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.append_sprint_level_history(uuid, smallint, smallint, smallint, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_sprint_level_history()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by uuid := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.append_sprint_level_history(NEW.user_id, 0::smallint, NULL, NEW.level_speed, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 4::smallint, NULL, NEW.level_structure, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 5::smallint, NULL, NEW.level_builders, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 6::smallint, NULL, NEW.level_mastery, v_changed_by);
    ELSE
        PERFORM public.append_sprint_level_history(NEW.user_id, 0::smallint, OLD.level_speed, NEW.level_speed, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 4::smallint, OLD.level_structure, NEW.level_structure, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 5::smallint, OLD.level_builders, NEW.level_builders, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 6::smallint, OLD.level_mastery, NEW.level_mastery, v_changed_by);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_sprint_progress_change_record_level_history ON public.student_m_sprint_progress;
CREATE TRIGGER on_sprint_progress_change_record_level_history
AFTER INSERT OR UPDATE OF level_speed, level_structure, level_builders, level_mastery ON public.student_m_sprint_progress
FOR EACH ROW EXECUTE PROCEDURE public.record_sprint_level_history();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.record_sprint_level_history() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_sprint_level_as_of(
    p_user_id uuid,
    p_question_type smallint,
    p_at timestamp with time zone
)
RETURNS smallint AS $$
    SELECT h.new_level
    FROM public.student_t_sprint_level_history h
    WHERE h.user_id = p_user_id
      AND h.question_type = p_question_type
      AND h.voided_at IS NULL
      AND h.effective_at <= p_at
    ORDER BY h.effective_at DESC, h.history_id DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_level_as_of(uuid, smallint, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sprint_level_as_of(uuid, smallint, timestamp with time zone) TO service_role;

-- 既存の生徒の起点（適用時点のレベル）を記録する
INSERT INTO public.student_t_sprint_level_history (user_id, question_type, old_level, new_level, change_kind, effective_at)
SELECT p.user_id, v.question_type, NULL, v.level, 0, NOW()
FROM public.student_m_sprint_progress p
CROSS JOIN LATERAL (VALUES
  (0::smallint, p.level_speed),
  (4::smallint, p.level_structure),
  (5::smallint, p.level_builders),
  (6::smallint, p.level_mastery)
) AS v(question_type, level)
WHERE NOT EXISTS (
  SELECT 1 FROM public.student_t_sprint_level_history h WHERE h.user_id = p.user_id
);

COMMIT;

-- =========================================================================
-- 【追加セクション】トレーニングレポート（ドラフト）の集計RPC
-- 追加日: 2026-10-01
--
-- 【内容】
--   アドミンの「サポート > トレーニングレポート」画面で、満了月ごとのライセンス一覧を表示し、
--   ライセンスごとにレポート(PDF)を作るための集計関数を追加する（service_roleのみ実行可）。
--   前提: 本ファイルの「スプリント到達レベルの変更履歴」セクションが適用済みであること。
--
-- 対応ファイル: DDL/function/get_training_report_targets.sql, DDL/function/get_training_report_data.sql
-- =========================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_training_report_targets(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_training_report_targets(
    p_from timestamp with time zone,
    p_to timestamp with time zone
)
RETURNS TABLE (
    license_id uuid,
    license_status smallint,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    student_id uuid,
    student_name text,
    contract_id uuid,
    contract_name text,
    plan_name text,
    client_name text,
    has_live_session boolean,
    finalized_comment_count integer,
    draft_comment_count integer
) AS $$
    SELECT
        l.license_id,
        l.status,
        l.start_date,
        l.end_date,
        l.user_id,
        u.user_name,
        c.contract_id,
        c.contract_name,
        c.plan_name,
        cl.client_name,
        t.ticket_id IS NOT NULL,
        COALESCE(rc.finalized_count, 0),
        COALESCE(rc.draft_count, 0)
    FROM public.com_t_user_license l
    JOIN public.com_m_user u ON u.id = l.user_id
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    JOIN public.com_m_client cl ON cl.client_id = c.client_id
    LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE r.status = 2)::integer AS finalized_count,
            COUNT(*) FILTER (WHERE r.status = 1)::integer AS draft_count
        FROM public.com_t_contract_training_report r
        WHERE r.ticket_id = t.ticket_id
    ) rc ON true
    WHERE l.end_date >= p_from AND l.end_date < p_to
    ORDER BY cl.client_name, c.contract_name, u.user_name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_targets(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_targets(timestamp with time zone, timestamp with time zone) TO service_role;

DROP FUNCTION IF EXISTS public.get_training_report_data(uuid[]);

CREATE OR REPLACE FUNCTION public.get_training_report_data(p_license_ids uuid[])
RETURNS jsonb AS $$
    WITH lic AS (
        SELECT
            l.license_id, l.user_id, l.status, l.start_date, l.end_date,
            (l.start_date AT TIME ZONE 'Asia/Tokyo')::date AS from_date,
            (l.end_date AT TIME ZONE 'Asia/Tokyo')::date AS to_date,
            LEAST(l.end_date, NOW()) AS level_end_at,
            u.user_name,
            c.contract_id, c.contract_name, c.plan_name, cl.client_name,
            t.ticket_id, t.total_sessions
        FROM public.com_t_user_license l
        JOIN public.com_m_user u ON u.id = l.user_id
        JOIN public.com_m_contract c ON c.contract_id = l.contract_id
        JOIN public.com_m_client cl ON cl.client_id = c.client_id
        LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
        WHERE l.license_id = ANY(p_license_ids)
    ),
    daily AS (
        SELECT
            lic.license_id,
            d.training_date,
            SUM(d.words)::integer AS words,
            SUM(d.phrases)::integer AS phrases,
            SUM(d.sprint_questions)::integer AS sprint_questions,
            SUM(d.assessments)::integer AS assessments
        FROM lic
        CROSS JOIN LATERAL (
            SELECT w.training_date, w.word_count AS words, w.phrase_count AS phrases,
                   0 AS sprint_questions, w.assessment_count AS assessments
            FROM public.self_t_word_summary w
            WHERE w.user_id = lic.user_id AND w.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT s.training_date, 0, 0, s.question_count, s.assessment_count
            FROM public.self_t_sprint_summary s
            WHERE s.user_id = lic.user_id AND s.training_date BETWEEN lic.from_date AND lic.to_date
        ) d
        GROUP BY lic.license_id, d.training_date
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'license_id', lic.license_id,
            'license_status', lic.status,
            'start_date', lic.start_date,
            'end_date', lic.end_date,
            'student_id', lic.user_id,
            'student_name', lic.user_name,
            'contract_id', lic.contract_id,
            'contract_name', lic.contract_name,
            'plan_name', lic.plan_name,
            'client_name', lic.client_name,
            'levels_start', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.start_date),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.start_date),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.start_date),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.start_date)
            ),
            'levels_end', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.level_end_at),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.level_end_at),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.level_end_at),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.level_end_at)
            ),
            'activity', (
                SELECT jsonb_build_object(
                    'active_days', COUNT(*)::integer,
                    'words', COALESCE(SUM(daily.words), 0)::integer,
                    'phrases', COALESCE(SUM(daily.phrases), 0)::integer,
                    'sprint_questions', COALESCE(SUM(daily.sprint_questions), 0)::integer,
                    'assessments', COALESCE(SUM(daily.assessments), 0)::integer
                )
                FROM daily WHERE daily.license_id = lic.license_id
            ),
            'monthly', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'month', m.month,
                    'active_days', m.active_days,
                    'words', m.words,
                    'phrases', m.phrases,
                    'sprint_questions', m.sprint_questions
                ) ORDER BY m.month), '[]'::jsonb)
                FROM (
                    SELECT to_char(daily.training_date, 'YYYY-MM') AS month,
                           COUNT(*)::integer AS active_days,
                           SUM(daily.words)::integer AS words,
                           SUM(daily.phrases)::integer AS phrases,
                           SUM(daily.sprint_questions)::integer AS sprint_questions
                    FROM daily WHERE daily.license_id = lic.license_id
                    GROUP BY 1
                ) m
            ),
            'live', CASE WHEN lic.ticket_id IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'total_sessions', lic.total_sessions,
                    'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IN (1, 2))::integer,
                    'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)::integer,
                    'late_cancel', COUNT(*) FILTER (WHERE s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded IS FALSE)::integer
                )
                FROM public.com_t_session s
                WHERE s.ticket_id = lic.ticket_id
            ) END,
            'comments', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'coach_name', cu.user_name,
                    'status', r.status,
                    'comment_text', r.comment_text,
                    'finalized_at', r.finalized_at
                ) ORDER BY r.insert_date), '[]'::jsonb)
                FROM public.com_t_contract_training_report r
                JOIN public.com_m_user cu ON cu.id = r.coach_id
                WHERE r.ticket_id = lic.ticket_id
            )
        )
        ORDER BY lic.user_name
    ), '[]'::jsonb)
    FROM lic;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) TO service_role;

COMMIT;
