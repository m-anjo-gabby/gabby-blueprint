---------------------------------------------
-- DDL: com_m_user テーブルの作成
---------------------------------------------
CREATE TABLE public.com_m_user (
  -- 1. 主キーと認証の連携: 必須のUUID型
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY, 
  -- 2. システム採番ID (BIGSERIALで自動採番)
  user_id BIGSERIAL UNIQUE NOT NULL, 
  user_type text DEFAULT '1', -- デフォルトを '1' (生徒) 
  user_name text DEFAULT NULL,
  area_cd text NOT NULL DEFAULT '00',
  locale_id text DEFAULT 'ja',
  agree_date timestamp with time zone NULL, 
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

-- テーブル名にコメントを設定
COMMENT ON TABLE public.com_m_user IS 'ユーザ情報マスタ';

-- カラム名にコメントを設定
COMMENT ON COLUMN public.com_m_user.id IS '認証システムID (UUID)';
COMMENT ON COLUMN public.com_m_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.area_cd IS '地域コード';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.agree_date IS '利用規約同意日付';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

-- RLSの有効化
ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

-- ユーザー自身のみが自分のデータにアクセスできるポリシー
CREATE POLICY "Users can view and update their own com_m_user."
  ON public.com_m_user FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

---
-- サインアップ連動トリガー
---

-- ユーザー作成時に必須カラムを初期化してユーザマスタを作成する
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_user_id BIGINT;
BEGIN
    -- 1. 必須カラムの初期値を挿入（user_idは自動採番）
    INSERT INTO public.com_m_user (id, area_cd)
    VALUES (new.id, '00')
    RETURNING user_id INTO new_user_id; -- 採番されたuser_idを取得
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

---------------------------------------------
-- DDL: com_m_client (顧客マスタ)
---------------------------------------------
CREATE TABLE public.com_m_client (
  client_id BIGSERIAL PRIMARY KEY NOT NULL,
  client_name TEXT NOT NULL,
  industry_type SMALLINT NOT NULL DEFAULT 1, -- 業界種別（Pharma, Semi, etc.）
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_client IS '顧客情報マスタ';
COMMENT ON COLUMN public.com_m_client.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_client.client_name IS '顧客名称（企業名・団体名）';
COMMENT ON COLUMN public.com_m_client.industry_type IS '業界区分';
COMMENT ON COLUMN public.com_m_client.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_client.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_client.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_corpus (コーパス管理マスタ)
---------------------------------------------
CREATE TABLE public.com_m_corpus (
  corpus_id BIGSERIAL PRIMARY KEY NOT NULL,
  corpus_name TEXT NOT NULL,
  client_id BIGINT REFERENCES public.com_m_client(client_id),
  seq_no SMALLINT NOT NULL DEFAULT 1,
  description TEXT,
  corpus_label TEXT NOT NULL,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_corpus IS 'コーパス管理マスタ';
COMMENT ON COLUMN public.com_m_corpus.corpus_id IS 'コーパスID';
COMMENT ON COLUMN public.com_m_corpus.corpus_name IS 'コーパス名称';
COMMENT ON COLUMN public.com_m_corpus.client_id IS '関連顧客ID';
COMMENT ON COLUMN public.com_m_corpus.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_corpus.description IS 'コーパス説明・解析根拠';
COMMENT ON COLUMN public.com_m_corpus.corpus_label IS 'コーパスラベル';
COMMENT ON COLUMN public.com_m_corpus.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_corpus.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_corpus.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_word (コーパス単語マスタ)
---------------------------------------------
CREATE TABLE public.com_m_word (
  word_id BIGSERIAL PRIMARY KEY NOT NULL,
  corpus_id BIGINT REFERENCES public.com_m_corpus(corpus_id) ON DELETE CASCADE,
  word_en TEXT NOT NULL,
  word_ja TEXT NOT NULL,
  frequency_rank INT,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_word IS 'コーパス単語マスタ';
COMMENT ON COLUMN public.com_m_word.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_word.corpus_id IS 'コーパスID';
COMMENT ON COLUMN public.com_m_word.word_en IS '単語（英語表記）';
COMMENT ON COLUMN public.com_m_word.word_ja IS '単語（日本語表記）';
COMMENT ON COLUMN public.com_m_word.frequency_rank IS '解析時の出現頻度順位';
COMMENT ON COLUMN public.com_m_word.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_word.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_word.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_phrase (出題例文マスタ)
---------------------------------------------
CREATE TABLE public.com_m_phrase (
  phrase_id BIGSERIAL PRIMARY KEY NOT NULL,
  word_id BIGINT REFERENCES public.com_m_word(word_id) ON DELETE CASCADE,
  seq_no SMALLINT NOT NULL DEFAULT 1,
  phrase_type SMALLINT NOT NULL,
  phrase_en TEXT NOT NULL,
  phrase_ja TEXT NOT NULL,
  section_id TEXT, 
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_phrase IS '出題例文マスタ';
COMMENT ON COLUMN public.com_m_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_m_phrase.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_phrase.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_phrase.phrase_type IS 'フレーズ種別（1: S+V 2: Adding 3: Strategic Solution 4: PAST 5: PRESENT PERFECT）';
COMMENT ON COLUMN public.com_m_phrase.phrase_en IS 'フレーズ（英語表記）';
COMMENT ON COLUMN public.com_m_phrase.phrase_ja IS 'フレーズ（日本語表記）';
COMMENT ON COLUMN public.com_m_phrase.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_phrase.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_phrase.update_date IS '更新日時';
