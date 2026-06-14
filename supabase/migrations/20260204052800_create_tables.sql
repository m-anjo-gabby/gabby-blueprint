---------------------------------------------
-- DDL: com_m_client (顧客マスタ)
---------------------------------------------
CREATE TABLE public.com_m_client (
  client_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_type SMALLINT NOT NULL DEFAULT 1, -- 0: 初期テナント 1:法人, 2:個人
  industry_type SMALLINT NOT NULL DEFAULT 1, -- 業界種別（Pharma, Semi, etc.）
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_client IS '顧客情報マスタ';
COMMENT ON COLUMN public.com_m_client.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_client.client_name IS '顧客名称（企業名・団体名）';
COMMENT ON COLUMN public.com_m_client.client_type IS '顧客種別 0: 初期テナント 1:法人, 2:個人';
COMMENT ON COLUMN public.com_m_client.industry_type IS '業界区分';
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
  locale_id text DEFAULT 'ja',
  timezone text NOT NULL DEFAULT 'Asia/Tokyo'
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
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）';
COMMENT ON COLUMN public.com_m_user.login_failed_count IS 'ログイン連続失敗回数';
COMMENT ON COLUMN public.com_m_user.locked_until IS 'アカウントロックアウト終了日時';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_role (ロールマスタ)
---------------------------------------------
CREATE TABLE public.com_m_role (
  role_id TEXT PRIMARY KEY, -- 'admin', 'content_manager'
  role_name TEXT NOT NULL,
  target_user_type TEXT DEFAULT '0',
  seq_no SMALLINT NOT NULL DEFAULT 1,
  delete_flg TEXT NOT NULL DEFAULT '0'
);

-- テーブル名にコメントを設定
COMMENT ON TABLE public.com_m_role IS 'ロールマスタ';

-- カラム名にコメントを設定
COMMENT ON COLUMN public.com_m_role.role_id IS 'ロールID';
COMMENT ON COLUMN public.com_m_role.role_name IS 'ロール名';
COMMENT ON COLUMN public.com_m_role.target_user_type IS '対象ユーザー種別 (0:管理者, 1:生徒';
COMMENT ON COLUMN public.com_m_role.seq_no IS 'SEQ';
COMMENT ON COLUMN public.com_m_role.delete_flg IS '削除フラグ';

---------------------------------------------
-- DDL: com_t_user_role (ユーザロール紐付け情報)
---------------------------------------------
CREATE TABLE public.com_t_user_role (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES public.com_m_role(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- テーブル名にコメントを設定
COMMENT ON TABLE public.com_t_user_role IS 'ユーザロール紐付け情報';

-- カラム名にコメントを設定
COMMENT ON COLUMN public.com_t_user_role.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_role.role_id IS 'ロールID';

---------------------------------------------
-- COM_M_CONTRACT (契約マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contract (
    contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
    plan_name TEXT NOT NULL,          -- 'Standard', 'Premium' 等
    max_licenses INTEGER NOT NULL,    -- 契約ライセンス上限数
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status SMALLINT DEFAULT 1,        -- 1: 有効, 0: 無効, 9: 解約
    note TEXT DEFAULT NULL,           -- アドミン用管理メモ
    insert_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contract IS '契約情報マスタ';
COMMENT ON COLUMN public.com_m_contract.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_m_contract.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用）';
COMMENT ON COLUMN public.com_m_contract.max_licenses IS 'この契約で発行可能な最大ユーザー数';
COMMENT ON COLUMN public.com_m_contract.start_date IS '開始日';
COMMENT ON COLUMN public.com_m_contract.end_date IS '終了日';
COMMENT ON COLUMN public.com_m_contract.status IS 'ステータス 1: 有効, 0: 無効, 9: 解約';
COMMENT ON COLUMN public.com_m_contract.note IS '運用管理者用のメモ';
COMMENT ON COLUMN public.com_m_contract.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract.update_date IS '更新日時';

-- 顧客単位での契約検索を高速化
CREATE INDEX idx_contract_client_id ON public.com_m_contract (client_id, status);

---------------------------------------------
-- DDL: com_t_invitation テーブルの作成
---------------------------------------------
CREATE TABLE public.com_t_invitation (
  -- 1. 主キー（仮のユーザーIDとしても機能するUUID）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 2. 招待対象の基本属性
  email TEXT NOT NULL UNIQUE,
  user_name TEXT DEFAULT NULL,
  user_type TEXT NOT NULL DEFAULT '1', -- 0:管理者 1:生徒 2:モニター
  client_id UUID REFERENCES public.com_m_client(client_id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.com_m_contract(contract_id) ON DELETE SET NULL,
  
  -- 3. ロール割当情報 (複数ロールを保持するため TEXT配列型 [TEXT[]] で管理)
  roles TEXT[] DEFAULT '{}'::TEXT[],

  -- 4. 招待トークンとセキュリティ管理
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  
  mail_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  last_mail_error TEXT DEFAULT NULL,
  
  -- 5. 監査用カラム
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 招待した管理者のAuth.UUID
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- テーブル・カラムコメントの設定
COMMENT ON TABLE public.com_t_invitation IS 'ユーザー招待管理テーブル';
COMMENT ON COLUMN public.com_t_invitation.id IS '招待ID（仮ユーザーID）';
COMMENT ON COLUMN public.com_t_invitation.email IS '招待メールアドレス';
COMMENT ON COLUMN public.com_t_invitation.user_name IS '招待ユーザー名称';
COMMENT ON COLUMN public.com_t_invitation.user_type IS 'ユーザータイプ 0:管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_t_invitation.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_t_invitation.contract_id IS '紐付けるライセンス契約ID';
COMMENT ON COLUMN public.com_t_invitation.roles IS '付与するロールID配列';
COMMENT ON COLUMN public.com_t_invitation.token IS 'セキュアな招待用トークン';
COMMENT ON COLUMN public.com_t_invitation.expires_at IS '招待リンク有効期限日時';
COMMENT ON COLUMN public.com_t_invitation.accepted_at IS 'ユーザー本登録完了日時';
COMMENT ON COLUMN public.com_t_invitation.mail_sent_at IS '最終メール送信日時';
COMMENT ON COLUMN public.com_t_invitation.last_mail_error IS '最終メール送信時のエラー内容';
COMMENT ON COLUMN public.com_t_invitation.invited_by IS '招待を発行した管理者UUID';

-- インデックス設計（検索・検証の高速化）
CREATE INDEX idx_invitation_token ON public.com_t_invitation(token);
CREATE INDEX idx_invitation_email ON public.com_t_invitation(email);

---------------------------------------------
-- COM_T_USER_LICENSE (ライセンス割当実体)
---------------------------------------------
CREATE TABLE public.com_t_user_license (
    license_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id uuid REFERENCES public.com_m_contract(contract_id) NOT NULL,
    user_id uuid REFERENCES public.com_m_user(id) NOT NULL,
    status SMALLINT NOT NULL DEFAULT 1, -- 1:有効, 0:停止, 9:満了
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT DEFAULT NULL,           -- 個別対応の理由等のメモ
    insert_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_contract UNIQUE(user_id, contract_id),
    CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES public.com_m_user(id)
);

COMMENT ON TABLE public.com_t_user_license IS 'ユーザーライセンス割当情報';
COMMENT ON COLUMN public.com_t_user_license.license_id IS 'ライセンスID';
COMMENT ON COLUMN public.com_t_user_license.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_t_user_license.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_license.status IS 'ステータス 1:有効, 0:停止';
COMMENT ON COLUMN public.com_t_user_license.start_date IS '開始日';
COMMENT ON COLUMN public.com_t_user_license.end_date IS '終了日';
COMMENT ON COLUMN public.com_t_user_license.note IS '個別対応時のメモ';
COMMENT ON COLUMN public.com_t_user_license.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_license.update_date IS '更新日時';

-- 認証・認可クエリの高速化
CREATE INDEX idx_user_license_auth ON public.com_t_user_license (user_id, status, start_date, end_date);
-- ビュー内での集計用インデックス
CREATE INDEX idx_license_contract_stats ON public.com_t_user_license (contract_id, status, start_date, end_date);

---------------------------------------------
-- DDL: com_m_contents (コンテンツ管理マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contents (
  content_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_name TEXT NOT NULL,
  content_type SMALLINT NOT NULL DEFAULT 1,
  content_scope SMALLINT NOT NULL DEFAULT 0,
  seq_no SMALLINT NOT NULL DEFAULT 1,
  difficulty_level SMALLINT NOT NULL DEFAULT 1,
  recommend SMALLINT NOT NULL DEFAULT 0,
  description TEXT,
  content_label TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contents IS 'コンテンツ管理マスタ';
COMMENT ON COLUMN public.com_m_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents.content_name IS 'コンテンツ名称';
COMMENT ON COLUMN public.com_m_contents.content_type IS 'コンテンツ種別 0:単語・フレーズ, 1:ビデオ, 2:Gabbyスプリント';
COMMENT ON COLUMN public.com_m_contents.content_scope IS 'コンテンツ公開範囲 0:共通, 1:クライアント限定';
COMMENT ON COLUMN public.com_m_contents.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_contents.difficulty_level IS '難易度';
COMMENT ON COLUMN public.com_m_contents.recommend IS 'おすすめ';
COMMENT ON COLUMN public.com_m_contents.description IS 'コンテンツ説明・解析根拠';
COMMENT ON COLUMN public.com_m_contents.content_label IS 'コンテンツラベル';
COMMENT ON COLUMN public.com_m_contents.metadata IS 'メタデータ（タグなど）';
COMMENT ON COLUMN public.com_m_contents.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_contents_access (コンテンツアクセス制御マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contents_access (
  access_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
  content_id uuid REFERENCES public.com_m_contents(content_id) NOT NULL,
  notes TEXT, -- 「2026年キャンペーンで付与」などのメモ
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- 同じ顧客に同じコンテンツを二重登録させない
  UNIQUE(client_id, content_id)
);

COMMENT ON TABLE public.com_m_contents_access IS 'コンテンツアクセス制御マスタ';
COMMENT ON COLUMN public.com_m_contents_access.access_id IS 'アクセスID';
COMMENT ON COLUMN public.com_m_contents_access.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contents_access.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents_access.notes IS 'メモ';
COMMENT ON COLUMN public.com_m_contents_access.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents_access.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_access.update_date IS '更新日時';

-- 検索パフォーマンス向上のためのインデックス
CREATE INDEX idx_contents_access_client ON public.com_m_contents_access(client_id);

---------------------------------------------
-- DDL: com_m_contents_tag (コンテンツタグ管理マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contents_tag (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL, -- 'industry', 'scene', 'skill' 等
  seq_no SMALLINT NOT NULL DEFAULT 1,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contents_tag IS 'コンテンツタグ管理マスタ';
COMMENT ON COLUMN public.com_m_contents_tag.tag_id IS 'タグID（可読文字列）';
COMMENT ON COLUMN public.com_m_contents_tag.tag_name IS 'タグ表示名称';
COMMENT ON COLUMN public.com_m_contents_tag.tag_type IS 'タグ種別';
COMMENT ON COLUMN public.com_m_contents_tag.seq_no IS 'デフォルト表示順';
COMMENT ON COLUMN public.com_m_contents_tag.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents_tag.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_tag.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_t_contents_tag_rel (コンテンツタグリレーション管理マスタ)
---------------------------------------------
CREATE TABLE public.com_t_contents_tag_rel (
  content_id UUID REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.com_m_contents_tag(tag_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (content_id, tag_id)
);

COMMENT ON TABLE public.com_t_contents_tag_rel IS 'コンテンツタグリレーション管理マスタ';
COMMENT ON COLUMN public.com_t_contents_tag_rel.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.tag_id IS 'タグID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.insert_date IS '登録日時';

-- 検索パフォーマンス向上のためのインデックス
CREATE INDEX idx_tag_rel_content ON public.com_t_contents_tag_rel(content_id);
CREATE INDEX idx_tag_rel_tag ON public.com_t_contents_tag_rel(tag_id);

---------------------------------------------
-- DDL: com_m_word (単語マスタ)
---------------------------------------------
CREATE TABLE public.com_m_word (
  word_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  word_en TEXT NOT NULL,
  word_ja TEXT NOT NULL,
  frequency_rank INT,
  status TEXT NOT NULL DEFAULT 'live', -- 'live' (公開), 'pending' (非公開)
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Upsertの「競合判断」に使われます
  CONSTRAINT unique_content_word UNIQUE(content_id, word_en)
);

COMMENT ON TABLE public.com_m_word IS '単語マスタ';
COMMENT ON COLUMN public.com_m_word.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_word.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_word.word_en IS '単語（英語表記）';
COMMENT ON COLUMN public.com_m_word.word_ja IS '単語（日本語表記）';
COMMENT ON COLUMN public.com_m_word.frequency_rank IS '解析時の出現頻度順位';
COMMENT ON COLUMN public.com_m_word.status IS '公開ステータス';
COMMENT ON COLUMN public.com_m_word.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_word.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_m_phrase (出題例文マスタ)
---------------------------------------------
CREATE TABLE public.com_m_phrase (
  phrase_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES public.com_m_word(word_id) ON DELETE CASCADE,
  seq_no SMALLINT NOT NULL DEFAULT 1,
  phrase_type SMALLINT NOT NULL,
  phrase_en TEXT NOT NULL,
  phrase_ja TEXT NOT NULL,
  audio_path TEXT,
  tts_ssml TEXT,
  tts_ssml_mode TEXT NOT NULL DEFAULT 'auto', -- 'auto': UI生成, 'manual': 手動編集
  tts_adjustments JSONB,                      -- ワード単位の調整パラメータ
  tts_status SMALLINT NOT NULL DEFAULT 0, -- 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  last_tts_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'live', -- 'live' (公開), 'pending' (非公開)
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- 単語内で連番が重複しないようにする制約
  CONSTRAINT unique_word_phrase_seq UNIQUE(word_id, seq_no)

);

COMMENT ON TABLE public.com_m_phrase IS '出題例文マスタ';
COMMENT ON COLUMN public.com_m_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_m_phrase.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_phrase.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_phrase.phrase_type IS 'フレーズ種別（1: S+V 2: Adding 3: Strategic Solution 4: PAST 5: PRESENT PERFECT）';
COMMENT ON COLUMN public.com_m_phrase.phrase_en IS 'フレーズ（英語表記）';
COMMENT ON COLUMN public.com_m_phrase.phrase_ja IS 'フレーズ（日本語表記）';
COMMENT ON COLUMN public.com_m_phrase.audio_path IS '音声ファイルパス（Storage）';
COMMENT ON COLUMN public.com_m_phrase.tts_ssml IS 'TTS用SSMLテキスト';
COMMENT ON COLUMN public.com_m_phrase.tts_ssml_mode IS 'TTS用SSML生成モード（auto/manual）';
COMMENT ON COLUMN public.com_m_phrase.tts_adjustments IS 'TTS用ワード単位調整データ（JSON）';
COMMENT ON COLUMN public.com_m_phrase.tts_status IS '音声生成ステータス';
COMMENT ON COLUMN public.com_m_phrase.last_tts_date IS '最終音声生成日時';
COMMENT ON COLUMN public.com_m_phrase.status IS '公開ステータス';
COMMENT ON COLUMN public.com_m_phrase.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_phrase.update_date IS '更新日時';

-- 検索パフォーマンス向上のためのインデックス
CREATE INDEX idx_com_m_phrase_word_id ON public.com_m_phrase(word_id);

---------------------------------------------
-- DDL: com_t_favorite_contents (お気に入りコンテンツ)
---------------------------------------------
CREATE TABLE public.com_t_favorite_contents (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- 二重登録防止
  UNIQUE(user_id, content_id)
);

COMMENT ON TABLE public.com_t_favorite_contents IS 'お気に入りコンテンツ';
COMMENT ON COLUMN public.com_t_favorite_contents.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_contents.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_favorite_contents.insert_date IS '登録日時';

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

---------------------------------------------
-- DDL: com_t_resume_contents (コンテンツ再開管理テーブル)
---------------------------------------------
CREATE TABLE public.com_t_resume_contents (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  item_id uuid, 
  metadata JSONB NOT NULL DEFAULT '{}',
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_resume_contents IS 'コンテンツ再開管理テーブル';
COMMENT ON COLUMN public.com_t_resume_contents.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_resume_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_resume_contents.item_id IS 'アイテムID（word_id, phrase_idなどの一意なID）';
COMMENT ON COLUMN public.com_t_resume_contents.metadata IS 'メタデータ';
COMMENT ON COLUMN public.com_t_resume_contents.update_date IS '更新日時';

---------------------------------------------
-- DDL: com_t_tts_asset (汎用音声資産テーブル)
---------------------------------------------
CREATE TABLE public.com_t_tts_asset (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 入力情報
  raw_text TEXT NOT NULL,                -- 入力された素のテキスト
  comment TEXT,                          -- 担当者用メモ（例: "Video clip A intro"）
  
  -- TTS生成データ（既存のPhraseマスタと互換）
  audio_path TEXT,                       -- Azure Storage上のファイルパス
  tts_ssml TEXT,                         -- 最終的なSSMLコード
  tts_ssml_mode TEXT NOT NULL DEFAULT 'auto', -- 'auto' or 'manual'
  tts_adjustments JSONB,                 -- UI上の調整値（Voice, Speed, Word単位の調整等）
  
  -- 管理情報
  created_by uuid,                       -- 作成者（admin_user_id等）
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- インデックス: 作成日順での表示や、テキスト検索を想定
CREATE INDEX idx_com_t_tts_asset_created_at ON public.com_t_tts_asset(created_at DESC);
CREATE INDEX idx_com_t_tts_asset_raw_text ON public.com_t_tts_asset USING gin (to_tsvector('english', raw_text));

-- コメント設定
COMMENT ON TABLE public.com_t_tts_asset IS '汎用音声資産テーブル（TTS Designer履歴）';
COMMENT ON COLUMN public.com_t_tts_asset.asset_id IS 'アセットID';
COMMENT ON COLUMN public.com_t_tts_asset.raw_text IS '入力テキスト（原文）';
COMMENT ON COLUMN public.com_t_tts_asset.comment IS '管理用コメント';
COMMENT ON COLUMN public.com_t_tts_asset.audio_path IS '音声ファイルパス（Storage）';
COMMENT ON COLUMN public.com_t_tts_asset.tts_ssml IS 'TTS用SSMLテキスト';
COMMENT ON COLUMN public.com_t_tts_asset.tts_ssml_mode IS 'SSML生成モード（auto/manual）';
COMMENT ON COLUMN public.com_t_tts_asset.tts_adjustments IS 'TTS調整パラメータ（JSON）';
COMMENT ON COLUMN public.com_t_tts_asset.created_by IS '作成者ID';
COMMENT ON COLUMN public.com_t_tts_asset.created_at IS '作成日時';
COMMENT ON COLUMN public.com_t_tts_asset.updated_at IS '更新日時';

---------------------------------------------
-- DDL: com_m_terms (規約マスタ)
-- 規約のメタ情報（タイプ、バージョン、ファイルパス）を管理
---------------------------------------------
CREATE TABLE public.com_m_terms (
  term_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_type text NOT NULL,        -- 'TERMS':利用規約, 'PRIVACY':プライバシーポリシー
  version_name text NOT NULL,     -- 'v1.0.0', '2026-05-07' 等
  storage_path text NOT NULL,     -- Supabase Storage内のパス ('terms/tos_v1.md'等)
  is_required boolean DEFAULT true NOT NULL, -- 同意が必須かどうか
  published_date timestamp with time zone DEFAULT now() NOT NULL, -- 公開日
  insert_date timestamp with time zone DEFAULT now() NOT NULL,
  update_date timestamp with time zone DEFAULT now() NOT NULL,
  
  -- 同じタイプでバージョン名が重複するのを防ぐ
  UNIQUE(term_type, version_name)
);

-- コメント設定
COMMENT ON TABLE public.com_m_terms IS '規約マスタ：規約のバージョンとStorageパスを管理';
COMMENT ON COLUMN public.com_m_terms.term_type IS '規約タイプ（TERMS/PRIVACY等）';
COMMENT ON COLUMN public.com_m_terms.version_name IS '規約のバージョン名';
COMMENT ON COLUMN public.com_m_terms.storage_path IS 'Supabase Storage上のファイル参照パス';
COMMENT ON COLUMN public.com_m_terms.is_required IS '同意必須フラグ';
COMMENT ON COLUMN public.com_m_terms.published_date IS '公開日時';
COMMENT ON COLUMN public.com_m_terms.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_terms.update_date IS '更新日時';

-- 最新の規約をタイプ別に取得するためのインデックス
CREATE INDEX idx_m_terms_type_published ON public.com_m_terms(term_type, published_date DESC);

---------------------------------------------
-- DDL: com_t_user_terms_agreement (規約同意履歴)
-- どのユーザーが、どの規約（バージョン）に、いつ同意したかを記録
---------------------------------------------
CREATE TABLE public.com_t_user_terms_agreement (
  agreement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.com_m_user(id) ON DELETE CASCADE NOT NULL,
  term_id uuid REFERENCES public.com_m_terms(term_id) NOT NULL,
  agreed_date timestamp with time zone DEFAULT now() NOT NULL,
  ip_address text,                 -- 同意時のIPアドレス（証跡用）
  user_agent text,                 -- 同意時のブラウザ情報（証跡用）
  insert_date timestamp with time zone DEFAULT now() NOT NULL,
  update_date timestamp with time zone DEFAULT now() NOT NULL,

  -- 同じユーザーが同じバージョンの規約に重複して同意レコードを作らない制約
  UNIQUE(user_id, term_id)
);

-- コメント設定
COMMENT ON TABLE public.com_t_user_terms_agreement IS '規約同意履歴：ユーザーが同意した規約の記録';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_id IS 'ユーザID (auth.users連携)';
COMMENT ON COLUMN public.com_t_user_terms_agreement.term_id IS '規約マスタID';
COMMENT ON COLUMN public.com_t_user_terms_agreement.agreed_date IS '同意日付';
COMMENT ON COLUMN public.com_t_user_terms_agreement.ip_address IS '同意時の接続元IP';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_agent IS '同意時のブラウザ情報';
COMMENT ON COLUMN public.com_t_user_terms_agreement.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_terms_agreement.update_date IS '更新日時';

-- ユーザーごとの同意状況を高速に検索
CREATE INDEX idx_user_agreement_user_id ON public.com_t_user_terms_agreement(user_id);
-- 特定の規約に対する同意者一覧を高速に検索
CREATE INDEX idx_user_agreement_term_id ON public.com_t_user_terms_agreement(term_id);

---------------------------------------------
-- DDL: com_m_sprint_questions (スプリント問題マスタ)
---------------------------------------------
CREATE TABLE public.com_m_sprint_questions (
  -- 【基本情報】
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_type TEXT NOT NULL,                  -- '0':Speed, '4':Structure, '5':Builders, '6':Mastery
  difficulty_level SMALLINT NOT NULL DEFAULT 1, -- 難易度レベル
  group_id UUID DEFAULT NULL,                   -- 共通グループID
  seq_no SMALLINT NOT NULL DEFAULT 1,           -- グループ内の出題順序

  ---------------------------------------------
  -- ① ステートメント（親文）セクション
  ---------------------------------------------
  statement TEXT DEFAULT NULL,
  statement_ja TEXT DEFAULT NULL,
  statement_voice TEXT DEFAULT NULL,            -- 生成された音声URL
  statement_tts_ssml TEXT DEFAULT NULL,
  statement_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  statement_tts_adjustments JSONB DEFAULT NULL,
  statement_tts_status SMALLINT NOT NULL DEFAULT 0, -- 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  
  ---------------------------------------------
  -- ② クエスチョン（指示文・問い）セクション
  ---------------------------------------------
  question TEXT NOT NULL,
  question_ja TEXT DEFAULT NULL,
  question_voice TEXT DEFAULT NULL,              -- 生成された音声URL
  question_tts_ssml TEXT DEFAULT NULL,
  question_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  question_tts_adjustments JSONB DEFAULT NULL,
  question_tts_status SMALLINT NOT NULL DEFAULT 0,
  
  ---------------------------------------------
  -- ③ 解答（YES・通常正解文）セクション
  ---------------------------------------------
  answer_sentence_yes TEXT NOT NULL,
  answer_sentence_yes_ja TEXT DEFAULT NULL,
  answer_sentence_yes_voice TEXT DEFAULT NULL,   -- 生成された音声URL
  answer_sentence_yes_tts_ssml TEXT DEFAULT NULL,
  answer_sentence_yes_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  answer_sentence_yes_tts_adjustments JSONB DEFAULT NULL,
  answer_sentence_yes_tts_status SMALLINT NOT NULL DEFAULT 0,
  
  ---------------------------------------------
  -- ④ 解答（NO・否定文 ※Speed専用）セクション
  ---------------------------------------------
  answer_sentence_no TEXT DEFAULT NULL,
  answer_sentence_no_ja TEXT DEFAULT NULL,
  answer_sentence_no_voice TEXT DEFAULT NULL,    -- 生成された音声URL
  answer_sentence_no_tts_ssml TEXT DEFAULT NULL,
  answer_sentence_no_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  answer_sentence_no_tts_adjustments JSONB DEFAULT NULL,
  answer_sentence_no_tts_status SMALLINT NOT NULL DEFAULT 0,

  ---------------------------------------------
  -- 【共通管理・移行用カラム】
  ---------------------------------------------
  last_tts_date TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- 最終TTS生成日
  legacy_question_id BIGINT DEFAULT NULL,
  legacy_group_id INTEGER DEFAULT NULL,
  
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_sprint_questions IS 'スプリント問題マスタテーブル';

-- 【基本情報】
COMMENT ON COLUMN public.com_m_sprint_questions.question_id IS '問題ユニークID (UUID)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_type IS '問題種別 (''0'':Speed, ''4'':Structure, ''5'':Builders, ''6'':Mastery)';
COMMENT ON COLUMN public.com_m_sprint_questions.difficulty_level IS '難易度レベル (0:Basic 〜)';
COMMENT ON COLUMN public.com_m_sprint_questions.group_id IS '共通グループID (問題群をグルーピングするUUID)';
COMMENT ON COLUMN public.com_m_sprint_questions.seq_no IS 'グループ内の出題順序';

-- ① ステートメント（親文）セクション
COMMENT ON COLUMN public.com_m_sprint_questions.statement IS 'ステートメント（親文・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_ja IS 'ステートメント（親文・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_voice IS 'ステートメント生成音声URL';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_ssml IS 'ステートメント用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_ssml_mode IS 'ステートメント用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_adjustments IS 'ステートメント用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_status IS 'ステートメント用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

-- ② クエスチョン（指示文・問い）セクション
COMMENT ON COLUMN public.com_m_sprint_questions.question IS 'クエスチョン（指示文/問い・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.question_ja IS 'クエスチョン（指示文/問い・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.question_voice IS 'クエスチョン生成音声URL';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_ssml IS 'クエスチョン用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_ssml_mode IS 'クエスチョン用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_adjustments IS 'クエスチョン用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_status IS 'クエスチョン用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

-- ③ 解答（YES・通常正解文）セクション
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes IS '解答（YES/通常正解文・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_ja IS '解答（YES/通常正解文・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_voice IS '解答（YES）生成音声URL';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_ssml IS '解答（YES）用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_ssml_mode IS '解答（YES）用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_adjustments IS '解答（YES）用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_status IS '解答（YES）用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

-- ④ 解答（NO・否定文 ※Speed専用）セクション
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no IS '解答（NO/否定文・英語 ※Speed専用）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_ja IS '解答（NO/否定文・日本語訳 ※Speed専用）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_voice IS '解答（NO）生成音声URL';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_ssml IS '解答（NO）用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_ssml_mode IS '解答（NO）用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_adjustments IS '解答（NO）用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_status IS '解答（NO）用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

-- 【共通管理・移行用カラム】
COMMENT ON COLUMN public.com_m_sprint_questions.last_tts_date IS '最終TTS音声生成日時';
COMMENT ON COLUMN public.com_m_sprint_questions.legacy_question_id IS '移行元レガシー問題ID';
COMMENT ON COLUMN public.com_m_sprint_questions.legacy_group_id IS '移行元レガシーグループID';
COMMENT ON COLUMN public.com_m_sprint_questions.delete_flg IS '削除フラグ (''0'':有効, ''1'':削除済)';
COMMENT ON COLUMN public.com_m_sprint_questions.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_sprint_questions.update_date IS '更新日時';

-- ---------------------------------------------
-- 高速検索・ソートのための複合インデックス
-- ---------------------------------------------
-- 開いた際に対象種別・レベルから問題群を一発で、かつグループ順・ステップ順に綺麗に引き出すための最適化
CREATE INDEX idx_com_m_sprint_questions_lookup 
ON public.com_m_sprint_questions (question_type, difficulty_level, group_id, seq_no)
WHERE delete_flg = '0';

---------------------------------------------
-- DDL: self_t_sprint テーブル（自主トレスプリント結果・履歴）
---------------------------------------------
CREATE TABLE public.self_t_sprint (
  self_sprint_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  
  -- 設定情報 (sprint.ts マスタと完全同期)
  question_type VARCHAR(2) NOT NULL,    -- '0': Speed, '4': Structure, '5': Builders, '6': Mastery
  answer_type VARCHAR(2) NOT NULL,      -- '0': YES回答, '1': NO回答
  difficulty_level SMALLINT NOT NULL,   -- 0 (Basic) 〜 10
  time_limit_sec SMALLINT NOT NULL,     -- 60, 90, 120, 150
  
  -- スコア・実績データ
  total_answered SMALLINT NOT NULL,     -- タイムアップまでに答えた総問題数 (スコア)
  
  -- 問題履歴をJSONで保持
  answered_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- 共通タイムスタンプ (末尾のカンマを除去して修正)
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- コメント設定
COMMENT ON TABLE public.self_t_sprint IS '自主トレスプリント結果・履歴管理テーブル';
COMMENT ON COLUMN public.self_t_sprint.self_sprint_id IS 'スプリント結果ユニークID (UUID)';
COMMENT ON COLUMN public.self_t_sprint.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.self_t_sprint.question_type IS 'スプリント問題種別 (''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery)';
COMMENT ON COLUMN public.self_t_sprint.answer_type IS '解答種別（''0'': YES回答, ''1'': NO回答）';
COMMENT ON COLUMN public.self_t_sprint.difficulty_level IS '難易度レベル (0: Basic 〜 10)';
COMMENT ON COLUMN public.self_t_sprint.time_limit_sec IS '制限時間 (60, 90, 120, 150秒)';
COMMENT ON COLUMN public.self_t_sprint.total_answered IS '総回答数';
COMMENT ON COLUMN public.self_t_sprint.answered_history IS '実施問題の履歴情報(JSON)';
COMMENT ON COLUMN public.self_t_sprint.insert_date IS '登録日時';
COMMENT ON COLUMN public.self_t_sprint.update_date IS '更新日時';

-- 高速集計のためのインデックス（ユーザーごと、または種別ごとのランキングや履歴用）
CREATE INDEX idx_self_t_sprint_user_type 
ON public.self_t_sprint (user_id, question_type, difficulty_level);

---------------------------------------------
-- DDL: student_m_sprint_progress (ユーザースプリント進捗マスタ)
---------------------------------------------
CREATE TABLE public.student_m_sprint_progress (
  -- ユーザID (PK)
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE PRIMARY KEY,
  -- 到達しているステージ (1 - 10)
  stage SMALLINT NOT NULL DEFAULT 0,
  -- 各問題種別の到達レベル (0: Basic - 10)
  level_speed SMALLINT NOT NULL DEFAULT 0,
  level_structure SMALLINT NOT NULL DEFAULT 0,
  level_builders SMALLINT NOT NULL DEFAULT 0,
  level_mastery SMALLINT NOT NULL DEFAULT 0,
  -- 共通管理
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.student_m_sprint_progress IS 'ユーザースプリント進捗マスタ';
COMMENT ON COLUMN public.student_m_sprint_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_sprint_progress.stage IS '全体到達ステージ (1-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_speed IS 'Speed到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_structure IS 'Structure到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_builders IS 'Builders到達レベル (1-5)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_mastery IS 'Mastery到達レベル (1-5)';

---------------------------------------------
-- DDL: self_t_word_summary（単語ドリル日次サマリー）
-- キャパシティ上限： ユーザー数 × 実際の学習日数 × 教材数
---------------------------------------------
CREATE TABLE public.self_t_word_summary (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  training_date DATE NOT NULL DEFAULT CURRENT_DATE, -- タイムゾーンを考慮した「日付」
  
  word_count INT NOT NULL DEFAULT 1,             -- その日に学習した「延べ」単語数
  phrase_count INT NOT NULL DEFAULT 0,           -- その日に学習した「延べ」フレーズ数
  assessment_count INT NOT NULL DEFAULT 0,       -- その日に発話評価した回数
  
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- 1ユーザー・1教材・1日あたり「1レコード」に絶対制限する一意制約（最重要）
  CONSTRAINT unique_user_content_date UNIQUE (user_id, content_id, training_date)
);

-- インデックスはこれだけでOK。直近の学習グラフ描画や、今日の進捗取得がミリ秒で終わります。
CREATE INDEX idx_daily_summary_perf 
ON public.self_t_word_summary (user_id, training_date DESC);

COMMENT ON TABLE public.self_t_word_summary IS '単語ドリル日次サマリー';