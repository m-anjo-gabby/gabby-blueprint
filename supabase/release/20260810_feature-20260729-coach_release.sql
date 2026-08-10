-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260729-coach (staging からの差分)
-- 作成日: 2026-08-10
--
-- 【内容】
--   コーチプロフィール、国籍/タイムゾーンマスタ、チャット機能、
--   AIナレッジベース(RAG)、ライセンス変更履歴、ライセンス期限切れ
--   自己修復バッチ、契約詳細ビューの集計ロジック修正
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   エラーが出た場合は内容を確認のうえ再実行してください。
--
-- 【注意事項】
--   1. 本スクリプトは「1回限りの本番適用」を想定しています。
--      CREATE TABLE 等は IF NOT EXISTS を付けていない箇所があるため、
--      正常終了後の再実行はエラーになります（再実行不可）。
--      DML(マスタデータ)部分と一部バッチ処理は ON CONFLICT / 条件付きで
--      再実行しても副作用がないよう作られています。
--   2. fk_com_m_user_timezone 制約の追加(手順8)は、既存の com_m_user.timezone
--      値がすべて com_m_timezone マスタに存在することが前提です。
--      手順2〜3（タイムゾーンマスタのテーブル作成・データ投入）より前に
--      実行されないよう、本スクリプトの順序を変更しないでください。
--   3. pg_cron 拡張が本番プロジェクトで未有効の場合、手順19の
--      CREATE EXTENSION IF NOT EXISTS pg_cron; で有効化を試みますが、
--      プランによっては Supabase Dashboard > Database > Extensions から
--      事前に有効化しておく必要があります。
--   4. 実行後、下部の「動作確認クエリ」セクションで主要オブジェクトの
--      作成状況を確認してください。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. タイムゾーンマスタ: 検証関数
-- =========================================================================
CREATE OR REPLACE FUNCTION public.validate_iana_timezone()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.validate_iana_timezone() IS 'IANAタイムゾーン名の妥当性を検証するトリガー関数（pg_timezone_names準拠）';

-- =========================================================================
-- 2. タイムゾーンマスタ: テーブル
-- =========================================================================
CREATE TABLE public.com_m_timezone (
  timezone text PRIMARY KEY, -- IANAタイムゾーン名（例: Asia/Tokyo）
  display_name_ja text NOT NULL,
  display_name_en text NOT NULL,
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_timezone IS 'タイムゾーンマスタ（IANAタイムゾーンデータベース準拠）';
COMMENT ON COLUMN public.com_m_timezone.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）。PostgreSQLのタイムゾーン識別子としてそのまま利用可能。';
COMMENT ON COLUMN public.com_m_timezone.display_name_ja IS '表示名称（日本語）';
COMMENT ON COLUMN public.com_m_timezone.display_name_en IS '表示名称（英語）';
COMMENT ON COLUMN public.com_m_timezone.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_timezone.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_timezone.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_timezone.update_date IS '更新日時';

DROP TRIGGER IF EXISTS trg_validate_iana_timezone ON public.com_m_timezone;

CREATE TRIGGER trg_validate_iana_timezone
BEFORE INSERT OR UPDATE ON public.com_m_timezone
FOR EACH ROW EXECUTE FUNCTION public.validate_iana_timezone();

ALTER TABLE public.com_m_timezone ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view timezones" ON public.com_m_timezone;

CREATE POLICY "Anyone can view timezones" ON public.com_m_timezone
FOR SELECT TO authenticated USING (delete_flg = '0');

-- =========================================================================
-- 3. タイムゾーンマスタ: 登録データ
-- =========================================================================
INSERT INTO public.com_m_timezone (timezone, display_name_ja, display_name_en, sort_no) VALUES
  ('Asia/Tokyo', '日本（東京）', 'Japan (Tokyo)', 1),
  ('America/Toronto', 'カナダ東部（トロント）', 'Canada Eastern (Toronto)', 2),
  ('America/Winnipeg', 'カナダ中部（ウィニペグ）', 'Canada Central (Winnipeg)', 3),
  ('America/Edmonton', 'カナダ山岳部（エドモントン）', 'Canada Mountain (Edmonton)', 4),
  ('America/Vancouver', 'カナダ太平洋（バンクーバー）', 'Canada Pacific (Vancouver)', 5),
  ('America/Halifax', 'カナダ大西洋岸（ハリファックス）', 'Canada Atlantic (Halifax)', 6),
  ('America/St_Johns', 'カナダ・ニューファンドランド（セントジョンズ）', 'Canada Newfoundland (St. John''s)', 7),
  ('America/New_York', 'アメリカ東部（ニューヨーク）', 'US Eastern (New York)', 8),
  ('America/Chicago', 'アメリカ中部（シカゴ）', 'US Central (Chicago)', 9),
  ('America/Denver', 'アメリカ山岳部（デンバー）', 'US Mountain (Denver)', 10),
  ('America/Los_Angeles', 'アメリカ太平洋（ロサンゼルス）', 'US Pacific (Los Angeles)', 11),
  ('America/Phoenix', 'アメリカ山岳部（フェニックス・DSTなし）', 'US Mountain (Phoenix, No DST)', 12),
  ('America/Anchorage', 'アラスカ（アンカレッジ）', 'Alaska (Anchorage)', 13),
  ('Pacific/Honolulu', 'ハワイ（ホノルル）', 'Hawaii (Honolulu)', 14),
  ('America/Puerto_Rico', 'プエルトリコ', 'Puerto Rico', 15),
  ('America/Jamaica', 'ジャマイカ', 'Jamaica', 16),
  ('America/Sao_Paulo', 'ブラジル（サンパウロ）', 'Brazil (São Paulo)', 17),
  ('America/Argentina/Buenos_Aires', 'アルゼンチン（ブエノスアイレス）', 'Argentina (Buenos Aires)', 18),
  ('America/Bogota', 'コロンビア（ボゴタ）', 'Colombia (Bogotá)', 19),
  ('Europe/London', 'イギリス（ロンドン）', 'United Kingdom (London)', 20),
  ('Europe/Lisbon', 'ポルトガル（リスボン）', 'Portugal (Lisbon)', 21),
  ('Atlantic/Reykjavik', 'アイスランド（レイキャビク）', 'Iceland (Reykjavik)', 22),
  ('Europe/Berlin', '中央ヨーロッパ（ベルリン）', 'Central Europe (Berlin)', 23),
  ('Europe/Athens', '東ヨーロッパ（アテネ）', 'Eastern Europe (Athens)', 24),
  ('Africa/Cairo', 'エジプト（カイロ）', 'Egypt (Cairo)', 25),
  ('Africa/Harare', '中央アフリカ（ハラレ）', 'Central Africa (Harare)', 26),
  ('Africa/Nairobi', '東アフリカ（ナイロビ）', 'East Africa (Nairobi)', 27),
  ('Asia/Riyadh', 'サウジアラビア（リヤド）', 'Saudi Arabia (Riyadh)', 28),
  ('Asia/Dubai', 'UAE（ドバイ）', 'UAE (Dubai)', 29),
  ('Asia/Tehran', 'イラン（テヘラン）', 'Iran (Tehran)', 30),
  ('Asia/Yerevan', 'アルメニア（エレバン）', 'Armenia (Yerevan)', 31),
  ('Asia/Kolkata', 'インド（コルカタ）', 'India (Kolkata)', 32),
  ('Asia/Dhaka', 'バングラデシュ（ダッカ）', 'Bangladesh (Dhaka)', 33),
  ('Asia/Karachi', 'パキスタン（カラチ）', 'Pakistan (Karachi)', 34),
  ('Asia/Taipei', '台湾（台北）', 'Taiwan (Taipei)', 35),
  ('Asia/Seoul', '韓国（ソウル）', 'Korea (Seoul)', 36),
  ('Asia/Singapore', 'シンガポール', 'Singapore', 37),
  ('Asia/Jakarta', 'インドネシア西部（ジャカルタ）', 'Indonesia Western (Jakarta)', 38),
  ('Asia/Makassar', 'インドネシア中部（マカッサル）', 'Indonesia Central (Makassar)', 39),
  ('Asia/Jayapura', 'インドネシア東部（ジャヤプラ）', 'Indonesia Eastern (Jayapura)', 40),
  ('Asia/Phnom_Penh', 'カンボジア（プノンペン）', 'Cambodia (Phnom Penh)', 41),
  ('Asia/Ho_Chi_Minh', 'ベトナム（ホーチミン）', 'Vietnam (Ho Chi Minh City)', 42),
  ('Australia/Perth', 'オーストラリア西部（パース）', 'Australia Western (Perth)', 43),
  ('Australia/Adelaide', 'オーストラリア中部（アデレード）', 'Australia Central (Adelaide)', 44),
  ('Australia/Darwin', 'オーストラリア中部（ダーウィン・DSTなし）', 'Australia Central (Darwin, No DST)', 45),
  ('Australia/Brisbane', 'オーストラリア東部（ブリスベン・DSTなし）', 'Australia Eastern (Brisbane, No DST)', 46),
  ('Australia/Sydney', 'オーストラリア東部（シドニー）', 'Australia Eastern (Sydney)', 47),
  ('Pacific/Auckland', 'ニュージーランド（オークランド）', 'New Zealand (Auckland)', 48),
  ('Pacific/Guadalcanal', 'ソロモン諸島', 'Solomon Islands', 49),
  ('Pacific/Midway', 'ミッドウェー諸島', 'Midway Islands', 50)
ON CONFLICT (timezone) DO UPDATE SET
  display_name_ja = EXCLUDED.display_name_ja,
  display_name_en = EXCLUDED.display_name_en,
  sort_no = EXCLUDED.sort_no,
  update_date = now();

-- =========================================================================
-- 4. 国籍マスタ: テーブル
-- =========================================================================
CREATE TABLE public.com_m_country (
  country_code text PRIMARY KEY, -- ISO 3166-1 alpha-2 (例: 'JP', 'US')
  name_en text NOT NULL,
  name_ja text NOT NULL,
  icon_path text, -- Storage "country-flag" バケット内の国旗アイコン画像パス
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_country IS '国籍マスタ（コーチプロフィールの国籍選択・国旗表示用）';
COMMENT ON COLUMN public.com_m_country.country_code IS 'ISO 3166-1 alpha-2 国コード（例: JP, US）';
COMMENT ON COLUMN public.com_m_country.name_en IS '国名（英語表記、coachアプリ用）';
COMMENT ON COLUMN public.com_m_country.name_ja IS '国名（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_country.icon_path IS 'Storage内の国旗アイコン画像パス（"country-flag"バケット）';
COMMENT ON COLUMN public.com_m_country.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_country.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_country.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_country.update_date IS '更新日時';

ALTER TABLE public.com_m_country ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view countries" ON public.com_m_country;

CREATE POLICY "Anyone can view countries" ON public.com_m_country
FOR SELECT TO authenticated USING (delete_flg = '0');

-- =========================================================================
-- 5. 国籍マスタ: 登録データ
-- 注意: icon_path は country-flag バケットへの新規アップロードファイル名
-- （2桁ISOコード基準）を前提としています。既存の3桁ファイル名からの
-- リネーム（例: AUS.png -> AU.png）がStorage側で完了していることを確認してください。
-- =========================================================================
INSERT INTO public.com_m_country (country_code, name_en, name_ja, icon_path, sort_no) VALUES
  ('AU',  'Australia',       'オーストラリア',   'AU.png',  1),
  ('CA',  'Canada',          'カナダ',           'CA.png',  2),
  ('CO',  'Colombia',        'コロンビア',       'CO.png',  3),
  ('GB',  'United Kingdom',  'イギリス',         'GB.png',  4),
  ('IE',  'Ireland',         'アイルランド',     'IE.png',  5),
  ('JP',  'Japan',           '日本',             'JP.png',  6),
  ('NZ',  'New Zealand',     'ニュージーランド', 'NZ.png',  7),
  ('SCT', 'Scotland',        'スコットランド',   'SCT.png', 8),
  ('US',  'United States',   'アメリカ合衆国',   'US.png',  9),
  ('ZA',  'South Africa',    '南アフリカ',       'ZA.png',  10)
ON CONFLICT (country_code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  icon_path = EXCLUDED.icon_path,
  sort_no = EXCLUDED.sort_no,
  update_date = now();

-- =========================================================================
-- 6. Storageバケット: country-flag / profile
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'country-flag',
  'country-flag',
  true,
  1048576, -- 1MB
  ARRAY['image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile',
  'profile',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =========================================================================
-- 7. com_m_user: プロフィールアイコン列の追加
-- =========================================================================
ALTER TABLE public.com_m_user
  ADD COLUMN IF NOT EXISTS icon_path text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_user.icon_path IS 'プロフィールアイコン画像のStorageパス（profileバケット内、例: profile/{user_id}/icon/xxxx.png）';

COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:コーチ';

-- =========================================================================
-- 8. com_m_user: タイムゾーンマスタとの整合性制約
-- 前提: 手順2〜3（com_m_timezoneテーブル作成・データ投入）が完了していること。
-- 既存の timezone 値が全てマスタに存在しないと、このALTER文はエラーになります。
-- =========================================================================
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

-- =========================================================================
-- 9. com_m_user: 権限昇格防止（列単位UPDATE権限の制限）
-- 自己サービスで更新可能な列を timezone / icon_path / update_date に限定する。
-- =========================================================================
REVOKE UPDATE ON public.com_m_user FROM authenticated, anon;
GRANT UPDATE (timezone, icon_path, update_date) ON public.com_m_user TO authenticated;

-- =========================================================================
-- 10. コーチ公開プロフィールマスタ: テーブル
-- 前提: 手順4（com_m_countryテーブル作成）が完了していること。
-- =========================================================================
CREATE TABLE public.com_m_coach_profile (
  user_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  country_code text REFERENCES public.com_m_country(country_code),
  coach_since date, -- Gabby Coach Since（月単位表示のため月初日で保持。例: 2024-11-01）
  education text, -- 学歴
  qualifications text, -- 保有資格
  teaching_years smallint, -- 英語指導年数
  job_experience text, -- 職務経験
  introduction text, -- 自己紹介（自由記述、コーチが入力した言語のまま各ポータルへ表示する）
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_coach_profile IS 'コーチ公開プロフィールマスタ（com_m_userの1:1拡張、生徒向け公開項目）';
COMMENT ON COLUMN public.com_m_coach_profile.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_profile.country_code IS '国籍（com_m_country.country_code）';
COMMENT ON COLUMN public.com_m_coach_profile.coach_since IS 'コーチ活動開始年月（月初日で保持）';
COMMENT ON COLUMN public.com_m_coach_profile.education IS '学歴';
COMMENT ON COLUMN public.com_m_coach_profile.qualifications IS '保有資格';
COMMENT ON COLUMN public.com_m_coach_profile.teaching_years IS '英語指導年数';
COMMENT ON COLUMN public.com_m_coach_profile.job_experience IS '職務経験';
COMMENT ON COLUMN public.com_m_coach_profile.introduction IS '自己紹介（自由記述）';
COMMENT ON COLUMN public.com_m_coach_profile.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_profile.update_date IS '更新日時';

-- 既存コーチアカウントへのバックフィル（本機能追加以前に作成されたコーチ分の初期レコードを補完、冪等）
INSERT INTO public.com_m_coach_profile (user_id)
SELECT id FROM public.com_m_user WHERE user_type = '2'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.com_m_coach_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coach profiles" ON public.com_m_coach_profile;
DROP POLICY IF EXISTS "Coaches can update their own profile" ON public.com_m_coach_profile;

CREATE POLICY "Anyone can view active coach profiles" ON public.com_m_coach_profile
FOR SELECT TO authenticated USING (
    delete_flg = '0' OR user_id = auth.uid()
);

CREATE POLICY "Coaches can update their own profile" ON public.com_m_coach_profile
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 11. サインアップ連動トリガー関数の更新（コーチプロフィール初期レコード作成を追加）
-- 前提: 手順10（com_m_coach_profileテーブル作成）が完了していること。
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    param_client_id uuid := (new.raw_user_meta_data->>'client_id')::uuid;
    param_user_name text := new.raw_user_meta_data->>'user_name';
    param_user_type text := new.raw_user_meta_data->>'user_type';
    param_timezone  text := new.raw_user_meta_data->>'timezone';
    target_client_id uuid;
BEGIN
    IF param_client_id IS NOT NULL THEN
        target_client_id := param_client_id;
    ELSE
        SELECT client_id INTO target_client_id FROM public.com_m_client WHERE client_type = 0 LIMIT 1;
    END IF;

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

    -- ユーザタイプが '1'、または未指定（デフォルトで生徒扱いになる）場合のみ実行
    IF param_user_type = '1' OR param_user_type IS NULL THEN
        INSERT INTO public.student_m_sprint_progress (user_id)
        VALUES (new.id);
    END IF;

    -- ユーザタイプが '2' (コーチ) の場合のみ実行
    IF param_user_type = '2' THEN
        INSERT INTO public.com_m_coach_profile (user_id)
        VALUES (new.id);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 12. チャット機能: テーブル
-- =========================================================================
CREATE TABLE public.com_t_chat_room (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type VARCHAR(10) NOT NULL DEFAULT '1ON1', -- '1ON1', 'GROUP'
  room_name VARCHAR(100), -- GROUPルームの表示名（1ON1はNULL、参加者名から表示名を導出）
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.com_t_chat_room IS 'チャットルーム管理';
COMMENT ON COLUMN public.com_t_chat_room.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room.room_type IS 'ルーム種別（1ON1: 1対1、GROUP: グループ）。作成時にクライアントから指定';
COMMENT ON COLUMN public.com_t_chat_room.room_name IS 'ルーム名（GROUPルームのみ設定。1ON1は相手ユーザー名を画面側で表示するためNULL）';
COMMENT ON COLUMN public.com_t_chat_room.created_at IS '作成日時';
COMMENT ON COLUMN public.com_t_chat_room.closed_at IS 'クローズ日時 (NULL: 有効なルーム)';

CREATE TABLE public.com_t_chat_room_user (
  room_id UUID NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL, -- 'ADMIN', 'STUDENT', 'COACH'
  last_read_chat_id UUID, -- 未読管理用 (com_t_chat.chat_id)
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY (room_id, user_id)
);

COMMENT ON TABLE public.com_t_chat_room_user IS 'チャット参加者 & 未読管理';
COMMENT ON COLUMN public.com_t_chat_room_user.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_type IS '参加者種別 (ADMIN, STUDENT, COACH)';
COMMENT ON COLUMN public.com_t_chat_room_user.last_read_chat_id IS '最終既読メッセージID (未読件数算出用)';
COMMENT ON COLUMN public.com_t_chat_room_user.joined_at IS '参加日時';
COMMENT ON COLUMN public.com_t_chat_room_user.left_at IS '退出日時 (NULL: 参加中)';

CREATE INDEX idx_com_t_chat_room_user_user_id ON public.com_t_chat_room_user (user_id);
CREATE INDEX idx_com_t_chat_room_user_room_id ON public.com_t_chat_room_user (room_id);

CREATE TABLE public.com_t_chat (
  chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type VARCHAR(10) NOT NULL DEFAULT 'TEXT', -- 'TEXT', 'IMAGE', 'FILE', 'SYSTEM'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.com_t_chat IS 'チャットメッセージ';
COMMENT ON COLUMN public.com_t_chat.chat_id IS 'メッセージID';
COMMENT ON COLUMN public.com_t_chat.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat.sender_user_id IS '送信者ユーザID';
COMMENT ON COLUMN public.com_t_chat.message IS 'メッセージ本文 (FILE/IMAGEの場合はStorageパスまたはファイル名を含むJSON文字列)';
COMMENT ON COLUMN public.com_t_chat.message_type IS 'メッセージ種別 (TEXT, IMAGE, FILE, SYSTEM)';
COMMENT ON COLUMN public.com_t_chat.created_at IS '送信日時';
COMMENT ON COLUMN public.com_t_chat.deleted_at IS '論理削除日時 (NULL: 未削除)';

CREATE INDEX idx_com_t_chat_room_id ON public.com_t_chat (room_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_chat;

CREATE TABLE public.com_t_chat_attachment (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.com_t_chat(chat_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_chat_attachment IS 'チャットメッセージ添付ファイル';
COMMENT ON COLUMN public.com_t_chat_attachment.attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_chat_attachment.chat_id IS 'メッセージID (com_t_chat)';
COMMENT ON COLUMN public.com_t_chat_attachment.file_path IS 'Storage上のパス ("chat"バケット)';
COMMENT ON COLUMN public.com_t_chat_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_chat_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_chat_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_chat_attachment.created_at IS 'アップロード日時';

CREATE INDEX idx_com_t_chat_attachment_chat_id ON public.com_t_chat_attachment (chat_id);

-- =========================================================================
-- 13. チャット機能: 参加者判定ヘルパー関数
-- 前提: 手順12（com_t_chat_room_userテーブル作成）が完了していること。
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_chat_room_member(p_room_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.com_t_chat_room_user
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND left_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_chat_room_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_room_member(uuid) TO authenticated;

-- =========================================================================
-- 14. チャット機能: RLSポリシー
-- 前提: 手順13（is_chat_room_member関数作成）が完了していること。
-- =========================================================================
ALTER TABLE public.com_t_chat_room ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their chat rooms" ON public.com_t_chat_room;
DROP POLICY IF EXISTS "Admins can manage chat rooms" ON public.com_t_chat_room;

CREATE POLICY "Members can view their chat rooms" ON public.com_t_chat_room
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage chat rooms" ON public.com_t_chat_room
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

ALTER TABLE public.com_t_chat_room_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Admins can manage room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Users can update their own participation row" ON public.com_t_chat_room_user;

CREATE POLICY "Members can view their room participants" ON public.com_t_chat_room_user
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage room participants" ON public.com_t_chat_room_user
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

CREATE POLICY "Users can update their own participation row" ON public.com_t_chat_room_user
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

ALTER TABLE public.com_t_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view messages in their rooms" ON public.com_t_chat;
DROP POLICY IF EXISTS "Members can send messages as themselves" ON public.com_t_chat;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.com_t_chat;
DROP POLICY IF EXISTS "Admins can moderate messages" ON public.com_t_chat;

CREATE POLICY "Members can view messages in their rooms" ON public.com_t_chat
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Members can send messages as themselves" ON public.com_t_chat
FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can view all messages" ON public.com_t_chat
FOR SELECT TO authenticated USING (
    public.get_jwt_user_type() = '0'
);

CREATE POLICY "Admins can moderate messages" ON public.com_t_chat
FOR UPDATE TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

ALTER TABLE public.com_t_chat_attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view attachments in their rooms" ON public.com_t_chat_attachment;
DROP POLICY IF EXISTS "Admins can view all attachments" ON public.com_t_chat_attachment;
DROP POLICY IF EXISTS "Members can attach files to their own messages" ON public.com_t_chat_attachment;

CREATE POLICY "Members can view attachments in their rooms" ON public.com_t_chat_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id
        AND public.is_chat_room_member(c.room_id)
    )
);

CREATE POLICY "Admins can view all attachments" ON public.com_t_chat_attachment
FOR SELECT TO authenticated USING (
    public.get_jwt_user_type() = '0'
);

CREATE POLICY "Members can attach files to their own messages" ON public.com_t_chat_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id
        AND c.sender_user_id = auth.uid()
    )
);

-- =========================================================================
-- 15. AIナレッジベース (RAG): 拡張機能・テーブル
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.com_m_ai_knowledge_base (
  knowledge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,             -- 'help' | 'coach' | 'roleplay' 等の区分（今後追加可）
  title TEXT NOT NULL,                   -- 記事・ナレッジのタイトル
  body TEXT NOT NULL,                    -- 埋め込み生成・回答根拠に使う本文
  metadata JSONB NOT NULL DEFAULT '{}',  -- source_typeごとに異なる付加情報
  embedding vector(768),                 -- Gemini Embedding（output_dimensionality=768）。未生成時はNULL
  embedding_model TEXT,                  -- 埋め込み生成に使用したモデルID（再生成判定用）
  delete_flg TEXT NOT NULL DEFAULT '0',
  created_by uuid,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_com_m_ai_knowledge_base_source_type
  ON public.com_m_ai_knowledge_base(source_type)
  WHERE delete_flg = '0';

CREATE INDEX idx_com_m_ai_knowledge_base_embedding
  ON public.com_m_ai_knowledge_base
  USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE public.com_m_ai_knowledge_base IS 'AIナレッジベース（RAG検索対象マスタ。ヘルプ記事/AIコーチ知識/ロールプレイシナリオ等を共通管理）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.knowledge_id IS 'ナレッジID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.source_type IS '区分（help:ヘルプ記事, coach:AIコーチ知識, roleplay:ロールプレイシナリオ 等）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.body IS '本文（埋め込み生成・回答根拠に使用）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.metadata IS '付加情報（JSON。source_typeごとに異なる項目を許容）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.embedding IS 'Geminiで生成したベクトル（次元768）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.embedding_model IS '埋め込み生成に使用したモデルID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.created_by IS '作成者ID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.update_date IS '更新日時';

ALTER TABLE public.com_m_ai_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users can manage ai knowledge base" ON public.com_m_ai_knowledge_base;

CREATE POLICY "Admin users can manage ai knowledge base" ON public.com_m_ai_knowledge_base
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- =========================================================================
-- 16. AIナレッジベース (RAG): 類似検索関数
-- 前提: 手順15（com_m_ai_knowledge_baseテーブル作成）が完了していること。
-- =========================================================================
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_base(
    _query_embedding vector(768),
    _source_type TEXT DEFAULT NULL,
    _match_count INT DEFAULT 5,
    _match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    knowledge_id uuid,
    source_type text,
    title text,
    body text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        k.knowledge_id,
        k.source_type,
        k.title,
        k.body,
        k.metadata,
        1 - (k.embedding <=> _query_embedding) AS similarity
    FROM public.com_m_ai_knowledge_base k
    WHERE k.delete_flg = '0'
      AND k.embedding IS NOT NULL
      AND (_source_type IS NULL OR k.source_type = _source_type)
      AND 1 - (k.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY k.embedding <=> _query_embedding ASC
    LIMIT _match_count;
$$;

ALTER FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) TO authenticated;

-- =========================================================================
-- 17. ライセンス変更履歴: テーブル
-- =========================================================================
CREATE TABLE public.com_t_user_license_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL,             -- com_t_user_license.license_id（解除後は非存在になり得るためFKなし）
    contract_id UUID REFERENCES public.com_m_contract(contract_id),
    user_id UUID REFERENCES public.com_m_user(id),
    action TEXT NOT NULL CHECK (action IN ('assigned', 'updated', 'removed')),
    status SMALLINT NOT NULL,             -- 記録時点でのステータス
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT DEFAULT NULL,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 操作を行った管理者
    performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_user_license_history IS 'ライセンス変更履歴（割当・更新・解除の追記専用ログ）';
COMMENT ON COLUMN public.com_t_user_license_history.license_id IS '対象のライセンスID（com_t_user_license, FKなし）';
COMMENT ON COLUMN public.com_t_user_license_history.action IS '操作種別 assigned:割当 / updated:更新(更新前スナップショット) / removed:解除(解除前スナップショット)';
COMMENT ON COLUMN public.com_t_user_license_history.status IS '記録時点でのステータス';
COMMENT ON COLUMN public.com_t_user_license_history.performed_by IS '操作を行った管理者のUUID（不明時はNULL）';
COMMENT ON COLUMN public.com_t_user_license_history.performed_at IS '操作日時';

CREATE INDEX idx_license_history_user ON public.com_t_user_license_history (user_id, performed_at DESC);
CREATE INDEX idx_license_history_contract ON public.com_t_user_license_history (contract_id, performed_at DESC);

ALTER TABLE public.com_t_user_license_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant license history" ON public.com_t_user_license_history;

CREATE POLICY "Users can view relevant license history" ON public.com_t_user_license_history
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract
        WHERE client_id = public.get_jwt_client_id()
    )
);

-- =========================================================================
-- 18. 契約詳細ビュー: 有効数集計ロジックの修正
-- status=1 かつ「現在その期間内」のものだけを有効数としてカウントするよう修正
-- （期限切れだが status=1 のまま残っているライセンスの誤カウントを解消）
-- =========================================================================
CREATE OR REPLACE VIEW public.vw_contract_details AS
SELECT
    c.*,
    cl.client_name,
    COALESCE(stats.total_assigned_count, 0) AS current_assigned_count,
    COALESCE(stats.active_snapshot_count, 0) AS current_active_count,
    c.max_licenses - COALESCE(stats.total_assigned_count, 0) AS remaining_licenses
FROM
    public.com_m_contract c
JOIN
    public.com_m_client cl ON c.client_id = cl.client_id
LEFT JOIN (
    SELECT
        contract_id,
        COUNT(license_id) AS total_assigned_count,
        COUNT(CASE WHEN status = 1 AND NOW() BETWEEN start_date AND end_date THEN 1 END) AS active_snapshot_count
    FROM
        public.com_t_user_license
    GROUP BY
        contract_id
) stats ON c.contract_id = stats.contract_id;

-- =========================================================================
-- 19. ライセンス期限切れ自己修復バッチ (pg_cron)
-- 前提: pg_cron 拡張がプロジェクトで有効化可能なこと。
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.touch_expired_user_licenses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.com_t_user_license
    SET update_date = NOW()
    WHERE status = 1
      AND end_date < NOW()
      AND end_date >= NOW() - INTERVAL '2 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_expired_user_licenses() FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-user-licenses-daily';

SELECT cron.schedule(
    'expire-stale-user-licenses-daily',
    '0 15 * * *', -- UTC 15:00 = JST 0:00（日本はDSTが無いため年間固定）
    $$ SELECT public.touch_expired_user_licenses(); $$
);

-- 一回限りのバックフィル: 本パッチ適用時点で既に期限切れなのに
-- is_licensed=true のまま放置されている既存データを一度だけ補正する。
UPDATE public.com_t_user_license
SET update_date = NOW()
WHERE status = 1
  AND end_date < NOW();

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT to_regclass('public.com_m_timezone'), to_regclass('public.com_m_country'),
--        to_regclass('public.com_m_coach_profile'), to_regclass('public.com_t_chat_room'),
--        to_regclass('public.com_t_chat_room_user'), to_regclass('public.com_t_chat'),
--        to_regclass('public.com_t_chat_attachment'), to_regclass('public.com_m_ai_knowledge_base'),
--        to_regclass('public.com_t_user_license_history');
--
-- SELECT count(*) FROM public.com_m_timezone;  -- 期待値: 50
-- SELECT count(*) FROM public.com_m_country;   -- 期待値: 10
-- SELECT count(*) FROM public.com_m_coach_profile; -- 期待値: 既存コーチ数以上
--
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'expire-stale-user-licenses-daily';
--
-- SELECT conname FROM pg_constraint WHERE conname = 'fk_com_m_user_timezone';
-- SELECT * FROM storage.buckets WHERE id IN ('country-flag', 'profile');
