-- =========================================================================
-- com_m_coach_profile: コーチの公開プロフィール（com_m_user の1対1の拡張）
-- =========================================================================
-- 【作成】
-- コーチの作成時に handle_new_user() トリガーが空の行を作り、coach_since（作成月の1日）を入れる。
-- 作成時にトリガーが新人コーチの初期の評価（3項目とも4）を登録する（fn_create_initial_coach_rating）。
-- 作成はトリガー（service_role）だけで行い、コーチ本人は自分の行の更新だけができる。
--
-- 【参照できる範囲】
-- 有効なプロフィールは認証済みユーザーなら誰でも参照できる（生徒がコーチを選ぶため）。自分の行は常に参照できる。
--
-- 【主な列】
-- intro_video_path: 紹介ビデオ（Storage の profile バケット、profile/{user_id}/video/{uuid}.mp4）
-- zoom_meeting_url: コーチ固定のミーティングURL（セッションごとにURLは持たない）
-- availability_confirmed_at: 空き時間を最後に確認した日時。空き時間は UTC で持つためコーチの現地時刻では
--   夏時間の切り替えでずれる。14日ごとに見直しを促す通知に使う（function/enqueue_coach_availability_reminders.sql）。
-- accepting_students: 新規の生徒の受付（初期値 ON）。OFF で止めるのは新しいマッチングだけで、担当中の生徒・
--   確定済みのセッションは続く。アドミンによる休止は com_m_coach_matching_suspension。
--   「専属コーチを探す」に出る条件は get_matchable_coach_ids()（受付 ON・休止でない・必須項目と空き時間がそろっている）。
-- =========================================================================

-- @schema public.com_m_coach_profile
CREATE TABLE public.com_m_coach_profile (
    user_id                  uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    country_code             text         REFERENCES public.com_m_country(country_code) ON DELETE RESTRICT,
    coach_since              date,
    education                text,
    qualifications           text,
    teaching_years           smallint,
    job_experience           text,
    introduction             text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    intro_video_path         text,
    zoom_meeting_url         text,
    availability_confirmed_at timestamp with time zone,
    accepting_students       boolean      NOT NULL DEFAULT true
);

COMMENT ON TABLE public.com_m_coach_profile IS 'コーチ公開プロフィールマスタ（com_m_userの1:1拡張、生徒向け公開項目）';
COMMENT ON COLUMN public.com_m_coach_profile.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_profile.country_code IS '国籍（com_m_country.country_code）';
COMMENT ON COLUMN public.com_m_coach_profile.coach_since IS 'コーチ活動開始年月（アカウント作成日の月初日を自動設定。手入力不可）';
COMMENT ON COLUMN public.com_m_coach_profile.education IS '学歴';
COMMENT ON COLUMN public.com_m_coach_profile.qualifications IS '保有資格';
COMMENT ON COLUMN public.com_m_coach_profile.teaching_years IS '英語指導年数';
COMMENT ON COLUMN public.com_m_coach_profile.job_experience IS '職務経験';
COMMENT ON COLUMN public.com_m_coach_profile.introduction IS '自己紹介（自由記述）';
COMMENT ON COLUMN public.com_m_coach_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_profile.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_coach_profile.intro_video_path IS '紹介ビデオのStorageパス（profileバケット内、例: profile/{user_id}/video/xxxx.mp4）';
COMMENT ON COLUMN public.com_m_coach_profile.zoom_meeting_url IS 'ライブセッション用の固定ビデオ通話URL（現状はZoomの個人ミーティングURLを想定。生徒への公開は自身の確定レッスン参加者に限定するため、UI側で表示範囲を制御する）';
COMMENT ON COLUMN public.com_m_coach_profile.availability_confirmed_at IS '空き時間を最後に確認した日時（空き時間の保存・「変更なしで確認」で更新。NULLは未確認。14日を過ぎると見直しの通知を出す）';
COMMENT ON COLUMN public.com_m_coach_profile.accepting_students IS '新規の生徒の受付（コーチ本人が切り替える。falseの間は生徒のコーチ選択に出さない）';

CREATE TRIGGER trg_coach_profile_initial_rating AFTER INSERT ON public.com_m_coach_profile FOR EACH ROW EXECUTE FUNCTION public.trg_create_initial_coach_rating();

ALTER TABLE public.com_m_coach_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active coach profiles" ON public.com_m_coach_profile FOR SELECT TO authenticated
USING (
    true
);

CREATE POLICY "Coaches can update their own profile" ON public.com_m_coach_profile FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
