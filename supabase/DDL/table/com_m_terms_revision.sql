-- =========================================================================
-- com_m_terms_revision: 規約の本文（リビジョン）
-- =========================================================================
-- 【バージョンとリビジョン】
--   com_m_terms（バージョン）: 同意の単位。料金改定・免責事項・個人情報の取扱いの変更など、再同意が必要な変更は
--     新しいバージョンにする。
--   com_m_terms_revision（リビジョン）: 同じバージョンの中の文言の修正。誤字の修正等はリビジョンの追加で行う
--     （再同意は不要）。
-- 表示・同意の対象は、そのバージョンの最新のリビジョン（revision_no が最大）。
-- 同意の履歴（com_t_user_terms_agreement.revision_id）がリビジョンを指すため、同意した時点の文面を後から確かめられる。
--
-- 【書き換えない】
-- リビジョンは追記のみで、UPDATE はトリガーで拒否する。削除は公開前のバージョンを削除した時の
-- ON DELETE CASCADE だけで起き、同意の履歴から参照されているリビジョンは外部キーで削除できない。
-- 登録は create_term / add_term_revision だけで行う。本文は公開情報のため誰でも参照できる。
-- =========================================================================

-- @schema public.com_m_terms_revision
CREATE TABLE public.com_m_terms_revision (
    revision_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    term_id                  uuid         NOT NULL REFERENCES public.com_m_terms(term_id) ON DELETE CASCADE,
    revision_no              integer      NOT NULL,
    content                  text         NOT NULL,
    change_note              text,
    insert_user              uuid         DEFAULT auth.uid() REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_com_m_terms_revision_no UNIQUE (term_id, revision_no),
    CONSTRAINT chk_com_m_terms_revision_no CHECK (revision_no >= 1)
);

COMMENT ON TABLE public.com_m_terms_revision IS '規約本文リビジョン：同一バージョン内の文言修正履歴（追記専用、最新revision_noが現行本文）';
COMMENT ON COLUMN public.com_m_terms_revision.revision_id IS 'リビジョンID';
COMMENT ON COLUMN public.com_m_terms_revision.term_id IS '規約マスタID（バージョン）';
COMMENT ON COLUMN public.com_m_terms_revision.revision_no IS 'バージョン内のリビジョン番号（1始まり）';
COMMENT ON COLUMN public.com_m_terms_revision.content IS '規約本文（Markdown）';
COMMENT ON COLUMN public.com_m_terms_revision.change_note IS '修正内容・理由（公開後の修正では必須）';
COMMENT ON COLUMN public.com_m_terms_revision.insert_user IS '登録者（com_m_user.id）。データ移行分はNULL';
COMMENT ON COLUMN public.com_m_terms_revision.insert_date IS '登録日時';

CREATE TRIGGER trg_reject_terms_revision_update BEFORE UPDATE ON public.com_m_terms_revision FOR EACH ROW EXECUTE FUNCTION public.fn_reject_terms_revision_update();

ALTER TABLE public.com_m_terms_revision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert terms revisions" ON public.com_m_terms_revision FOR INSERT TO authenticated
WITH CHECK (
    public.is_system_admin()
);

CREATE POLICY "Terms revisions are viewable by everyone" ON public.com_m_terms_revision FOR SELECT TO public
USING (
    true
);
-- @end-schema
