---------------------------------------------
-- set_update_date: 行の更新のたびに更新日時を現在時刻にする（BEFORE UPDATE トリガー用）
---------------------------------------------
-- 更新日時の列を持つ全テーブルに trg_set_update_date として付ける（新しいテーブルにも付ける。
-- 規約は supabase/DDL/README.md）。アプリ・RPC が update_date を書き忘れても、DB 側で必ず更新される
-- （書いた値は現在時刻で上書きする）。列名が update_date 以外のテーブルは、トリガーの引数で列名を渡す
-- （例: com_t_tts_asset は 'updated_at'）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.set_update_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(coalesce(TG_ARGV[0], 'update_date'), now()));
    RETURN NEW;
END;
$$;
