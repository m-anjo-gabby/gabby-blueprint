---------------------------------------------
-- DDL: com_t_tts_asset (汎用音声資産テーブル)
---------------------------------------------
CREATE TABLE public.com_t_tts_asset (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,                -- 入力された素のテキスト
  comment TEXT,                          -- 担当者用メモ（例: "Video clip A intro"）
  audio_path TEXT,                       -- Azure Storage上のファイルパス
  tts_ssml TEXT,                         -- 最終的なSSMLコード
  tts_ssml_mode TEXT NOT NULL DEFAULT 'auto', -- 'auto' or 'manual'
  tts_adjustments JSONB,                 -- UI上の調整値（Voice, Speed, Word単位の調整等）
  created_by uuid,                       -- 作成者（admin_user_id等）
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_com_t_tts_asset_created_at ON public.com_t_tts_asset(created_at DESC);
CREATE INDEX idx_com_t_tts_asset_raw_text ON public.com_t_tts_asset USING gin (to_tsvector('english', raw_text));

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
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_tts_asset ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users can manage tts assets" ON public.com_t_tts_asset;

CREATE POLICY "Admin users can manage tts assets" ON public.com_t_tts_asset
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');
