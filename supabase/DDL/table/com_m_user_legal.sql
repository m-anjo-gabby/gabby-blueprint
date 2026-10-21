-- =========================================================================
-- com_m_user_legal: ユーザーの正式な情報（正式な氏名）
-- =========================================================================
-- 【役割】
-- com_m_user.user_name は画面に出す名前（ニックネーム）で、正式な氏名とは限らない。運営が作る書面
-- （コーチ向けの支払通知書・請求書、生徒向けのトレーニングレポート）に載せる正式な氏名を、生徒・コーチ共通で持つ
-- （com_m_user と1対1。行が無い＝未登録）。com_m_user は同じ契約の生徒同士や生徒からコーチの行が読めるため、
-- 個人情報として別のテーブルにしている。口座名義など、書面・支払いに使う正式な情報を持つ場合もここに追加する。
--
-- 【姓・名】
-- first / last は書く順番ではなく「名・姓」の意味（山田 太郎 → last_name = 山田、first_name = 太郎）。
--   last_name : 姓。姓の無い1語の名前の人のため任意
--   first_name: 名。ミドルネームを含める。必須
--   *_latin   : ローマ字の表記（任意。日本語の氏名の人を英語の書面に載せる場合に使う）
-- 書面での並べ方は packages/lib/userLegal/formatLegalName.ts の formatLegalName()（日本語: 姓 名、英語: 名 姓）。
--
-- 【書き込み・参照】
-- アドミンの「ユーザー管理 > 正式氏名」から登録・変更する（単一テーブルのため RPC にはしない）。
-- Webトライアルの申込者は、本登録時に申込（com_t_trial_application）の姓・名とローマ字から作る
-- （本人の申告のため updated_by は NULL。packages/lib/trial/registration.ts）。
-- 本人は自分の行を参照だけできる（変更は運営に依頼する）。書面はサーバー側で service_role を使って読む。
-- =========================================================================

-- @schema public.com_m_user_legal
CREATE TABLE public.com_m_user_legal (
    user_id                  uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    last_name                text,
    first_name               text         NOT NULL,
    last_name_latin          text,
    first_name_latin         text,
    updated_by               uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_legal_first_name CHECK (char_length(btrim(first_name)) >= 1 AND char_length(btrim(first_name)) <= 100),
    CONSTRAINT chk_user_legal_last_name CHECK (last_name IS NULL OR char_length(btrim(last_name)) >= 1 AND char_length(btrim(last_name)) <= 100),
    CONSTRAINT chk_user_legal_latin CHECK ((first_name_latin IS NULL OR char_length(btrim(first_name_latin)) >= 1 AND char_length(btrim(first_name_latin)) <= 100) AND (last_name_latin IS NULL OR char_length(btrim(last_name_latin)) >= 1 AND char_length(btrim(last_name_latin)) <= 100) AND (last_name_latin IS NULL OR first_name_latin IS NOT NULL))
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

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_user_legal FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_user_legal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user legal info" ON public.com_m_user_legal FOR ALL TO authenticated
USING (
    public.is_system_admin()
)
WITH CHECK (
    public.is_system_admin()
);

CREATE POLICY "Users can view their own legal info" ON public.com_m_user_legal FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
