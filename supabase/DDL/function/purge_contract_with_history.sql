---------------------------------------------
-- 契約の完全削除（履歴含む）RPC (2026-08-22 追加)
-- 前提: table/com_m_contract.sql, table/com_t_user_license.sql,
--       table/com_t_user_license_history.sql, table/com_t_user_session_ticket.sql,
--       table/com_t_user_session_ticket_history.sql の作成が完了していること。
---------------------------------------------
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
---------------------------------------------
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
