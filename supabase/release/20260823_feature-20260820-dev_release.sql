-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260820-dev
-- 作成日: 2026-08-23
--
-- 【内容】
--   学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・各種通算値）の追加
--   1. student_m_training_lifetime_stats テーブルを新規作成
--      - 単語ドリル/スプリントの月次履歴テーブル（self_t_word_summary /
--        self_t_sprint_summary / self_t_sprint）を都度スキャンせずに、通算学習日数・
--        連続学習日数・最終トレーニング日・各種通算値を即時参照するための事前集計テーブル。
--      - 学習履歴が数年分蓄積してもクエリ性能が劣化しないよう、
--        トレーニング画面（apps/student/training配下の実績・履歴一覧）の
--        パフォーマンス検討の一環として先行対応するもの。
--      - 保持項目: 通算学習日数 / 連続学習日数 / 最終トレーニング日 /
--        通算単語数・フレーズ数 / 通算発話評価回数 / 通算スプリント本数・回答数。
--   2. update_training_lifetime_stats() を新規作成
--      - 1.のテーブルを更新する内部関数。通算学習日数・連続学習日数・最終トレーニング日は
--        同日内の複数回呼び出しでは加算せず、前日から連続していれば連続日数+1、
--        1日以上空いていれば1にリセットする。各種通算値（単語数等）は呼び出し順に依存しない
--        単純加算のため、常にデルタを加算する。
--      - アプリからの直接呼び出しは想定せず、下記の関数・トリガーの内部からのみ実行される
--        （REVOKE EXECUTE 済み）。
--   3. increment_word_summary() / increment_sprint_summary() を更新
--      - 既存の日次サマリーUpsert処理の末尾で update_training_lifetime_stats()
--        を呼び出すよう変更（既存の引数・戻り値に変更はなし）。
--   4. sync_sprint_session_lifetime_stats() を新規作成し、self_t_sprint に INSERTトリガーとして設置
--      - self_t_sprint（自主トレスプリントのセッションモード）は createSprintScoreAction()
--        から直接 INSERT されており、上記2関数のようなRPC経由の更新が入らない。
--        そのままだと「タイムドスプリントのみを実施したユーザー」の学習実績サマリーが
--        更新されないため、INSERTトリガーで同期する。
--   5. 既存ユーザーの学習履歴からの初期バックフィル
--      - 新規テーブルのため、リリース時点で既に学習実績のある既存ユーザーが
--        「通算0日・連続0日・各種通算値0」に見えないよう、既存の3つの履歴テーブルから
--        全項目を算出して一括投入する。
--   6. アプリケーションコード側の変更は本SQLの対象外（DB変更のみ）。
--
--   契約管理機能の改善（同ブランチでコミット済みのDDL）
--   7. purge_contract_with_history(uuid) を新規作成
--      - 検証用に作成したテスト契約を、紐づくライセンス割当・割当履歴・
--        チケット履歴まで含めて完全削除するための管理者専用RPC。
--        既存の deleteContract（通常削除）は、実運用契約の監査ログを
--        誤って失わせないよう履歴テーブルからのFK参照がある契約の削除を
--        意図的に拒否するため、その例外的な削除経路として追加するもの。
--      - service_role（管理画面のサーバーアクション）経由のみを想定し、
--        anon/authenticated からの直接実行は REVOKE 済み。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（IF NOT EXISTS / CREATE OR REPLACE /
--   ON CONFLICT DO UPDATE）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. student_m_training_lifetime_stats 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.student_m_training_lifetime_stats (
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE PRIMARY KEY,
  total_active_days INT NOT NULL DEFAULT 0,
  current_streak_days INT NOT NULL DEFAULT 0,
  last_training_date DATE,
  total_words INT NOT NULL DEFAULT 0,
  total_phrases INT NOT NULL DEFAULT 0,
  total_assessments INT NOT NULL DEFAULT 0,
  total_sprint_sessions INT NOT NULL DEFAULT 0,
  total_sprint_answers INT NOT NULL DEFAULT 0,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 冪等性確保: 本スクリプトの以前のバージョンを既に適用済みの環境向けに、旧カラム構成からの追従を保証する
ALTER TABLE public.student_m_training_lifetime_stats ADD COLUMN IF NOT EXISTS total_words INT NOT NULL DEFAULT 0;
ALTER TABLE public.student_m_training_lifetime_stats ADD COLUMN IF NOT EXISTS total_phrases INT NOT NULL DEFAULT 0;
ALTER TABLE public.student_m_training_lifetime_stats ADD COLUMN IF NOT EXISTS total_assessments INT NOT NULL DEFAULT 0;
ALTER TABLE public.student_m_training_lifetime_stats ADD COLUMN IF NOT EXISTS total_sprint_sessions INT NOT NULL DEFAULT 0;
ALTER TABLE public.student_m_training_lifetime_stats ADD COLUMN IF NOT EXISTS total_sprint_answers INT NOT NULL DEFAULT 0;

COMMENT ON TABLE public.student_m_training_lifetime_stats IS '学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・各種通算値を保持する事前集計テーブル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_active_days IS '通算学習日数（単語ドリル・スプリントいずれかを実施したユニーク日数の累計）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.current_streak_days IS '連続学習日数（最終トレーニング日から連続して学習している日数。1日でも空くと1にリセット）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.last_training_date IS '最終トレーニング実施日（ユーザーのタイムゾーン基準のローカル日付）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_words IS '通算学習単語数（単語ドリル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_phrases IS '通算学習フレーズ数（単語ドリル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_assessments IS '通算発話評価回数（単語ドリル・スプリント[セッション/ドリル]の合算）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_sprint_sessions IS '通算スプリント実施本数（自主トレスプリントのセッション完了回数。ドリルモードは含まない）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_sprint_answers IS '通算スプリント回答数（自主トレスプリントのセッション内回答総数。ドリルモードは含まない）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.update_date IS '更新日時';

ALTER TABLE public.student_m_training_lifetime_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own training lifetime stats" ON public.student_m_training_lifetime_stats;

CREATE POLICY "Users can manage their own training lifetime stats" ON public.student_m_training_lifetime_stats
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 2. update_training_lifetime_stats() 新規作成
-- =========================================================================
-- 旧シグネチャ（2引数版）が存在する場合はクリーンアップ（引数が異なるため別関数として共存してしまうのを防ぐ）
DROP FUNCTION IF EXISTS public.update_training_lifetime_stats(UUID, DATE);

CREATE OR REPLACE FUNCTION public.update_training_lifetime_stats(
  p_user_id UUID,
  p_training_date DATE,
  p_word_delta INT DEFAULT 0,
  p_phrase_delta INT DEFAULT 0,
  p_assessment_delta INT DEFAULT 0,
  p_sprint_session_delta INT DEFAULT 0,
  p_sprint_answer_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.student_m_training_lifetime_stats (
    user_id, total_active_days, current_streak_days, last_training_date,
    total_words, total_phrases, total_assessments,
    total_sprint_sessions, total_sprint_answers
  )
  VALUES (
    p_user_id, 1, 1, p_training_date,
    p_word_delta, p_phrase_delta, p_assessment_delta,
    p_sprint_session_delta, p_sprint_answer_delta
  )
  ON CONFLICT (user_id) DO UPDATE SET
    -- 日付起点の項目は、過去日付での呼び出し（クロックずれ等の異常系）を無視して安全側に倒す
    total_active_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      ELSE student_m_training_lifetime_stats.total_active_days + 1
    END,
    current_streak_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date - 1
        THEN student_m_training_lifetime_stats.current_streak_days + 1
      ELSE 1
    END,
    last_training_date = GREATEST(student_m_training_lifetime_stats.last_training_date, p_training_date),
    -- 通算カウンタ系は呼び出し順序に依存しない単純加算のため、日付の前後に関わらず常に加算する
    total_words = student_m_training_lifetime_stats.total_words + p_word_delta,
    total_phrases = student_m_training_lifetime_stats.total_phrases + p_phrase_delta,
    total_assessments = student_m_training_lifetime_stats.total_assessments + p_assessment_delta,
    total_sprint_sessions = student_m_training_lifetime_stats.total_sprint_sessions + p_sprint_session_delta,
    total_sprint_answers = student_m_training_lifetime_stats.total_sprint_answers + p_sprint_answer_delta,
    update_date = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_training_lifetime_stats(UUID, DATE, INT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. increment_word_summary() 更新（末尾で update_training_lifetime_stats を呼び出し）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.increment_word_summary(
  p_content_id UUID,
  p_word_count INT,
  p_phrase_count INT,
  p_assessment_count INT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_timezone TEXT;
  v_local_today DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = v_user_id AND delete_flg = '0';

  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  INSERT INTO public.self_t_word_summary (
    user_id, content_id, training_date, word_count, phrase_count, assessment_count
  )
  VALUES (
    v_user_id,
    p_content_id,
    v_local_today,
    p_word_count,
    p_phrase_count,
    p_assessment_count
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET
    word_count = self_t_word_summary.word_count + p_word_count,
    phrase_count = self_t_word_summary.phrase_count + p_phrase_count,
    assessment_count = self_t_word_summary.assessment_count + p_assessment_count,
    update_date = NOW();

  PERFORM public.update_training_lifetime_stats(
    v_user_id,
    v_local_today,
    p_word_delta => p_word_count,
    p_phrase_delta => p_phrase_count,
    p_assessment_delta => p_assessment_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) TO authenticated;

-- =========================================================================
-- 4. increment_sprint_summary() 更新（末尾で update_training_lifetime_stats を呼び出し）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.increment_sprint_summary(
  p_content_id UUID,
  p_question_count INT,
  p_assessment_count INT,
  p_question_type TEXT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_timezone TEXT;
  v_local_today DATE;

  v_speed_inc INT := 0;
  v_structure_inc INT := 0;
  v_builders_inc INT := 0;
  v_mastery_inc INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = v_user_id AND delete_flg = '0';

  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  IF p_question_type = '0' THEN
    v_speed_inc := p_question_count;
  ELSIF p_question_type = '4' THEN
    v_structure_inc := p_question_count;
  ELSIF p_question_type = '5' THEN
    v_builders_inc := p_question_count;
  ELSIF p_question_type = '6' THEN
    v_mastery_inc := p_question_count;
  END IF;

  INSERT INTO public.self_t_sprint_summary (
    user_id,
    content_id,
    training_date,
    question_count,
    assessment_count,
    speed_count,
    structure_count,
    builders_count,
    mastery_count
  )
  VALUES (
    v_user_id,
    p_content_id,
    v_local_today,
    p_question_count,
    p_assessment_count,
    v_speed_inc,
    v_structure_inc,
    v_builders_inc,
    v_mastery_inc
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET
    question_count = self_t_sprint_summary.question_count + p_question_count,
    assessment_count = self_t_sprint_summary.assessment_count + p_assessment_count,
    speed_count = self_t_sprint_summary.speed_count + v_speed_inc,
    structure_count = self_t_sprint_summary.structure_count + v_structure_inc,
    builders_count = self_t_sprint_summary.builders_count + v_builders_inc,
    mastery_count = self_t_sprint_summary.mastery_count + v_mastery_inc,
    update_date = NOW();

  -- 💡 ドリルモードのため通算スプリント本数・回答数（total_sprint_sessions/total_sprint_answers）は
  --    加算しない。これらはセッションモード（self_t_sprint への INSERT）専用のカウンタ。
  PERFORM public.update_training_lifetime_stats(
    v_user_id,
    v_local_today,
    p_assessment_delta => p_assessment_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) TO authenticated;

-- =========================================================================
-- 5. sync_sprint_session_lifetime_stats() 新規作成 + self_t_sprint への INSERTトリガー設置
-- =========================================================================
-- self_t_sprint（自主トレスプリントのセッションモード）は createSprintScoreAction() から
-- 直接 INSERT される（RPC経由ではない）ため、INSERTトリガーで学習実績サマリーを同期する。
CREATE OR REPLACE FUNCTION public.sync_sprint_session_lifetime_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_user_timezone TEXT;
  v_local_date DATE;
BEGIN
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = NEW.user_id AND delete_flg = '0';

  v_local_date := (NEW.insert_date AT TIME ZONE v_user_timezone)::date;

  PERFORM public.update_training_lifetime_stats(
    NEW.user_id,
    v_local_date,
    p_assessment_delta => NEW.total_assessments,
    p_sprint_session_delta => 1,
    p_sprint_answer_delta => NEW.total_answered
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_sprint_session_insert ON public.self_t_sprint;
CREATE TRIGGER on_sprint_session_insert
AFTER INSERT ON public.self_t_sprint
FOR EACH ROW EXECUTE PROCEDURE public.sync_sprint_session_lifetime_stats();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_sprint_session_lifetime_stats() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 6. 既存ユーザーの学習履歴からの初期バックフィル
--    student_m_training_lifetime_stats は新規テーブルのため、リリース時点で
--    既に学習実績のある既存ユーザーは行が存在せず全項目0に見えてしまう。単語ドリル
--    (self_t_word_summary)・スプリントドリル(self_t_sprint_summary)・
--    スプリントセッション(self_t_sprint)の実施済み履歴から全項目を算出して一括投入する。
--    以降は 2.〜5. の関数・トリガーが差分更新を担う。
--    ON CONFLICT DO UPDATE のため、再実行しても常に最新の履歴から再計算され
--    冪等（この一括SQLの再実行が唯一の反映手段であり、通常運用では
--    increment_* 関数・トリガー側の差分更新のみで足りる）。
-- =========================================================================
-- UNION（UNION ALLではない）により (user_id, d) の重複は自動的に除去される
WITH distinct_dates AS (
  SELECT user_id, training_date AS d
  FROM public.self_t_word_summary
  UNION
  SELECT user_id, training_date AS d
  FROM public.self_t_sprint_summary
  UNION
  SELECT s.user_id, (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date AS d
  FROM public.self_t_sprint s
  JOIN public.com_m_user u ON u.id = s.user_id
),
totals AS (
  SELECT user_id, COUNT(*) AS total_active_days, MAX(d) AS last_training_date
  FROM distinct_dates
  GROUP BY user_id
),
-- ギャップ&アイランド法: 日付から連番を引くと、連続した日付は同じ値になることを利用してグルーピングする
streak_groups AS (
  SELECT
    user_id,
    d,
    d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int AS grp
  FROM distinct_dates
),
streak_lengths AS (
  SELECT user_id, grp, MAX(d) AS group_end_date, COUNT(*) AS streak_len
  FROM streak_groups
  GROUP BY user_id, grp
),
current_streak AS (
  -- 最終実施日(last_training_date)を含む連続区間の長さ = 現時点の連続学習日数
  SELECT sl.user_id, sl.streak_len AS current_streak_days
  FROM streak_lengths sl
  JOIN totals t ON t.user_id = sl.user_id AND sl.group_end_date = t.last_training_date
),
-- 通算単語数・フレーズ数・単語ドリルの発話評価回数
word_totals AS (
  SELECT
    user_id,
    SUM(word_count) AS total_words,
    SUM(phrase_count) AS total_phrases,
    SUM(assessment_count) AS word_assessments
  FROM public.self_t_word_summary
  GROUP BY user_id
),
-- スプリントドリルの発話評価回数
sprint_drill_totals AS (
  SELECT user_id, SUM(assessment_count) AS drill_assessments
  FROM public.self_t_sprint_summary
  GROUP BY user_id
),
-- 通算スプリント本数・回答数・セッションモードの発話評価回数
sprint_session_totals AS (
  SELECT
    user_id,
    COUNT(*) AS total_sprint_sessions,
    SUM(total_answered) AS total_sprint_answers,
    SUM(total_assessments) AS session_assessments
  FROM public.self_t_sprint
  GROUP BY user_id
)
INSERT INTO public.student_m_training_lifetime_stats (
  user_id, total_active_days, current_streak_days, last_training_date,
  total_words, total_phrases, total_assessments,
  total_sprint_sessions, total_sprint_answers
)
SELECT
  t.user_id,
  t.total_active_days,
  cs.current_streak_days,
  t.last_training_date,
  COALESCE(wt.total_words, 0),
  COALESCE(wt.total_phrases, 0),
  COALESCE(wt.word_assessments, 0) + COALESCE(sdt.drill_assessments, 0) + COALESCE(sst.session_assessments, 0),
  COALESCE(sst.total_sprint_sessions, 0),
  COALESCE(sst.total_sprint_answers, 0)
FROM totals t
JOIN current_streak cs ON cs.user_id = t.user_id
LEFT JOIN word_totals wt ON wt.user_id = t.user_id
LEFT JOIN sprint_drill_totals sdt ON sdt.user_id = t.user_id
LEFT JOIN sprint_session_totals sst ON sst.user_id = t.user_id
ON CONFLICT (user_id) DO UPDATE SET
  total_active_days = EXCLUDED.total_active_days,
  current_streak_days = EXCLUDED.current_streak_days,
  last_training_date = EXCLUDED.last_training_date,
  total_words = EXCLUDED.total_words,
  total_phrases = EXCLUDED.total_phrases,
  total_assessments = EXCLUDED.total_assessments,
  total_sprint_sessions = EXCLUDED.total_sprint_sessions,
  total_sprint_answers = EXCLUDED.total_sprint_answers,
  update_date = NOW();

-- =========================================================================
-- 7. purge_contract_with_history(uuid) 新規作成（契約管理改善）
-- =========================================================================
-- 前提: table/com_m_contract.sql, table/com_t_user_license.sql,
--       table/com_t_user_license_history.sql, table/com_t_user_session_ticket.sql,
--       table/com_t_user_session_ticket_history.sql の作成が完了していること
--       （前回までのリリースで反映済み）。
--
-- 【背景】
-- com_m_contract は、一度でもライセンスが割り当てられた実績があると、
-- com_t_user_license_history / com_t_user_session_ticket_history からの
-- 外部キー参照が残るため、通常の DELETE（deleteContract アクション）は
-- DB制約(23503)により拒否される（これは実運用契約の監査ログを誤って
-- 失わせないための意図的な安全策であり、通常運用では変更しない）。
--
-- 一方で、新規プランの検証等で作成したテスト契約は、検証後に痕跡なく
-- 削除できた方が運用上望ましい。本関数はその用途に限定した「例外的な
-- 完全削除」の入口であり、契約本体だけでなく紐づくライセンス割当・
-- 割当履歴・チケット履歴まで全て物理削除する（＝監査ログも消える）。
-- 実運用契約に対して実行すると復元不能な監査情報の欠落を招くため、
-- 呼び出し元（adminContractAction.purgeContractWithHistory）では
-- 通常の契約削除とは別の、強い確認を伴うUI経由でのみ呼び出すこと。
--
-- 複数テーブルへの削除を単一トランザクションで実行するためRPC化する
-- （Supabase JSクライアントからの逐次DELETEでは、途中失敗時に
-- 中途半端な状態が残り得るため）。
CREATE OR REPLACE FUNCTION public.purge_contract_with_history(p_contract_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- com_t_user_session_ticket は com_t_user_license 削除時にON DELETE CASCADEで
    -- 自動的に削除されるため、ここでの明示的な削除対象にはしない
    DELETE FROM public.com_t_user_session_ticket_history WHERE contract_id = p_contract_id;
    DELETE FROM public.com_t_user_license_history WHERE contract_id = p_contract_id;
    DELETE FROM public.com_t_user_license WHERE contract_id = p_contract_id;

    -- com_t_invitation.contract_id は ON DELETE SET NULL のため、
    -- 契約削除時に自動的にNULLへ更新される（明示的な削除は不要）

    DELETE FROM public.com_m_contract WHERE contract_id = p_contract_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'contract % not found', p_contract_id;
    END IF;
END;
$$;

-- 呼び出しはservice_role経由（管理画面のサーバーアクション）のみを想定するため、
-- 一般ロールからの直接実行は許可しない
REVOKE EXECUTE ON FUNCTION public.purge_contract_with_history(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT * FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'student_m_training_lifetime_stats';
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'update_training_lifetime_stats';
--
-- SELECT tgname FROM pg_trigger WHERE tgname = 'on_sprint_session_insert';
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'purge_contract_with_history';
--
-- -- バックフィル件数の確認（既存の学習履歴を持つユーザー数と一致するはず）
-- SELECT COUNT(*) FROM public.student_m_training_lifetime_stats;
--
-- -- 特定ユーザーの算出結果を、元の履歴データと突き合わせて検算する例
-- SELECT * FROM public.student_m_training_lifetime_stats
-- WHERE user_id = '<検証したいユーザーのUUID>';
--
-- -- 実際にドリル/スプリントを1回実施した後、対象ユーザーの行が想定通り更新されるか確認
-- SELECT user_id, total_active_days, current_streak_days, last_training_date,
--        total_words, total_phrases, total_assessments,
--        total_sprint_sessions, total_sprint_answers, update_date
-- FROM public.student_m_training_lifetime_stats
-- ORDER BY update_date DESC
-- LIMIT 10;
