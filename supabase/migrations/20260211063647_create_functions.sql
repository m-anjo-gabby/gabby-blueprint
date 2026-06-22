---------------------------------------------
-- サインアップ連動トリガー
---------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- userメタデータから値を取得
    param_client_id uuid := (new.raw_user_meta_data->>'client_id')::uuid;
    param_user_name text := new.raw_user_meta_data->>'user_name';
    param_user_type text := new.raw_user_meta_data->>'user_type';
    param_timezone  text := new.raw_user_meta_data->>'timezone';
    target_client_id uuid;
BEGIN
    -- 1. 優先順位に基づいた client_id の解決
    IF param_client_id IS NOT NULL THEN
        target_client_id := param_client_id;
    ELSE
        -- クライアントID未指定時は初期テナントを設定
        SELECT client_id INTO target_client_id FROM public.com_m_client WHERE client_type = 0 LIMIT 1;
    END IF;

    -- 2. ユーザマスタ登録
    INSERT INTO public.com_m_user (
        id, 
        client_id, 
        timezone, 
        user_type, 
        user_name
    ) 
    VALUES (
        new.id, 
        target_client_id, 
        COALESCE(param_timezone, 'Asia/Tokyo'), 
        COALESCE(param_user_type, '1'), -- 未指定時はデフォルトで '1' (生徒)
        param_user_name
    );

    -- 3. ユーザースプリント進捗マスタの初期レコード作成
    -- ユーザタイプが '1'、または未指定（デフォルトで生徒扱いになる）場合のみ実行
    IF param_user_type = '1' OR param_user_type IS NULL THEN
        INSERT INTO public.student_m_sprint_progress (user_id)
        VALUES (new.id);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- トリガーの再登録用に一旦削除してクリーンに作成
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- API(RPC)経由での不正実行を完全に防御（トリガーからは問題なく起動します）
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- app_metadata 統合同期ファンクション
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_app_metadata()
RETURNS TRIGGER AS $$
DECLARE
    v_roles text[];
    v_user_type text;
    v_client_id uuid;
    v_target_id uuid;
    v_data jsonb;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_data := to_jsonb(OLD);
    ELSE
        v_data := to_jsonb(NEW);
    END IF;

    v_target_id := COALESCE(
        (v_data->>'id')::uuid, 
        (v_data->>'user_id')::uuid
    );

    IF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'com_m_user') THEN
        RETURN OLD;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_id) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT user_type, client_id INTO v_user_type, v_client_id 
    FROM public.com_m_user WHERE id = v_target_id;

    SELECT array_agg(role_id) INTO v_roles 
    FROM public.com_t_user_role WHERE user_id = v_target_id;

    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
            'client_id', v_client_id,
            'user_type', v_user_type,
            'roles', COALESCE(v_roles, '{}'::text[])
        )
    WHERE id = v_target_id;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
-- SECURITY DEFINER 警告への対策: search_path の固定
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- トリガーのバインド
DROP TRIGGER IF EXISTS trg_sync_app_meta_m_user ON public.com_m_user;
CREATE TRIGGER trg_sync_app_meta_m_user
    AFTER INSERT OR UPDATE OF client_id, user_type ON public.com_m_user
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

DROP TRIGGER IF EXISTS trg_sync_app_meta_roles ON public.com_t_user_role;
CREATE TRIGGER trg_sync_app_meta_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_role
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

-- API(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_user_app_metadata() FROM PUBLIC, anon, authenticated;


---------------------------------------------
-- JWTから client_id を安全に取り出すヘルパー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_jwt_client_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'client_id', '')::uuid;
-- 行レベルセキュリティ、ビューの参照をセキュアにするための設定
$$ LANGUAGE sql STABLE SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.get_jwt_client_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jwt_client_id() TO authenticated;


---------------------------------------------
-- 有効ライセンス情報のメタデータ同期
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_license_metadata()
RETURNS TRIGGER AS $$
DECLARE
    is_licensed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.com_t_user_license
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
          AND status = 1
          AND end_date >= NOW()
    ) INTO is_licensed;

    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object('is_licensed', is_licensed)
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    RETURN NULL;
END;
-- SECURITY DEFINER 警告への対策: search_path の固定
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_license_change ON public.com_t_user_license;
CREATE TRIGGER on_license_change
AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_license
FOR EACH ROW EXECUTE PROCEDURE public.sync_user_license_metadata();

-- API(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_user_license_metadata() FROM PUBLIC, anon, authenticated;


---------------------------------------------
-- JWTから user_type を安全に取り出すヘルパー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_jwt_user_type()
RETURNS text AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'user_type', '');
$$ LANGUAGE sql STABLE SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.get_jwt_user_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jwt_user_type() TO authenticated;


---------------------------------------------
-- 警告にあったrls_auto_enable の防御措置
---------------------------------------------
-- もしデータベース内に実体が存在する場合、外部からの RPC 実行を安全に遮断します。
-- (不要であれば DROP FUNCTION IF EXISTS public.rls_auto_enable(); で削除しても構いません)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
        ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
    END IF;
END $$;

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
      AND u.delete_flg = '0'
    LIMIT 1;
END;
$$;

-- 1. 安全のため、一度すべてのデフォルト権限をリセット（剥奪）する
REVOKE EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) FROM PUBLIC, anon, authenticated;

-- 一般ロール(anon, authenticated)への再付与をやめ、管理用サービスロール(service_role)のみに限定
-- これにより、外部API(/rest/v1/rpc)経由での一般ブラウザからの不正な直接実行を100%遮断し、警告を解消します。
GRANT EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) TO service_role;


---------------------------------------------
-- ユーザーログイン失敗カウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_login_failed_count(p_user_id UUID, p_max_attempts INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- 未ログイン状態からでも安全にマスタを更新できます
SET search_path = public
AS $$
DECLARE
    v_current_count INT;
    v_lockout_until TIMESTAMP WITH TIME ZONE := NULL;
BEGIN
    -- 現在の失敗回数を取得
    SELECT login_failed_count INTO v_current_count FROM public.com_m_user WHERE id = p_user_id;
    
    -- カウントを1増やす
    v_current_count := COALESCE(v_current_count, 0) + 1;
    
    -- 設定された上限回数を超えたら30分ロック
    IF v_current_count >= p_max_attempts THEN
        v_lockout_until := clock_timestamp() + INTERVAL '30 minutes';
    END IF;

    -- マスタを更新
    UPDATE public.com_m_user
    SET 
        login_failed_count = v_current_count,
        locked_until = v_lockout_until,
        update_date = clock_timestamp()
    WHERE id = p_user_id;
END;
$$;

-- 安全のため、一度すべてのデフォルト権限をリセット（剥奪）する
REVOKE EXECUTE ON FUNCTION public.increment_login_failed_count(UUID, INT) FROM PUBLIC, anon, authenticated;

-- 未ログイン画面の裏で動くNext.jsサーバー(Server Action)から、AdminClient(service_role)を用いて叩く運用に統一
-- anon への直接公開を停止し、service_role のみに絞ることで安全性を引き上げ、警告を解消します。
GRANT EXECUTE ON FUNCTION public.increment_login_failed_count(UUID, INT) TO service_role;

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
  WHERE id = v_user_id AND delete_flg = '0';

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC = 誰でも実行可能）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) TO authenticated;

---------------------------------------------
-- 1. ユーザーリスト関数（セキュリティ修正版）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_user_list(
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF private.vw_user_list
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
    SELECT v.*
    FROM private.vw_user_list v
    WHERE v.client_id = _client_id
      AND v.user_type ~ '1'
      AND (
        v.user_id IS NULL -- 招待中
        OR
        (
          v.license_state = 'active'
          -- 💡 デモユーザーはどんな時でも絶対に含めない
          AND NOT EXISTS (
            SELECT 1 FROM public.com_t_user_role r 
            WHERE r.user_id = v.id AND r.role_id = 'demo_user'
          )
          -- 💡 モニターロールの切り替えロジック
          AND (
            _include_monitor = TRUE -- ONならモニターロールの人も通過させる
            OR
            NOT EXISTS ( -- OFFならモニターロールの人も弾く（通常表示）
              SELECT 1 FROM public.com_t_user_role r 
              WHERE r.user_id = v.id AND r.role_id = 'monitor'
            )
          )
        )
      )
    ORDER BY v.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_user_list(BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_user_list(BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_user_list(BOOLEAN) TO authenticated;


---------------------------------------------
-- 2. ドリル履歴関数（セキュリティ修正版）
---------------------------------------------
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
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
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
    INNER JOIN public.com_m_user u ON u.id = w.user_id
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE u.client_id = _client_id
      AND w.training_date BETWEEN _start_date AND _end_date
      AND (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR w.user_id = ANY(_user_ids))
      -- 💡 デモユーザーの履歴は常に100%遮断
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターの履歴切り替え
      AND (
        _include_monitor = TRUE
        OR
        NOT EXISTS (
          SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
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
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_history(
    _start_date TIMESTAMP WITH TIME ZONE,
    _end_date TIMESTAMP WITH TIME ZONE,
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
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'question_type', s.question_type,
        'answer_type', s.answer_type,
        'difficulty_level', s.difficulty_level,
        'time_limit_sec', s.time_limit_sec,
        'total_answered', s.total_answered,
        'insert_date', s.insert_date,
        'user_name', u.user_name
    )
    FROM public.self_t_sprint s
    INNER JOIN public.com_m_user u ON u.id = s.user_id
    WHERE u.client_id = _client_id
      AND s.insert_date BETWEEN _start_date AND _end_date
      AND (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR s.user_id = ANY(_user_ids))
      -- 💡 デモユーザーの履歴は常に100%遮断
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターの履歴切り替え
      AND (
        _include_monitor = TRUE
        OR
        NOT EXISTS (
          SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) TO authenticated;

---------------------------------------------
-- スプリントドリル日次サマリーカウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_sprint_summary(
  p_content_id UUID,
  p_question_count INT,
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
  WHERE id = v_user_id AND delete_flg = '0';

  -- 2. ユーザーのタイムゾーン基準で現在日付を切り出す
  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  -- 3. スプリントサマリーテーブルへUpsert
  INSERT INTO public.self_t_sprint_summary (
    user_id, 
    content_id, 
    training_date, 
    question_count, 
    assessment_count
  )
  VALUES (
    v_user_id, 
    p_content_id, 
    v_local_today, 
    p_question_count, 
    p_assessment_count
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET 
    question_count = self_t_sprint_summary.question_count + p_question_count,
    assessment_count = self_t_sprint_summary.assessment_count + p_assessment_count,
    update_date = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC / anon）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT) TO authenticated;