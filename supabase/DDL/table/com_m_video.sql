-- =========================================================================
-- com_m_video: ビデオ
-- 前提: com_m_video_section
-- =========================================================================
-- 【役割】
-- セクション（section_id）の中の1本のビデオ。content_id は持たず、別のセクション・教材へ移す時は section_id だけを変える。
--
-- 【ファイル】
-- video_path / thumbnail_path はビデオのバケットの中のキーだけを持つ（バケット名・URL は持たない）。
-- 置き場所・URL の発行・アップロード・削除は packages/lib/video/storage.ts だけが扱う。
-- キーは {video_id}/{uuid}.<拡張子> で、ファイルを差し替えるたびに新しいキーにし、古いファイルは消す
-- （署名付き URL・ブラウザのキャッシュに古いファイルが残らないようにするため）。
-- 行の削除の後に、その行のファイルも消す（docs/DATA-DELETION.md §1）。
--
-- 【書き込み】
-- admin（service_role）だけ。旧システムからの移行は legacy_code（旧ファイル名）で突き合わせる。
--
-- 【参照できる範囲】
-- 公開（status = 1）で、セクション（ひいては教材）が見える利用者。
-- =========================================================================

-- @schema public.com_m_video
CREATE TABLE public.com_m_video (
    video_id                 uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id               uuid         NOT NULL REFERENCES public.com_m_video_section(section_id) ON DELETE CASCADE,
    title                    text         NOT NULL,
    description              text,
    video_path               text         NOT NULL,
    thumbnail_path           text,
    duration_sec             integer,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    status                   smallint     NOT NULL DEFAULT 0,
    legacy_code              text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    title_en                 text,
    CONSTRAINT chk_video_duration_sec CHECK (duration_sec IS NULL OR duration_sec >= 0),
    CONSTRAINT chk_video_status CHECK (status = ANY (ARRAY[0, 1]))
);

COMMENT ON TABLE public.com_m_video IS 'ビデオマスタ';
COMMENT ON COLUMN public.com_m_video.video_id IS 'ビデオID';
COMMENT ON COLUMN public.com_m_video.section_id IS 'セクションID';
COMMENT ON COLUMN public.com_m_video.title IS 'タイトル（和名）';
COMMENT ON COLUMN public.com_m_video.description IS '説明';
COMMENT ON COLUMN public.com_m_video.video_path IS '動画ファイルのキー（ビデオのバケットの中。{video_id}/{uuid}.mp4。差し替えのたびに新しいキーにする）';
COMMENT ON COLUMN public.com_m_video.thumbnail_path IS 'サムネイル画像のキー（ビデオのバケットの中。{video_id}/{uuid}.png 等）';
COMMENT ON COLUMN public.com_m_video.duration_sec IS '再生時間（秒。ファイルから測った値）';
COMMENT ON COLUMN public.com_m_video.seq_no IS 'セクションの中の並び順';
COMMENT ON COLUMN public.com_m_video.status IS '公開状態 1:公開 0:非公開（新規作成時は非公開）';
COMMENT ON COLUMN public.com_m_video.legacy_code IS '旧システムのファイル名（移行の突き合わせ用。新規登録ではNULL）';
COMMENT ON COLUMN public.com_m_video.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_video.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_video.title_en IS 'タイトル（英名・任意。コーチ向け画面で使用し、未入力時はtitleにフォールバックする）';

CREATE INDEX idx_video_section_seq ON public.com_m_video (section_id, seq_no);
CREATE UNIQUE INDEX uq_video_legacy_code ON public.com_m_video (legacy_code) WHERE legacy_code IS NOT NULL;

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_video FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_video ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view published videos of accessible contents" ON public.com_m_video FOR SELECT TO authenticated
USING (
    status = 1 AND (EXISTS ( SELECT 1
       FROM public.com_m_video_section s
      WHERE s.section_id = com_m_video.section_id))
);
-- @end-schema
