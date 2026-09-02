-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260828-dev
-- 作成日: 2026-08-28
--
-- 【内容】
--   通知(notification)機能の新規追加 (Phase 1: 進捗達成通知 / Phase 2: チャット新着通知)
--   1. com_t_notification テーブルを新規作成
--      - お知らせ(com_m_notice、管理者発信の一斉配信コンテンツ)とは別概念の、
--        システムが自動発火する個人宛イベント通知（学習進捗の達成・チャット新着等）を保持する。
--      - notification_type はDB側で縛らず自由なVARCHARとし、表示定義はアプリ側
--        (packages/types/notification.ts) に一元管理することで、新しい通知種別の追加が
--        スキーマ変更を伴わないようにしている。
--      - (user_id, notification_type, dedup_key) にUNIQUE制約を設け、通知の性質に応じて
--        ON CONFLICT DO NOTHING（達成系: 一度きりの発火を保証）/
--        ON CONFLICT DO UPDATE（フロー系: 同一キー宛の連続発生を1行に集約）を使い分ける。
--   2. notify_training_milestone() を新規作成し、student_m_training_lifetime_stats への
--      INSERT/UPDATEトリガーとして設置
--      - 初回トレーニング実施（総学習日数 0→1）、連続学習日数マイルストーン到達（まずは5日連続）
--        の2種を通知する。閾値は関数内の配列で管理し、今後の追加は配列への追記のみで対応可能。
--   3. notify_chat_new_message() を新規作成し、com_t_chat への INSERTトリガーとして設置
--      - 新着メッセージの送信者以外の在室メンバー全員に通知行を作成/更新する。
--        dedup_key に room_id を用いてON CONFLICT DO UPDATEすることで、同一ルームからの
--        連続送信が通知の乱立にならず1行に集約されるようにしている。
--      - 対象UIはチャット画面が存在する admin/coach アプリのみ実装する（studentアプリには
--        現状チャット画面自体が無いため対象外。DB側は将来のstudent対応に備えuser_typeを
--        問わず一律に通知行を作成する）。
--   4. アプリケーションコード側の変更は本SQLの対象外（DB変更のみ）。
--
--   Student Overview画面(コーチ向け・担当生徒詳細)の新規追加
--   5. com_t_coach_student_note テーブルを新規作成
--      - コーチが担当生徒ごとに自分用のメモを記録するためのテーブル。他コーチのメモは不可視
--        (coach_id = auth.uid()の行のみ)。更新は行わず追記のみとし、画面では最新順に表示する。
--   6. student_m_sprint_progress に、担当コーチ向けの参照許可ポリシーを追加
--      - com_m_lesson_scheduleで結びついたコーチ(status不問。コーチ交代後の引き継ぎ閲覧を想定)が、
--        生徒のスプリント進捗(ステージ・レベル)を参照できるようにする。既存の本人向けALLポリシー
--        はそのまま残るため、本人のフルアクセスは変わらない(追加の許可のみ)。
--
--   コーチ向け Lesson Sprint 機能の新規追加
--   7. lesson_t_sprint テーブルを新規作成
--      - コーチがレッスン中に対面で実施するスプリントトレーニング（self_t_sprintの生徒自主トレ版に
--        対応するコーチ運用版）の結果・履歴を保持する。音声再生/認識は行わず、コーチが1-5の手動評価と
--        解答文中のクリック単語（ハイライト）を記録する。コーチは自分が実施した記録をFOR ALLで操作でき、
--        生徒本人は自分が対象の記録をSELECTのみ可能。com_t_session/com_m_lesson_scheduleへの紐付けは
--        行わず、coach_id/student_id/insert_dateのみで管理するシンプルな構成とした。
--
--   Student Overview画面ヘッダーへの契約情報表示対応
--   8. com_t_user_license / com_m_contract に、担当コーチ向けの参照許可ポリシーを追加
--      - 生徒が現在有効な契約を持っているか（契約期間・プラン名）をヘッダーに表示するため、
--        担当コーチがライセンス行および紐づく契約を参照できるようにする。
--        com_m_lesson_scheduleで結びついたコーチ(status不問。コーチ交代後の引き継ぎ閲覧を想定)
--        のみが対象で、既存の本人・契約先クライアント向けポリシーはそのまま残る(追加の許可のみ)。
--        アプリケーションコード側の変更(getStudentOverviewCoreの拡張、ヘッダーUIの表示追加)は
--        本SQLの対象外。
--      - com_m_contract側のポリシーがcom_t_user_licenseを直接参照すると、com_t_user_license
--        側の既存ポリシーがcom_m_contractを参照しているため2テーブル間の循環参照(infinite
--        recursion detected in policy for relation)になる。is_coach_of_contract_license()
--        (SECURITY DEFINER)を新規作成し、これを経由させることで回避している。
--
--   Student Overview画面: コーチによる生徒レベル/ステージ手動編集機能の新規追加
--   9. student_m_sprint_progress に、担当コーチ向けの更新許可ポリシーを追加
--      - 問題種別ごとのレベルアップ、およびステージの強制アップ（不足レベルの底上げ）を
--        コーチが行えるようにする。既存の担当関係チェック(SELECTポリシーと同一条件)でUPDATEを
--        許可し、値の妥当性検証（範囲・「上げる」方向のみ等）はアプリケーション層で行う。
--      - ステージ到達条件マスタ(packages/types/stageProgression.ts)と判定ロジック
--        (packages/lib/sprint/stageProgression.ts)を新規追加し、Coach/Admin/将来の自動判定から
--        共通利用できるようにした。アプリケーションコード側の変更は本SQLの対象外（DB変更のみ）。
--
--   教材名称の英語版対応
--   10. com_m_contents に content_name_en (NULL許容) を追加
--      - 既存のcontent_name（日本語・必須）は生徒向け設計のまま維持しつつ、コーチ向け画面
--        （Lesson Sprintの教材選択・実施・結果・履歴）で使う英語版名称を任意項目として追加する。
--        全コンテンツ種別共通の項目とし、アドミンの教材管理画面から入力する。未入力の教材は
--        アプリ側でcontent_nameにフォールバックするため、既存データの一括バックフィルは不要。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（IF NOT EXISTS / CREATE OR REPLACE /
--   DROP ... IF EXISTS / ON CONFLICT）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_t_notification 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_notification (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  dedup_key VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, notification_type, dedup_key)
);

COMMENT ON TABLE public.com_t_notification IS '通知（システムが自動発火する個人宛イベント通知。お知らせ(com_m_notice)とは別概念）';
COMMENT ON COLUMN public.com_t_notification.notification_id IS '通知ID';
COMMENT ON COLUMN public.com_t_notification.user_id IS '通知対象ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_notification.notification_type IS '通知種別 (例: TRAINING_FIRST, TRAINING_STREAK, CHAT_NEW_MESSAGE)。表示定義はpackages/types/notification.tsで管理';
COMMENT ON COLUMN public.com_t_notification.dedup_key IS '集約キー。同一(user_id, notification_type, dedup_key)への再発生を1行に集約するために使用（NULL可、NULLは常に新規行）';
COMMENT ON COLUMN public.com_t_notification.payload IS '表示に必要なパラメータ (JSONB、通知種別ごとに内容が異なる)';
COMMENT ON COLUMN public.com_t_notification.link_path IS 'クリック時の遷移先（アプリ内相対パス）';
COMMENT ON COLUMN public.com_t_notification.is_read IS '既読フラグ';
COMMENT ON COLUMN public.com_t_notification.read_at IS '既読日時';
COMMENT ON COLUMN public.com_t_notification.occurred_at IS '最新発生日時（一覧のソート・表示用。集約UPSERT時に最新化される）';
COMMENT ON COLUMN public.com_t_notification.insert_date IS '登録日時（初回発生日時）';
COMMENT ON COLUMN public.com_t_notification.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON public.com_t_notification (user_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notification_user_occurred ON public.com_t_notification (user_id, occurred_at DESC);

ALTER TABLE public.com_t_notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.com_t_notification;
DROP POLICY IF EXISTS "Users can mark their own notifications as read" ON public.com_t_notification;

CREATE POLICY "Users can view their own notifications" ON public.com_t_notification
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
);

CREATE POLICY "Users can mark their own notifications as read" ON public.com_t_notification
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Realtime購読対象への追加は再実行時にエラーとなるため存在チェックしてから行う
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'com_t_notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_notification;
  END IF;
END $$;

-- =========================================================================
-- 2. notify_training_milestone() 新規作成 + student_m_training_lifetime_stats への
--    INSERT/UPDATEトリガー設置（進捗達成通知）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_training_milestone()
RETURNS TRIGGER AS $$
DECLARE
  v_streak_milestones INT[] := ARRAY[5];
  v_milestone INT;
BEGIN
  IF NEW.total_active_days = 1 AND (TG_OP = 'INSERT' OR OLD.total_active_days = 0) THEN
    INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path, occurred_at)
    VALUES (
      NEW.user_id,
      'TRAINING_FIRST',
      'FIRST_TRAINING',
      jsonb_build_object('days', 1),
      '/dashboard',
      NOW()
    )
    ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.current_streak_days IS DISTINCT FROM OLD.current_streak_days THEN
    FOREACH v_milestone IN ARRAY v_streak_milestones LOOP
      IF NEW.current_streak_days = v_milestone THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path, occurred_at)
        VALUES (
          NEW.user_id,
          'TRAINING_STREAK',
          'STREAK_' || v_milestone,
          jsonb_build_object('days', v_milestone),
          '/dashboard',
          NOW()
        )
        ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_training_lifetime_stats_change ON public.student_m_training_lifetime_stats;
CREATE TRIGGER on_training_lifetime_stats_change
AFTER INSERT OR UPDATE ON public.student_m_training_lifetime_stats
FOR EACH ROW EXECUTE PROCEDURE public.notify_training_milestone();

REVOKE EXECUTE ON FUNCTION public.notify_training_milestone() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. notify_chat_new_message() 新規作成 + com_t_chat への INSERTトリガー設置
--    （チャット新着通知。対象UIはadmin/coachアプリのみ実装、DB側はuser_type非依存）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_chat_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  SELECT user_name INTO v_sender_name
  FROM public.com_m_user
  WHERE id = NEW.sender_user_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  SELECT
    cru.user_id,
    'CHAT_NEW_MESSAGE',
    NEW.room_id::text,
    jsonb_build_object(
      'room_id', NEW.room_id,
      'sender_user_id', NEW.sender_user_id,
      'sender_name', v_sender_name,
      'preview', LEFT(NEW.message, 100),
      'message_type', NEW.message_type
    ),
    '/chat/' || NEW.room_id,
    NEW.created_at
  FROM public.com_t_chat_room_user cru
  WHERE cru.room_id = NEW.room_id
    AND cru.user_id != NEW.sender_user_id
    AND cru.left_at IS NULL
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_chat_message_insert_notify ON public.com_t_chat;
CREATE TRIGGER on_chat_message_insert_notify
AFTER INSERT ON public.com_t_chat
FOR EACH ROW EXECUTE PROCEDURE public.notify_chat_new_message();

REVOKE EXECUTE ON FUNCTION public.notify_chat_new_message() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 4. com_t_coach_student_note 新規作成
--    （Student Overview画面: コーチが担当生徒ごとに記録する自分用メモ。追記のみ・履歴管理）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_coach_student_note (
    note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_coach_student_note_text_not_blank CHECK (btrim(note_text) <> '')
);

COMMENT ON TABLE public.com_t_coach_student_note IS 'コーチ担当生徒メモ（コーチ自分用、追記のみ・履歴管理）';
COMMENT ON COLUMN public.com_t_coach_student_note.note_id IS 'メモID';
COMMENT ON COLUMN public.com_t_coach_student_note.coach_id IS '記入したコーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.student_id IS '対象の生徒のユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.note_text IS 'メモ本文';
COMMENT ON COLUMN public.com_t_coach_student_note.insert_date IS '登録日時';

CREATE INDEX IF NOT EXISTS idx_coach_student_note_lookup ON public.com_t_coach_student_note (coach_id, student_id, insert_date DESC);

ALTER TABLE public.com_t_coach_student_note ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view their own student notes" ON public.com_t_coach_student_note;
DROP POLICY IF EXISTS "Coaches can create their own student notes" ON public.com_t_coach_student_note;

-- [参照] 自分が記入したメモのみ閲覧可能（他コーチのメモは不可視）。管理者は全件参照可能。
CREATE POLICY "Coaches can view their own student notes" ON public.com_t_coach_student_note
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 自分自身をcoach_idとしてのみ作成可能
CREATE POLICY "Coaches can create their own student notes" ON public.com_t_coach_student_note
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
);

-- 更新・削除は許可しない（履歴として保持するため、authenticatedロールへのUPDATE/DELETE権限は付与しない）。

-- =========================================================================
-- 5. student_m_sprint_progress へのコーチ閲覧ポリシー追加
--    （Student Overview画面: 担当コーチが生徒のスプリント進捗(ステージ・レベル)を閲覧できるようにする。
--      既存の本人向け "Users can manage their own sprint progress" (FOR ALL) はそのまま残るため、
--      本人のフルアクセスは変わらない（追加の許可のみ）。
-- =========================================================================
DROP POLICY IF EXISTS "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = student_m_sprint_progress.user_id AND s.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 6. lesson_t_sprint 新規作成
--    （コーチ向け Lesson Sprint 機能: レッスン中にコーチが対面で実施するスプリントトレーニングの
--      結果・履歴。self_t_sprintの生徒自主トレ版に対応するコーチ運用版）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.lesson_t_sprint (
  lesson_sprint_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  sprint_type TEXT NOT NULL,
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  answer_type TEXT NOT NULL,
  difficulty_level SMALLINT NOT NULL,
  time_limit_sec SMALLINT NOT NULL,
  total_answered SMALLINT NOT NULL,
  total_evaluated SMALLINT NOT NULL,
  paused_duration_sec SMALLINT NOT NULL DEFAULT 0,
  session_note TEXT,
  answered_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lesson_t_sprint IS 'コーチ主導レッスンスプリント結果・履歴管理テーブル';
COMMENT ON COLUMN public.lesson_t_sprint.lesson_sprint_id IS 'レッスンスプリント結果ユニークID (UUID)';
COMMENT ON COLUMN public.lesson_t_sprint.coach_id IS '実施したコーチのユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.lesson_t_sprint.student_id IS '対象の生徒のユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.lesson_t_sprint.sprint_type IS 'スプリント種別';
COMMENT ON COLUMN public.lesson_t_sprint.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.lesson_t_sprint.question_type IS 'スプリント問題種別 (''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery)';
COMMENT ON COLUMN public.lesson_t_sprint.answer_type IS '解答種別（''0'': YES回答, ''1'': NO回答）';
COMMENT ON COLUMN public.lesson_t_sprint.difficulty_level IS '難易度レベル (0: Basic 〜 10)';
COMMENT ON COLUMN public.lesson_t_sprint.time_limit_sec IS '制限時間 (60, 90, 120, 150秒)';
COMMENT ON COLUMN public.lesson_t_sprint.total_answered IS '総提示問題数';
COMMENT ON COLUMN public.lesson_t_sprint.total_evaluated IS 'コーチが1-5評価した総回数（スキップ除く）';
COMMENT ON COLUMN public.lesson_t_sprint.paused_duration_sec IS '一時停止していた合計秒数（参考値）';
COMMENT ON COLUMN public.lesson_t_sprint.session_note IS 'スプリント中に記録したコーチのメモ';
COMMENT ON COLUMN public.lesson_t_sprint.answered_history IS '実施問題の履歴情報(JSON): question_id, group_id, seq_no, is_skipped, score(1-5|null), highlighted_word_indices';
COMMENT ON COLUMN public.lesson_t_sprint.insert_date IS '登録日時';
COMMENT ON COLUMN public.lesson_t_sprint.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_coach_student
  ON public.lesson_t_sprint (coach_id, student_id, insert_date DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_student
  ON public.lesson_t_sprint (student_id, insert_date DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_content_id
  ON public.lesson_t_sprint (content_id);

ALTER TABLE public.lesson_t_sprint ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint;
DROP POLICY IF EXISTS "Students can view their own lesson sprints" ON public.lesson_t_sprint;

CREATE POLICY "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint
FOR ALL TO authenticated
USING (coach_id = auth.uid() OR public.get_jwt_user_type() = '0')
WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Students can view their own lesson sprints" ON public.lesson_t_sprint
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
);

-- =========================================================================
-- 8. com_t_user_license / com_m_contract: 担当コーチ向けの参照許可ポリシー追加
--    （Student Overview画面ヘッダー: 生徒の契約有効性・プラン名表示のため）
-- =========================================================================
DROP POLICY IF EXISTS "Coaches can view licenses of their students" ON public.com_t_user_license;
CREATE POLICY "Coaches can view licenses of their students" ON public.com_t_user_license
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = com_t_user_license.user_id AND s.coach_id = auth.uid()
    )
);

-- com_m_contract側の新規ポリシーがcom_t_user_licenseを直接EXISTSで参照すると、
-- com_t_user_license側の既存ポリシー("Users can view relevant licenses")がcom_m_contract
-- を参照しているため、2テーブル間の循環参照(infinite recursion detected in policy for
-- relation)になる。is_chat_room_memberと同様、SECURITY DEFINER関数で回避する。
CREATE OR REPLACE FUNCTION public.is_coach_of_contract_license(p_contract_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_t_user_license l
    JOIN public.com_m_lesson_schedule s ON s.student_id = l.user_id
    WHERE l.contract_id = p_contract_id
      AND s.coach_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_coach_of_contract_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_of_contract_license(uuid) TO authenticated;

DROP POLICY IF EXISTS "Coaches can view contracts of their students' licenses" ON public.com_m_contract;
CREATE POLICY "Coaches can view contracts of their students' licenses" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    public.is_coach_of_contract_license(com_m_contract.contract_id)
);

-- =========================================================================
-- 9. student_m_sprint_progress: 担当コーチ向けの更新許可ポリシー追加
--    （Student Overview画面: コーチによる生徒のレベル/ステージ手動編集機能のため）
-- =========================================================================
DROP POLICY IF EXISTS "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress
FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = student_m_sprint_progress.user_id AND s.coach_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = student_m_sprint_progress.user_id AND s.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 10. com_m_contents: 教材名称の英語版カラム追加
--    （コーチ向け画面での教材名表示のため。全コンテンツ種別共通の任意項目。
--      未入力の教材はアプリ側でcontent_name（日本語・必須）にフォールバックする）
-- =========================================================================
ALTER TABLE public.com_m_contents ADD COLUMN IF NOT EXISTS content_name_en TEXT;
COMMENT ON COLUMN public.com_m_contents.content_name_en IS 'コンテンツ名称（英語版・任意。コーチ向け画面で使用し、未入力時はcontent_nameにフォールバックする）';

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT * FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'com_t_notification';
--
-- SELECT policyname FROM pg_policies WHERE tablename = 'com_t_notification';
--
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'com_t_notification';
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'notify_training_milestone';
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'notify_chat_new_message';
--
-- SELECT tgname FROM pg_trigger WHERE tgname = 'on_training_lifetime_stats_change';
-- SELECT tgname FROM pg_trigger WHERE tgname = 'on_chat_message_insert_notify';
--
-- -- 進捗達成通知の確認（対象ユーザーで単語ドリル/スプリントを実施後）
-- SELECT * FROM public.com_t_notification
-- WHERE notification_type IN ('TRAINING_FIRST', 'TRAINING_STREAK')
-- ORDER BY occurred_at DESC LIMIT 10;
--
-- -- チャット新着通知の確認（対象ルームでメッセージ送信後。連続送信しても1行のままか確認）
-- SELECT * FROM public.com_t_notification
-- WHERE notification_type = 'CHAT_NEW_MESSAGE'
-- ORDER BY occurred_at DESC LIMIT 10;
--
-- SELECT * FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'com_t_coach_student_note';
--
-- SELECT policyname FROM pg_policies WHERE tablename = 'com_t_coach_student_note';
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'student_m_sprint_progress'
--   AND policyname = 'Coaches can view sprint progress of their students';
--
-- SELECT * FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'lesson_t_sprint';
--
-- SELECT policyname FROM pg_policies WHERE tablename = 'lesson_t_sprint';
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'com_t_user_license'
--   AND policyname = 'Coaches can view licenses of their students';
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'com_m_contract'
--   AND policyname = 'Coaches can view contracts of their students'' licenses';
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'is_coach_of_contract_license';
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'student_m_sprint_progress'
--   AND policyname = 'Coaches can update sprint progress of their students';
--
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'com_m_contents' AND column_name = 'content_name_en';
