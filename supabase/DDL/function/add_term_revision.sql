---------------------------------------------
-- 規約本文のリビジョン追加RPC（サイレント更新） (2026-09-24 追加)
-- 前提: table/com_m_terms_revision.sql, function/fn_assert_actor_or_admin.sql の作成が
--       完了していること。
---------------------------------------------
-- 【概要】
-- 既存バージョンに新しいリビジョン（revision_no = 現在の最大値 + 1）を追加する。
-- 同意の単位（term_id）は変わらないため、ユーザーへの再同意は求めない（サイレント更新）。
-- 誤字修正・表現調整などの軽微な修正を想定。料金改定・免責事項・個人情報の取扱変更など
-- 再同意が必要な変更は create_term で新バージョンを作成すること。
--
-- 【修正理由の必須化】
-- 公開済み（published_date <= now()）のバージョンへの修正は、利用者が既に目にしている
-- 文面の変更となるため、監査のため p_change_note を必須とする。公開前は任意。
--
-- 【同時実行】
-- 親バージョン行を FOR UPDATE でロックしてから採番するため、同時保存でも
-- revision_no は重複しない。
--
-- 【呼び出し元】
-- apps/admin/actions/adminTermAction.ts の addTermRevision。service_role ではなく
-- サインイン済みアドミンのJWT（createServerClient）で呼び出すこと。
--
-- 【戻り値】追加した revision_no
---------------------------------------------
DROP FUNCTION IF EXISTS public.add_term_revision(uuid, text, text);

CREATE OR REPLACE FUNCTION public.add_term_revision(
    p_term_id uuid,
    p_content text,
    p_change_note text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_term RECORD;
    v_latest_no integer;
    v_latest_content text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to update terms');

    IF p_content IS NULL OR btrim(p_content) = '' THEN
        RAISE EXCEPTION 'content is required';
    END IF;

    SELECT term_id, published_date INTO v_term
    FROM public.com_m_terms
    WHERE term_id = p_term_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'term not found: %', p_term_id;
    END IF;

    IF v_term.published_date <= now() AND (p_change_note IS NULL OR btrim(p_change_note) = '') THEN
        RAISE EXCEPTION 'change_note is required for published terms';
    END IF;

    SELECT revision_no, content INTO v_latest_no, v_latest_content
    FROM public.com_m_terms_revision
    WHERE term_id = p_term_id
    ORDER BY revision_no DESC
    LIMIT 1;

    IF v_latest_content = p_content THEN
        RAISE EXCEPTION 'content is unchanged';
    END IF;

    v_latest_no := COALESCE(v_latest_no, 0) + 1;

    INSERT INTO public.com_m_terms_revision (term_id, revision_no, content, change_note, insert_user)
    VALUES (p_term_id, v_latest_no, p_content, NULLIF(btrim(p_change_note), ''), auth.uid());

    UPDATE public.com_m_terms
    SET update_date = now()
    WHERE term_id = p_term_id;

    RETURN v_latest_no;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_term_revision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_term_revision(uuid, text, text) TO authenticated;
