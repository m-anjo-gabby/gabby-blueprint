-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261020-dev
-- 作成日: 2026-10-20
--
-- 【内容】
--   ビデオ教材（旧システムの発音トレーニング・オンデマンド等のビデオを Blueprint に移す）の DB の土台。
--   1. ビデオ教材の表（シリーズ内の区切り com_m_video_section・ビデオ com_m_video・
--      生徒ごとの視聴の進み具合 student_m_video_progress）を作り、com_m_contents.category_id を
--      ビデオ教材の種類（発音トレーニング / オンデマンド / ColorVowel）にも使う
--
-- 対応ファイル:
--   DDL/table/com_m_contents.sql, com_m_video_section.sql（新規）, com_m_video.sql（新規）,
--   student_m_video_progress.sql（新規）
--
-- 【注意】ビデオのファイルの置き場所は Cloudflare R2（環境ごとの非公開のバケット）。R2 の準備ができるまでは
--   dev だけ Supabase Storage の一時のバケット（video）で作っており、staging・本番にはビデオの機能を出さない
--   （packages/lib/video/storage.ts）。
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--     node supabase/release/run.mjs 20261020_feature-20261020-dev_release.sql --env=<staging|prod>
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1-1. com_m_contents.category_id: ビデオ教材の種類にも使う
--   値の意味は content_type ごとに違うため CHECK は付けず、アプリ（packages/types）で確かめる。
-- -------------------------------------------------------------------------
COMMENT ON COLUMN public.com_m_contents.category_id IS 'コンテンツ種別ごとの分類ID。1:ビデオ → 1:発音トレーニング, 2:オンデマンド, 3:ColorVowel / 3:ダイアログプラクティス → 1:Beginner, 2:Intermediate, 3:Advanced, 4:Corpus。他の種別ではNULL（値の意味が種別ごとに違うためCHECKは付けない）';

-- -------------------------------------------------------------------------
-- 1-2. com_m_video_section: ビデオ教材（シリーズ）の中の区切り
--   シリーズの教材は必ず1つ以上の区切りを持ち、見出しの無い教材は section_name を NULL にする。
-- -------------------------------------------------------------------------
CREATE TABLE public.com_m_video_section (
    section_id    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id    uuid        NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    section_name  text,
    seq_no        smallint    NOT NULL DEFAULT 1,
    insert_date   timestamp with time zone NOT NULL DEFAULT now(),
    update_date   timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_video_section IS 'ビデオ教材の区切りマスタ';
COMMENT ON COLUMN public.com_m_video_section.section_id IS '区切りID';
COMMENT ON COLUMN public.com_m_video_section.content_id IS 'コンテンツID（content_type=1:ビデオの教材）';
COMMENT ON COLUMN public.com_m_video_section.section_name IS '区切りの見出し（NULL:見出しを出さない）';
COMMENT ON COLUMN public.com_m_video_section.seq_no IS '教材の中の並び順';
COMMENT ON COLUMN public.com_m_video_section.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_video_section.update_date IS '更新日時';

CREATE INDEX idx_video_section_content_seq ON public.com_m_video_section (content_id, seq_no);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_video_section FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_video_section ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sections of accessible video contents" ON public.com_m_video_section FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.com_m_contents c WHERE c.content_id = com_m_video_section.content_id)
);

-- -------------------------------------------------------------------------
-- 1-3. com_m_video: ビデオ
--   教材を区切り（section_id）だけで持ち、content_id は持たない（別の教材へ移す時は section_id だけを変える）。
--   ファイルの列はバケットの中のキーだけを持つ（置き場所を R2 に移しても列は変えない）。
-- -------------------------------------------------------------------------
CREATE TABLE public.com_m_video (
    video_id        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id      uuid        NOT NULL REFERENCES public.com_m_video_section(section_id) ON DELETE CASCADE,
    title           text        NOT NULL,
    description     text,
    video_path      text        NOT NULL,
    thumbnail_path  text,
    duration_sec    integer,
    seq_no          smallint    NOT NULL DEFAULT 1,
    status          smallint    NOT NULL DEFAULT 0,
    legacy_code     text,
    insert_date     timestamp with time zone NOT NULL DEFAULT now(),
    update_date     timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_video_status CHECK (status = ANY (ARRAY[0, 1])),
    CONSTRAINT chk_video_duration_sec CHECK (duration_sec IS NULL OR duration_sec >= 0)
);

COMMENT ON TABLE public.com_m_video IS 'ビデオマスタ';
COMMENT ON COLUMN public.com_m_video.video_id IS 'ビデオID';
COMMENT ON COLUMN public.com_m_video.section_id IS '区切りID';
COMMENT ON COLUMN public.com_m_video.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_video.description IS '説明';
COMMENT ON COLUMN public.com_m_video.video_path IS '動画ファイルのキー（ビデオのバケットの中。{video_id}/{uuid}.mp4。差し替えのたびに新しいキーにする）';
COMMENT ON COLUMN public.com_m_video.thumbnail_path IS 'サムネイル画像のキー（ビデオのバケットの中。{video_id}/{uuid}.png 等）';
COMMENT ON COLUMN public.com_m_video.duration_sec IS '再生時間（秒。ファイルから測った値）';
COMMENT ON COLUMN public.com_m_video.seq_no IS '区切りの中の並び順';
COMMENT ON COLUMN public.com_m_video.status IS '公開状態 1:公開 0:非公開（新規作成時は非公開）';
COMMENT ON COLUMN public.com_m_video.legacy_code IS '旧システムのファイル名（移行の突き合わせ用。新規登録ではNULL）';
COMMENT ON COLUMN public.com_m_video.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_video.update_date IS '更新日時';

CREATE INDEX idx_video_section_seq ON public.com_m_video (section_id, seq_no);
CREATE UNIQUE INDEX uq_video_legacy_code ON public.com_m_video (legacy_code) WHERE legacy_code IS NOT NULL;

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_video FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_video ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view published videos of accessible contents" ON public.com_m_video FOR SELECT TO authenticated
USING (
    status = 1 AND EXISTS (SELECT 1 FROM public.com_m_video_section s WHERE s.section_id = com_m_video.section_id)
);

-- -------------------------------------------------------------------------
-- 1-4. student_m_video_progress: 生徒ごとのビデオの視聴の進み具合
--   学習の記録のため、ユーザーからは CASCADE、ビデオからは RESTRICT（docs/DATA-DELETION.md §3）。
-- -------------------------------------------------------------------------
CREATE TABLE public.student_m_video_progress (
    user_id            uuid        NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    video_id           uuid        NOT NULL REFERENCES public.com_m_video(video_id) ON DELETE RESTRICT,
    last_position_sec  integer     NOT NULL DEFAULT 0,
    completed_at       timestamp with time zone,
    last_viewed_at     timestamp with time zone NOT NULL DEFAULT now(),
    insert_date        timestamp with time zone NOT NULL DEFAULT now(),
    update_date        timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, video_id),
    CONSTRAINT chk_video_progress_last_position_sec CHECK (last_position_sec >= 0)
);

COMMENT ON TABLE public.student_m_video_progress IS '生徒ビデオ視聴進捗';
COMMENT ON COLUMN public.student_m_video_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_video_progress.video_id IS 'ビデオID';
COMMENT ON COLUMN public.student_m_video_progress.last_position_sec IS '最後に見ていた位置（秒）';
COMMENT ON COLUMN public.student_m_video_progress.completed_at IS '初めて最後まで見た日時（NULL:未視聴完了）';
COMMENT ON COLUMN public.student_m_video_progress.last_viewed_at IS '最後に見た日時';
COMMENT ON COLUMN public.student_m_video_progress.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_m_video_progress.update_date IS '更新日時';

CREATE INDEX idx_video_progress_video ON public.student_m_video_progress (video_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_m_video_progress FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_m_video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video progress" ON public.student_m_video_progress FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.com_m_video v WHERE v.video_id = student_m_video_progress.video_id)
);

COMMIT;
