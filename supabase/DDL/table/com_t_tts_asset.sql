-- =========================================================================
-- com_t_tts_asset: 読み上げ音声の素材（Azure TTS で作る汎用の音声）
-- =========================================================================

-- @schema public.com_t_tts_asset
CREATE TABLE public.com_t_tts_asset (
    asset_id                 uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_text                 text         NOT NULL,
    comment                  text,
    audio_path               text,
    tts_ssml                 text,
    tts_ssml_mode            text         NOT NULL DEFAULT 'auto'::text,
    tts_adjustments          jsonb,
    created_by               uuid,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    updated_at               timestamp with time zone NOT NULL DEFAULT now()
);

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

CREATE INDEX idx_com_t_tts_asset_created_at ON public.com_t_tts_asset (created_at DESC);
CREATE INDEX idx_com_t_tts_asset_raw_text ON public.com_t_tts_asset USING gin (to_tsvector('english'::regconfig, raw_text));

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_tts_asset FOR EACH ROW EXECUTE FUNCTION public.set_update_date('updated_at');

ALTER TABLE public.com_t_tts_asset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage tts assets" ON public.com_t_tts_asset FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);
-- @end-schema
