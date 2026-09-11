---------------------------------------------
-- DDL: com_t_session_homework_checklist_item (宿題チェックリスト項目) (2026-09-11 追加)
-- 更新: 2026-09-12（メッセージ投稿(com_t_session_homework)からセッション(com_t_session)へ
--       紐付け先を変更。詳細は下記【背景】を参照）
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの宿題管理はこれまで自由メッセージの送信のみで、生徒側の進捗管理ができな
-- かった。コーチが自由記述で最大5件まで設定できるチェックリスト（Todo/Candoリストの
-- イメージ）を提示できるようにし、生徒がON/OFFで完了操作できるようにする。
--
-- 当初はcom_t_session_homework（宿題メッセージの1投稿）に1:1で紐付ける設計だったが、
-- 1セッションに対してコーチが複数回メッセージを送ると、その都度チェックリストが
-- 増殖して生徒側で分かりにくくなる（メッセージはあくまで補足連絡、チェックリストは
-- 「このセッションでやるべきこと」を集約した1つの主要コンテンツにしたい）。
-- そのため、宿題メッセージの投稿単位ではなく、セッション(com_t_session)に対して
-- 1:1で紐付ける設計に変更する。これによりチェックリストの作成・更新はメッセージ
-- 投稿とは独立したライフサイクルを持つ。
--
-- com_t_session_homeworkは投稿後の編集・削除を許可しない追記専用（コーチ評価の証跡の
-- ため）だが、このテーブルはメッセージから独立しているため同じ制約を継承する必要は
-- ない。ただし、生徒が既に完了操作した項目の意味が後から変わらないよう、既存項目の
-- item_text変更・削除はコーチであっても不可とし、上限5件までの範囲での項目「追加」
-- （INSERT）のみ許可する。is_done/done_atのみ生徒本人が更新可能とする（列単位GRANTで
-- 保護。com_m_user.sqlのtimezone/icon_path自己更新パターンを参照）。
---------------------------------------------
CREATE TABLE public.com_t_session_homework_checklist_item (
    checklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    item_no smallint NOT NULL,
    item_text text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    done_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_homework_checklist_item_no CHECK (item_no BETWEEN 1 AND 5),
    CONSTRAINT chk_homework_checklist_item_text_not_blank CHECK (btrim(item_text) <> ''),
    CONSTRAINT chk_homework_checklist_done_at CHECK ((is_done AND done_at IS NOT NULL) OR (NOT is_done AND done_at IS NULL)),
    CONSTRAINT uq_homework_checklist_item_no UNIQUE (session_id, item_no)
);

COMMENT ON TABLE public.com_t_session_homework_checklist_item IS 'セッション単位の宿題チェックリスト項目（コーチが最大5件まで自由記述で追加、生徒がON/OFFで完了操作）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.checklist_item_id IS 'チェックリスト項目ID';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.session_id IS '対象のレッスンセッション (com_t_session)。宿題メッセージ(com_t_session_homework)とは独立';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_no IS '表示順（1〜5、追加した順に採番。既存項目の欠番は詰めない）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_text IS '項目本文（追加時のみ設定、以後不変。修正したい場合は削除ではなく新規追加で対応する運用とする）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.is_done IS '完了フラグ（生徒本人のみ更新可能）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.done_at IS '完了操作日時（is_done=falseに戻すとNULLに戻る）';

CREATE INDEX idx_homework_checklist_item_session ON public.com_t_session_homework_checklist_item (session_id, item_no);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_homework_checklist_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item;
DROP POLICY IF EXISTS "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item;
DROP POLICY IF EXISTS "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item;

-- [参照] 対象セッションの担当コーチ本人・対象生徒本人・管理者が閲覧可能
CREATE POLICY "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- [追加] なりすまし防止: 自分が担当するセッションにのみ項目を追加可能（item_noの上限・重複はアプリ側で採番して防止）
CREATE POLICY "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.coach_id = auth.uid()
    )
);

-- [更新] 対象生徒本人のみ、is_done/done_at列に限り更新可能（item_text/item_noは列単位GRANTで保護）
CREATE POLICY "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item
FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.student_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.student_id = auth.uid()
    )
);

-- 生徒が更新できる列を is_done/done_at/update_date のみに制限する
-- （item_text/item_no/session_idの改ざんを防止。com_m_user.sqlの自己更新パターンと同様）
REVOKE UPDATE ON public.com_t_session_homework_checklist_item FROM authenticated, anon;
GRANT UPDATE (is_done, done_at, update_date) ON public.com_t_session_homework_checklist_item TO authenticated;

-- 削除・item_text/item_noの変更は許可しない（コーチであっても不可。追加のみで運用する）。
