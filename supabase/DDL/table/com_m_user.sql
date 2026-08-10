---------------------------------------------
-- DDL: com_m_user (ユーザ情報マスタ)
---------------------------------------------
CREATE TABLE public.com_m_user (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY, 
  user_id BIGSERIAL UNIQUE NOT NULL, 
  client_id uuid REFERENCES public.com_m_client(client_id),
  user_type text DEFAULT '1', -- デフォルトを '1' (生徒) 
  user_name text DEFAULT NULL,
  locale_id text DEFAULT 'ja',
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  login_failed_count integer not null default 0,
  locked_until timestamp with time zone null,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_user IS 'ユーザ情報マスタ';
COMMENT ON COLUMN public.com_m_user.id IS '認証システムID (UUID)';
COMMENT ON COLUMN public.com_m_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_m_user.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:コーチ';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）';
COMMENT ON COLUMN public.com_m_user.login_failed_count IS 'ログイン連続失敗回数';
COMMENT ON COLUMN public.com_m_user.locked_until IS 'アカウントロックアウト終了日時';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view themselves and colleagues" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can view themselves and colleagues." ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data." ON public.com_m_user;

CREATE POLICY "Users can view themselves and colleagues" ON public.com_m_user
FOR SELECT TO authenticated USING (
    id = auth.uid() 
    OR 
    client_id = public.get_jwt_client_id()
);

CREATE POLICY "Users can update their own data" ON public.com_m_user
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

---------------------------------------------
-- 追加パッチ: プロフィールアイコン対応 (2026-07-31)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 保存先: Storage "profile" バケット / パス例: profile/{user_id}/icon/{uuid}.png
---------------------------------------------
ALTER TABLE public.com_m_user
  ADD COLUMN IF NOT EXISTS icon_path text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_user.icon_path IS 'プロフィールアイコン画像のStorageパス（profileバケット内、例: profile/{user_id}/icon/xxxx.png）';

---------------------------------------------
-- 追加パッチ: タイムゾーンマスタ整合性対応 (2026-07-31)
-- 前提: table/com_m_timezone.sql の作成 および DML/com_m_timezone.sql の登録が完了していること。
-- （既存の timezone 値が全てマスタに存在しないと、このALTER文はエラーになります）
---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_com_m_user_timezone'
  ) THEN
    ALTER TABLE public.com_m_user
      ADD CONSTRAINT fk_com_m_user_timezone FOREIGN KEY (timezone)
      REFERENCES public.com_m_timezone(timezone);
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_com_m_user_timezone ON public.com_m_user IS 'ユーザーのタイムゾーンはcom_m_timezoneマスタに存在する値のみ許容する';

---------------------------------------------
-- 追加パッチ: 権限昇格防止 - 列単位UPDATE権限の制限 (2026-08-06)
-- 既存環境に対しては、このSQLをSupabase SQL Editor等で実行してください。
--
-- 【背景】
-- 上記の "Users can update their own data" ポリシーは「自分の行であること」
-- (id = auth.uid()) しか検証しておらず、「どの列を変更してよいか」を制限していない。
-- そのため authenticated ロールの誰でも、Supabase Clientから直接
--   supabase.from('com_m_user').update({ user_type: '0' }).eq('id', myId)
-- のようなリクエストを送ることで、自分自身を管理者(user_type='0')に昇格させたり、
-- client_id(テナント)を書き換えたり、login_failed_count/locked_untilを操作して
-- 自身のロックアウトを解除したりできてしまう状態だった
-- （user_type/client_id の変更は sync_user_app_metadata トリガー経由で
--   即座に auth.users.raw_app_meta_data に反映され、権限が有効化される）。
--
-- 【対応】
-- 自己サービスで実際に更新されているのは timezone / icon_path / update_date のみ
-- （@gabby/lib/profile 配下の各Coreアクションを参照）。それ以外の列
-- (user_type, client_id, user_name, delete_flg, login_failed_count, locked_until 等)は
-- 常に service_role(RLSをバイパスする管理者操作)経由でのみ更新されているため、
-- authenticated ロールのUPDATE権限をこの3列に列単位で制限する。
---------------------------------------------
REVOKE UPDATE ON public.com_m_user FROM authenticated, anon;
GRANT UPDATE (timezone, icon_path, update_date) ON public.com_m_user TO authenticated;
