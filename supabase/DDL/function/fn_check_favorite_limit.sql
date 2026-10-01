---------------------------------------------
-- Function: fn_check_favorite_limit (お気に入りの登録上限チェック)
---------------------------------------------
-- お気に入りテーブル（com_t_favorite_contents / com_t_favorite_phrase / com_t_favorite_sprint_question）の
-- BEFORE INSERT トリガーで使う。ユーザーごと・テーブル（種別）ごとに登録件数の上限を設け、
-- 超える場合は SQLSTATE 'GBF01' の例外で登録を拒否する（アプリ側は apps/student/constants/favorites.ts）。
--
-- 引数: TG_ARGV[0] = 対象を表す列名（例: 'content_id'）。
-- ・登録済みの対象を upsert した場合（ON CONFLICT で更新になる場合）は件数が増えないため拒否しない
--   （BEFORE INSERT トリガーは ON CONFLICT の判定より前に動くため、ここで判定する）。
-- ・同じユーザーの同時登録で上限を超えないよう、ユーザー×テーブル単位のアドバイザリーロックで直列化する。
-- ・SECURITY INVOKER（既定）。件数は本人のRLSの範囲（本人の行）で数える。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_favorite_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_limit CONSTANT integer := 1000;
  v_target_column text := TG_ARGV[0];
  v_exists boolean;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || NEW.user_id::text));

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE user_id = $1 AND %I::text = $2)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_target_column
  )
  INTO v_exists
  USING NEW.user_id, to_jsonb(NEW) ->> v_target_column;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM %I.%I WHERE user_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
  INTO v_count
  USING NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'favorite limit exceeded (% rows) on %', v_limit, TG_TABLE_NAME
      USING ERRCODE = 'GBF01';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_check_favorite_limit() IS 'お気に入りの登録上限チェック（BEFORE INSERTトリガー。引数=対象の列名）';
