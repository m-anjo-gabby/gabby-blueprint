-- 文字コードをUTF8に指定（念のため）
SET client_encoding = 'UTF8';

DO $$ 
BEGIN
    -----------------------------------------------------------------
    -- 1. 一般ユーザー（com_m_user & auth.users）の連動ダミー化
    -----------------------------------------------------------------
    -- 【解説】
    -- com_m_user の user_type が '0' (管理者) 以外のレコードを対象にマスクします。
    -- 先に氏名を連番化（Test000001形式）し、その後 auth.users のメールアドレスも完全に連動させます。

    -- 先に public.com_m_user の氏名を連番化 (user_type = '0' を除外)
    UPDATE public.com_m_user
    SET user_name = 'Test' || lpad(com_m_user.user_id::text, 6, '0')
    WHERE com_m_user.user_type IS NULL OR com_m_user.user_type != '0';

    -- 次に auth.users のメールアドレスを、上記 com_m_user の連番・条件と完全に一致させてダミー化
    UPDATE auth.users 
    SET email = 'Test' || lpad(u.user_id::text, 6, '0') || '@example.com'
    FROM public.com_m_user u
    WHERE auth.users.id = u.id
      AND (u.user_type IS NULL OR u.user_type != '0');


    -----------------------------------------------------------------
    -- 2. 招待テーブル（public.com_t_invitation）のマスク処理
    -----------------------------------------------------------------
    -- 【解説】
    -- 招待テーブルも同様に user_type = '0' (管理者) 以外のレコードのみをマスク対象とします。
    -- UNIQUE制約（重複不可）を維持するため、UUIDの先頭8文字を抽出して一意なダミーデータを生成します。

    UPDATE public.com_t_invitation
    SET 
        email = 'invite_' || substring(id::text, 1, 8) || '@example.com',
        user_name = 'Invite_' || substring(id::text, 1, 8)
    WHERE user_type IS NULL OR user_type != '0';


    -- 必要があればアナライズ
    -- ANALYZE;
END $$;