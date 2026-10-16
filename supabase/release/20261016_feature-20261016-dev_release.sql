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
--   admin の申込一覧 /trial-applications・本登録時のトライアルのライセンス）。各セクションの説明を参照。
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
    user_name                text         NOT NULL,
    romaji_last_name         text         NOT NULL,
    romaji_first_name        text         NOT NULL,
    timezone                 text         NOT NULL REFERENCES public.com_m_timezone(timezone),
    country_city             text,
    occupation               smallint     NOT NULL,
    occupation_other         text,
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
COMMENT ON COLUMN public.com_t_trial_application.user_name IS '氏名';
COMMENT ON COLUMN public.com_t_trial_application.romaji_last_name IS '姓（ローマ字）';
COMMENT ON COLUMN public.com_t_trial_application.romaji_first_name IS '名（ローマ字）';
COMMENT ON COLUMN public.com_t_trial_application.timezone IS 'タイムゾーン（本登録時に com_m_user.timezone へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.country_city IS '国・都市';
COMMENT ON COLUMN public.com_t_trial_application.occupation IS '業種・職業のコード（正本は packages/types/trialApplication.ts の TRIAL_OCCUPATIONS）';
COMMENT ON COLUMN public.com_t_trial_application.occupation_other IS '業種・職業が「その他」の場合の記入内容';
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
-- 招待の所属は固定の顧客「Webトライアル」（web_trial_client_id()）。契約・ライセンスは本登録の時点で決める
-- （fn_resolve_web_trial_contract）。p_email は小文字にそろえて渡す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);

CREATE OR REPLACE FUNCTION public.fn_submit_trial_application(
    p_email text,
    p_user_name text,
    p_romaji_last_name text,
    p_romaji_first_name text,
    p_timezone text,
    p_country_city text,
    p_occupation smallint,
    p_occupation_other text,
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
            VALUES (v_email, p_user_name, '1', public.web_trial_client_id(), NULL, '{}', p_token, p_expires_at)
            RETURNING id INTO v_invitation_id;
            v_kind := 'new';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL AND v_inv.id IS NOT DISTINCT FROM v_app.invitation_id THEN
            UPDATE public.com_t_invitation
            SET user_name = p_user_name, token = p_token, expires_at = p_expires_at,
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
            SET user_name = p_user_name, user_type = '1', client_id = public.web_trial_client_id(), contract_id = NULL,
                roles = '{}', token = p_token, expires_at = p_expires_at, accepted_at = NULL,
                mail_sent_at = NULL, last_mail_error = NULL, invited_by = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'new';
            v_token := p_token;
        END IF;
    END IF;

    INSERT INTO public.com_t_trial_application AS a (
        email, user_name, romaji_last_name, romaji_first_name, timezone, country_city,
        occupation, occupation_other, message, invitation_id, user_id
    ) VALUES (
        v_email, p_user_name, p_romaji_last_name, p_romaji_first_name, p_timezone, NULLIF(p_country_city, ''),
        p_occupation, NULLIF(p_occupation_other, ''), NULLIF(p_message, ''), v_invitation_id, v_user_id
    )
    ON CONFLICT (email) DO UPDATE SET
        user_name = EXCLUDED.user_name,
        romaji_last_name = EXCLUDED.romaji_last_name,
        romaji_first_name = EXCLUDED.romaji_first_name,
        timezone = EXCLUDED.timezone,
        country_city = EXCLUDED.country_city,
        occupation = EXCLUDED.occupation,
        occupation_other = EXCLUDED.occupation_other,
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
           jsonb_build_object('application_id', v_application_id, 'applicant_name', p_user_name, 'kind', v_kind, 'apply_count', v_apply_count),
           '/trial-applications'
    FROM public.com_m_user u
    WHERE u.user_type = '0' AND u.delete_flg = '0'
    ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;

    RETURN QUERY SELECT v_kind, v_application_id, v_apply_count, v_token, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval) TO service_role;

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
CREATE OR REPLACE VIEW private.vw_trial_application_list
WITH (security_invoker = false) -- 定義者権限を維持
AS
SELECT
  a.application_id,
  a.email,
  a.user_name,
  a.romaji_last_name,
  a.romaji_first_name,
  a.timezone,
  a.country_city,
  a.occupation,
  a.occupation_other,
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
