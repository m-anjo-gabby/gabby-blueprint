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

    -- 4. コーチ公開プロフィールマスタの初期レコード作成
    -- ユーザタイプが '2' (コーチ) の場合のみ実行
    IF param_user_type = '2' THEN
        INSERT INTO public.com_m_coach_profile (user_id)
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
