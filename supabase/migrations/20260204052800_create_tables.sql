---------------------------------------------
-- DDL: com_m_client (顧客マスタ)
---------------------------------------------
CREATE TABLE public.com_m_client (
  client_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_type SMALLINT NOT NULL DEFAULT 1, -- 0: 初期テナント 1:法人, 2:個人
  industry_type SMALLINT NOT NULL DEFAULT 1, -- 業界種別（Pharma, Semi, etc.）
  logo_url TEXT, -- ブランドロゴのURL
  dashboard_title TEXT, -- 「Blueprint English for 〇〇」の〇〇部分
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_client IS '顧客情報マスタ';
COMMENT ON COLUMN public.com_m_client.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_client.client_name IS '顧客名称（企業名・団体名）';
COMMENT ON COLUMN public.com_m_client.client_type IS '顧客種別 0: 初期テナント 1:法人, 2:個人';
COMMENT ON COLUMN public.com_m_client.industry_type IS '業界区分';
COMMENT ON COLUMN public.com_m_client.logo_url IS 'ブランドロゴURL';
COMMENT ON COLUMN public.com_m_client.dashboard_title IS 'ダッシュボードタイトル';
COMMENT ON COLUMN public.com_m_client.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_client.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_client.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_user テーブルの作成
---------------------------------------------
CREATE TABLE public.com_m_user (
  -- 1. 主キーと認証の連携: 必須のUUID型
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY, 
  -- 2. システム採番ID (BIGSERIALで自動採番)
  user_id BIGSERIAL UNIQUE NOT NULL, 
  client_id uuid REFERENCES public.com_m_client(client_id),
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
COMMENT ON COLUMN public.com_m_user.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.area_cd IS '地域コード';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.agree_date IS '利用規約同意日付';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_corpus (コーパス管理マスタ)
---------------------------------------------
CREATE TABLE public.com_m_corpus (
  corpus_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus_name TEXT NOT NULL,
  corpus_type SMALLINT NOT NULL DEFAULT 1,
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
COMMENT ON COLUMN public.com_m_corpus.corpus_type IS 'コーパス種別 0:共通, 1:クライアント限定';
COMMENT ON COLUMN public.com_m_corpus.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_corpus.description IS 'コーパス説明・解析根拠';
COMMENT ON COLUMN public.com_m_corpus.corpus_label IS 'コーパスラベル';
COMMENT ON COLUMN public.com_m_corpus.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_corpus.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_corpus.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_corpus_access (コーパスアクセス制御マスタ)
---------------------------------------------
CREATE TABLE public.com_m_corpus_access (
  access_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
  corpus_id uuid REFERENCES public.com_m_corpus(corpus_id) NOT NULL,
  notes TEXT, -- 「2026年キャンペーンで付与」などのメモ
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- 同じ顧客に同じコーパスを二重登録させない
  UNIQUE(client_id, corpus_id)
);

COMMENT ON TABLE public.com_m_corpus_access IS 'コーパスアクセス制御マスタ';
COMMENT ON COLUMN public.com_m_corpus_access.access_id IS 'アクセスID';
COMMENT ON COLUMN public.com_m_corpus_access.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_corpus_access.corpus_id IS 'コーパスID';
COMMENT ON COLUMN public.com_m_corpus_access.notes IS 'メモ';
COMMENT ON COLUMN public.com_m_corpus_access.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_corpus_access.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_corpus_access.update_date IS '更新日時';

-- 検索パフォーマンス向上のためのインデックス
CREATE INDEX idx_corpus_access_client ON public.com_m_corpus_access(client_id);

---------------------------------------------
-- DDL: com_m_word (コーパス単語マスタ)
---------------------------------------------
CREATE TABLE public.com_m_word (
  word_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus_id uuid REFERENCES public.com_m_corpus(corpus_id) ON DELETE CASCADE,
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
  phrase_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid REFERENCES public.com_m_word(word_id) ON DELETE CASCADE,
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

---------------------------------------------
-- DDL: com_t_favorite_phrase (お気に入りフレーズ)
---------------------------------------------
CREATE TABLE public.com_t_favorite_phrase (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  phrase_id uuid NOT NULL REFERENCES public.com_m_phrase(phrase_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- 同じユーザーが同じフレーズを二重登録できないように制約
  UNIQUE(user_id, phrase_id)
);

COMMENT ON TABLE public.com_t_favorite_phrase IS 'お気に入りフレーズ';
COMMENT ON COLUMN public.com_t_favorite_phrase.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_phrase.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_t_favorite_phrase.insert_date IS '登録日時';