---------------------------------------------
-- 学習進捗の達成通知（初回トレーニング・連続日数マイルストーン）
---------------------------------------------
-- student_m_training_lifetime_stats（単語ドリル/スプリントドリル/スプリントセッションの
-- いずれの経路でも update_training_lifetime_stats() が更新する集計テーブル）へのトリガーとして
-- 1箇所にフックすることで、学習実施経路によらず一律に達成判定できる。
--
-- 連続日数の達成閾値は v_streak_milestones 配列で管理する。今後「10日連続」「30日連続」等の
-- 閾値を追加する場合は、この配列に値を足すだけでよい（スキーマ変更不要）。
-- dedup_key に閾値を含めた固定文字列(例: 'STREAK_5')を用いるため、当該閾値への到達は
-- ユーザーごとに一度だけ通知される（ON CONFLICT DO NOTHING）。同じ閾値に複数回到達しても
-- 再通知はされない仕様（初達成をお祝いする体験として割り切り。再通知が必要になった場合は
-- dedup_key にサイクル番号を含める等の拡張で対応する）。
CREATE OR REPLACE FUNCTION public.notify_training_milestone()
RETURNS TRIGGER AS $$
DECLARE
  v_streak_milestones INT[] := ARRAY[5];
  v_milestone INT;
BEGIN
  -- 初回トレーニング実施 (総学習日数が 0→1 になった瞬間のみ)
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

  -- 連続学習日数マイルストーン到達
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

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.notify_training_milestone() FROM PUBLIC, anon, authenticated;
