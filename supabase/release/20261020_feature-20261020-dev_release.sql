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
-- 【注意】ビデオのファイルの置き場所は Cloudflare R2（環境ごとの非公開のバケット blueprint-video-stg / -prod。
--   packages/lib/video/storage.ts）。バケット・CORS・API トークンは作成済み（2026-10-21）。
--
-- 【環境変数（このスクリプトの適用の後、Deploy の前）】
--   admin・student に R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_VIDEO_BUCKET を追加する。
--   student に TRAINING_MENU_ENABLED を追加する（staging は true、本番は試験運用の間 false。今日のトレーニングメニューの表示）。
--     pnpm vercel-env --env=<staging|prod> --apply
--
-- 【ビデオの取り込み（Deploy の後）】
--   旧システムのビデオを取り込む（教材は非公開で入る。admin のプレビューで確かめてから公開する）。
--     node scripts/video-import/run.mjs --env=<staging|prod> --src=D:/work/video --apply
--   本番は実物の再エンコードに1時間ほどかかるため、先に --prepare で作っておく（scripts/video-import/README.md）。
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

-- =========================================================================
-- 【追加セクション】ビデオ・区切りの英名
--
-- 【内容】
--   コーチもビデオを見られるようにする予定のため、他の教材（content_name / content_name_en）と同じく
--   ビデオのタイトルと区切りの見出しに英名の列を足す。説明は生徒だけに見せるため和文だけにする。
--   1. com_m_video.title_en（英名・任意。未入力時は title にフォールバック）
--   2. com_m_video_section.section_name_en（英名・任意。未入力時は section_name にフォールバック）
--
-- 対応ファイル: DDL/table/com_m_video.sql, DDL/table/com_m_video_section.sql
-- =========================================================================

BEGIN;

ALTER TABLE public.com_m_video ADD COLUMN title_en text;

COMMENT ON COLUMN public.com_m_video.title IS 'タイトル（和名）';
COMMENT ON COLUMN public.com_m_video.title_en IS 'タイトル（英名・任意。コーチ向け画面で使用し、未入力時はtitleにフォールバックする）';

ALTER TABLE public.com_m_video_section ADD COLUMN section_name_en text;

COMMENT ON COLUMN public.com_m_video_section.section_name IS '区切りの見出し（和名。NULL:見出しを出さない）';
COMMENT ON COLUMN public.com_m_video_section.section_name_en IS '区切りの見出し（英名・任意。コーチ向け画面で使用し、未入力時はsection_nameにフォールバックする）';

COMMIT;

-- =========================================================================
-- 【追加セクション】ビデオ教材の「区切り」を「セクション」と呼ぶ
--
-- 【内容】
--   画面の呼び方を「セクション」にそろえたため、列・表のコメントも合わせる（構造は変えない）。
--
-- 対応ファイル: DDL/table/com_m_video.sql, DDL/table/com_m_video_section.sql
-- =========================================================================

BEGIN;

COMMENT ON TABLE public.com_m_video_section IS 'ビデオ教材のセクションマスタ';
COMMENT ON COLUMN public.com_m_video_section.section_id IS 'セクションID';
COMMENT ON COLUMN public.com_m_video_section.section_name IS 'セクションの見出し（和名。NULL:見出しを出さない）';
COMMENT ON COLUMN public.com_m_video_section.section_name_en IS 'セクションの見出し（英名・任意。コーチ向け画面で使用し、未入力時はsection_nameにフォールバックする）';
COMMENT ON COLUMN public.com_m_video.section_id IS 'セクションID';
COMMENT ON COLUMN public.com_m_video.seq_no IS 'セクションの中の並び順';

COMMIT;

-- =========================================================================
-- 【追加セクション】今日のトレーニングメニュー
--
-- 【内容】
--   ホームの「今日やること」を、生徒ごと・日ごとの「今日のトレーニングメニュー」（やることの並び）に置き換える土台。
--   中身は、旧システムのメニュー（RunNow）を引き継いだ標準メニュー（スプリント2種類＋発音トレーニングのビデオ）から始め、
--   後でコース（はじめの2週間等）のその日のメニューを同じ表に入れる。
--   1. student_t_training_menu（生徒 × 生徒のタイムゾーンでの日付で1行）
--   2. student_t_training_menu_item（メニューのやること。スプリントは種別・レベル・回数、ビデオはビデオを指す）
--   3. create_training_menu（その日のメニューとやることを1トランザクションで作る RPC）
--   完了は各トレーニングの記録（self_t_sprint・student_m_video_progress）から判定し、生徒本人が completed_at だけを書く。
--   メニューは学習の記録ではなく案内のため、教材・ビデオの削除では一緒に消す（CASCADE。実績は各トレーニングの記録に残る）。
--   本番は試験運用の間、student の TRAINING_MENU_ENABLED=false でメニューを出さない（表は作るが行はできない）。
--
-- 対応ファイル:
--   DDL/table/student_t_training_menu.sql（新規）, DDL/table/student_t_training_menu_item.sql（新規）,
--   DDL/function/create_training_menu.sql（新規）
-- =========================================================================

BEGIN;

CREATE TABLE public.student_t_training_menu (
    menu_id       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       uuid        NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    menu_date     date        NOT NULL,
    menu_source   smallint    NOT NULL DEFAULT 1,
    completed_at  timestamp with time zone,
    insert_date   timestamp with time zone NOT NULL DEFAULT now(),
    update_date   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_training_menu_user_date UNIQUE (user_id, menu_date),
    CONSTRAINT chk_training_menu_menu_source CHECK (menu_source IN (1))
);

COMMENT ON TABLE public.student_t_training_menu IS '今日のトレーニングメニュー（生徒 × 日付）';
COMMENT ON COLUMN public.student_t_training_menu.menu_id IS 'メニューID';
COMMENT ON COLUMN public.student_t_training_menu.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_t_training_menu.menu_date IS 'メニューの日付（生徒のタイムゾーンでの日付）';
COMMENT ON COLUMN public.student_t_training_menu.menu_source IS 'メニューの作り方（1:標準メニュー）';
COMMENT ON COLUMN public.student_t_training_menu.completed_at IS 'すべてのやることを終えた日時（NULL:未完了）';
COMMENT ON COLUMN public.student_t_training_menu.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_t_training_menu.update_date IS '更新日時';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_t_training_menu FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_t_training_menu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training menus" ON public.student_t_training_menu FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

CREATE POLICY "Users can complete their own training menus" ON public.student_t_training_menu FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

-- 作るのは create_training_menu だけ。本人が書き換えてよいのは完了の日時だけにする
REVOKE INSERT, UPDATE, DELETE ON public.student_t_training_menu FROM authenticated;
GRANT UPDATE (completed_at) ON public.student_t_training_menu TO authenticated;

CREATE TABLE public.student_t_training_menu_item (
    item_id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_id           uuid        NOT NULL REFERENCES public.student_t_training_menu(menu_id) ON DELETE CASCADE,
    seq_no            smallint    NOT NULL,
    item_type         smallint    NOT NULL,
    content_id        uuid        NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    video_id          uuid        REFERENCES public.com_m_video(video_id) ON DELETE CASCADE,
    question_type     text,
    difficulty_level  smallint,
    target_count      smallint    NOT NULL DEFAULT 1,
    completed_at      timestamp with time zone,
    insert_date       timestamp with time zone NOT NULL DEFAULT now(),
    update_date       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_training_menu_item_seq UNIQUE (menu_id, seq_no),
    CONSTRAINT chk_training_menu_item_item_type CHECK (item_type IN (1, 2)),
    CONSTRAINT chk_training_menu_item_question_type CHECK (question_type IN ('0', '4', '5', '6')),
    CONSTRAINT chk_training_menu_item_target CHECK (
        (item_type = 1 AND question_type IS NOT NULL AND difficulty_level IS NOT NULL AND video_id IS NULL AND target_count >= 1)
        OR (item_type = 2 AND video_id IS NOT NULL AND question_type IS NULL AND difficulty_level IS NULL AND target_count = 1)
    )
);

COMMENT ON TABLE public.student_t_training_menu_item IS '今日のトレーニングメニューのやること';
COMMENT ON COLUMN public.student_t_training_menu_item.item_id IS 'やることID';
COMMENT ON COLUMN public.student_t_training_menu_item.menu_id IS 'メニューID';
COMMENT ON COLUMN public.student_t_training_menu_item.seq_no IS 'メニューの中の並び順';
COMMENT ON COLUMN public.student_t_training_menu_item.item_type IS 'やることの種類（1:スプリントのタイムアタック, 2:ビデオ）';
COMMENT ON COLUMN public.student_t_training_menu_item.content_id IS 'コンテンツID（スプリント・ビデオの教材）';
COMMENT ON COLUMN public.student_t_training_menu_item.video_id IS 'ビデオID（item_type=2 のみ）';
COMMENT ON COLUMN public.student_t_training_menu_item.question_type IS 'スプリント問題種別（item_type=1 のみ。''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery）';
COMMENT ON COLUMN public.student_t_training_menu_item.difficulty_level IS 'スプリントの難易度レベル（item_type=1 のみ）';
COMMENT ON COLUMN public.student_t_training_menu_item.target_count IS '行う回数（スプリントはタイムアタックの回数。ビデオは1）';
COMMENT ON COLUMN public.student_t_training_menu_item.completed_at IS '終えた日時（NULL:未完了）';
COMMENT ON COLUMN public.student_t_training_menu_item.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_t_training_menu_item.update_date IS '更新日時';

CREATE INDEX idx_training_menu_item_content ON public.student_t_training_menu_item (content_id);
CREATE INDEX idx_training_menu_item_video ON public.student_t_training_menu_item (video_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_t_training_menu_item FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_t_training_menu_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training menu items" ON public.student_t_training_menu_item FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.student_t_training_menu m WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid())
);

CREATE POLICY "Users can complete their own training menu items" ON public.student_t_training_menu_item FOR UPDATE TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.student_t_training_menu m WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid())
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.student_t_training_menu m WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid())
);

REVOKE INSERT, UPDATE, DELETE ON public.student_t_training_menu_item FROM authenticated;
GRANT UPDATE (completed_at) ON public.student_t_training_menu_item TO authenticated;

-- 生徒のタイムゾーンでの今日のメニューを作る。同じ日のメニューが既にあれば作らず、そのIDを返す
CREATE OR REPLACE FUNCTION public.create_training_menu(p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_menu_date date;
    v_menu_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'p_items must be an array of 1 to 10 items' USING ERRCODE = '22023';
    END IF;

    SELECT (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date
    INTO v_menu_date
    FROM public.com_m_user u
    WHERE u.id = v_user_id;

    INSERT INTO public.student_t_training_menu (user_id, menu_date)
    VALUES (v_user_id, v_menu_date)
    ON CONFLICT (user_id, menu_date) DO NOTHING
    RETURNING menu_id INTO v_menu_id;

    IF v_menu_id IS NULL THEN
        SELECT m.menu_id INTO v_menu_id
        FROM public.student_t_training_menu m
        WHERE m.user_id = v_user_id AND m.menu_date = v_menu_date;
        RETURN v_menu_id;
    END IF;

    INSERT INTO public.student_t_training_menu_item (
        menu_id, seq_no, item_type, content_id, video_id, question_type, difficulty_level, target_count
    )
    SELECT v_menu_id, x.seq_no, x.item_type, x.content_id, x.video_id, x.question_type, x.difficulty_level, COALESCE(x.target_count, 1)
    FROM jsonb_to_recordset(p_items) AS x(
        seq_no smallint, item_type smallint, content_id uuid, video_id uuid,
        question_type text, difficulty_level smallint, target_count smallint
    );

    RETURN v_menu_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_training_menu(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_training_menu(jsonb) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】月次コーチングレポートの承認の件数の固定・代理ログインの期限の廃止
--
-- 【内容】
--   1. approve_coach_monthly_report: 承認のスナップショットに内訳（完了・12時間未満のキャンセル・欠席）を足し、
--      請求書・支払通知書（PDF）の件数・内訳・金額をスナップショットから作れるようにする（これまでは PDF を開いた時点の
--      件数で計算していたため、承認後の実施結果の修正で支払額が変わっていた）。
--      あわせて、今月より後の月と承認済みの月（上書き・通知の二重送信）の承認を拒否する。
--   2. 承認済みの月のスナップショットに内訳を足す（今のセッションの記録から数える。合計は承認時の値のまま）。
--   3. get_coach_monthly_active_students: 月の途中でライセンスを停止した・契約を解約した生徒も、その月にセッションが
--      あれば縦軸に出す（これまでは画面の合計・PDF の金額から漏れ、スナップショットの合計とずれていた）。
--   4. com_t_admin_impersonation_log.expires_at を消す。代理ログインの30分の期限を廃止し、終わるのは
--      アドミンが代理ログイン先でログアウトした時にする（運用の手順で守る）。期限で Cookie が消えると、以降の操作が
--      代理ログインの印の無い本人の操作としてログに残っていたため、印を残すことを優先する。
--
-- 対応ファイル:
--   DDL/function/approve_coach_monthly_report.sql, DDL/function/get_coach_monthly_active_students.sql,
--   DDL/table/com_t_admin_impersonation_log.sql
-- =========================================================================

BEGIN;

-- 1. 承認（関数の本体は DDL/function/approve_coach_monthly_report.sql と同じ）
CREATE OR REPLACE FUNCTION public.approve_coach_monthly_report(
    p_coach_id uuid,
    p_report_month date,
    p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_coach_timezone text;
    v_snapshot jsonb;
    v_unresolved_count integer;
    v_rate_amount numeric(10, 2);
    v_rate_currency text;
BEGIN
    IF public.get_jwt_user_type() IS NOT NULL AND NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_month > date_trunc('month', NOW() AT TIME ZONE COALESCE(v_coach_timezone, 'Asia/Tokyo'))::date THEN
        RAISE EXCEPTION 'cannot approve a future month';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_monthly_report_approval a
        WHERE a.coach_id = p_coach_id AND a.report_month = v_month AND a.status = 2
    ) THEN
        RAISE EXCEPTION 'monthly report is already approved';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.is_unresolved;

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'cannot approve while % unresolved session(s) remain for this month', v_unresolved_count;
    END IF;

    SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IS DISTINCT FROM 3),
        'late_cancel', COUNT(*) FILTER (WHERE s.status = 3),
        'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', per_student.student_id, 'count', per_student.cnt))
             FROM (
                 SELECT ps.student_id, COUNT(*) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month) ps
                 WHERE ps.counts_toward_total
                 GROUP BY ps.student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.counts_toward_total;

    SELECT rate_amount, currency_code INTO v_rate_amount, v_rate_currency
    FROM public.com_m_session_pay_rate
    ORDER BY update_date DESC
    LIMIT 1;

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, rate_amount, rate_currency, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, v_rate_amount, v_rate_currency, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        rate_amount = v_rate_amount,
        rate_currency = v_rate_currency,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        -- 対象の月を開く（月の指定が無いと今月が開くため）
        '/monthly-reports?month=' || to_char(v_month, 'YYYY-MM')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;

-- 2. 承認済みの月のスナップショットに内訳を足す（合計・生徒ごとの件数は承認時の値を残す）
UPDATE public.com_t_coach_monthly_report_approval a
SET session_count_snapshot = a.session_count_snapshot || (
        SELECT jsonb_build_object(
            'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IS DISTINCT FROM 3),
            'late_cancel', COUNT(*) FILTER (WHERE s.status = 3),
            'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)
        )
        FROM public.get_coach_monthly_sessions(a.coach_id, a.report_month) s
        WHERE s.counts_toward_total
    )
WHERE a.status = 2
  AND a.session_count_snapshot IS NOT NULL
  AND NOT (a.session_count_snapshot ? 'completed');

-- 3. 縦軸の生徒（関数の本体は DDL/function/get_coach_monthly_active_students.sql と同じ）
CREATE OR REPLACE FUNCTION public.get_coach_monthly_active_students(p_coach_id uuid, p_report_month date)
RETURNS TABLE(student_id uuid, user_name text, icon_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT u.id, u.user_name, u.icon_path
    FROM public.com_m_user u
    WHERE u.id IN (
        SELECT r.student_id
        FROM public.com_m_coach_student_relationship r
        WHERE r.coach_id = p_coach_id
          AND EXISTS (
              SELECT 1
              FROM public.com_t_user_license l
              JOIN public.com_m_contract c ON c.contract_id = l.contract_id
              WHERE l.user_id = r.student_id
                AND l.status = 1
                AND c.status = 1
                AND l.start_date <= v_month_end_utc
                AND l.end_date >= v_month_start_utc
          )
        UNION
        SELECT s.student_id
        FROM public.get_coach_monthly_sessions(p_coach_id, p_report_month) s
    )
    ORDER BY u.user_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) TO authenticated;

-- 4. 代理ログインの期限の列を消す
ALTER TABLE public.com_t_admin_impersonation_log DROP COLUMN expires_at;

COMMENT ON TABLE public.com_t_admin_impersonation_log IS '管理者の代理ログイン（対象の生徒・コーチとしてのログイン）の監査ログ';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.target_user_id IS '代理ログインの対象の生徒・コーチのUUID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.redeemed_at IS '生徒・コーチのポータルでリンクが使われ、セッションができた日時';

COMMIT;

-- =========================================================================
-- 【追加セクション】ビデオのペア（今日のメニューで2本を1回分として割り当てる）
--
-- 【内容】
--   旧システム（COM_M_RUNNOW_VIDEO の PAIR_TYPE / PAIR_ID）と同じく、発音トレーニングのビデオを
--   「シングル（1本）」と「ペア（並び順で続く2本）」に分け、今日のメニューではペアの2本を同じ日に割り当てる。
--   1. com_m_video.pair_with_next（true: 教材の中の並び順で次のビデオとペア。教材をまたぐペアは持たない）
--   取り込み済みのビデオの印は scripts/video-import（catalog.json の pairWithNext）で付ける。
--
-- 対応ファイル: DDL/table/com_m_video.sql
-- =========================================================================

BEGIN;

ALTER TABLE public.com_m_video ADD COLUMN pair_with_next boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.com_m_video.pair_with_next IS '次のビデオとペアか（true:教材の中の並び順で次のビデオと2本を1回分として今日のメニューに割り当てる）';

COMMIT;
