-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261016-dev
-- 作成日: 2026-10-16
--
-- 【内容】
--   受講生同士が同じクライアント（テナント）の他の受講生のデータを読めないようにする
--   （Webトライアルで外部の申込者を1つの固定テナントに集めるための前提作業）。
--   1. モニター用RPC（get_monitor_*）を、モニターロールを持つ利用者だけが呼べるようにする
--      （これまでは JWT の client_id だけで判定しており、同じクライアントの一般の受講生でも呼べた）
--   2. com_m_user の「同じクライアントの利用者を参照できる」ポリシーを、本人・担当関係の相手・
--      同じチャットルームの参加者に絞る
--   3. ライセンス・チケット（と各履歴）を本人の行だけに絞る（コーチ向けのポリシーは変えない）
--   4. 学習実績（self_t_sprint / self_t_sprint_summary / self_t_word_summary）の
--      「同じクライアントの実績を参照できる」ポリシーを削除する（モニター画面は 1. のRPC経由で読む）
--
-- 対応ファイル:
--   DDL/function/get_monitor_client_id.sql（新規）, DDL/function/is_chat_room_peer.sql（新規）,
--   DDL/function/get_monitor_user_list.sql, get_monitor_word_history.sql, get_monitor_sprint_history.sql,
--   get_monitor_sprint_drill_history.sql,
--   DDL/table/com_m_user.sql, com_t_user_license.sql, com_t_user_license_history.sql,
--   com_t_user_session_ticket.sql, com_t_user_session_ticket_history.sql,
--   self_t_sprint.sql, self_t_sprint_summary.sql, self_t_word_summary.sql
-- 【注意】アプリの変更は不要（受講生・コーチの画面は本人の行・担当関係・チャット参加者のポリシーで読む。
--   admin は service_role で読む）。
--
-- 【このリリースの全体】
--   セクション1: 上記の RLS の締め直し / セクション2〜4: Webトライアルの申込（student の公開画面 /trial・
--   admin の申込一覧 /trial-applications・本登録時のトライアルのライセンス）/
--   セクション5: admin のユーザーの招待・即時作成のメールアドレスの重複確認 /
--   セクション6: Webトライアルの生徒のコーチ検索を「Webトライアル担当」ロールのコーチに限る /
--   セクション7: 使っていないロール（premium_member・chat_user）の削除。各セクションの説明を参照。
--
-- 【アプリの環境変数（このリリースで追加。student のみ）】
--   値は scripts/vercel-env/values/.env.<env> に書き、`pnpm vercel-env --env=<staging|prod> --apply` で反映してから
--   student をデプロイする（Vercel の画面では設定しない）。
--   - NEXT_PUBLIC_ADMIN_URL … 環境の定義から自動で決まる（値の設定は不要）
--   - MAIL_TRIAL_APPLICATION_TO … staging: m-iwatani@gvtech.co.jp / prod: support@gabbyacademy.com（値ファイルに設定済み）
--   - NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY … staging は Cloudflare のテスト用の固定値（設定不要）。
--     prod は Cloudflare の Turnstile で blueprint.gabbyacademy.com 用に作ったサイトキー・秘密鍵を値ファイルに書く
--     （未設定のままでは --apply が止まる。秘密鍵が無いと申込を受け付けない）
--
-- 【リリース後の作業】
--   コーポレートサイトのトライアル申込のリンク先を https://blueprint.gabbyacademy.com/trial に変える（制作会社に依頼）。
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--     node supabase/release/run.mjs 20261016_feature-20261016-dev_release.sql --env=<staging|prod>
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. モニター用RPCの呼び出し元確認
-- -------------------------------------------------------------------------
---------------------------------------------
-- モニター用RPCの呼び出し元確認ヘルパー（内部共通ヘルパー）
---------------------------------------------
-- 生徒モニタリング画面（apps/student /monitor）の各RPC（get_monitor_user_list / get_monitor_word_history /
-- get_monitor_sprint_history / get_monitor_sprint_drill_history）の先頭で呼び、呼び出し元が
-- モニターロール（com_t_user_role.role_id = 'monitor'）を持つ場合だけ、JWT の client_id を返す。
-- - client_id が JWT に無い場合、モニターロールを持たない場合は例外にする
--   （同じクライアントの一般の受講生が RPC を直接呼んでも、他の受講生の一覧・実績を読めないようにする）。
-- - ロールは JWT ではなく DB（com_t_user_role）で判定する（画面の表示可否 apps/student (app)/layout.tsx と同じ基準）。
-- - private スキーマに置き、SECURITY DEFINER の各RPCの内部からのみ呼び出す（authenticated には公開しない）。
CREATE OR REPLACE FUNCTION private.get_monitor_client_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'monitor'
    ) THEN
        RAISE EXCEPTION 'Monitor role required.' USING ERRCODE = '42501';
    END IF;

    RETURN _client_id;
END;
$$;

-- 🚨 内部ヘルパーのため外部公開しない（SECURITY DEFINER関数の内部からのみ呼び出される）
REVOKE ALL ON FUNCTION private.get_monitor_client_id() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- get_monitor_user_list: モニター画面の受講生の一覧
-- =========================================================================
-- 対象の生徒の判定は private.get_monitor_target_users（_client_id, _start_date, _end_date, _include_monitor）に任せ、
-- 本関数はその結果に表示用の情報（氏名・メール・ロール等）を結合するだけにする（モニターの各関数で判定をそろえるため）。
-- - _start_date / _end_date は必須で、常に「対象期間とライセンス期間が重なるか」で判定する。
-- - 招待中で本登録していない（ライセンス未発行の）ユーザーは含めない。
-- - 戻り値は RETURNS TABLE で列を明示する（アドミン用のビュー vw_user_list の列構成に依存させず、
--   アドミン専用の契約名も出さないため）。
-- =========================================================================

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
    -- モニターのロールを持つ利用者だけが、自分のクライアントの受講生を参照できる
    _client_id := private.get_monitor_client_id();

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

---------------------------------------------
-- 2. ドリル履歴関数（セキュリティ修正版）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化。
-- 従来はライセンス状態を一切見ず client_id の一致のみで絞り込んでいたため、対象期間に
-- 有効な契約を持っていない生徒（そもそも一度も契約していない等）の履歴も表示され得た。
-- 他のモニターRPCと同じ「対象期間に有効な契約を持っていた生徒」の定義に揃える。
CREATE OR REPLACE FUNCTION public.get_monitor_word_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    -- モニターのロールを持つ利用者だけが、自分のクライアントの受講生を参照できる
    _client_id := private.get_monitor_client_id();

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
    )
    SELECT jsonb_build_object(
        'summary_id', w.summary_id,
        'content_id', w.content_id,
        'user_id', w.user_id,
        'training_date', w.training_date,
        'word_count', w.word_count,
        'phrase_count', w.phrase_count,
        'assessment_count', w.assessment_count,
        'update_date', w.update_date,
        'content_name', c.content_name,
        'user_name', u.user_name
    )
    FROM public.self_t_word_summary w
    INNER JOIN target_users tu ON tu.user_id = w.user_id
    INNER JOIN public.com_m_user u ON u.id = w.user_id
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE w.training_date BETWEEN _start_date AND _end_date
      AND (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR w.user_id = ANY(_user_ids))
    ORDER BY w.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

---------------------------------------------
-- 3. スプリント履歴関数（セキュリティ修正版）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化。
-- 従来は get_monitor_user_list（表示用の付随情報まで結合する重い一覧関数）を対象生徒の
-- 絞り込みだけの目的で呼び出していた。対象生徒の判定ロジック自体は private.get_monitor_target_users
-- に集約されたため、本関数はそちらを直接呼び出す（余計なJOINを避け、判定ロジックの変更も
-- 一箇所で完結する）。
-- 【2026-10-03 改修】対象期間を日付（集計期間のタイムゾーン＝日本時間の暦日）で受け取り、各回は実施した
-- 生徒のタイムゾーンでの実施日（training_date）で絞って返す（各実績は生徒のタイムゾーンでの実施日で数える。
-- testing/e2e/specs/training/training-stats.md）。引数の型が変わるため旧シグネチャを削除してから作成する。
DROP FUNCTION IF EXISTS public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_monitor_sprint_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    -- モニターのロールを持つ利用者だけが、自分のクライアントの受講生を参照できる
    _client_id := private.get_monitor_client_id();

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'user_id', s.user_id,
        'sprint_type', s.sprint_type,
        'content_id', s.content_id,
        'question_type', s.question_type,
        'answer_type', s.answer_type,
        'difficulty_level', s.difficulty_level,
        'time_limit_sec', s.time_limit_sec,
        'total_answered', s.total_answered,
        'total_assessments', s.total_assessments,
        'insert_date', s.insert_date,
        'training_date', (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint s
    INNER JOIN target_users tu ON tu.user_id = s.user_id
    INNER JOIN public.com_m_user u ON u.id = s.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = s.content_id
    -- 前後1日広げた範囲で索引を使って絞り込み、生徒のタイムゾーンでの実施日で対象期間に合わせる
    WHERE s.insert_date >= (_start_date - 1)::timestamptz
      AND s.insert_date < (_end_date + 2)::timestamptz
      AND (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date BETWEEN _start_date AND _end_date
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

---------------------------------------------
-- 4. スプリントドリル履歴関数（新規追加）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化
-- （get_monitor_sprint_history と同様。詳細はそちらのコメント参照）。
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_drill_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    -- モニターのロールを持つ利用者だけが、自分のクライアントの受講生を参照できる
    _client_id := private.get_monitor_client_id();

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'summary_id', d.summary_id,
        'user_id', d.user_id,
        'content_id', d.content_id,
        'training_date', d.training_date,
        'question_count', d.question_count,
        'assessment_count', d.assessment_count,
        'speed_count', d.speed_count,
        'structure_count', d.structure_count,
        'builders_count', d.builders_count,
        'mastery_count', d.mastery_count,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint_summary d
    INNER JOIN target_users tu ON tu.user_id = d.user_id
    INNER JOIN public.com_m_user u ON u.id = d.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = d.content_id
    WHERE d.training_date BETWEEN _start_date AND _end_date
    ORDER BY d.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. com_m_user: 本人・担当関係の相手・同じチャットルームの参加者
-- -------------------------------------------------------------------------
---------------------------------------------
-- チャットルームの相手判定ヘルパー関数
---------------------------------------------
-- ログイン中のユーザーが参加中のルームに、指定したユーザーが参加している（または参加していた）かを返す。
-- com_m_user の RLS（"Chat room members can view each other"）から呼び、グループチャットで
-- 同じクライアントの受講生同士でも、同じルームの参加者の氏名・アイコンだけは参照できるようにする。
-- - 自分は参加中（left_at IS NULL）であること。相手は退出済みでもよい（過去の発言者の表示のため）。
-- - com_t_chat_room_user の RLS を経由すると評価が重くなるため、SECURITY DEFINER で直接判定する
--   （is_chat_room_member と同様のパターン）。
CREATE OR REPLACE FUNCTION public.is_chat_room_peer(p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_t_chat_room_user me
    JOIN public.com_t_chat_room_user peer ON peer.room_id = me.room_id
    WHERE me.user_id = auth.uid()
      AND me.left_at IS NULL
      AND peer.user_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.is_chat_room_peer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_room_peer(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view themselves and colleagues" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can view themselves" ON public.com_m_user;
CREATE POLICY "Users can view themselves" ON public.com_m_user FOR SELECT TO authenticated
USING (
    id = auth.uid()
);

DROP POLICY IF EXISTS "Users can view their coach-student counterparts" ON public.com_m_user;
CREATE POLICY "Users can view their coach-student counterparts" ON public.com_m_user FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE (r.coach_id = auth.uid() AND r.student_id = com_m_user.id)
           OR (r.student_id = auth.uid() AND r.coach_id = com_m_user.id)
    )
);

DROP POLICY IF EXISTS "Chat room members can view each other" ON public.com_m_user;
CREATE POLICY "Chat room members can view each other" ON public.com_m_user FOR SELECT TO authenticated
USING (
    public.is_chat_room_peer(id)
);

-- -------------------------------------------------------------------------
-- 3. ライセンス・チケット（と各履歴）: 本人の行だけ
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view relevant licenses" ON public.com_t_user_license;
DROP POLICY IF EXISTS "Users can view their own licenses" ON public.com_t_user_license;
CREATE POLICY "Users can view their own licenses" ON public.com_t_user_license FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can view relevant license history" ON public.com_t_user_license_history;
DROP POLICY IF EXISTS "Users can view their own license history" ON public.com_t_user_license_history;
CREATE POLICY "Users can view their own license history" ON public.com_t_user_license_history FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can view relevant session tickets" ON public.com_t_user_session_ticket;
DROP POLICY IF EXISTS "Users can view their own session tickets" ON public.com_t_user_session_ticket;
CREATE POLICY "Users can view their own session tickets" ON public.com_t_user_session_ticket FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can view relevant session ticket history" ON public.com_t_user_session_ticket_history;
DROP POLICY IF EXISTS "Users can view their own session ticket history" ON public.com_t_user_session_ticket_history;
CREATE POLICY "Users can view their own session ticket history" ON public.com_t_user_session_ticket_history FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

-- -------------------------------------------------------------------------
-- 4. 学習実績: 同じクライアントの実績を参照できるポリシーを削除
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers can view client's sprint scores" ON public.self_t_sprint;
DROP POLICY IF EXISTS "Managers can view client's sprint summaries" ON public.self_t_sprint_summary;
DROP POLICY IF EXISTS "Managers can view client's word summaries" ON public.self_t_word_summary;

COMMIT;

-- =========================================================================
-- 【追加セクション】Webトライアルの申込（固定の顧客・プラン・申込テーブル・月ごとの契約）
--
-- 【内容】
--   1. 固定の顧客「Webトライアル」（全環境で同じID。web_trial_client_id()）とプラン WEB_TRIAL（ライブ1回）を登録
--   2. 申込テーブル com_t_trial_application（メールアドレスごとに1行。参照は管理者のみ）
--   3. fn_resolve_web_trial_contract(): 本登録の月の契約（1日〜翌月14日・ライセンス数100）を探し、無ければ作る
--
-- 対応ファイル: DML/com_m_client_web_trial.sql, DML/com_m_contract_plan.sql,
--   DDL/table/com_t_trial_application.sql, DDL/function/web_trial_client_id.sql,
--   DDL/function/fn_resolve_web_trial_contract.sql
-- 【注意】student・admin のデプロイより先に適用すること（申込フォーム・本登録・admin の申込一覧が使う）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DML: com_m_client（顧客マスタ）Webトライアルの固定の顧客
-- 前提: DDL/table/com_m_client.sql の実行が完了していること。
-- ID は全環境で同じ（web_trial_client_id() / packages/types/trialApplication.ts の WEB_TRIAL_CLIENT_ID）。
-- client_type 2 = 個人。冪等性のため、既存行は名前・種別だけ上書きする。
---------------------------------------------
INSERT INTO public.com_m_client (client_id, client_name, client_type) VALUES
  ('a7e1a100-0000-4000-8000-000000000001', 'Webトライアル', 2)
ON CONFLICT (client_id) DO UPDATE SET
  client_name = EXCLUDED.client_name,
  client_type = EXCLUDED.client_type,
  update_date = NOW();

INSERT INTO public.com_m_contract_plan (plan_code, plan_name, plan_name_en, contract_type, weekly_frequency, period_months, total_sessions, has_dialogue_practice, sort_no) VALUES
  ('WEB_TRIAL', 'Webトライアル', 'Web trial', 2, 1, 1, 1, false, 99)
ON CONFLICT (plan_code) DO NOTHING;

CREATE TABLE public.com_t_trial_application (
    application_id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    email                    text         NOT NULL UNIQUE,
    last_name                text         NOT NULL,
    first_name               text         NOT NULL,
    last_name_latin          text         NOT NULL,
    first_name_latin         text         NOT NULL,
    timezone                 text         NOT NULL REFERENCES public.com_m_timezone(timezone),
    country_city             text,
    occupation               smallint     NOT NULL,
    occupation_other         text,
    referral_source          smallint     NOT NULL,
    referral_source_other    text,
    message                  text,
    invitation_id            uuid         UNIQUE REFERENCES public.com_t_invitation(id) ON DELETE SET NULL,
    user_id                  uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    apply_count              integer      NOT NULL DEFAULT 1,
    last_applied_at          timestamp with time zone NOT NULL DEFAULT now(),
    accepted_at              timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_trial_application_email_lower CHECK (email = lower(email))
);

COMMENT ON TABLE public.com_t_trial_application IS 'Webトライアルの申込（メールアドレスごとに1行。再申込は同じ行を更新）';
COMMENT ON COLUMN public.com_t_trial_application.application_id IS '申込ID';
COMMENT ON COLUMN public.com_t_trial_application.email IS 'メールアドレス（小文字）';
COMMENT ON COLUMN public.com_t_trial_application.last_name IS '姓（本登録時に com_m_user_legal.last_name へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.first_name IS '名（本登録時に com_m_user_legal.first_name へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.last_name_latin IS '姓のローマ字表記（本登録時に com_m_user_legal.last_name_latin へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.first_name_latin IS '名のローマ字表記（本登録時に com_m_user_legal.first_name_latin へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.timezone IS 'タイムゾーン（本登録時に com_m_user.timezone へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.country_city IS '国・都市';
COMMENT ON COLUMN public.com_t_trial_application.occupation IS '業種・職業のコード（正本は packages/types/trialApplication.ts の TRIAL_OCCUPATIONS）';
COMMENT ON COLUMN public.com_t_trial_application.occupation_other IS '業種・職業が「その他」の場合の記入内容';
COMMENT ON COLUMN public.com_t_trial_application.referral_source IS '知ったきっかけのコード（正本は packages/types/trialApplication.ts の TRIAL_REFERRAL_SOURCES）';
COMMENT ON COLUMN public.com_t_trial_application.referral_source_other IS '知ったきっかけが「その他」の場合の記入内容';
COMMENT ON COLUMN public.com_t_trial_application.message IS 'ご要望・ご質問（自由記入）';
COMMENT ON COLUMN public.com_t_trial_application.invitation_id IS '招待ID (com_t_invitation.id)';
COMMENT ON COLUMN public.com_t_trial_application.user_id IS '本登録したユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_trial_application.apply_count IS '申込の回数（再申込で増える）';
COMMENT ON COLUMN public.com_t_trial_application.last_applied_at IS '最後に申し込んだ日時';
COMMENT ON COLUMN public.com_t_trial_application.accepted_at IS '本登録（パスワード設定）の日時';
COMMENT ON COLUMN public.com_t_trial_application.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_trial_application.update_date IS '更新日時';

ALTER TABLE public.com_t_trial_application ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trial applications" ON public.com_t_trial_application FOR SELECT TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
);

---------------------------------------------
-- Webトライアルの申込者が所属する固定の顧客のID
---------------------------------------------
-- 全環境で同じIDの顧客「Webトライアル」（supabase/DML/com_m_client_web_trial.sql）に、申込者を常に所属させる
-- （月ごと等に顧客を増やさない）。アプリ側の同じ値は packages/types/trialApplication.ts の WEB_TRIAL_CLIENT_ID。
-- 変更する場合は両方を直す。
CREATE OR REPLACE FUNCTION public.web_trial_client_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'a7e1a100-0000-4000-8000-000000000001'::uuid $$;

COMMENT ON FUNCTION public.web_trial_client_id() IS 'Webトライアルの申込者が所属する固定の顧客のID';

---------------------------------------------
-- fn_resolve_web_trial_contract: Webトライアルの本登録に使う契約を探す（無ければ作る）
---------------------------------------------
-- Webトライアルの申込者が本登録（パスワード設定）した時点で acceptInvitationCore（service_role）から呼び、
-- 本登録の月（集計期間のタイムゾーン＝日本時間）の契約の ID を返す。申込の時点では契約を決めない
-- （月末の申込が翌月に本登録しても、本登録の月の契約に入る）。
-- - 顧客は固定の「Webトライアル」（web_trial_client_id()）、プランは plan_code = 'WEB_TRIAL'。
-- - 契約の期間は、その月の1日 0:00 〜 翌月14日 23:59:59.999（日本時間）。ライセンスは本登録の日から
--   14日間のため、月末に本登録した人の期間も契約の期間に収まる。
-- - ライセンス数（max_licenses）は 100。超えても本登録は止めない（issueInitialLicense は上限を確かめない）。
-- - 同時に本登録した人が別々に契約を作らないよう、トランザクション単位のロックで1件にまとめる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_web_trial_contract(p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz text := public.reporting_timezone();
    v_client_id uuid := public.web_trial_client_id();
    v_month date := date_trunc('month', p_at AT TIME ZONE v_tz)::date;
    v_start timestamptz := v_month::timestamp AT TIME ZONE v_tz;
    v_end timestamptz := ((v_month + interval '1 month' + interval '14 days')::timestamp AT TIME ZONE v_tz) - interval '1 millisecond';
    v_plan public.com_m_contract_plan%ROWTYPE;
    v_contract_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_resolve_web_trial_contract'));

    SELECT contract_id INTO v_contract_id
    FROM public.com_m_contract
    WHERE client_id = v_client_id
      AND start_date = v_start
      AND status = 1
    ORDER BY insert_date
    LIMIT 1;

    IF v_contract_id IS NOT NULL THEN
        RETURN v_contract_id;
    END IF;

    SELECT * INTO v_plan FROM public.com_m_contract_plan WHERE plan_code = 'WEB_TRIAL' AND delete_flg = '0';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract plan WEB_TRIAL not found.';
    END IF;

    INSERT INTO public.com_m_contract (
        client_id, plan_id, plan_name, plan_name_en, contract_name, contract_type,
        weekly_frequency, total_sessions, has_dialogue_practice, max_licenses, start_date, end_date, status, note
    ) VALUES (
        v_client_id, v_plan.plan_id, v_plan.plan_name, v_plan.plan_name_en,
        'Webトライアル ' || to_char(v_month, 'YYYY年MM月'), v_plan.contract_type,
        v_plan.weekly_frequency, v_plan.total_sessions, v_plan.has_dialogue_practice, 100, v_start, v_end, 1,
        'Webトライアルの本登録時に自動で作成'
    )
    RETURNING contract_id INTO v_contract_id;

    RETURN v_contract_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】Webトライアルの申込の受付（fn_submit_trial_application）
--
-- 【内容】
--   申込フォームのサーバーアクション（service_role）が呼ぶ。申込の種類（新規・再申込・登録済み・招待中）の判定、
--   招待の作成・出し直し、申込の記録、管理者全員へのアプリ内の通知（TRIAL_APPLIED）を1トランザクションで行う。
--
-- 対応ファイル: DDL/function/fn_submit_trial_application.sql
-- 【注意】student のデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- fn_submit_trial_application: Webトライアルの申込を受け付ける
---------------------------------------------
-- 申込フォーム（apps/student /trial）のサーバーアクションから service_role で呼ぶ。メールの送信はアプリ側
-- （packages/lib/trial/apply.ts）が戻り値の kind に合わせて行う。
--
-- 【申込の種類（kind）】（同じメールアドレスの申込はロックで1件ずつ処理する）
--   new        … 招待を作る（トライアル以外で本登録済みの古い招待が残っていれば、トライアルの招待に作り直す）
--   reapply    … 本登録前の再申込。この申込の招待のトークン・有効期限を出し直す（期限切れでも出し直す）
--   registered … 登録済みのアドレス（auth.users に有る）。招待は作らず、申込にそのユーザーを記録する
--                （アプリが本人にログインの案内を送る）
--   invited    … トライアル以外の招待（管理者が作った招待）が本登録前。招待には触れない（窓口が個別に対応する）
-- いずれの場合も申込（com_t_trial_application）は最新の入力で記録し（メールアドレスごとに1行、apply_count を増やす）、
-- 管理者全員へアプリ内の通知（TRIAL_APPLIED）を登録する（管理者宛ての通知はメールを送らない）。
--
-- 【連続の送信】
-- 同じアドレスの前回の申込から p_min_interval 以内なら何もせず throttled = true を返す（二重送信・連打で
-- 招待メール・通知が重ならないように。画面には通常の受付完了を表示する）。
--
-- 【氏名】
-- 姓・名とそれぞれのローマ字を受け取る。招待（→ com_m_user.user_name。コーチも見る画面の名前）には
-- ローマ字の「名 姓」（例: Taro Yamada）を入れ、正式な氏名（com_m_user_legal）は本登録時にアプリが申込から作る。
--
-- 招待の所属は固定の顧客「Webトライアル」（web_trial_client_id()）。契約・ライセンスは本登録の時点で決める
-- （fn_resolve_web_trial_contract）。p_email は小文字にそろえて渡す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);

CREATE OR REPLACE FUNCTION public.fn_submit_trial_application(
    p_email text,
    p_last_name text,
    p_first_name text,
    p_last_name_latin text,
    p_first_name_latin text,
    p_timezone text,
    p_country_city text,
    p_occupation smallint,
    p_occupation_other text,
    p_referral_source smallint,
    p_referral_source_other text,
    p_message text,
    p_token text,
    p_expires_at timestamptz,
    p_min_interval interval DEFAULT interval '2 minutes'
)
RETURNS TABLE (
    kind text,
    application_id uuid,
    apply_count integer,
    invitation_token text,
    throttled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_email text := lower(trim(p_email));
    v_user_name text := btrim(p_first_name_latin) || ' ' || btrim(p_last_name_latin);
    v_app public.com_t_trial_application%ROWTYPE;
    v_inv public.com_t_invitation%ROWTYPE;
    v_kind text;
    v_invitation_id uuid;
    v_token text;
    v_application_id uuid;
    v_apply_count integer;
    v_user_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_submit_trial_application:' || v_email));

    SELECT * INTO v_app FROM public.com_t_trial_application a WHERE a.email = v_email;
    IF FOUND AND v_app.last_applied_at > now() - p_min_interval THEN
        RETURN QUERY SELECT NULL::text, v_app.application_id, v_app.apply_count, NULL::text, true;
        RETURN;
    END IF;

    SELECT au.id INTO v_user_id FROM auth.users au WHERE lower(au.email) = v_email;
    IF v_user_id IS NOT NULL THEN
        v_kind := 'registered';
        v_invitation_id := v_app.invitation_id;
    ELSE
        SELECT * INTO v_inv FROM public.com_t_invitation i WHERE lower(i.email) = v_email;
        IF NOT FOUND THEN
            INSERT INTO public.com_t_invitation (email, user_name, user_type, client_id, contract_id, roles, token, expires_at)
            VALUES (v_email, v_user_name, '1', public.web_trial_client_id(), NULL, '{}', p_token, p_expires_at)
            RETURNING id INTO v_invitation_id;
            v_kind := 'new';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL AND v_inv.id IS NOT DISTINCT FROM v_app.invitation_id THEN
            UPDATE public.com_t_invitation
            SET user_name = v_user_name, token = p_token, expires_at = p_expires_at,
                mail_sent_at = NULL, last_mail_error = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'reapply';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL THEN
            v_kind := 'invited';
            v_invitation_id := v_app.invitation_id;
        ELSE
            -- 本登録済みの招待が残っているが、ユーザーは削除済み。トライアルの招待として作り直す
            UPDATE public.com_t_invitation
            SET user_name = v_user_name, user_type = '1', client_id = public.web_trial_client_id(), contract_id = NULL,
                roles = '{}', token = p_token, expires_at = p_expires_at, accepted_at = NULL,
                mail_sent_at = NULL, last_mail_error = NULL, invited_by = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'new';
            v_token := p_token;
        END IF;
    END IF;

    INSERT INTO public.com_t_trial_application AS a (
        email, last_name, first_name, last_name_latin, first_name_latin, timezone, country_city,
        occupation, occupation_other, referral_source, referral_source_other, message, invitation_id, user_id
    ) VALUES (
        v_email, p_last_name, p_first_name, p_last_name_latin, p_first_name_latin, p_timezone, NULLIF(p_country_city, ''),
        p_occupation, NULLIF(p_occupation_other, ''), p_referral_source, NULLIF(p_referral_source_other, ''),
        NULLIF(p_message, ''), v_invitation_id, v_user_id
    )
    ON CONFLICT (email) DO UPDATE SET
        last_name = EXCLUDED.last_name,
        first_name = EXCLUDED.first_name,
        last_name_latin = EXCLUDED.last_name_latin,
        first_name_latin = EXCLUDED.first_name_latin,
        timezone = EXCLUDED.timezone,
        country_city = EXCLUDED.country_city,
        occupation = EXCLUDED.occupation,
        occupation_other = EXCLUDED.occupation_other,
        referral_source = EXCLUDED.referral_source,
        referral_source_other = EXCLUDED.referral_source_other,
        message = EXCLUDED.message,
        invitation_id = EXCLUDED.invitation_id,
        accepted_at = CASE WHEN v_kind = 'new' THEN NULL ELSE a.accepted_at END,
        user_id = CASE WHEN v_kind = 'new' THEN NULL ELSE COALESCE(a.user_id, EXCLUDED.user_id) END,
        apply_count = a.apply_count + 1,
        last_applied_at = now(),
        update_date = now()
    RETURNING a.application_id, a.apply_count INTO v_application_id, v_apply_count;

    INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
    SELECT u.id, 'TRIAL_APPLIED', v_application_id::text || ':' || v_apply_count::text,
           jsonb_build_object('application_id', v_application_id, 'applicant_name', p_last_name || ' ' || p_first_name,
                              'applicant_name_en', v_user_name, 'kind', v_kind, 'apply_count', v_apply_count),
           '/trial-applications'
    FROM public.com_m_user u
    WHERE u.user_type = '0' AND u.delete_flg = '0'
    ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;

    RETURN QUERY SELECT v_kind, v_application_id, v_apply_count, v_token, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, smallint, text, text, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, smallint, text, text, text, timestamptz, interval) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】Webトライアルの申込一覧のビュー（admin の /trial-applications）
--
-- 対応ファイル: DDL/view/vw_trial_application_list.sql
-- 【注意】admin のデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- VIEW: vw_trial_application_list Webトライアルの申込一覧（admin の /trial-applications。privateスキーマに隔離）
---------------------------------------------
-- 申込に招待の有効期限を添え、状態（status）を判定する（状態の判定はこのビューだけで行う。
-- 値の一覧は packages/types/trialApplication.ts の TrialApplicationStatus）。
--   registered … 本登録済み、または登録済みのアドレスからの申込（user_id あり）
--   invited    … 招待が本登録前・有効期限内
--   expired    … それ以外（招待の期限切れ、トライアル以外の招待中のアドレス等）
-- 氏名の検索用に、姓・名をつないだ full_name（姓 名）・full_name_latin（ローマ字の 名 姓）を添える。
CREATE OR REPLACE VIEW private.vw_trial_application_list
WITH (security_invoker = false) -- 定義者権限を維持
AS
SELECT
  a.application_id,
  a.email,
  a.last_name,
  a.first_name,
  a.last_name_latin,
  a.first_name_latin,
  a.last_name || ' ' || a.first_name AS full_name,
  a.first_name_latin || ' ' || a.last_name_latin AS full_name_latin,
  a.timezone,
  a.country_city,
  a.occupation,
  a.occupation_other,
  a.referral_source,
  a.referral_source_other,
  a.message,
  a.apply_count,
  a.last_applied_at,
  a.accepted_at,
  a.user_id,
  i.expires_at AS invitation_expires_at,
  CASE
    WHEN a.user_id IS NOT NULL OR a.accepted_at IS NOT NULL THEN 'registered'
    WHEN i.accepted_at IS NULL AND i.expires_at > now() THEN 'invited'
    ELSE 'expired'
  END AS status,
  a.insert_date
FROM public.com_t_trial_application a
LEFT JOIN public.com_t_invitation i ON i.id = a.invitation_id;

COMMENT ON VIEW private.vw_trial_application_list IS 'Webトライアルの申込一覧（admin 用。状態の判定つき）';

-- 🔒 セキュリティ権限の再設定
REVOKE ALL ON private.vw_trial_application_list FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.vw_trial_application_list TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】メールアドレスで認証のアカウントを探す（admin のユーザーの招待・即時作成の重複確認）
--
-- 【内容】
--   fn_find_auth_user_id_by_email(): admin の招待・即時作成が、登録済みのアドレスかを auth.users で確かめる
--   （従来は存在しない列 com_m_user.email を見ていて確認が効かず、即時作成したユーザーのアドレスにも招待を送れていた）。
--
-- 対応ファイル: DDL/function/fn_find_auth_user_id_by_email.sql
-- 【注意】admin のデプロイより先に適用すること（未適用だと招待・即時作成が失敗する）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- fn_find_auth_user_id_by_email: メールアドレスで認証のアカウント（auth.users）を探す
---------------------------------------------
-- admin のユーザーの招待・即時作成（apps/admin/actions/adminUserAction.ts）が、登録済みのアドレスかを確かめるのに使う。
-- com_m_user にはメールアドレスの列が無く、削除済み（delete_flg = '1'）のユーザーも認証のアカウントは残るため、
-- auth.users を直接見る（大文字小文字を区別しない）。見つからなければ NULL。service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT au.id FROM auth.users au WHERE lower(au.email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_find_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_find_auth_user_id_by_email(text) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】Webトライアルの生徒のコーチ検索を「Webトライアル担当」のコーチに限る
--
-- 【内容】
--   1. com_m_role: コーチ用のロール「Webトライアル担当」（web_trial_coach）を追加する
--      （admin のユーザー編集で、コーチに付与する）
--   2. get_matchable_coach_ids(p_ticket_id): 対象を生徒のチケット（契約）ごとに求めるよう引数を追加し、
--      プランが WEB_TRIAL のチケットでは Webトライアル担当のコーチだけを返す（担当のコーチは通常の生徒にも出る）
--
-- 対応ファイル: DML/com_m_role.sql, DDL/function/get_matchable_coach_ids.sql
-- 【注意】引数が変わるため、適用後は student の「専属コーチを探す」が新しいアプリでないと動かない。
--   適用と student のデプロイは続けて行うこと。
-- 【リリース後の作業】運営が Webトライアル担当のコーチを決め、admin のユーザー編集でロールを付与する
--   （付与するまで、Webトライアルの生徒の一覧にはコーチが出ない。担当のコーチもプロフィール・空き時間がそろい、
--   受付 ON・休止でないことが必要）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_role: Webトライアル担当（コーチ用）
---------------------------------------------
INSERT INTO public.com_m_role (role_id, role_name, target_user_type, seq_no) VALUES
  ('web_trial_coach', 'Webトライアル担当', '2', 3)
ON CONFLICT (role_id) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  target_user_type = EXCLUDED.target_user_type,
  seq_no = EXCLUDED.seq_no;

-- -------------------------------------------------------------------------
-- 2. get_matchable_coach_ids(p_ticket_id)
-- -------------------------------------------------------------------------
---------------------------------------------
-- マッチング対象コーチID取得関数
---------------------------------------------
-- 生徒向けの「専属コーチを探す」(apps/student /coach-matching) で、指定した生徒のチケット（契約）で
-- 申請できるコーチのIDを返す。マッチングはチケットごとのため、対象もチケットで決まる。
-- 呼び出した生徒（auth.uid()）のチケットでなければ何も返さない。
--
-- 【対象コーチの定義】有効なコーチプロフィール（com_m_coach_profile.delete_flg = '0'）のうち、次をすべて満たすコーチ
--   - コーチ本人が新規の生徒を受け付けている（com_m_coach_profile.accepting_students）
--   - アドミンが休止にしていない（com_m_coach_matching_suspension に行が無い）
--   - プロフィールの必須項目と空き時間がそろっている（fn_coach_matching_missing_items() が空）
--     （担当中・継続の生徒にも例外は設けない。内訳は get_coach_matching_status() でコーチ本人・アドミンが確認できる）
--   - デモユーザー（com_t_user_role.role_id = 'demo_user'）のコーチは、呼び出した生徒もデモユーザーの場合だけ含める
--     （本番のリリース検証・顧客向けプレゼン用のデモコーチが、通常の生徒から申請を受けないようにする）
--   - チケットの契約のプランが Webトライアル（com_m_contract_plan.plan_code = 'WEB_TRIAL'）の場合は、
--     Webトライアル担当（role_id = 'web_trial_coach'）のコーチだけ。担当のコーチは通常の生徒の一覧にも出る
--     （ロールは「トライアルの生徒にも出す」ための追加の扱い）。プランはチケットのライセンスの契約（com_m_contract.plan_id）で判定する
--
-- com_t_user_role はRLSで本人・adminしか閲覧できず、生徒からはコーチのロールを判定できないため
-- SECURITY DEFINER とする。戻り値はコーチIDのみで、ロール情報そのものは返さない。
--
-- 【呼び出し元】packages/lib/matching/actions/matchingActions.ts
--   - getCoachBrowseListCore ... コーチ一覧の絞り込み
--   - createMatchingRequestCore ... 申請先コーチの妥当性チェック（一覧外のコーチIDを直接送る申請を拒否）
-- admin の直接マッチング（admin_match_student_with_coach）は運営の手動操作のため対象外。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_matchable_coach_ids();

CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids(p_ticket_id uuid)
RETURNS TABLE (coach_id uuid) AS $$
  WITH caller_ticket AS (
    SELECT
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      ) AS is_demo,
      pl.plan_code = 'WEB_TRIAL' AS is_web_trial
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    JOIN public.com_m_contract_plan pl ON pl.plan_id = c.plan_id
    WHERE t.ticket_id = p_ticket_id
      AND t.user_id = auth.uid()
  )
  SELECT p.user_id
  FROM caller_ticket ct
  CROSS JOIN public.com_m_coach_profile p
  WHERE p.delete_flg = '0'
    AND p.accepting_students
    AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
    AND cardinality(public.fn_coach_matching_missing_items(p.user_id)) = 0
    -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
    AND (
      ct.is_demo
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    )
    -- Webトライアルのチケットは、Webトライアル担当のコーチだけ
    AND (
      NOT ct.is_web_trial
      OR EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'web_trial_coach'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】使っていないロール（premium_member・chat_user）を削除する
--
-- 【内容】
--   開発初期に検証用に作ったロール「プレミアム会員」（premium_member）・「チャット利用可能」（chat_user）を、
--   ユーザーへの付与（com_t_user_role）と本登録前の招待（com_t_invitation.roles）から外したうえで削除する。アプリ・DB の関数・ポリシーはどちらも参照していない。
--   付与の削除で trg_sync_app_meta_roles が動き、各ユーザーの app_metadata.roles からも外れる
--   （JWT のロールは次のトークンの更新から反映される）。
--
-- 対応ファイル: DML/com_m_role.sql
-- =========================================================================

BEGIN;

-- 本登録前の招待に残っている分も外す（本登録時に付与するため、残すと存在しないロールの付与で失敗する）
UPDATE public.com_t_invitation
SET roles = array_remove(array_remove(roles, 'premium_member'), 'chat_user')
WHERE roles && ARRAY['premium_member', 'chat_user']::text[];

DELETE FROM public.com_t_user_role WHERE role_id IN ('premium_member', 'chat_user');
DELETE FROM public.com_m_role WHERE role_id IN ('premium_member', 'chat_user');

COMMIT;

-- =========================================================================
-- 【追加セクション】論理削除フラグ（delete_flg）を廃止し、状態の列（status / is_active）と物理削除に置き換える
--
-- 【内容】（規約は docs/DATA-DELETION.md）
--   1. 状態の列を追加して値を移す
--      - com_m_user.status（1:有効 / 0:停止 / 9:退会済み）、com_m_client.status（1:取引中 / 9:取引終了）
--      - com_m_contents.status（1:公開 / 0:非公開）。これまで content_scope = 9 が「非公開」を兼ねていたため分け、
--        content_scope は 0:共通 / 1:限定 だけにする（非公開だった教材は、限定公開の設定があれば 1、無ければ 0）
--      - com_t_dialogue_assignment.status（1:割当中 / 0:解除）
--      - 選択肢のマスタに is_active（com_m_contract_plan / com_m_coach_specialty / com_m_country / com_m_timezone）
--   2. 物理削除だけにするテーブルの論理削除済みの行を消す（参照されていれば外部キーで止まり、全体が取り消される）。
--      固定のマスタ（com_m_role / com_m_color_vowel）に論理削除済みの行があれば中断する
--   3. delete_flg を参照する関数を置き換え、ポリシーの条件を書き換え、インデックスを作り直す
--   4. delete_flg 列を全テーブルから削除する。dev にだけ残っていた未使用のビュー（vw_*_monitored）と
--      作業用の表 bk_com_m_sprint_questions も削除する
--
-- 対応ファイル: DDL/table/（delete_flg を持っていた21テーブル）, DDL/function/（下記で置き換える18関数）
-- 【注意】アプリの変更と同時に反映する（旧アプリは delete_flg を参照するため、適用後〜デプロイまでの間は一部の画面が失敗する）。
-- =========================================================================

BEGIN;

-- 1. 状態の列 -------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.com_m_role WHERE delete_flg <> '0')
     OR EXISTS (SELECT 1 FROM public.com_m_color_vowel WHERE delete_flg <> 0) THEN
    RAISE EXCEPTION '固定のマスタ（com_m_role / com_m_color_vowel）に論理削除済みの行があります。扱いを決めてから再実行してください';
  END IF;
END $$;

ALTER TABLE public.com_m_user ADD COLUMN status smallint NOT NULL DEFAULT 1;
UPDATE public.com_m_user SET status = 0 WHERE delete_flg <> '0';
ALTER TABLE public.com_m_user ADD CONSTRAINT chk_user_status CHECK (status = ANY (ARRAY[0, 1, 9]));
COMMENT ON COLUMN public.com_m_user.status IS '状態 1:有効 0:停止（ログインできない） 9:退会済み（個人情報を消去済み）';

ALTER TABLE public.com_m_client ADD COLUMN status smallint NOT NULL DEFAULT 1;
UPDATE public.com_m_client SET status = 9 WHERE delete_flg <> '0';
ALTER TABLE public.com_m_client ADD CONSTRAINT chk_client_status CHECK (status = ANY (ARRAY[1, 9]));
COMMENT ON COLUMN public.com_m_client.status IS '状態 1:取引中 9:取引終了';

ALTER TABLE public.com_m_contents ADD COLUMN status smallint NOT NULL DEFAULT 0;
UPDATE public.com_m_contents c SET
  status = CASE WHEN c.delete_flg = '0' AND c.content_scope <> 9 THEN 1 ELSE 0 END,
  content_scope = CASE
    WHEN c.content_scope <> 9 THEN c.content_scope
    WHEN EXISTS (SELECT 1 FROM public.com_m_contents_access a WHERE a.content_id = c.content_id AND a.delete_flg = '0') THEN 1
    ELSE 0
  END;
ALTER TABLE public.com_m_contents ADD CONSTRAINT chk_contents_status CHECK (status = ANY (ARRAY[0, 1]));
ALTER TABLE public.com_m_contents ADD CONSTRAINT chk_contents_scope CHECK (content_scope = ANY (ARRAY[0, 1]));
COMMENT ON COLUMN public.com_m_contents.status IS '公開状態 1:公開 0:非公開（新規作成時は非公開）';
COMMENT ON COLUMN public.com_m_contents.content_scope IS 'コンテンツ公開範囲 0:共通, 1:クライアント限定';

ALTER TABLE public.com_t_dialogue_assignment ADD COLUMN status smallint NOT NULL DEFAULT 1;
UPDATE public.com_t_dialogue_assignment SET status = 0 WHERE delete_flg <> '0';
ALTER TABLE public.com_t_dialogue_assignment ADD CONSTRAINT chk_dialogue_assignment_status CHECK (status = ANY (ARRAY[0, 1]));
COMMENT ON COLUMN public.com_t_dialogue_assignment.status IS '状態 1:割当中 0:解除。同一セットの再割当を許容するため、一意性は割当中の行だけを対象にした部分ユニークインデックスで担保する';

ALTER TABLE public.com_m_contract_plan ADD COLUMN is_active boolean NOT NULL DEFAULT true;
UPDATE public.com_m_contract_plan SET is_active = false WHERE delete_flg <> '0';
COMMENT ON COLUMN public.com_m_contract_plan.is_active IS '販売中（契約の作成で選択肢に出す）';
ALTER TABLE public.com_m_coach_specialty ADD COLUMN is_active boolean NOT NULL DEFAULT true;
UPDATE public.com_m_coach_specialty SET is_active = false WHERE delete_flg <> '0';
COMMENT ON COLUMN public.com_m_coach_specialty.is_active IS '使用中（専門分野の設定で選択肢に出す）';
ALTER TABLE public.com_m_country ADD COLUMN is_active boolean NOT NULL DEFAULT true;
UPDATE public.com_m_country SET is_active = false WHERE delete_flg <> '0';
COMMENT ON COLUMN public.com_m_country.is_active IS '使用中（国の選択肢に出す）';
ALTER TABLE public.com_m_timezone ADD COLUMN is_active boolean NOT NULL DEFAULT true;
UPDATE public.com_m_timezone SET is_active = false WHERE delete_flg <> '0';
COMMENT ON COLUMN public.com_m_timezone.is_active IS '使用中（タイムゾーンの選択肢に出す）';

-- 2. 物理削除だけにするテーブルの論理削除済みの行 -------------------------
DELETE FROM public.com_m_ai_knowledge_base WHERE delete_flg <> '0';
DELETE FROM public.com_m_coach_availability WHERE delete_flg <> '0';
DELETE FROM public.com_m_contents_access WHERE delete_flg <> '0';
DELETE FROM public.com_m_contents_tag WHERE delete_flg <> '0';
DELETE FROM public.com_m_notice WHERE delete_flg <> '0';
DELETE FROM public.com_m_calendar_event WHERE delete_flg <> '0';
DELETE FROM public.com_m_calendar_event_series WHERE delete_flg <> '0';
DELETE FROM public.com_m_dialogue_session WHERE delete_flg <> '0';
DELETE FROM public.com_m_sprint_questions WHERE delete_flg <> '0';
DELETE FROM public.com_m_color_vowel_dictionary WHERE delete_flg <> 0;

DROP VIEW IF EXISTS public.vw_self_t_word_summary_monitored;
DROP VIEW IF EXISTS public.vw_com_m_user_monitored;
DROP TABLE IF EXISTS public.bk_com_m_sprint_questions;

-- 3. 関数（正本 DDL/function/ の全体）--------------------------------------

-- ---- DDL/function/admin_add_calendar_event_series_sessions.sql ----
---------------------------------------------
-- admin_add_calendar_event_series_sessions: シリーズに複数の回をまとめて登録する (2026-10-05 追加)
---------------------------------------------
-- アドミンのシリーズ詳細「回をまとめて追加」から呼ぶ（admin アプリのサーバーアクション、service_role）。
-- 各回（com_m_calendar_event）と担当コーチ（com_t_calendar_event_coach）を1つのトランザクションで登録し、
-- 途中で失敗した場合は1件も登録しない。
-- 各回の event_type はシリーズと同じにする。参加確認（rsvp_enabled）は呼び出し側で種別の rsvpRequired に従って渡す。
--
-- p_sessions: [{ "title", "description", "start_datetime", "end_datetime", "location_url",
--                "target_type", "client_id", "rsvp_enabled", "is_published", "coach_ids": [uuid, ...] }, ...]
-- 戻り値: 登録した回のID（登録順）
---------------------------------------------
DROP FUNCTION IF EXISTS public.admin_add_calendar_event_series_sessions(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.admin_add_calendar_event_series_sessions(p_series_id uuid, p_sessions jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_type varchar(30);
    v_session jsonb;
    v_event_id uuid;
BEGIN
    SELECT event_type INTO v_event_type
    FROM public.com_m_calendar_event_series
    WHERE series_id = p_series_id;
    IF v_event_type IS NULL THEN
        RAISE EXCEPTION 'series_not_found';
    END IF;
    IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
        RAISE EXCEPTION 'sessions_required';
    END IF;

    FOR v_session IN SELECT value FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.com_m_calendar_event (
            event_type, series_id, title, description, start_datetime, end_datetime, location_url,
            target_type, client_id, rsvp_enabled, is_published
        ) VALUES (
            v_event_type,
            p_series_id,
            v_session->>'title',
            NULLIF(v_session->>'description', ''),
            (v_session->>'start_datetime')::timestamptz,
            NULLIF(v_session->>'end_datetime', '')::timestamptz,
            NULLIF(v_session->>'location_url', ''),
            COALESCE(v_session->>'target_type', 'ALL'),
            NULLIF(v_session->>'client_id', '')::uuid,
            COALESCE((v_session->>'rsvp_enabled')::boolean, FALSE),
            COALESCE((v_session->>'is_published')::boolean, FALSE)
        )
        RETURNING calendar_event_id INTO v_event_id;

        INSERT INTO public.com_t_calendar_event_coach (calendar_event_id, coach_id)
        SELECT v_event_id, coach_id::uuid
        FROM jsonb_array_elements_text(COALESCE(v_session->'coach_ids', '[]'::jsonb)) AS coach_id;

        RETURN NEXT v_event_id;
    END LOOP;

    UPDATE public.com_m_calendar_event_series SET update_date = NOW() WHERE series_id = p_series_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) TO service_role;

-- ---- DDL/function/admin_set_coach_specialties.sql ----
---------------------------------------------
-- アドミンによるコーチの専門の設定RPC (2026-10-11 追加)
-- 前提: table/com_m_coach_specialty.sql, table/com_m_coach_specialty_assignment.sql の作成が完了していること。
---------------------------------------------
-- admin のユーザー管理 → コーチの「専門」ダイアログで使う。コーチ1人分の専門を、渡したコードの集合に置き換える
-- （外したものを削除し、足したものを登録する。続けて設定されているものは登録日時を変えない）。
-- 検証:
--   - アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED
--   - 対象がコーチでない（存在しない）場合は COACH_NOT_FOUND
--   - 有効なマスタに無いコードは INVALID_SPECIALTY
--   - 分野（kind='field'）は4つまで（TOO_MANY_FIELDS）。得意分野（kind='skill'）は数えない。
--     上限はアプリ側の COACH_SPECIALTY_FIELD_MAX（packages/types/coachSpecialty.ts）と揃える。
-- 返り値: 設定後の専門コード（マスタの表示順）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_coach_specialties(p_coach_id uuid, p_specialty_codes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_field_max CONSTANT integer := 4;
    v_codes text[];
    v_invalid text;
    v_field_count integer;
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can set coach specialties';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.com_m_user WHERE id = p_coach_id AND user_type = '2') THEN
        RAISE EXCEPTION 'COACH_NOT_FOUND: %', p_coach_id;
    END IF;

    -- 同じコーチへの同時の設定を順番に処理する（置き換えの途中で混ざらないようにする）
    PERFORM pg_advisory_xact_lock(hashtext('coach_specialty:' || p_coach_id::text));

    v_codes := ARRAY(SELECT DISTINCT unnest(COALESCE(p_specialty_codes, ARRAY[]::text[])));

    SELECT c INTO v_invalid
    FROM unnest(v_codes) AS c
    WHERE NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_specialty s
        WHERE s.specialty_code = c AND s.is_active
    )
    LIMIT 1;
    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_SPECIALTY: %', v_invalid;
    END IF;

    SELECT count(*) INTO v_field_count
    FROM public.com_m_coach_specialty s
    WHERE s.specialty_code = ANY(v_codes) AND s.kind = 'field';
    IF v_field_count > c_field_max THEN
        RAISE EXCEPTION 'TOO_MANY_FIELDS: % (max %)', v_field_count, c_field_max;
    END IF;

    DELETE FROM public.com_m_coach_specialty_assignment
    WHERE coach_id = p_coach_id AND NOT (specialty_code = ANY(v_codes));

    INSERT INTO public.com_m_coach_specialty_assignment (coach_id, specialty_code, created_by)
    SELECT p_coach_id, c, auth.uid()
    FROM unnest(v_codes) AS c
    ON CONFLICT (coach_id, specialty_code) DO NOTHING;

    RETURN ARRAY(
        SELECT a.specialty_code
        FROM public.com_m_coach_specialty_assignment a
        JOIN public.com_m_coach_specialty s ON s.specialty_code = a.specialty_code
        WHERE a.coach_id = p_coach_id
        ORDER BY s.sort_no
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) TO authenticated;

-- ---- DDL/function/enqueue_coach_availability_reminders.sql ----
---------------------------------------------
-- コーチの空き時間の見直し通知 (2026-10-06 追加)
-- 前提: table/com_m_coach_profile.sql（availability_confirmed_at パッチ）, table/com_m_coach_availability.sql,
--       table/com_t_notification.sql, function/fn_notify.sql の作成が完了していること。pg_cron が有効であること。
---------------------------------------------
-- 【背景】
-- 空き時間（com_m_coach_availability）はUTCで持つため、コーチの現地時刻での表示は夏時間の切り替えで
-- 1時間ずれる。また空き時間はコーチの生活の予定に合わせて変わる。そこで、コーチに14日ごとに
-- 空き時間を見直すようアプリ内通知で促す（メールは送らない。enqueue_notification_mail の対象外）。
--   - 空き時間が1件以上あるコーチ: 最後の確認（availability_confirmed_at）から14日を過ぎたら見直しを促す（kind = 'review'）
--   - 空き時間が0件のコーチ: 空き時間を登録するよう促す（kind = 'empty'。マッチングの申請を受けられないため）
--
-- 【通知の行】
-- 通知種別 COACH_AVAILABILITY_REMINDER、集約キー 'availability' の1行をコーチごとに使い回す
-- （再通知のたびに内容・未読・日時を更新する。一覧に同じ通知が溜まらない）。直近14日に通知した
-- コーチには出さない。空き時間を保存する・「変更なしで確認」すると、確認日時を更新し、この通知を既読にする。
--
-- 【対象のコーチ】
-- 有効なコーチ（com_m_user.user_type = '2' かつ status = 1）。デモコーチ
-- （demo_user ロール）は除く（通常の生徒のマッチング対象外のため。get_matchable_coach_ids と同じ考え方）。
-- 新規の生徒の受付をOFFにしたコーチ・アドミンが休止にしたコーチも除く（空き時間はマッチングにだけ使うため。2026-10-11 追加）。
---------------------------------------------

-- 確認日時の更新と、見直しの通知の既読化（空き時間の保存・「変更なしで確認」の共通処理。内部処理専用）
CREATE OR REPLACE FUNCTION public.fn_mark_coach_availability_confirmed(p_coach_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_m_coach_profile
    SET availability_confirmed_at = NOW()
    WHERE user_id = p_coach_id;

    UPDATE public.com_t_notification
    SET is_read = TRUE, read_at = NOW(), update_date = NOW()
    WHERE user_id = p_coach_id
      AND notification_type = 'COACH_AVAILABILITY_REMINDER'
      AND is_read = FALSE;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_coach_availability_confirmed(uuid) FROM PUBLIC, anon, authenticated;

-- 空き時間の追加・変更・削除（論理削除）のたびに確認済みにする
CREATE OR REPLACE FUNCTION public.trg_coach_availability_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_mark_coach_availability_confirmed(NEW.coach_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_coach_availability_change_confirm ON public.com_m_coach_availability;
CREATE TRIGGER on_coach_availability_change_confirm
AFTER INSERT OR UPDATE ON public.com_m_coach_availability
FOR EACH ROW EXECUTE FUNCTION public.trg_coach_availability_confirmed();

-- 「変更なしで確認」（コーチ本人のみ）
CREATE OR REPLACE FUNCTION public.confirm_my_coach_availability()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at timestamptz;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.com_m_coach_profile WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not authorized to confirm availability';
    END IF;

    PERFORM public.fn_mark_coach_availability_confirmed(auth.uid());

    SELECT availability_confirmed_at INTO v_confirmed_at FROM public.com_m_coach_profile WHERE user_id = auth.uid();
    RETURN v_confirmed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_my_coach_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_coach_availability() TO authenticated;

-- 見直しの通知を登録する（pg_cron から毎日実行）。戻り値は通知したコーチの数
CREATE OR REPLACE FUNCTION public.enqueue_coach_availability_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH coaches AS (
        SELECT
            p.user_id AS coach_id,
            COUNT(a.availability_id) AS slot_count,
            -- 確認日時が無い（本機能の追加前から登録している）場合は、空き時間の最終更新を確認日時とみなす
            COALESCE(p.availability_confirmed_at, MAX(a.update_date)) AS confirmed_at
        FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2' AND u.status = 1
        LEFT JOIN public.com_m_coach_availability a ON a.coach_id = p.user_id
        WHERE p.accepting_students
          AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_user_role r
              WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
          )
        GROUP BY p.user_id, p.availability_confirmed_at
    ),
    targets AS (
        SELECT c.coach_id, CASE WHEN c.slot_count = 0 THEN 'empty' ELSE 'review' END AS kind
        FROM coaches c
        WHERE (c.slot_count = 0 OR c.confirmed_at IS NULL OR c.confirmed_at < NOW() - interval '14 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_notification n
              WHERE n.user_id = c.coach_id
                AND n.notification_type = 'COACH_AVAILABILITY_REMINDER'
                AND n.dedup_key = 'availability'
                AND n.occurred_at >= NOW() - interval '14 days'
          )
    ),
    upserted AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
        SELECT coach_id, 'COACH_AVAILABILITY_REMINDER', 'availability', jsonb_build_object('kind', kind), '/availability'
        FROM targets
        ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            link_path = EXCLUDED.link_path,
            is_read = FALSE,
            read_at = NULL,
            occurred_at = NOW(),
            update_date = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_coach_availability_reminders() FROM PUBLIC, anon, authenticated;

-- 毎日 00:15 UTC（日本 9:15、北米は前日の夕方）に実行する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'coach-availability-reminders-daily';

SELECT cron.schedule(
    'coach-availability-reminders-daily',
    '15 0 * * *',
    $$ SELECT public.enqueue_coach_availability_reminders(); $$
);

-- ---- DDL/function/enqueue_event_reminders.sql ----
---------------------------------------------
-- enqueue_event_reminders: イベント（グループセッション）のリマインダーメールを送信待ちに登録する (2026-10-05 追加)
---------------------------------------------
-- 【呼び出し元】
-- 時刻で送るメールの登録のまとめ役 enqueue_scheduled_mails（enqueue_live_session_reminders.sql）経由で、
-- pg_cron のジョブ 'mail-dispatch-every-5min'（invoke_mail_dispatch.sql）と送信処理の冒頭から実行する。
--
-- 【対象】
-- 公開中のグループセッションの参加登録者（com_t_calendar_event_participant）と
-- 担当コーチ（com_t_calendar_event_coach）。同じ人が両方に該当しても1通にする。
--
-- 【送る時刻】
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾うため、
-- 実行が1回飛んでも次の実行で取りこぼさない。重複は com_t_mail_outbox の一意制約で防ぐ。
-- ただし期限を大きく過ぎた古い案内は送らない:
--   24h … 開始の24時間前〜12時間前の間だけ登録（開始の12時間前を切ってから参加登録した人には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- 開始後・取消・参加取消の確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_events AS (
        SELECT e.calendar_event_id, l.lead_key
        FROM public.com_m_calendar_event e
        JOIN leads l
          ON NOW() >= e.start_datetime - l.lead_from
         AND NOW() < e.start_datetime - l.lead_to
        WHERE e.event_type = 'GROUP_SESSION'
          AND e.is_published = TRUE
    ),
    recipients AS (
        SELECT d.calendar_event_id, d.lead_key, p.user_id
        FROM due_events d
        JOIN public.com_t_calendar_event_participant p ON p.calendar_event_id = d.calendar_event_id
        UNION
        SELECT d.calendar_event_id, d.lead_key, c.coach_id
        FROM due_events d
        JOIN public.com_t_calendar_event_coach c ON c.calendar_event_id = d.calendar_event_id
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'GROUP_SESSION_REMINDER',
           'REMINDER',
           r.calendar_event_id::text || ':' || r.lead_key,
           jsonb_build_object('calendar_event_id', r.calendar_event_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.status = 1
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_reminders() FROM PUBLIC, anon, authenticated;

-- ---- DDL/function/enqueue_live_session_reminders.sql ----
---------------------------------------------
-- enqueue_live_session_reminders: ライブセッションのリマインダーメールを送信待ちに登録する (2026-10-06 追加)
-- enqueue_scheduled_mails: 時刻で送るメールの登録のまとめ役（pg_cron の5分ごとのジョブ・送信処理の冒頭から呼ぶ）
---------------------------------------------
-- 【対象】
-- 予定（status=1）のライブセッションの生徒とコーチ。
--
-- 【送る時刻】（グループセッション enqueue_event_reminders と同じ）
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾う。重複は一意制約で防ぐ。
--   24h … 開始の24時間前〜12時間前の間だけ登録（直前に予約・振替した回には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- キャンセル・振替（振替後は別のセッション行）・開始済みの確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_live_session_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_sessions AS (
        SELECT s.session_id, s.student_id, s.coach_id, l.lead_key
        FROM public.com_t_session s
        JOIN leads l
          ON NOW() >= s.start_datetime - l.lead_from
         AND NOW() < s.start_datetime - l.lead_to
        WHERE s.status = 1
    ),
    recipients AS (
        SELECT session_id, lead_key, student_id AS user_id FROM due_sessions
        UNION
        SELECT session_id, lead_key, coach_id FROM due_sessions
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'LIVE_SESSION_REMINDER',
           'REMINDER',
           r.session_id::text || ':' || r.lead_key,
           jsonb_build_object('session_id', r.session_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.status = 1
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_live_session_reminders() FROM PUBLIC, anon, authenticated;

-- 時刻で送るメールの登録のまとめ役。時刻で送るメールの種類を増やすときは、ここに登録の関数を足す（cron のジョブは増やさない）
CREATE OR REPLACE FUNCTION public.enqueue_scheduled_mails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.enqueue_event_reminders() + public.enqueue_live_session_reminders();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_scheduled_mails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_scheduled_mails() TO service_role;

-- ---- DDL/function/enqueue_notification_mail.sql ----
---------------------------------------------
-- enqueue_notification_mail: アプリ内通知（com_t_notification）の登録をきっかけに、通知メールを送信待ちに積む (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 予約・キャンセル・マッチング・チャット等の出来事は、すべてアプリ内通知として com_t_notification に登録される
-- （ライブセッション関連は fn_notify、チャットは notify_chat_new_message、宿題・月次レポートは各RPC）。
-- 本トリガーで通知の登録と同じトランザクションの中で送信待ち（com_t_mail_outbox）に積むため、
-- 各RPCを変更せずに、業務データと通知メールの整合が取れる（処理が失敗すればメールも積まれない）。
-- 積んだメールは、処理の確定後に送信処理を呼んで（on_mail_outbox_inserted）すぐに送る。
--
-- 【対象】（値の正本は packages/lib/mail/dispatch/registry.ts の NOTIFICATION_MAIL_TYPES。変更する場合は両方を直す。
--   一致は単体テスト testing/unit/mail-dispatch-policy.test.ts で確かめる）
-- 宛先が生徒（user_type='1'）・コーチ（'2'）の通知のうち、下記の種別。管理者宛ては送らない。
-- 達成の通知（TRAINING_*）と、管理者の操作による通知（*_BY_ADMIN。fn_notify で登録しなくなった）は送らない。
--   mail_type='NOTIFICATION' … 通知の登録時に1通（dedup_key = notification_id）
--   mail_type='CHAT_UNREAD'  … チャットの新着。未読になった時点から10分後に送る（送る直前に既読なら送らない）。
--                              未読のまま続いた発言（同じ通知行の更新）は、同じ1通にまとめる。
--                              既読になった後の新着は新しい1通（dedup_key = notification_id:未読になった時刻）。
---------------------------------------------
CREATE OR REPLACE FUNCTION private.enqueue_notification_mail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type text;
BEGIN
    IF NEW.is_read THEN
        RETURN NULL;
    END IF;
    IF NOT (NEW.notification_type = ANY (ARRAY[
        -- 生徒宛て
        'SESSION_CANCELLED_BY_COACH',
        'SESSION_RESCHEDULE_PROPOSED',
        'SESSION_BOOKING_APPROVED',
        'SESSION_BOOKING_REJECTED',
        'MATCHING_APPROVED',
        'MATCHING_REJECTED',
        'MATCHING_EXPIRED',
        'HOMEWORK_POSTED',
        -- コーチ宛て
        'SESSION_CANCELLED_BY_STUDENT',
        'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT',
        'SESSION_BOOKED_BY_STUDENT',
        'SESSION_BOOKING_REQUESTED',
        'MATCHING_ASSIGNED_TO_COACH',
        'MATCHING_REQUESTED',
        'COACH_REPORT_APPROVED',
        'COACH_REPORT_APPROVAL_REVOKED',
        -- 両方
        'CHAT_NEW_MESSAGE'
    ])) THEN
        RETURN NULL;
    END IF;

    SELECT user_type INTO v_user_type FROM public.com_m_user WHERE id = NEW.user_id AND status = 1;
    IF v_user_type IS NULL OR v_user_type NOT IN ('1', '2') THEN
        RETURN NULL;
    END IF;

    IF NEW.notification_type = 'CHAT_NEW_MESSAGE' THEN
        -- 未読になった時（新規・既読からの再未読）だけ積む。未読のまま続く発言は、既に積んだ1通にまとめる
        IF TG_OP = 'UPDATE' AND NOT OLD.is_read THEN
            RETURN NULL;
        END IF;
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload, scheduled_at)
        VALUES (
            NEW.user_id,
            'CHAT_UNREAD',
            'NOTIFICATION',
            NEW.notification_id::text || ':' || floor(extract(epoch FROM NEW.occurred_at))::bigint::text,
            jsonb_build_object('notification_id', NEW.notification_id),
            NOW() + INTERVAL '10 minutes'
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
        VALUES (
            NEW.user_id,
            'NOTIFICATION',
            'NOTIFICATION',
            NEW.notification_id::text,
            jsonb_build_object('notification_id', NEW.notification_id)
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.enqueue_notification_mail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notification_enqueue_mail ON public.com_t_notification;
CREATE TRIGGER trg_notification_enqueue_mail
AFTER INSERT OR UPDATE ON public.com_t_notification
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_mail();

-- ---- DDL/function/fn_coach_matching_missing_items.sql ----
---------------------------------------------
-- コーチがマッチング対象になるために足りない項目 (2026-10-11 追加)
-- 前提: table/com_m_coach_profile.sql, table/com_m_user.sql（icon_path）, table/com_m_coach_availability.sql
---------------------------------------------
-- 【背景】
-- 生徒の「専属コーチを探す」には、プロフィールを設定し終えたコーチだけを出す。必須の項目は次のとおり
-- （紹介ビデオは任意。資格の無いコーチには「None」と入力してもらう）。
--   icon            ... プロフィールアイコン（com_m_user.icon_path）
--   country         ... 国籍
--   teaching_years  ... 英語指導年数
--   education       ... 学歴
--   qualifications  ... 保有資格
--   job_experience  ... 職務経験
--   introduction    ... 自己紹介
--   availability    ... 空き時間（1件以上。無いと申請できる枠が無い）
-- 文字の項目は空白だけの入力を未入力とみなす。
--
-- 返り値: 足りない項目のコード（上の順。そろっていれば空配列。コーチのプロフィールが無ければ NULL）。
-- 項目のコードと順は、アプリ側の COACH_MATCHING_REQUIRED_ITEMS（packages/types/coachProfile.ts）と
-- 判定 getCoachMatchingMissingItems（packages/lib/coachProfile/matchingReadiness.ts）と揃える。
--
-- 内部処理専用（get_matchable_coach_ids() / get_coach_matching_status() から呼ぶ）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coach_matching_missing_items(p_coach_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT array_remove(ARRAY[
        CASE WHEN NULLIF(btrim(u.icon_path), '') IS NULL THEN 'icon' END,
        CASE WHEN p.country_code IS NULL THEN 'country' END,
        CASE WHEN p.teaching_years IS NULL THEN 'teaching_years' END,
        CASE WHEN NULLIF(btrim(p.education, E' \t\r\n　'), '') IS NULL THEN 'education' END,
        CASE WHEN NULLIF(btrim(p.qualifications, E' \t\r\n　'), '') IS NULL THEN 'qualifications' END,
        CASE WHEN NULLIF(btrim(p.job_experience, E' \t\r\n　'), '') IS NULL THEN 'job_experience' END,
        CASE WHEN NULLIF(btrim(p.introduction, E' \t\r\n　'), '') IS NULL THEN 'introduction' END,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM public.com_m_coach_availability a
            WHERE a.coach_id = p.user_id
        ) THEN 'availability' END
    ], NULL)
    FROM public.com_m_coach_profile p
    JOIN public.com_m_user u ON u.id = p.user_id
    WHERE p.user_id = p_coach_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_coach_matching_missing_items(uuid) FROM PUBLIC, anon, authenticated;

-- ---- DDL/function/fn_resolve_web_trial_contract.sql ----
---------------------------------------------
-- fn_resolve_web_trial_contract: Webトライアルの本登録に使う契約を探す（無ければ作る）
---------------------------------------------
-- Webトライアルの申込者が本登録（パスワード設定）した時点で acceptInvitationCore（service_role）から呼び、
-- 本登録の月（集計期間のタイムゾーン＝日本時間）の契約の ID を返す。申込の時点では契約を決めない
-- （月末の申込が翌月に本登録しても、本登録の月の契約に入る）。
-- - 顧客は固定の「Webトライアル」（web_trial_client_id()）、プランは plan_code = 'WEB_TRIAL'。
-- - 契約の期間は、その月の1日 0:00 〜 翌月14日 23:59:59.999（日本時間）。ライセンスは本登録の日から
--   14日間のため、月末に本登録した人の期間も契約の期間に収まる。
-- - ライセンス数（max_licenses）は 100。超えても本登録は止めない（issueInitialLicense は上限を確かめない）。
-- - 同時に本登録した人が別々に契約を作らないよう、トランザクション単位のロックで1件にまとめる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_web_trial_contract(p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz text := public.reporting_timezone();
    v_client_id uuid := public.web_trial_client_id();
    v_month date := date_trunc('month', p_at AT TIME ZONE v_tz)::date;
    v_start timestamptz := v_month::timestamp AT TIME ZONE v_tz;
    v_end timestamptz := ((v_month + interval '1 month' + interval '14 days')::timestamp AT TIME ZONE v_tz) - interval '1 millisecond';
    v_plan public.com_m_contract_plan%ROWTYPE;
    v_contract_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_resolve_web_trial_contract'));

    SELECT contract_id INTO v_contract_id
    FROM public.com_m_contract
    WHERE client_id = v_client_id
      AND start_date = v_start
      AND status = 1
    ORDER BY insert_date
    LIMIT 1;

    IF v_contract_id IS NOT NULL THEN
        RETURN v_contract_id;
    END IF;

    SELECT * INTO v_plan FROM public.com_m_contract_plan WHERE plan_code = 'WEB_TRIAL';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract plan WEB_TRIAL not found.';
    END IF;

    INSERT INTO public.com_m_contract (
        client_id, plan_id, plan_name, plan_name_en, contract_name, contract_type,
        weekly_frequency, total_sessions, has_dialogue_practice, max_licenses, start_date, end_date, status, note
    ) VALUES (
        v_client_id, v_plan.plan_id, v_plan.plan_name, v_plan.plan_name_en,
        'Webトライアル ' || to_char(v_month, 'YYYY年MM月'), v_plan.contract_type,
        v_plan.weekly_frequency, v_plan.total_sessions, v_plan.has_dialogue_practice, 100, v_start, v_end, 1,
        'Webトライアルの本登録時に自動で作成'
    )
    RETURNING contract_id INTO v_contract_id;

    RETURN v_contract_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) TO service_role;

-- ---- DDL/function/fn_submit_trial_application.sql ----
---------------------------------------------
-- fn_submit_trial_application: Webトライアルの申込を受け付ける
---------------------------------------------
-- 申込フォーム（apps/student /trial）のサーバーアクションから service_role で呼ぶ。メールの送信はアプリ側
-- （packages/lib/trial/apply.ts）が戻り値の kind に合わせて行う。
--
-- 【申込の種類（kind）】（同じメールアドレスの申込はロックで1件ずつ処理する）
--   new        … 招待を作る（トライアル以外で本登録済みの古い招待が残っていれば、トライアルの招待に作り直す）
--   reapply    … 本登録前の再申込。この申込の招待のトークン・有効期限を出し直す（期限切れでも出し直す）
--   registered … 登録済みのアドレス（auth.users に有る）。招待は作らず、申込にそのユーザーを記録する
--                （アプリが本人にログインの案内を送る）
--   invited    … トライアル以外の招待（管理者が作った招待）が本登録前。招待には触れない（窓口が個別に対応する）
-- いずれの場合も申込（com_t_trial_application）は最新の入力で記録し（メールアドレスごとに1行、apply_count を増やす）、
-- 管理者全員へアプリ内の通知（TRIAL_APPLIED）を登録する（管理者宛ての通知はメールを送らない）。
--
-- 【連続の送信】
-- 同じアドレスの前回の申込から p_min_interval 以内なら何もせず throttled = true を返す（二重送信・連打で
-- 招待メール・通知が重ならないように。画面には通常の受付完了を表示する）。
--
-- 【氏名】
-- 姓・名とそれぞれのローマ字を受け取る。招待（→ com_m_user.user_name。コーチも見る画面の名前）には
-- ローマ字の「名 姓」（例: Taro Yamada）を入れ、正式な氏名（com_m_user_legal）は本登録時にアプリが申込から作る。
--
-- 招待の所属は固定の顧客「Webトライアル」（web_trial_client_id()）。契約・ライセンスは本登録の時点で決める
-- （fn_resolve_web_trial_contract）。p_email は小文字にそろえて渡す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);

CREATE OR REPLACE FUNCTION public.fn_submit_trial_application(
    p_email text,
    p_last_name text,
    p_first_name text,
    p_last_name_latin text,
    p_first_name_latin text,
    p_timezone text,
    p_country_city text,
    p_occupation smallint,
    p_occupation_other text,
    p_referral_source smallint,
    p_referral_source_other text,
    p_message text,
    p_token text,
    p_expires_at timestamptz,
    p_min_interval interval DEFAULT interval '2 minutes'
)
RETURNS TABLE (
    kind text,
    application_id uuid,
    apply_count integer,
    invitation_token text,
    throttled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_email text := lower(trim(p_email));
    v_user_name text := btrim(p_first_name_latin) || ' ' || btrim(p_last_name_latin);
    v_app public.com_t_trial_application%ROWTYPE;
    v_inv public.com_t_invitation%ROWTYPE;
    v_kind text;
    v_invitation_id uuid;
    v_token text;
    v_application_id uuid;
    v_apply_count integer;
    v_user_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_submit_trial_application:' || v_email));

    SELECT * INTO v_app FROM public.com_t_trial_application a WHERE a.email = v_email;
    IF FOUND AND v_app.last_applied_at > now() - p_min_interval THEN
        RETURN QUERY SELECT NULL::text, v_app.application_id, v_app.apply_count, NULL::text, true;
        RETURN;
    END IF;

    SELECT au.id INTO v_user_id FROM auth.users au WHERE lower(au.email) = v_email;
    IF v_user_id IS NOT NULL THEN
        v_kind := 'registered';
        v_invitation_id := v_app.invitation_id;
    ELSE
        SELECT * INTO v_inv FROM public.com_t_invitation i WHERE lower(i.email) = v_email;
        IF NOT FOUND THEN
            INSERT INTO public.com_t_invitation (email, user_name, user_type, client_id, contract_id, roles, token, expires_at)
            VALUES (v_email, v_user_name, '1', public.web_trial_client_id(), NULL, '{}', p_token, p_expires_at)
            RETURNING id INTO v_invitation_id;
            v_kind := 'new';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL AND v_inv.id IS NOT DISTINCT FROM v_app.invitation_id THEN
            UPDATE public.com_t_invitation
            SET user_name = v_user_name, token = p_token, expires_at = p_expires_at,
                mail_sent_at = NULL, last_mail_error = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'reapply';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL THEN
            v_kind := 'invited';
            v_invitation_id := v_app.invitation_id;
        ELSE
            -- 本登録済みの招待が残っているが、ユーザーは削除済み。トライアルの招待として作り直す
            UPDATE public.com_t_invitation
            SET user_name = v_user_name, user_type = '1', client_id = public.web_trial_client_id(), contract_id = NULL,
                roles = '{}', token = p_token, expires_at = p_expires_at, accepted_at = NULL,
                mail_sent_at = NULL, last_mail_error = NULL, invited_by = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'new';
            v_token := p_token;
        END IF;
    END IF;

    INSERT INTO public.com_t_trial_application AS a (
        email, last_name, first_name, last_name_latin, first_name_latin, timezone, country_city,
        occupation, occupation_other, referral_source, referral_source_other, message, invitation_id, user_id
    ) VALUES (
        v_email, p_last_name, p_first_name, p_last_name_latin, p_first_name_latin, p_timezone, NULLIF(p_country_city, ''),
        p_occupation, NULLIF(p_occupation_other, ''), p_referral_source, NULLIF(p_referral_source_other, ''),
        NULLIF(p_message, ''), v_invitation_id, v_user_id
    )
    ON CONFLICT (email) DO UPDATE SET
        last_name = EXCLUDED.last_name,
        first_name = EXCLUDED.first_name,
        last_name_latin = EXCLUDED.last_name_latin,
        first_name_latin = EXCLUDED.first_name_latin,
        timezone = EXCLUDED.timezone,
        country_city = EXCLUDED.country_city,
        occupation = EXCLUDED.occupation,
        occupation_other = EXCLUDED.occupation_other,
        referral_source = EXCLUDED.referral_source,
        referral_source_other = EXCLUDED.referral_source_other,
        message = EXCLUDED.message,
        invitation_id = EXCLUDED.invitation_id,
        accepted_at = CASE WHEN v_kind = 'new' THEN NULL ELSE a.accepted_at END,
        user_id = CASE WHEN v_kind = 'new' THEN NULL ELSE COALESCE(a.user_id, EXCLUDED.user_id) END,
        apply_count = a.apply_count + 1,
        last_applied_at = now(),
        update_date = now()
    RETURNING a.application_id, a.apply_count INTO v_application_id, v_apply_count;

    INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
    SELECT u.id, 'TRIAL_APPLIED', v_application_id::text || ':' || v_apply_count::text,
           jsonb_build_object('application_id', v_application_id, 'applicant_name', p_last_name || ' ' || p_first_name,
                              'applicant_name_en', v_user_name, 'kind', v_kind, 'apply_count', v_apply_count),
           '/trial-applications'
    FROM public.com_m_user u
    WHERE u.user_type = '0' AND u.status = 1
    ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;

    RETURN QUERY SELECT v_kind, v_application_id, v_apply_count, v_token, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, smallint, text, text, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, text, smallint, text, smallint, text, text, text, timestamptz, interval) TO service_role;

-- ---- DDL/function/get_matchable_coach_ids.sql ----
---------------------------------------------
-- マッチング対象コーチID取得関数
---------------------------------------------
-- 生徒向けの「専属コーチを探す」(apps/student /coach-matching) で、指定した生徒のチケット（契約）で
-- 申請できるコーチのIDを返す。マッチングはチケットごとのため、対象もチケットで決まる。
-- 呼び出した生徒（auth.uid()）のチケットでなければ何も返さない。
--
-- 【対象コーチの定義】有効なコーチ（com_m_user.status = 1）のコーチプロフィールのうち、次をすべて満たすコーチ
--   - コーチ本人が新規の生徒を受け付けている（com_m_coach_profile.accepting_students）
--   - アドミンが休止にしていない（com_m_coach_matching_suspension に行が無い）
--   - プロフィールの必須項目と空き時間がそろっている（fn_coach_matching_missing_items() が空）
--     （担当中・継続の生徒にも例外は設けない。内訳は get_coach_matching_status() でコーチ本人・アドミンが確認できる）
--   - デモユーザー（com_t_user_role.role_id = 'demo_user'）のコーチは、呼び出した生徒もデモユーザーの場合だけ含める
--     （本番のリリース検証・顧客向けプレゼン用のデモコーチが、通常の生徒から申請を受けないようにする）
--   - チケットの契約のプランが Webトライアル（com_m_contract_plan.plan_code = 'WEB_TRIAL'）の場合は、
--     Webトライアル担当（role_id = 'web_trial_coach'）のコーチだけ。担当のコーチは通常の生徒の一覧にも出る
--     （ロールは「トライアルの生徒にも出す」ための追加の扱い）。プランはチケットのライセンスの契約（com_m_contract.plan_id）で判定する
--
-- com_t_user_role はRLSで本人・adminしか閲覧できず、生徒からはコーチのロールを判定できないため
-- SECURITY DEFINER とする。戻り値はコーチIDのみで、ロール情報そのものは返さない。
--
-- 【呼び出し元】packages/lib/matching/actions/matchingActions.ts
--   - getCoachBrowseListCore ... コーチ一覧の絞り込み
--   - createMatchingRequestCore ... 申請先コーチの妥当性チェック（一覧外のコーチIDを直接送る申請を拒否）
-- admin の直接マッチング（admin_match_student_with_coach）は運営の手動操作のため対象外。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_matchable_coach_ids();

CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids(p_ticket_id uuid)
RETURNS TABLE (coach_id uuid) AS $$
  WITH caller_ticket AS (
    SELECT
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      ) AS is_demo,
      pl.plan_code = 'WEB_TRIAL' AS is_web_trial
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    JOIN public.com_m_contract_plan pl ON pl.plan_id = c.plan_id
    WHERE t.ticket_id = p_ticket_id
      AND t.user_id = auth.uid()
  )
  SELECT p.user_id
  FROM caller_ticket ct
  CROSS JOIN public.com_m_coach_profile p
  JOIN public.com_m_user cu ON cu.id = p.user_id
  WHERE cu.status = 1
    AND p.accepting_students
    AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
    AND cardinality(public.fn_coach_matching_missing_items(p.user_id)) = 0
    -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
    AND (
      ct.is_demo
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    )
    -- Webトライアルのチケットは、Webトライアル担当のコーチだけ
    AND (
      NOT ct.is_web_trial
      OR EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'web_trial_coach'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) TO authenticated;

-- ---- DDL/function/get_sprint_available_levels.sql ----
---------------------------------------------
-- スプリント教材の「問題が存在する種別×レベル」の一覧取得 (2026-10-02 追加)
---------------------------------------------
-- 【背景】
-- コーパススプリントは特定のレベルにしか問題が無いことがあるため、生徒の自主トレの選択画面と
-- コーチのLive Sprintの設定画面で、問題の無い種別・レベルを選べないようにする。
-- 教材の全問題（汎用スプリントは約2万問）をアプリへ送らず、組み合わせ（最大で約30組/教材）だけを返す。
--
-- 【権限】
-- SECURITY INVOKER（呼び出したユーザーの権限で実行）。com_m_sprint_questions のRLS（認証済みユーザーは
-- 有効な問題を参照可）がそのまま適用される。
--
-- 【性能】
-- idx_sprint_questions_content_level（table/com_m_sprint_questions.sql）のインデックスのみで集計できる。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_sprint_available_levels(uuid[]);

CREATE OR REPLACE FUNCTION public.get_sprint_available_levels(p_content_ids uuid[])
RETURNS TABLE (
    content_id uuid,
    question_type text,
    difficulty_level smallint
) AS $$
    SELECT DISTINCT q.content_id, q.question_type, q.difficulty_level
    FROM public.com_m_sprint_questions q
    WHERE q.content_id = ANY(p_content_ids)
    ORDER BY q.content_id, q.question_type, q.difficulty_level;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) TO authenticated, service_role;

-- ---- DDL/function/get_student_available_content_ids.sql ----
---------------------------------------------
-- 指定生徒が利用可能なコンテンツID一覧の取得 (2026-09-24 追加)
--
-- 【背景】
-- コーチが生徒に教材を割り当てる／レッスンで使用する画面（Dialogue Practiceの割当、
-- Lesson Sprintの教材選択）は、可視範囲をcom_m_contentsのRLSに委ねていた。
-- しかしRLSはis_coach_content_accessible()により「コーチが一度でも担当した全生徒の
-- テナント」の限定公開(content_scope=1)教材を可視とするため、生徒Aの画面に生徒Bの
-- テナント（やコーチ自身のテナント）専用の教材まで表示・割当できてしまっていた。
--
-- 【用途】
-- 「対象生徒本人が生徒アプリで閲覧できる教材」と同じ範囲を、担当コーチの権限で返す。
--   - content_scope=0（共通）
--   - content_scope=1（クライアント限定）のうち、生徒のclient_idにcom_m_contents_accessがあるもの
--   - 非公開（status=0）は常に除外
-- コーチはcom_m_userのRLSで生徒のclient_idを、com_m_contents_accessのRLSで他テナントの
-- アクセス権を参照できないため、SECURITY DEFINERで判定する。
-- 呼び出し元(auth.uid())が対象生徒の担当コーチ（com_m_coach_student_relationshipに行がある。
-- hasCoachStudentRelationshipと同じ意味論）でない場合は空集合を返す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_student_available_content_ids(uuid, smallint);

CREATE OR REPLACE FUNCTION public.get_student_available_content_ids(
    p_student_id uuid,
    p_content_type smallint
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.content_id
  FROM public.com_m_contents c
  JOIN public.com_m_user u ON u.id = p_student_id
  WHERE c.content_type = p_content_type
    AND c.status = 1
    AND EXISTS (
      SELECT 1 FROM public.com_m_coach_student_relationship r
      WHERE r.coach_id = auth.uid()
        AND r.student_id = p_student_id
    )
    AND (
      c.content_scope = 0
      OR EXISTS (
        SELECT 1 FROM public.com_m_contents_access a
        WHERE a.content_id = c.content_id
          AND a.client_id = u.client_id
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_available_content_ids(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_available_content_ids(uuid, smallint) TO authenticated;

-- ---- DDL/function/get_user_lock_status_by_email.sql ----
---------------------------------------------
-- ユーザーロック状態取得
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_lock_status_by_email(p_email TEXT)
RETURNS TABLE (
    id UUID,
    user_type TEXT,
    login_failed_count INT,
    locked_until TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER -- Next.js(サーバー)から auth.users を安全にJOINして検索できます
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.user_type,
        u.login_failed_count,
        u.locked_until
    FROM public.com_m_user u
    JOIN auth.users a ON u.id = a.id
    WHERE a.email = p_email 
      AND u.status = 1
    LIMIT 1;
END;
$$;

-- 1. 安全のため、一度すべてのデフォルト権限をリセット（剥奪）する
REVOKE EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) FROM PUBLIC, anon, authenticated;

-- 一般ロール(anon, authenticated)への再付与をやめ、管理用サービスロール(service_role)のみに限定
-- これにより、外部API(/rest/v1/rpc)経由での一般ブラウザからの不正な直接実行を100%遮断し、警告を解消します。
GRANT EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) TO service_role;

-- ---- DDL/function/increment_sprint_summary.sql ----
---------------------------------------------
-- スプリントドリル日次サマリーカウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_sprint_summary(
  p_content_id UUID,
  p_question_count INT,
  p_assessment_count INT,
  p_question_type TEXT  -- 追加された問題種別 ('0', '4', '5', '6')
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid(); -- JWTから直接ユーザーIDを取得（セキュリティ向上）
  v_user_timezone TEXT;
  v_local_today DATE;
  
  -- 各問題種別の増分値を管理する変数
  v_speed_inc INT := 0;
  v_structure_inc INT := 0;
  v_builders_inc INT := 0;
  v_mastery_inc INT := 0;
BEGIN
  -- 認証されていない場合は何もせず終了（安全策）
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. ユーザーマスタからタイムゾーンを取得（デフォルトは 'Asia/Tokyo'）
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = v_user_id;

  -- 2. ユーザーのタイムゾーン基準で現在日付を切り出す
  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  -- 3. 問題種別（question_type）に応じてインクリメント対象を振り分け
  IF p_question_type = '0' THEN
    v_speed_inc := p_question_count;
  ELSIF p_question_type = '4' THEN
    v_structure_inc := p_question_count;
  ELSIF p_question_type = '5' THEN
    v_builders_inc := p_question_count;
  ELSIF p_question_type = '6' THEN
    v_mastery_inc := p_question_count;
  -- 想定外の種別が渡された場合は、トータルのカウントのみ行うよう安全側に倒す
  END IF;

  -- 4. スプリントサマリーテーブルへUpsert
  INSERT INTO public.self_t_sprint_summary (
    user_id, 
    content_id, 
    training_date, 
    question_count, 
    assessment_count,
    speed_count,
    structure_count,
    builders_count,
    mastery_count
  )
  VALUES (
    v_user_id, 
    p_content_id, 
    v_local_today, 
    p_question_count, 
    p_assessment_count,
    v_speed_inc,
    v_structure_inc,
    v_builders_inc,
    v_mastery_inc
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET
    question_count = self_t_sprint_summary.question_count + p_question_count,
    assessment_count = self_t_sprint_summary.assessment_count + p_assessment_count,
    speed_count = self_t_sprint_summary.speed_count + v_speed_inc,
    structure_count = self_t_sprint_summary.structure_count + v_structure_inc,
    builders_count = self_t_sprint_summary.builders_count + v_builders_inc,
    mastery_count = self_t_sprint_summary.mastery_count + v_mastery_inc,
    update_date = NOW();

  -- 5. 学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・通算発話評価回数）を更新
  -- 💡 ドリルモードのため通算スプリント本数・回答数（total_sprint_sessions/total_sprint_answers）は
  --    加算しない。これらはセッションモード（self_t_sprint への INSERT）専用のカウンタ。
  PERFORM public.update_training_lifetime_stats(
    v_user_id,
    v_local_today,
    p_assessment_delta => p_assessment_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC / anon）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) TO authenticated;

-- ---- DDL/function/increment_word_summary.sql ----
---------------------------------------------
-- 単語ドリル日次サマリーカウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_word_summary(
  p_content_id UUID,
  p_word_count INT,
  p_phrase_count INT,
  p_assessment_count INT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid(); -- JWTから直接ユーザーIDを取得（セキュリティ向上）
  v_user_timezone TEXT;
  v_local_today DATE;
BEGIN
  -- 認証されていない場合は何もせず終了（安全策）
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. ユーザーマスタからタイムゾーンを取得（デフォルトは 'Asia/Tokyo'）
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = v_user_id;

  -- 2. ユーザーのタイムゾーン基準で現在日付を切り出す
  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  -- 3. サマリーテーブルへUpsert
  INSERT INTO public.self_t_word_summary (
    user_id, content_id, training_date, word_count, phrase_count, assessment_count
  )
  VALUES (
    v_user_id, 
    p_content_id, 
    v_local_today, 
    p_word_count, 
    p_phrase_count,
    p_assessment_count
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET
    word_count = self_t_word_summary.word_count + p_word_count,
    phrase_count = self_t_word_summary.phrase_count + p_phrase_count,
    assessment_count = self_t_word_summary.assessment_count + p_assessment_count,
    update_date = NOW();

  -- 4. 学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・通算単語数等）を更新
  PERFORM public.update_training_lifetime_stats(
    v_user_id,
    v_local_today,
    p_word_delta => p_word_count,
    p_phrase_delta => p_phrase_count,
    p_assessment_delta => p_assessment_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC = 誰でも実行可能）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) TO authenticated;

-- ---- DDL/function/is_coach_content_accessible.sql ----
---------------------------------------------
-- コーチの担当生徒経由コンテンツアクセス判定ヘルパー関数 (2026-09-03 追加)
-- com_m_contentsのRLSポリシーから、コンテンツへのアクセス権を持つ生徒の
-- client_id(com_m_user.client_id)を判定しようとすると、com_m_user側の既存ポリシー
-- ("Users can view themselves and colleagues")がコーチ自身のclient_idしか許可しないため、
-- 生徒の行がRLSで不可視となり判定できない。
-- is_coach_of_contract_licenseと同様、SECURITY DEFINERで回避する。
--
-- 【用途】content_scope=1（クライアント限定）のコンテンツについて、コーチ自身のclient_id
-- では com_m_contents_access にマッチしない場合でも、コーチが担当する生徒（複数テナントを
-- 横断しうる）の client_id にアクセス権があれば閲覧を許可する。
-- 例: コーパススプリント教材（Lesson Sprintのコーチ向け教材選択画面）。
--
-- 2026-09-03: 担当関係の判定元をcom_m_lesson_schedule（スケジューリング用データ）から
-- 判定専用の派生マスタcom_m_coach_student_relationshipに変更（意味論・挙動は変更なし。
-- 引き続きstatusを問わず、一度でも担当したことがあれば判定対象とする。
-- 詳細はtable/com_m_coach_student_relationship.sqlを参照）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.is_coach_content_accessible(p_content_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    JOIN public.com_m_contents_access a
      ON a.client_id = u.client_id
     AND a.content_id = p_content_id
    WHERE r.coach_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) TO authenticated;

-- ---- DDL/function/match_ai_knowledge_base.sql ----
---------------------------------------------
-- ナレッジベース類似検索関数（RAG）
-- 依存: supabase/DDL/table/com_m_ai_knowledge_base.sql（vector拡張・テーブル定義）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_base(
    _query_embedding vector(768),
    _source_type TEXT DEFAULT NULL,
    _match_count INT DEFAULT 5,
    _match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    knowledge_id uuid,
    source_type text,
    title text,
    body text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        k.knowledge_id,
        k.source_type,
        k.title,
        k.body,
        k.metadata,
        1 - (k.embedding <=> _query_embedding) AS similarity
    FROM public.com_m_ai_knowledge_base k
    WHERE k.embedding IS NOT NULL
      AND (_source_type IS NULL OR k.source_type = _source_type)
      AND 1 - (k.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY k.embedding <=> _query_embedding ASC
    LIMIT _match_count;
$$;

-- 実運用ではService Roleクライアント（packages/lib/ai/retrieval）からの呼び出しを想定。
-- 将来クライアント（authenticated）から直接呼ぶケースに備え、明示的に権限を絞る。
ALTER FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) TO authenticated;

-- ---- DDL/function/sync_sprint_session_lifetime_stats.sql ----
---------------------------------------------
-- 自主トレスプリント（セッションモード）完了時の学習実績サマリー同期
---------------------------------------------
-- self_t_sprint は createSprintScoreAction() から直接 INSERT される
-- （increment_word_summary/increment_sprint_summary のような RPC 経由ではない）ため、
-- INSERT トリガーで student_m_training_lifetime_stats を同期する。
-- これにより「タイムドスプリントのみを実施したユーザー」でも通算学習日数・連続学習日数・
-- 通算スプリント本数/回答数/発話評価回数が正しく反映される。
CREATE OR REPLACE FUNCTION public.sync_sprint_session_lifetime_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_user_timezone TEXT;
  v_local_date DATE;
BEGIN
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = NEW.user_id;

  v_local_date := (NEW.insert_date AT TIME ZONE v_user_timezone)::date;

  PERFORM public.update_training_lifetime_stats(
    NEW.user_id,
    v_local_date,
    p_assessment_delta => NEW.total_assessments,
    p_sprint_session_delta => 1,
    p_sprint_answer_delta => NEW.total_answered
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_sprint_session_insert ON public.self_t_sprint;
CREATE TRIGGER on_sprint_session_insert
AFTER INSERT ON public.self_t_sprint
FOR EACH ROW EXECUTE PROCEDURE public.sync_sprint_session_lifetime_stats();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_sprint_session_lifetime_stats() FROM PUBLIC, anon, authenticated;

-- 3. ポリシーの条件 --------------------------------------------------------
ALTER POLICY "Users can view published calendar events" ON public.com_m_calendar_event USING (
  is_published = true AND (
    ((target_type)::text = 'ALL'::text AND get_jwt_user_type() = '1'::text)
    OR ((target_type)::text = 'CLIENT'::text AND get_jwt_user_type() = '1'::text AND client_id = get_jwt_client_id())
    OR ((target_type)::text = 'COACH'::text AND get_jwt_user_type() = '2'::text)
    OR (get_jwt_user_type() = '2'::text AND EXISTS (
      SELECT 1 FROM public.com_t_calendar_event_coach c
      WHERE c.calendar_event_id = com_m_calendar_event.calendar_event_id AND c.coach_id = auth.uid()))
  )
);
ALTER POLICY "Users can view series of visible events" ON public.com_m_calendar_event_series USING (
  EXISTS (SELECT 1 FROM public.com_m_calendar_event e WHERE e.series_id = com_m_calendar_event_series.series_id)
);
ALTER POLICY "Anyone can view active coach availability" ON public.com_m_coach_availability USING (true);
ALTER POLICY "Anyone can view active coach profiles" ON public.com_m_coach_profile USING (true);
ALTER POLICY "Anyone can view coach specialties" ON public.com_m_coach_specialty USING (true);
ALTER POLICY "Users can view active color vowels" ON public.com_m_color_vowel USING (true);
ALTER POLICY "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary USING (status = 'live'::text);
ALTER POLICY "Users can view common or assigned corpora" ON public.com_m_contents USING (
  status = 1 AND (
    content_scope = 0
    OR EXISTS (SELECT 1 FROM public.com_m_contents_access a
               WHERE a.content_id = com_m_contents.content_id AND a.client_id = get_jwt_client_id())
    OR is_coach_content_accessible(content_id)
  )
);
ALTER POLICY "Anyone can view tags" ON public.com_m_contents_tag USING (true);
ALTER POLICY "Anyone can view countries" ON public.com_m_country USING (true);
ALTER POLICY "Allow select access for authenticated users" ON public.com_m_dialogue_session USING (true);
ALTER POLICY "Users can view published notices for all or their client" ON public.com_m_notice USING (
  is_published = true AND published_at <= now() AND (expired_at IS NULL OR expired_at > now()) AND (
    ((target_type)::text = 'ALL'::text AND get_jwt_user_type() = '1'::text)
    OR ((target_type)::text = 'CLIENT'::text AND get_jwt_user_type() = '1'::text AND client_id = get_jwt_client_id())
    OR ((target_type)::text = 'COACH'::text AND get_jwt_user_type() = '2'::text)
  )
);
ALTER POLICY "Anyone can view roles" ON public.com_m_role USING (true);
ALTER POLICY "Allow select access for authenticated users" ON public.com_m_sprint_questions USING (true);
ALTER POLICY "Anyone can view timezones" ON public.com_m_timezone USING (true);
ALTER POLICY "Anyone can view active coach directory" ON public.com_m_user USING (user_type = '2'::text);

-- 3. インデックス（delete_flg を条件・列に含むものを作り直す）---------------
DROP INDEX IF EXISTS public.idx_sprint_questions_general_lookup;
DROP INDEX IF EXISTS public.idx_sprint_questions_corpus_lookup;
DROP INDEX IF EXISTS public.idx_sprint_questions_content_level;
DROP INDEX IF EXISTS public.idx_com_m_cv_dictionary_lookup;
DROP INDEX IF EXISTS public.idx_com_m_color_vowel_lookup;
DROP INDEX IF EXISTS public.idx_notice_fetch;
DROP INDEX IF EXISTS public.idx_dialogue_assignment_unique_active;
DROP INDEX IF EXISTS public.idx_dialogue_assignment_student;
DROP INDEX IF EXISTS public.idx_dialogue_session_content;
DROP INDEX IF EXISTS public.idx_com_m_ai_knowledge_base_source_type;
DROP INDEX IF EXISTS public.idx_coach_availability_coach;
DROP INDEX IF EXISTS public.idx_calendar_event_fetch;

-- 4. delete_flg 列の削除 ----------------------------------------------------
ALTER TABLE public.com_m_ai_knowledge_base DROP COLUMN delete_flg;
ALTER TABLE public.com_m_calendar_event DROP COLUMN delete_flg;
ALTER TABLE public.com_m_calendar_event_series DROP COLUMN delete_flg;
ALTER TABLE public.com_m_client DROP COLUMN delete_flg;
ALTER TABLE public.com_m_coach_availability DROP COLUMN delete_flg;
ALTER TABLE public.com_m_coach_profile DROP COLUMN delete_flg;
ALTER TABLE public.com_m_coach_specialty DROP COLUMN delete_flg;
ALTER TABLE public.com_m_color_vowel DROP COLUMN delete_flg;
ALTER TABLE public.com_m_color_vowel_dictionary DROP COLUMN delete_flg;
ALTER TABLE public.com_m_contents DROP COLUMN delete_flg;
ALTER TABLE public.com_m_contents_access DROP COLUMN delete_flg;
ALTER TABLE public.com_m_contents_tag DROP COLUMN delete_flg;
ALTER TABLE public.com_m_contract_plan DROP COLUMN delete_flg;
ALTER TABLE public.com_m_country DROP COLUMN delete_flg;
ALTER TABLE public.com_m_dialogue_session DROP COLUMN delete_flg;
ALTER TABLE public.com_m_notice DROP COLUMN delete_flg;
ALTER TABLE public.com_m_role DROP COLUMN delete_flg;
ALTER TABLE public.com_m_sprint_questions DROP COLUMN delete_flg;
ALTER TABLE public.com_m_timezone DROP COLUMN delete_flg;
ALTER TABLE public.com_m_user DROP COLUMN delete_flg;
ALTER TABLE public.com_t_dialogue_assignment DROP COLUMN delete_flg;

CREATE INDEX idx_sprint_questions_general_lookup ON public.com_m_sprint_questions (sprint_type, question_type, difficulty_level, group_id, seq_no);
CREATE INDEX idx_sprint_questions_corpus_lookup ON public.com_m_sprint_questions (content_id, seq_no) WHERE sprint_type = '1'::text;
CREATE INDEX idx_sprint_questions_content_level ON public.com_m_sprint_questions (content_id, question_type, difficulty_level);
CREATE INDEX idx_com_m_cv_dictionary_lookup ON public.com_m_color_vowel_dictionary (lower(word_en), part_of_speech, status);
CREATE INDEX idx_notice_fetch ON public.com_m_notice (is_published, published_at, expired_at);
CREATE UNIQUE INDEX idx_dialogue_assignment_unique_active ON public.com_t_dialogue_assignment (student_id, content_id) WHERE status = 1;
CREATE INDEX idx_dialogue_assignment_student ON public.com_t_dialogue_assignment (student_id) WHERE status = 1;
CREATE INDEX idx_dialogue_session_content ON public.com_m_dialogue_session (content_id, session_no);
CREATE INDEX idx_com_m_ai_knowledge_base_source_type ON public.com_m_ai_knowledge_base (source_type);
CREATE INDEX idx_coach_availability_coach ON public.com_m_coach_availability (coach_id);
CREATE INDEX idx_calendar_event_fetch ON public.com_m_calendar_event (is_published, start_datetime);

COMMIT;

-- =========================================================================
-- 【追加セクション】外部キーの ON DELETE を規約に合わせて付け替える
--
-- 【内容】（規約は docs/DATA-DELETION.md §3）
--   - 業務の記録（契約・支払い・セッション・学習の履歴・顧客への報告）を参照元とする外部キーは RESTRICT。
--     特に、ライセンス → チケット → 予定 → セッション、教材 → 全生徒の学習履歴 のように、親を1行消すと
--     業務の記録が連鎖して消えていた CASCADE を RESTRICT にする
--   - 指定なし（NO ACTION）を、RESTRICT（記録・マスタの参照）か SET NULL（操作者の記録）に明示する
--   - com_t_user_license.user_id の重複した外部キー（fk_user）を1つにする
--   - com_m_user.id → auth.users(id) を外す（退会で認証のアカウントを消したあとも、退会済みの行を残すため）
--   制約名は環境で異なることがあるため、表・列・参照先から既存の制約を探して作り直す（名前は既存のまま）。
--
-- 対応ファイル: DDL/table/（下記の各テーブル）
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_fk(p_table regclass, p_column text, p_ref regclass, p_rule text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_names text[];
  v_name text;
  v_ref_col text;
BEGIN
  SELECT array_agg(c.conname ORDER BY c.conname), min(ra.attname)
  INTO v_names, v_ref_col
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
  WHERE c.contype = 'f' AND c.conrelid = p_table AND c.confrelid = p_ref
    AND cardinality(c.conkey) = 1 AND a.attname = p_column;
  IF v_names IS NULL THEN
    RAISE EXCEPTION '外部キーが見つかりません: %.% → %', p_table, p_column, p_ref;
  END IF;
  FOREACH v_name IN ARRAY v_names LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, v_name);
  END LOOP;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s',
                 p_table, v_names[1], p_column, p_ref, v_ref_col, p_rule);
END $$;

-- 認証のアカウント
DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name FROM pg_constraint
  WHERE contype = 'f' AND conrelid = 'public.com_m_user'::regclass AND confrelid = 'auth.users'::regclass;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.com_m_user DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

-- 顧客
SELECT pg_temp.set_fk('public.com_m_contents_access', 'client_id', 'public.com_m_client', 'CASCADE');
SELECT pg_temp.set_fk('public.com_m_contract', 'client_id', 'public.com_m_client', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_user', 'client_id', 'public.com_m_client', 'RESTRICT');

-- マスタ
SELECT pg_temp.set_fk('public.com_m_coach_specialty_assignment', 'specialty_code', 'public.com_m_coach_specialty', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_color_vowel_dictionary', 'cv_id', 'public.com_m_color_vowel', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_contract', 'plan_id', 'public.com_m_contract_plan', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_coach_profile', 'country_code', 'public.com_m_country', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_lesson_schedule', 'schedule_timezone', 'public.com_m_timezone', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_user', 'timezone', 'public.com_m_timezone', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_matching_request', 'requested_timezone', 'public.com_m_timezone', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_trial_application', 'timezone', 'public.com_m_timezone', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_terms_agreement', 'term_id', 'public.com_m_terms', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_terms_agreement', 'revision_id', 'public.com_m_terms_revision', 'RESTRICT');

-- 教材（学習の履歴・割当は RESTRICT、教材に付属するものは CASCADE）
SELECT pg_temp.set_fk('public.com_m_contents_access', 'content_id', 'public.com_m_contents', 'CASCADE');
SELECT pg_temp.set_fk('public.com_m_dialogue_session', 'content_id', 'public.com_m_contents', 'CASCADE');
SELECT pg_temp.set_fk('public.com_t_dialogue_assignment', 'content_id', 'public.com_m_contents', 'RESTRICT');
SELECT pg_temp.set_fk('public.lesson_t_sprint', 'content_id', 'public.com_m_contents', 'RESTRICT');
SELECT pg_temp.set_fk('public.self_t_sprint', 'content_id', 'public.com_m_contents', 'RESTRICT');
SELECT pg_temp.set_fk('public.self_t_sprint_summary', 'content_id', 'public.com_m_contents', 'RESTRICT');
SELECT pg_temp.set_fk('public.self_t_word_summary', 'content_id', 'public.com_m_contents', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_dialogue_session_progress', 'dialogue_session_id', 'public.com_m_dialogue_session', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session_dialogue_log', 'dialogue_session_id', 'public.com_m_dialogue_session', 'RESTRICT');

-- 契約・ライセンス・チケット・予定・セッション
SELECT pg_temp.set_fk('public.com_t_user_license', 'contract_id', 'public.com_m_contract', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_license_history', 'contract_id', 'public.com_m_contract', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_session_ticket', 'contract_id', 'public.com_m_contract', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_session_ticket_history', 'contract_id', 'public.com_m_contract', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_session_ticket', 'license_id', 'public.com_t_user_license', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_lesson_schedule', 'ticket_id', 'public.com_t_user_session_ticket', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_coach_rating', 'ticket_id', 'public.com_t_user_session_ticket', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_contract_training_report', 'ticket_id', 'public.com_t_user_session_ticket', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_matching_request', 'ticket_id', 'public.com_t_user_session_ticket', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session', 'ticket_id', 'public.com_t_user_session_ticket', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session', 'schedule_id', 'public.com_m_lesson_schedule', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_lesson_schedule', 'source_request_id', 'public.com_t_matching_request', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_session', 'rescheduled_from', 'public.com_t_session', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_session_slot_proposal', 'resulting_session_id', 'public.com_t_session', 'SET NULL');
SELECT pg_temp.set_fk('public.student_t_sprint_level_history', 'voided_by_history_id', 'public.student_t_sprint_level_history', 'SET NULL');

-- ユーザー（業務の記録は RESTRICT、操作者の記録は SET NULL）
SELECT pg_temp.set_fk('public.com_m_coach_student_relationship', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_coach_student_relationship', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_lesson_schedule', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_m_lesson_schedule', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_admin_impersonation_log', 'target_user_id', 'public.com_m_user', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_coach_monthly_report_approval', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_coach_monthly_report_approval', 'approved_by', 'public.com_m_user', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_coach_rating', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_coach_rating', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_contract_training_report', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_contract_training_report', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_dialogue_assignment', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_dialogue_assignment', 'assigned_by_coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_dialogue_session_progress', 'updated_by_coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_matching_request', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_matching_request', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_matching_request', 'responded_by', 'public.com_m_user', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_session', 'coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session', 'cancelled_by', 'public.com_m_user', 'SET NULL');
SELECT pg_temp.set_fk('public.com_t_session_call_log', 'user_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_session_dialogue_log', 'opened_by_coach_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_license', 'user_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_license_history', 'user_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_session_ticket', 'user_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.com_t_user_session_ticket_history', 'user_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.lesson_t_sprint', 'student_id', 'public.com_m_user', 'RESTRICT');
SELECT pg_temp.set_fk('public.lesson_t_sprint', 'coach_id', 'public.com_m_user', 'RESTRICT');

-- 指定なし（NO ACTION）が残っていないことを確かめる（auth スキーマ等の外部は対象外）
DO $$
DECLARE v_left text;
BEGIN
  SELECT string_agg(conrelid::regclass::text || '.' || conname, ', ') INTO v_left
  FROM pg_constraint
  WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND confdeltype = 'a';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'ON DELETE が未指定の外部キーが残っています: %', v_left;
  END IF;
END $$;

COMMIT;

-- =========================================================================
-- 【追加セクション】退会（個人情報の消去）・顧客単位の一括削除と、その記録を追加する
--
-- 【内容】（規約は docs/DATA-DELETION.md §4・§5）
--   1. com_t_data_deletion_log（新規）: 退会・一括削除を、誰が・いつ・何件消したかの記録（氏名・メールアドレスは持たない）
--   2. fn_withdraw_user（新規）: 退会。個人情報を消し、com_m_user を「退会済みユーザー」（status = 9）として残す
--   3. fn_purge_client（新規）: 顧客単位の一括削除。p_dry_run = true で件数だけを返す
--   4. vw_user_list: ユーザーの状態（user_status）を足し、退会済み（認証のアカウントが無い）ユーザーも一覧に残す
--   5. 空き時間の物理削除でも「確認済み」を更新するよう、トリガーを DELETE にも反応させる
--      （delete_flg の廃止で、空き時間の削除が UPDATE から DELETE になったため）
--
-- 対応ファイル: DDL/table/com_t_data_deletion_log.sql（新規）, DDL/function/fn_withdraw_user.sql（新規）,
--   DDL/function/fn_purge_client.sql（新規）, DDL/view/vw_user_list.sql, DDL/function/enqueue_coach_availability_reminders.sql
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.com_t_data_deletion_log (
    log_id        uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    kind          text         NOT NULL,
    target_id     uuid         NOT NULL,
    counts        jsonb        NOT NULL DEFAULT '{}'::jsonb,
    performed_by  uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    performed_at  timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_data_deletion_log_kind CHECK (kind = ANY (ARRAY['withdraw_user'::text, 'purge_client'::text]))
);
COMMENT ON TABLE public.com_t_data_deletion_log IS '退会・顧客単位の一括削除の記録（氏名・メールアドレスは持たない）';
COMMENT ON COLUMN public.com_t_data_deletion_log.kind IS '種類 withdraw_user:退会（個人情報の消去） purge_client:顧客単位の一括削除';
COMMENT ON COLUMN public.com_t_data_deletion_log.target_id IS '対象のID（withdraw_user: com_m_user.id。退会済みの行として残る / purge_client: 削除した com_m_client.client_id）';
COMMENT ON COLUMN public.com_t_data_deletion_log.counts IS '消した件数（種類ごと）';
COMMENT ON COLUMN public.com_t_data_deletion_log.performed_by IS '実行した管理者（com_m_user.id）';
COMMENT ON COLUMN public.com_t_data_deletion_log.performed_at IS '実行日時';
CREATE INDEX IF NOT EXISTS idx_data_deletion_log_performed_at ON public.com_t_data_deletion_log (performed_at DESC);
ALTER TABLE public.com_t_data_deletion_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.com_t_data_deletion_log FROM anon, authenticated;

-- ---- DDL/function/fn_withdraw_user.sql ----
---------------------------------------------
-- fn_withdraw_user: 退会（個人情報の消去）。規約は docs/DATA-DELETION.md §4
---------------------------------------------
-- 本人を特定できる情報を物理削除し、業務の記録（セッション・チケット・ライセンス・学習の集計・チャットの本文等）は
-- com_m_user の行を「退会済みユーザー」（status = 9）として残したまま匿名の実績にする。
-- 1トランザクションで DB だけを処理し、Storage のファイルと認証のアカウント（auth.users）は呼び出し元の
-- サーバーアクション（apps/admin/actions/adminWithdrawAction.ts）が、戻り値の storage のパスを使って消す。
-- 途中で失敗しても再実行で続きから終わるよう、退会済みのユーザーにも同じ削除を行う（対象が無ければ何もしない）。
--
-- 【中断する場合】（例外のメッセージで判別する）
--   user_not_found / not_withdrawable（生徒・コーチ以外）/ active_license（有効なライセンスがある）/
--   scheduled_session（今後のセッションがある）/ active_matching（回答待ちの申請・稼働中の定期予定がある）
--   ライセンスの停止・セッションのキャンセルは既存の画面で先に行う（取り消しの通知・チケットの返還をそちらに任せる）。
--
-- 【消すもの】正式氏名、お気に入り、途中再開の状態、メール設定、通知、送信待ち・送信済みのメールとその配信の記録、
--   ロール、未使用の招待、生徒について書かれたメモ、生徒の宿題（添付を含む）、コーチのプロフィール・空き時間・専門・
--   マッチングの停止設定。Webトライアルの申込は氏名・メールアドレスだけを消し、要望・知ったきっかけは残す。
-- 【残すもの】セッション・チケット・ライセンス・契約・評価の点数・研修レポート・学習の記録・チャットとセッション内の
--   チャットの本文（送信者は「退会済みユーザー」と表示）・イベントの参加の記録・規約への同意の記録。
-- service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_withdraw_user(p_user_id uuid, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user          record;
    v_email         text;
    v_profile_paths text[];
    v_homework_paths text[];
    v_counts        jsonb;
    v_n             integer;
BEGIN
    SELECT id, user_type, status, icon_path INTO v_user
    FROM public.com_m_user WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_user.user_type NOT IN ('1', '2') THEN
        RAISE EXCEPTION 'not_withdrawable';
    END IF;

    IF EXISTS (SELECT 1 FROM public.com_t_user_license
               WHERE user_id = p_user_id AND status = 1 AND end_date > now()) THEN
        RAISE EXCEPTION 'active_license';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_t_session
               WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status = 1 AND start_datetime > now()) THEN
        RAISE EXCEPTION 'scheduled_session';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_t_matching_request
               WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status = 1)
       OR EXISTS (SELECT 1 FROM public.com_m_lesson_schedule
                  WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status IN (0, 1)) THEN
        RAISE EXCEPTION 'active_matching';
    END IF;

    SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_user_id;

    -- Storage のパス（消すのは呼び出し元）
    SELECT array_remove(ARRAY[
        v_user.icon_path,
        (SELECT intro_video_path FROM public.com_m_coach_profile WHERE user_id = p_user_id)
    ], NULL) INTO v_profile_paths;
    SELECT coalesce(array_agg(a.file_path), '{}') INTO v_homework_paths
    FROM public.com_t_session_homework_attachment a
    JOIN public.com_t_session_homework h ON h.homework_id = a.homework_id
    WHERE h.student_id = p_user_id;

    v_counts := '{}'::jsonb;

    DELETE FROM public.com_m_user_legal WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_contents WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_phrase WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_sprint_question WHERE user_id = p_user_id;
    DELETE FROM public.com_t_resume_contents WHERE user_id = p_user_id;
    DELETE FROM public.com_t_user_mail_setting WHERE user_id = p_user_id;
    DELETE FROM public.com_t_notification WHERE user_id = p_user_id;
    DELETE FROM public.com_t_mail_event
    WHERE mail_id IN (SELECT mail_id FROM public.com_t_mail_outbox WHERE user_id = p_user_id)
       OR (v_email IS NOT NULL AND lower(recipient) = v_email);
    DELETE FROM public.com_t_mail_outbox WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('mails', v_n);
    DELETE FROM public.com_t_user_role WHERE user_id = p_user_id;
    IF v_email IS NOT NULL THEN
        DELETE FROM public.com_t_invitation WHERE lower(email) = v_email AND accepted_at IS NULL;
    END IF;

    -- 生徒について書かれた情報
    DELETE FROM public.com_t_coach_student_note WHERE student_id = p_user_id;
    DELETE FROM public.com_t_session_homework WHERE student_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('homeworks', v_n);

    -- コーチの公開プロフィールと受付の設定
    DELETE FROM public.com_m_coach_profile WHERE user_id = p_user_id;
    DELETE FROM public.com_m_coach_availability WHERE coach_id = p_user_id;
    DELETE FROM public.com_t_coach_availability_exception WHERE coach_id = p_user_id;
    DELETE FROM public.com_m_coach_specialty_assignment WHERE coach_id = p_user_id;
    DELETE FROM public.com_m_coach_matching_suspension WHERE coach_id = p_user_id;

    -- Webトライアルの申込（要望・知ったきっかけはマーケティングのため残す）
    UPDATE public.com_t_trial_application
    SET email = 'withdrawn-' || application_id || '@invalid',
        last_name = '退会済み', first_name = '-', last_name_latin = 'Withdrawn', first_name_latin = '-',
        country_city = NULL, update_date = now()
    WHERE user_id = p_user_id AND email NOT LIKE 'withdrawn-%@invalid';

    UPDATE public.com_m_user
    SET status = 9, user_name = '退会済みユーザー', icon_path = NULL,
        login_failed_count = 0, locked_until = NULL, update_date = now()
    WHERE id = p_user_id;

    INSERT INTO public.com_t_data_deletion_log (kind, target_id, counts, performed_by)
    VALUES ('withdraw_user', p_user_id, v_counts, p_performed_by);

    RETURN jsonb_build_object(
        'counts', v_counts,
        'storage', jsonb_build_object('profile', to_jsonb(v_profile_paths), 'homework', to_jsonb(v_homework_paths))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_withdraw_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_withdraw_user(uuid, uuid) TO service_role;

-- ---- DDL/function/fn_purge_client.sql ----
---------------------------------------------
-- fn_purge_client: 顧客単位の一括削除（DangerZone）。規約は docs/DATA-DELETION.md §5
---------------------------------------------
-- テストデータ・営業用デモ・誤って作った顧客を、所属するユーザー・契約・ライセンス・チケット・セッション・学習の記録・
-- 招待・お知らせ・イベント・教材の限定公開の設定ごと物理削除する（戻せない）。
-- p_dry_run = true のときは何も消さず、消える件数（counts）だけを返す（画面で確認してから実行するため）。
-- 業務の記録の外部キーは RESTRICT のため、参照する側から順に消し、最後にユーザーと顧客を消す
-- （ユーザーに付属するだけのデータは CASCADE で一緒に消える）。
-- 認証のアカウント（auth.users）と Storage のファイルは、呼び出し元のサーバーアクション
-- （apps/admin/actions/adminPurgeClientAction.ts）が、戻り値の user_ids・storage を使って消す。
--
-- 【中断する場合】（例外のメッセージで判別する）
--   client_not_found / protected_client（初期テナント・Webトライアルの固定の顧客）/ has_admin（管理者が所属している）/
--   linked_to_other_client（他の顧客のユーザーとのセッション・担当関係・マッチング・評価・研修レポートがある。
--   例: この顧客のコーチが他の顧客の生徒を担当している）
-- service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_purge_client(p_client_id uuid, p_dry_run boolean, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client     record;
    v_users      uuid[];
    v_contracts  uuid[];
    v_licenses   uuid[];
    v_tickets    uuid[];
    v_rooms      uuid[];
    v_counts     jsonb;
    v_storage    jsonb;
BEGIN
    SELECT client_id, client_name, client_type INTO v_client
    FROM public.com_m_client WHERE client_id = p_client_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'client_not_found';
    END IF;
    IF v_client.client_type = 0 OR p_client_id = public.web_trial_client_id() THEN
        RAISE EXCEPTION 'protected_client';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_m_user WHERE client_id = p_client_id AND user_type = '0') THEN
        RAISE EXCEPTION 'has_admin';
    END IF;

    SELECT coalesce(array_agg(id), '{}') INTO v_users FROM public.com_m_user WHERE client_id = p_client_id;
    SELECT coalesce(array_agg(contract_id), '{}') INTO v_contracts FROM public.com_m_contract WHERE client_id = p_client_id;
    SELECT coalesce(array_agg(license_id), '{}') INTO v_licenses
    FROM public.com_t_user_license WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    SELECT coalesce(array_agg(ticket_id), '{}') INTO v_tickets
    FROM public.com_t_user_session_ticket
    WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts) OR license_id = ANY (v_licenses);

    -- 他の顧客のユーザーとの業務の記録があれば中断する（片側だけがこの顧客のユーザー）
    IF EXISTS (SELECT 1 FROM public.com_t_session
               WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users))
                  OR (ticket_id = ANY (v_tickets) AND NOT student_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_m_coach_student_relationship
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_m_lesson_schedule
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_matching_request
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_coach_rating
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_contract_training_report
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_user_license
                  WHERE contract_id = ANY (v_contracts) AND NOT user_id = ANY (v_users)) THEN
        RAISE EXCEPTION 'linked_to_other_client';
    END IF;

    v_counts := jsonb_build_object(
        'students', (SELECT count(*) FROM public.com_m_user WHERE id = ANY (v_users) AND user_type = '1'),
        'coaches', (SELECT count(*) FROM public.com_m_user WHERE id = ANY (v_users) AND user_type = '2'),
        'invitations', (SELECT count(*) FROM public.com_t_invitation
                        WHERE (client_id = p_client_id OR contract_id = ANY (v_contracts)) AND accepted_at IS NULL),
        'contracts', cardinality(v_contracts),
        'licenses', cardinality(v_licenses),
        'sessions', (SELECT count(*) FROM public.com_t_session
                     WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets)),
        'trainings', (SELECT count(*) FROM public.self_t_sprint WHERE user_id = ANY (v_users))
                     + (SELECT count(*) FROM public.self_t_word_summary WHERE user_id = ANY (v_users)),
        'chat_messages', (SELECT count(*) FROM public.com_t_chat WHERE sender_user_id = ANY (v_users)),
        'notices', (SELECT count(*) FROM public.com_m_notice WHERE client_id = p_client_id),
        'calendar_events', (SELECT count(*) FROM public.com_m_calendar_event WHERE client_id = p_client_id)
    );

    IF p_dry_run THEN
        RETURN jsonb_build_object('client_name', v_client.client_name, 'counts', v_counts);
    END IF;

    -- Storage のパス（消すのは呼び出し元）
    v_storage := jsonb_build_object(
        'profile', coalesce((
            SELECT jsonb_agg(p) FROM (
                SELECT icon_path AS p FROM public.com_m_user WHERE id = ANY (v_users) AND icon_path IS NOT NULL
                UNION ALL
                SELECT intro_video_path FROM public.com_m_coach_profile WHERE user_id = ANY (v_users) AND intro_video_path IS NOT NULL
            ) x), '[]'::jsonb),
        'homework', coalesce((
            SELECT jsonb_agg(a.file_path)
            FROM public.com_t_session_homework_attachment a
            JOIN public.com_t_session_homework h ON h.homework_id = a.homework_id
            WHERE h.student_id = ANY (v_users) OR h.coach_id = ANY (v_users)), '[]'::jsonb),
        'chat', coalesce((
            SELECT jsonb_agg(a.file_path)
            FROM public.com_t_chat_attachment a
            JOIN public.com_t_chat c ON c.chat_id = a.chat_id
            WHERE c.sender_user_id = ANY (v_users)), '[]'::jsonb)
    );
    SELECT coalesce(array_agg(DISTINCT room_id), '{}') INTO v_rooms
    FROM public.com_t_chat_room_user WHERE user_id = ANY (v_users);

    -- 業務の記録（RESTRICT の外部キーに当たらない順に）
    DELETE FROM public.com_t_coach_rating
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_contract_training_report
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.lesson_t_sprint WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users);
    DELETE FROM public.com_t_session_dialogue_log WHERE opened_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_dialogue_session_progress WHERE updated_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_dialogue_assignment WHERE student_id = ANY (v_users) OR assigned_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_session_call_log WHERE user_id = ANY (v_users);
    DELETE FROM public.com_t_session
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_m_lesson_schedule
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_matching_request
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_coach_monthly_report_approval WHERE coach_id = ANY (v_users);
    DELETE FROM public.com_m_coach_student_relationship WHERE coach_id = ANY (v_users) OR student_id = ANY (v_users);
    DELETE FROM public.com_t_user_session_ticket_history WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_t_user_session_ticket WHERE ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_user_license_history WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_t_user_license WHERE license_id = ANY (v_licenses);
    DELETE FROM public.com_t_invitation WHERE client_id = p_client_id OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_m_contract WHERE contract_id = ANY (v_contracts);

    -- ユーザー（付属するデータは CASCADE で消える）
    DELETE FROM public.com_t_mail_event
    WHERE mail_id IN (SELECT mail_id FROM public.com_t_mail_outbox WHERE user_id = ANY (v_users));
    DELETE FROM public.com_t_user_role WHERE user_id = ANY (v_users);
    DELETE FROM public.com_m_user WHERE id = ANY (v_users);
    -- 参加者が誰もいなくなったチャットルーム
    DELETE FROM public.com_t_chat_room r
    WHERE r.room_id = ANY (v_rooms)
      AND NOT EXISTS (SELECT 1 FROM public.com_t_chat_room_user m WHERE m.room_id = r.room_id);

    -- 顧客（お知らせ・イベント・教材の限定公開の設定は CASCADE で消える）
    DELETE FROM public.com_m_client WHERE client_id = p_client_id;

    INSERT INTO public.com_t_data_deletion_log (kind, target_id, counts, performed_by)
    VALUES ('purge_client', p_client_id, v_counts, p_performed_by);

    RETURN jsonb_build_object(
        'client_name', v_client.client_name,
        'counts', v_counts,
        'user_ids', to_jsonb(v_users),
        'storage', v_storage
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_purge_client(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purge_client(uuid, boolean, uuid) TO service_role;

-- ---- DDL/view/vw_user_list.sql ----
---------------------------------------------
-- VIEW: vw_user_list ユーザリスト (privateスキーマに隔離)
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
  -- アドミン管理用の契約名（CREATE OR REPLACE で列を足すため末尾に置く）
  con.contract_name,
  -- ユーザーの状態（com_m_user.status。1:有効 0:停止 9:退会済み）
  u.status AS user_status
FROM 
  public.com_m_user u
  -- 退会済みのユーザーは認証のアカウントを消しているため、外部結合にして一覧に残す（email 等は NULL）
  LEFT JOIN auth.users au ON u.id = au.id
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
  NULL AS contract_name,
  NULL::smallint AS user_status
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

-- ---- DDL/function/enqueue_coach_availability_reminders.sql ----
---------------------------------------------
-- コーチの空き時間の見直し通知 (2026-10-06 追加)
-- 前提: table/com_m_coach_profile.sql（availability_confirmed_at パッチ）, table/com_m_coach_availability.sql,
--       table/com_t_notification.sql, function/fn_notify.sql の作成が完了していること。pg_cron が有効であること。
---------------------------------------------
-- 【背景】
-- 空き時間（com_m_coach_availability）はUTCで持つため、コーチの現地時刻での表示は夏時間の切り替えで
-- 1時間ずれる。また空き時間はコーチの生活の予定に合わせて変わる。そこで、コーチに14日ごとに
-- 空き時間を見直すようアプリ内通知で促す（メールは送らない。enqueue_notification_mail の対象外）。
--   - 空き時間が1件以上あるコーチ: 最後の確認（availability_confirmed_at）から14日を過ぎたら見直しを促す（kind = 'review'）
--   - 空き時間が0件のコーチ: 空き時間を登録するよう促す（kind = 'empty'。マッチングの申請を受けられないため）
--
-- 【通知の行】
-- 通知種別 COACH_AVAILABILITY_REMINDER、集約キー 'availability' の1行をコーチごとに使い回す
-- （再通知のたびに内容・未読・日時を更新する。一覧に同じ通知が溜まらない）。直近14日に通知した
-- コーチには出さない。空き時間を保存する・「変更なしで確認」すると、確認日時を更新し、この通知を既読にする。
--
-- 【対象のコーチ】
-- 有効なコーチ（com_m_user.user_type = '2' かつ status = 1）。デモコーチ
-- （demo_user ロール）は除く（通常の生徒のマッチング対象外のため。get_matchable_coach_ids と同じ考え方）。
-- 新規の生徒の受付をOFFにしたコーチ・アドミンが休止にしたコーチも除く（空き時間はマッチングにだけ使うため。2026-10-11 追加）。
---------------------------------------------

-- 確認日時の更新と、見直しの通知の既読化（空き時間の保存・「変更なしで確認」の共通処理。内部処理専用）
CREATE OR REPLACE FUNCTION public.fn_mark_coach_availability_confirmed(p_coach_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_m_coach_profile
    SET availability_confirmed_at = NOW()
    WHERE user_id = p_coach_id;

    UPDATE public.com_t_notification
    SET is_read = TRUE, read_at = NOW(), update_date = NOW()
    WHERE user_id = p_coach_id
      AND notification_type = 'COACH_AVAILABILITY_REMINDER'
      AND is_read = FALSE;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_coach_availability_confirmed(uuid) FROM PUBLIC, anon, authenticated;

-- 空き時間の追加・変更・削除のたびに確認済みにする
CREATE OR REPLACE FUNCTION public.trg_coach_availability_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_mark_coach_availability_confirmed(COALESCE(NEW.coach_id, OLD.coach_id));
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_coach_availability_change_confirm ON public.com_m_coach_availability;
CREATE TRIGGER on_coach_availability_change_confirm
AFTER INSERT OR UPDATE OR DELETE ON public.com_m_coach_availability
FOR EACH ROW EXECUTE FUNCTION public.trg_coach_availability_confirmed();

-- 「変更なしで確認」（コーチ本人のみ）
CREATE OR REPLACE FUNCTION public.confirm_my_coach_availability()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at timestamptz;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.com_m_coach_profile WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not authorized to confirm availability';
    END IF;

    PERFORM public.fn_mark_coach_availability_confirmed(auth.uid());

    SELECT availability_confirmed_at INTO v_confirmed_at FROM public.com_m_coach_profile WHERE user_id = auth.uid();
    RETURN v_confirmed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_my_coach_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_coach_availability() TO authenticated;

-- 見直しの通知を登録する（pg_cron から毎日実行）。戻り値は通知したコーチの数
CREATE OR REPLACE FUNCTION public.enqueue_coach_availability_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH coaches AS (
        SELECT
            p.user_id AS coach_id,
            COUNT(a.availability_id) AS slot_count,
            -- 確認日時が無い（本機能の追加前から登録している）場合は、空き時間の最終更新を確認日時とみなす
            COALESCE(p.availability_confirmed_at, MAX(a.update_date)) AS confirmed_at
        FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2' AND u.status = 1
        LEFT JOIN public.com_m_coach_availability a ON a.coach_id = p.user_id
        WHERE p.accepting_students
          AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_user_role r
              WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
          )
        GROUP BY p.user_id, p.availability_confirmed_at
    ),
    targets AS (
        SELECT c.coach_id, CASE WHEN c.slot_count = 0 THEN 'empty' ELSE 'review' END AS kind
        FROM coaches c
        WHERE (c.slot_count = 0 OR c.confirmed_at IS NULL OR c.confirmed_at < NOW() - interval '14 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_notification n
              WHERE n.user_id = c.coach_id
                AND n.notification_type = 'COACH_AVAILABILITY_REMINDER'
                AND n.dedup_key = 'availability'
                AND n.occurred_at >= NOW() - interval '14 days'
          )
    ),
    upserted AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
        SELECT coach_id, 'COACH_AVAILABILITY_REMINDER', 'availability', jsonb_build_object('kind', kind), '/availability'
        FROM targets
        ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            link_path = EXCLUDED.link_path,
            is_read = FALSE,
            read_at = NULL,
            occurred_at = NOW(),
            update_date = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_coach_availability_reminders() FROM PUBLIC, anon, authenticated;

-- 毎日 00:15 UTC（日本 9:15、北米は前日の夕方）に実行する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'coach-availability-reminders-daily';

SELECT cron.schedule(
    'coach-availability-reminders-daily',
    '15 0 * * *',
    $$ SELECT public.enqueue_coach_availability_reminders(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】データモデルの整備（区分値の CHECK 制約・更新日時のトリガー・外部キーの索引・不要な表の削除）
--
-- 【内容】
--   1. dev にだけ残っていた不要な表（com_m_question・self_t_sprint_backup_20260710・temp_self_t_sprint_backup）を削除する
--      （正本に無く、コードからも参照していない。staging・本番には無い）。dev にだけある検証用の room_type = 'ADMIN' の
--      チャットルームは GROUP にそろえる
--   2. 区分値の列に CHECK 制約を足す（値はコードの定数・列のコメントに合わせる。既存の値が外れていれば中断する）。
--      種別が今後増える想定でフリーテキストにしている列（com_m_calendar_event.event_type 等）・外部の値
--      （com_t_mail_event.event_type）・想定値を決めていない列（com_m_ai_knowledge_base.source_type）は対象外。
--      com_m_sprint_questions.question_type の '1'・'2' は旧システムから移した教材「Gabby NLT」の問題種別で、
--      アプリの出題の対象外（定数 QUESTION_TYPES に無い）だが行が残っているため許容する
--   3. 更新日時の列を持つ全テーブルに、更新のたびに現在時刻にするトリガー（set_update_date）を付ける
--   4. 一覧・RLS・削除の判定でよく使う外部キーの列に索引を足す
--   あわせて、実際の値と違っていた列のコメントを直す（user_type の 2 はコーチ等）。
--
-- 対応ファイル: DDL/function/set_update_date.sql（新規）, DDL/table/（下記の各テーブル）
-- 【適用前の確認（staging・本番）】2. は既存の値が外れていると中断する。中断したら値を確かめ、直してから再実行する。
-- =========================================================================

BEGIN;

-- 1. 不要な表 ---------------------------------------------------------------
DROP TABLE IF EXISTS public.com_m_question;
DROP TABLE IF EXISTS public.self_t_sprint_backup_20260710;
DROP TABLE IF EXISTS public.temp_self_t_sprint_backup;
UPDATE public.com_t_chat_room SET room_type = 'GROUP' WHERE room_type NOT IN ('1ON1', 'GROUP');

-- 2. 区分値の CHECK 制約 ----------------------------------------------------
ALTER TABLE public.com_m_user ADD CONSTRAINT chk_user_type CHECK (user_type = ANY (ARRAY['0'::text, '1'::text, '2'::text]));
ALTER TABLE public.com_t_invitation ADD CONSTRAINT chk_invitation_user_type CHECK (user_type = ANY (ARRAY['0'::text, '1'::text, '2'::text]));
ALTER TABLE public.com_t_chat_room_user ADD CONSTRAINT chk_chat_room_user_user_type CHECK (user_type = ANY (ARRAY['0'::text, '1'::text, '2'::text]));
ALTER TABLE public.com_t_chat_room ADD CONSTRAINT chk_chat_room_type CHECK (room_type::text = ANY (ARRAY['1ON1'::text, 'GROUP'::text]));
ALTER TABLE public.com_m_client ADD CONSTRAINT chk_client_type CHECK (client_type = ANY (ARRAY[0, 1, 2]));
ALTER TABLE public.com_m_contents ADD CONSTRAINT chk_contents_type CHECK (content_type = ANY (ARRAY[0, 1, 2, 3]));
ALTER TABLE public.com_m_contents_tag ADD CONSTRAINT chk_contents_tag_type CHECK (tag_type = ANY (ARRAY['industry'::text, 'scene'::text, 'skill'::text, 'level'::text, 'other'::text]));
ALTER TABLE public.com_m_contract ADD CONSTRAINT chk_contract_status CHECK (status = ANY (ARRAY[0, 1, 9]));
ALTER TABLE public.com_t_user_license ADD CONSTRAINT chk_user_license_status CHECK (status = ANY (ARRAY[0, 1]));
ALTER TABLE public.com_t_user_license_history ADD CONSTRAINT chk_user_license_history_status CHECK (status = ANY (ARRAY[0, 1]));
ALTER TABLE public.com_m_word ADD CONSTRAINT chk_word_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text]));
ALTER TABLE public.com_m_phrase ADD CONSTRAINT chk_phrase_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text]));
ALTER TABLE public.com_m_phrase ADD CONSTRAINT chk_phrase_tts_status CHECK (tts_status = ANY (ARRAY[0, 1, 2, 9]));
ALTER TABLE public.com_m_color_vowel_dictionary ADD CONSTRAINT chk_cv_dictionary_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text]));
ALTER TABLE public.com_m_color_vowel_dictionary ADD CONSTRAINT chk_cv_dictionary_tts_status CHECK (tts_status = ANY (ARRAY[0, 1, 2, 9]));
ALTER TABLE public.com_m_sprint_questions ADD CONSTRAINT chk_sprint_questions_sprint_type CHECK (sprint_type = ANY (ARRAY['0'::text, '1'::text]));
ALTER TABLE public.com_m_sprint_questions ADD CONSTRAINT chk_sprint_questions_question_type CHECK (question_type = ANY (ARRAY['0'::text, '1'::text, '2'::text, '4'::text, '5'::text, '6'::text]));
ALTER TABLE public.com_m_sprint_questions ADD CONSTRAINT chk_sprint_questions_tts_status CHECK (
    statement_tts_status = ANY (ARRAY[0, 1, 2, 9]) AND question_tts_status = ANY (ARRAY[0, 1, 2, 9])
    AND answer_sentence_yes_tts_status = ANY (ARRAY[0, 1, 2, 9]) AND answer_sentence_no_tts_status = ANY (ARRAY[0, 1, 2, 9]));
ALTER TABLE public.self_t_sprint ADD CONSTRAINT chk_self_sprint_types CHECK (
    sprint_type = ANY (ARRAY['0'::text, '1'::text]) AND question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text])
    AND answer_type = ANY (ARRAY['0'::text, '1'::text]));
ALTER TABLE public.lesson_t_sprint ADD CONSTRAINT chk_lesson_sprint_types CHECK (
    sprint_type = ANY (ARRAY['0'::text, '1'::text]) AND question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text])
    AND answer_type = ANY (ARRAY['0'::text, '1'::text]));
ALTER TABLE public.com_m_calendar_event ADD CONSTRAINT chk_calendar_event_target_type CHECK (target_type::text = ANY (ARRAY['ALL'::text, 'CLIENT'::text, 'COACH'::text]));
ALTER TABLE public.com_m_notice ADD CONSTRAINT chk_notice_target_type CHECK (target_type::text = ANY (ARRAY['ALL'::text, 'CLIENT'::text, 'COACH'::text]));

COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザー種別 0:管理者 1:生徒 2:コーチ';
COMMENT ON COLUMN public.com_t_invitation.user_type IS 'ユーザー種別 0:管理者 1:生徒 2:コーチ';
COMMENT ON COLUMN public.com_t_chat_room_user.user_type IS '参加者の種別（com_m_user.user_type の写し。0:管理者 1:生徒 2:コーチ）';
COMMENT ON COLUMN public.com_m_contents_tag.tag_type IS 'タグ種別 industry:業界 scene:シチュエーション skill:スキル level:レベル other:その他';
COMMENT ON COLUMN public.com_t_user_license_history.status IS '記録時点のライセンスのステータス 1:有効 0:停止';
COMMENT ON COLUMN public.com_t_user_license.status IS 'ステータス 1:有効 0:停止';
COMMENT ON COLUMN public.com_m_sprint_questions.question_type IS '問題種別 (''0'':Speed, ''4'':Structure, ''5'':Builders, ''6'':Mastery。''1''・''2'' は旧システムから移した教材「Gabby NLT」の種別で、アプリの出題の対象外)';

-- 3. 更新日時のトリガー ------------------------------------------------------

-- ---- DDL/function/set_update_date.sql ----
---------------------------------------------
-- set_update_date: 行の更新のたびに更新日時を現在時刻にする（BEFORE UPDATE トリガー用）
---------------------------------------------
-- 更新日時の列を持つ全テーブルに trg_set_update_date として付ける（新しいテーブルにも付ける。
-- 規約は supabase/DDL/README.md）。アプリ・RPC が update_date を書き忘れても、DB 側で必ず更新される
-- （書いた値は現在時刻で上書きする）。列名が update_date 以外のテーブルは、トリガーの引数で列名を渡す
-- （例: com_t_tts_asset は 'updated_at'）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.set_update_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(coalesce(TG_ARGV[0], 'update_date'), now()));
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name IN ('update_date', 'updated_at')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_update_date ON public.%I', r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_update_date(%L)',
            r.table_name, r.column_name);
    END LOOP;
END $$;

-- 4. 外部キーの索引（一覧・RLS・削除の判定でよく使う列）----------------------
CREATE INDEX IF NOT EXISTS idx_user_client ON public.com_m_user (client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON public.com_t_chat (sender_user_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_sender ON public.com_t_session_chat (sender_user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_client ON public.com_t_invitation (client_id);
CREATE INDEX IF NOT EXISTS idx_coach_student_note_student ON public.com_t_coach_student_note (student_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_assignment_content ON public.com_t_dialogue_assignment (content_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_session_progress_session ON public.com_t_dialogue_session_progress (dialogue_session_id);
CREATE INDEX IF NOT EXISTS idx_session_dialogue_log_assignment ON public.com_t_session_dialogue_log (assignment_id);
CREATE INDEX IF NOT EXISTS idx_session_homework_coach ON public.com_t_session_homework (coach_id);
CREATE INDEX IF NOT EXISTS idx_trial_application_user ON public.com_t_trial_application (user_id);
CREATE INDEX IF NOT EXISTS idx_resume_contents_content ON public.com_t_resume_contents (content_id);
CREATE INDEX IF NOT EXISTS idx_word_summary_content ON public.self_t_word_summary (content_id);
CREATE INDEX IF NOT EXISTS idx_contract_plan ON public.com_m_contract (plan_id);

COMMIT;

-- =========================================================================
-- 【追加セクション】使っていない問題種別（'1'・'2'）のスプリントの問題を削除し、問題種別を 0・4・5・6 に限る
--
-- 【内容】
--   旧システムから移した教材「Gabby NLT」に残っていた問題種別 '1'・'2' の問題（dev・staging とも 3,276問）を削除する。
--   アプリの問題種別は 0:Speed / 4:Structure / 5:Builders / 6:Mastery だけ（packages/types/sprint.ts の QUESTION_TYPES）で、
--   これらは出題・表示されていない。教材自体と、種別 0・4・5・6 の問題・学習の記録はそのまま残る
--   （お気に入りに登録された問題は無い。あれば外部キーの CASCADE で一緒に消える）。
--   そのうえで com_m_sprint_questions.question_type の CHECK 制約を 0・4・5・6 に絞る。
--
-- 対応ファイル: DDL/table/com_m_sprint_questions.sql
-- =========================================================================

BEGIN;

DELETE FROM public.com_m_sprint_questions WHERE question_type IN ('1', '2');

ALTER TABLE public.com_m_sprint_questions DROP CONSTRAINT IF EXISTS chk_sprint_questions_question_type;
ALTER TABLE public.com_m_sprint_questions ADD CONSTRAINT chk_sprint_questions_question_type
    CHECK (question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text]));
COMMENT ON COLUMN public.com_m_sprint_questions.question_type IS '問題種別 (''0'':Speed, ''4'':Structure, ''5'':Builders, ''6'':Mastery)';

COMMIT;
