---------------------------------------------
-- DDL: com_m_user_legal (ユーザーの正式な情報) (2026-10-13 追加)
-- 前提: table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_user.user_name は画面に出す名前（ニックネーム）で、正式な氏名とは限らない。
-- 運営が作る書面（コーチ向けの支払通知書・請求書、生徒向けのトレーニングレポート）に載せる
-- 正式な氏名を、生徒・コーチ共通で持つ（com_m_user と1対1。行が無い＝未登録）。
-- 書面・管理でのみ使う個人情報のため com_m_user とは別のテーブルにする（com_m_user は同じ契約の
-- 生徒同士や、生徒からコーチの行が読めるため）。口座名義など、書面・支払いに使う正式な情報を
-- 今後持つ場合もこのテーブルに追加する。
--
-- 【姓・名の定義】
-- first / last は「書く順番」ではなく「名・姓」の意味で持つ（山田 太郎 → last_name = 山田、first_name = 太郎）。
--   last_name : 姓（family name）。姓の無い1語の名前の人のため任意
--   first_name: 名（given name）。ミドルネームはここに含める。必須
--   *_latin   : ローマ字の表記（任意。日本語の氏名の人が英語の書面に載せる場合に使う）
-- 書面への表示は packages/lib/userLegal/formatLegalName.ts の formatLegalName() で並べる
-- （日本語: 「姓 名」、英語: 「名 姓」）。
--
-- 【更新経路】
-- アドミンの「ユーザー管理 > 正式氏名」から登録・変更する（単一テーブルの更新のためRPCにはしない）。
-- 書面の作成はサーバー側で service_role 経由で読む（コーチの支払通知書のように本人の画面から作る場合も同じ）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_user_legal (
    user_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    last_name text,
    first_name text NOT NULL,
    last_name_latin text,
    first_name_latin text,
    updated_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_legal_first_name CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
    CONSTRAINT chk_user_legal_last_name CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 100),
    CONSTRAINT chk_user_legal_latin CHECK (
        (first_name_latin IS NULL OR char_length(btrim(first_name_latin)) BETWEEN 1 AND 100)
        AND (last_name_latin IS NULL OR char_length(btrim(last_name_latin)) BETWEEN 1 AND 100)
        AND (last_name_latin IS NULL OR first_name_latin IS NOT NULL)
    )
);

COMMENT ON TABLE public.com_m_user_legal IS 'ユーザーの正式な情報（書面に載せる正式な氏名等。生徒・コーチ共通、com_m_userと1対1。アドミンが登録）';
COMMENT ON COLUMN public.com_m_user_legal.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_user_legal.last_name IS '姓（family name。書く順番ではなく意味で持つ。姓の無い名前の人はNULL）';
COMMENT ON COLUMN public.com_m_user_legal.first_name IS '名（given name。ミドルネームを含む）';
COMMENT ON COLUMN public.com_m_user_legal.last_name_latin IS '姓のローマ字表記（任意）';
COMMENT ON COLUMN public.com_m_user_legal.first_name_latin IS '名のローマ字表記（任意。姓のローマ字表記を入れる場合は必須）';
COMMENT ON COLUMN public.com_m_user_legal.updated_by IS '最後に登録・変更したアドミン (com_m_user.id)';
COMMENT ON COLUMN public.com_m_user_legal.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user_legal.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_user_legal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage user legal info" ON public.com_m_user_legal;
DROP POLICY IF EXISTS "Users can view their own legal info" ON public.com_m_user_legal;

-- [参照・登録・変更・削除] アドミンのみ
CREATE POLICY "Admins can manage user legal info" ON public.com_m_user_legal
FOR ALL TO authenticated
USING (COALESCE(public.get_jwt_user_type(), '') = '0')
WITH CHECK (COALESCE(public.get_jwt_user_type(), '') = '0');

-- [参照] 本人は自分の行だけ読める（変更は運営に依頼する）
CREATE POLICY "Users can view their own legal info" ON public.com_m_user_legal
FOR SELECT TO authenticated USING (user_id = auth.uid());
