---------------------------------------------
-- DDL: com_m_terms_revision (規約本文リビジョン) (2026-09-24 追加)
-- 前提: table/com_m_terms.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 従来、規約本文はSupabase Storage（termsバケット）のMarkdownファイルで管理し、
-- 編集のたびに同じterm_idのまま本文ファイルを差し替え・旧ファイルを削除していた。
-- このため「ユーザーが同意した時点の文面」を後から証明できなかった。
--
-- 【バージョンとリビジョンの役割分担】
--   - com_m_terms（バージョン）: 同意の単位。料金改定・免責事項・個人情報の取扱変更など
--     再同意が必要な変更は、新しいバージョンとして作成する。
--   - com_m_terms_revision（リビジョン）: 同一バージョン内の文言修正履歴。誤字修正等の
--     軽微な修正はリビジョン追加（サイレント更新、再同意不要）で行う。
-- 表示・同意対象の本文は「そのバージョンの最新リビジョン（revision_no最大）」とする。
--
-- 【不変性】
-- リビジョンは追記専用とし、UPDATEはトリガーで拒否する（過去の文面を改変させないため）。
-- DELETEは親バージョン削除時（公開前のみ許可）のON DELETE CASCADEでのみ発生する想定。
-- なお同意履歴(com_t_user_terms_agreement.revision_id)から参照されているリビジョンは
-- FK制約により削除できない。
--
-- 登録は RPC create_term / add_term_revision 経由でのみ行う。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_terms_revision (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.com_m_terms(term_id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  content text NOT NULL,
  change_note text,
  insert_user uuid DEFAULT auth.uid() REFERENCES public.com_m_user(id) ON DELETE SET NULL,
  insert_date timestamp with time zone DEFAULT now() NOT NULL,

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

---------------------------------------------
-- 不変性の担保: UPDATEを拒否するトリガー
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reject_terms_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'com_m_terms_revision is append-only (revision_id=%)', OLD.revision_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_terms_revision_update ON public.com_m_terms_revision;
CREATE TRIGGER trg_reject_terms_revision_update
BEFORE UPDATE ON public.com_m_terms_revision
FOR EACH ROW EXECUTE FUNCTION public.fn_reject_terms_revision_update();

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_terms_revision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Terms revisions are viewable by everyone" ON public.com_m_terms_revision;
DROP POLICY IF EXISTS "Admins can insert terms revisions" ON public.com_m_terms_revision;

-- com_m_terms と同様、規約本文は公開情報のため誰でも参照可能
CREATE POLICY "Terms revisions are viewable by everyone" ON public.com_m_terms_revision
FOR SELECT USING (true);

CREATE POLICY "Admins can insert terms revisions" ON public.com_m_terms_revision
FOR INSERT TO authenticated
WITH CHECK (public.get_jwt_user_type() = '0');
