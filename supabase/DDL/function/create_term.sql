---------------------------------------------
-- 規約バージョンの新規作成RPC (2026-09-24 追加)
-- 前提: table/com_m_terms.sql（リビジョン管理パッチ）, table/com_m_terms_revision.sql,
--       function/fn_assert_actor_or_admin.sql の作成が完了していること。
---------------------------------------------
-- 【概要】
-- com_m_terms（バージョン）と com_m_terms_revision（リビジョン1）を1トランザクションで
-- 登録する。新しいバージョンの公開日以降、必須規約であれば全ユーザーに再同意を求める。
--
-- 【呼び出し元】
-- apps/admin/actions/adminTermAction.ts の createTerm。auth.uid()で権限判定するため、
-- service_role ではなくサインイン済みアドミンのJWT（createServerClient）で呼び出すこと。
--
-- 【戻り値】作成した term_id
---------------------------------------------
DROP FUNCTION IF EXISTS public.create_term(text, text, timestamp with time zone, boolean, text);

CREATE OR REPLACE FUNCTION public.create_term(
    p_term_type text,
    p_version_name text,
    p_published_date timestamp with time zone,
    p_is_required boolean,
    p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_term_id uuid;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to create terms');

    IF p_term_type NOT IN ('TERMS', 'PRIVACY') THEN
        RAISE EXCEPTION 'invalid term_type: %', p_term_type;
    END IF;

    IF p_version_name IS NULL OR btrim(p_version_name) = '' THEN
        RAISE EXCEPTION 'version_name is required';
    END IF;

    IF p_content IS NULL OR btrim(p_content) = '' THEN
        RAISE EXCEPTION 'content is required';
    END IF;

    -- UNIQUE(term_type, version_name) 違反時は 23505 がそのまま呼び出し元に返る
    INSERT INTO public.com_m_terms (term_type, version_name, is_required, published_date)
    VALUES (p_term_type, btrim(p_version_name), p_is_required, p_published_date)
    RETURNING term_id INTO v_term_id;

    INSERT INTO public.com_m_terms_revision (term_id, revision_no, content, change_note, insert_user)
    VALUES (v_term_id, 1, p_content, NULL, auth.uid());

    RETURN v_term_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_term(text, text, timestamp with time zone, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_term(text, text, timestamp with time zone, boolean, text) TO authenticated;
