---------------------------------------------
-- ライセンス期限切れの日次自己修復バッチ (2026-08-06 追加)
-- 既存環境に対しては、このファイルをSupabase SQL Editor等で実行してください。
-- 前提: pg_cron 拡張機能が有効になっていること
--       （Supabase Dashboard > Database > Extensions から有効化するか、
--         下記の CREATE EXTENSION 文をそのまま実行してください）
---------------------------------------------
-- 【背景】
-- auth.users.raw_app_meta_data.is_licensed は com_t_user_license への
-- INSERT/UPDATE/DELETEイベント時にのみ sync_user_license_metadata トリガーで
-- 再計算されるため、「何のイベントも起きないまま end_date を迎えて自然に期限切れになる」
-- ケースでは古い値（true）のまま取り残される。
--
-- 【方式】
-- 生徒アプリの都度リクエスト時にRPCで再検証する案は、利用者数増加に伴い通信量が
-- 増え続けるため採用せず、「今日ちょうど期限切れを迎えた行」だけを日次バッチで
-- 軽くUPDATE（update_dateタッチ）し、既存の sync_user_license_metadata トリガーを
-- 発火させることで is_licensed を再計算させる。判定ロジック自体は一切変更しない。
--
-- 【実行タイミング】
-- 日本にはDST(サマータイム)が無いため、「UTC 15:00 = JST 0:00」は年間を通じて固定。
-- 契約・ライセンスの終了日時は常に「その日23:59:59.999 JST」で保存される
-- （getUtcRangeFromJstDate 参照）ため、UTC 15:00 に日次実行すれば日付境界の
-- 切り替わり直後に確実に補正できる。
--
-- 【対象範囲】
-- status=1 のライセンスは自然期限切れ後も自動的にステータスが遷移しないため、
-- 対象を「end_date < NOW()」で無制限に取ると、過去の期限切れ行を毎日延々と
-- 再UPDATEし続けることになり負荷が増大し続ける。そのため対象は直近2日分
-- （cronが1回程度失敗しても取りこぼさないようバッファを持たせた範囲）に限定する。
-- 既存の未補正分（本パッチ適用時点で既に期限切れなのに is_licensed=true のまま
-- 残っている行）は、末尾の一回限りのバックフィルで別途解消する。
---------------------------------------------

-- pg_cron拡張の有効化（Dashboardで既に有効化済みの場合は無害）
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.touch_expired_user_licenses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.com_t_user_license
    SET update_date = NOW()
    WHERE status = 1
      AND end_date < NOW()
      AND end_date >= NOW() - INTERVAL '2 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_expired_user_licenses() FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-user-licenses-daily';

SELECT cron.schedule(
    'expire-stale-user-licenses-daily',
    '0 15 * * *', -- UTC 15:00 = JST 0:00（日本はDSTが無いため年間固定）
    $$ SELECT public.touch_expired_user_licenses(); $$
);

---------------------------------------------
-- 【一回限りのバックフィル】
-- 本パッチ適用時点で既に期限切れなのに is_licensed=true のまま放置されている
-- 既存データを一度だけ補正する。以後は上記の日次cronが継続的に処理するため、
-- この文を定期実行する必要はない（再実行しても副作用はないが無駄な書き込みになる）。
---------------------------------------------
UPDATE public.com_t_user_license
SET update_date = NOW()
WHERE status = 1
  AND end_date < NOW();
