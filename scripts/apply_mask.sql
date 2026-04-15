-- 文字コードをUTF8に指定（念のため）
SET client_encoding = 'UTF8';

DO $$ 
BEGIN
    -- 一般ユーザーのメールをダミー化
    UPDATE auth.users 
    SET email = 'test_' || substring(id::text, 1, 8) || '@example.com'
    WHERE (raw_app_meta_data->>'role' IS NULL OR raw_app_meta_data->>'role' != 'admin');

    -- 一般ユーザーの氏名をダミー化
    UPDATE public.com_m_user
    SET user_name = 'test_' || substring(com_m_user.id::text, 1, 4)
    FROM auth.users a
    WHERE public.com_m_user.id = a.id
      AND (a.raw_app_meta_data->>'role' IS NULL OR a.raw_app_meta_data->>'role' != 'admin');

    -- 必要があればアナライズ
    -- ANALYZE;
END $$;