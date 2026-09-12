---------------------------------------------
-- DDL: com_t_session_homework_checklist_item (宿題チェックリスト項目) (2026-09-11 追加)
-- 更新: 2026-09-12（セッション(com_t_session)から宿題本体(com_t_session_homework)へ
--       紐付け先を再変更）
-- 更新: 2026-09-12（宿題本体作成後のチェックリスト追加を廃止。作成時の一括登録のみに
--       限定。詳細は下記【背景】を参照）
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session_homework.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの宿題管理はこれまで自由メッセージの送信のみで、生徒側の進捗管理ができな
-- かった。コーチが自由記述で最大5件まで設定できるチェックリスト（Todo/Candoリストの
-- イメージ）を提示できるようにし、生徒がON/OFFで完了操作できるようにする。
--
-- 当初はcom_t_session_homework（宿題メッセージの1投稿）に1:1で紐付ける設計だったが、
-- 1セッションに対してコーチが複数回メッセージを送ると、その都度チェックリストが
-- 増殖して生徒側で分かりにくくなるという懸念から、一時的にセッション(com_t_session)
-- へ1:1で紐付ける設計に変更していた。
--
-- その後、「宿題の指示・説明＋チェックリストを1セットで発信し、以降の連絡はフォロー
-- アップコメントとして区別したい」という要望を受け、com_t_session_homework自体を
-- 「1セッション1件の宿題本体」に再定義した（table/com_t_session_homework.sqlの背景
-- コメント参照）。これにより「メッセージの複数回投稿によるチェックリスト増殖」という
-- 当初の懸念は解消されたため、本来自然な親子関係であるcom_t_session_homework
-- （宿題本体）への1:1紐付けに戻す。
--
-- さらに、宿題本体投稿後にチェックリスト項目を追加できる機能は「生徒の進捗管理の
-- 基準が後から変わる（本体テキストを編集不可にしている意図と矛盾する）」との判断から
-- 廃止し、宿題本体と同時（createSessionHomeworkの1回の呼び出し内）にのみ登録できる
-- こととした。投稿後の追加・修正の連絡はcom_t_session_homework_commentで行う。
-- INSERT側のRLSでも「対象宿題に既存項目が1件もない場合のみ」に制限し、アプリ層の
-- 実装ミスに依らずDBレベルで作成時一括登録のみを保証する。
--
-- com_t_session_homeworkは投稿後の編集・削除を許可しない追記専用（コーチ評価の証跡の
-- ため）だが、このテーブルはメッセージから独立しているため同じ制約を継承する必要は
-- ない。ただし、生徒が既に完了操作した項目の意味が後から変わらないよう、既存項目の
-- item_text変更・削除はコーチであっても不可とする。is_done/done_atのみ生徒本人が
-- 更新可能とする（列単位GRANTで保護。com_m_user.sqlのtimezone/icon_path自己更新
-- パターンを参照）。
---------------------------------------------
CREATE TABLE public.com_t_session_homework_checklist_item (
    checklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    item_no smallint NOT NULL,
    item_text text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    done_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_homework_checklist_item_no CHECK (item_no BETWEEN 1 AND 5),
    CONSTRAINT chk_homework_checklist_item_text_not_blank CHECK (btrim(item_text) <> ''),
    CONSTRAINT chk_homework_checklist_done_at CHECK ((is_done AND done_at IS NOT NULL) OR (NOT is_done AND done_at IS NULL)),
    CONSTRAINT uq_homework_checklist_item_no UNIQUE (homework_id, item_no)
);

COMMENT ON TABLE public.com_t_session_homework_checklist_item IS '宿題本体単位のチェックリスト項目（コーチが宿題本体作成時に最大5件まで自由記述で一括登録、生徒がON/OFFで完了操作。本体作成後の追加は不可）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.checklist_item_id IS 'チェックリスト項目ID';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.homework_id IS '対象の宿題本体 (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_no IS '表示順（1〜5、追加した順に採番。既存項目の欠番は詰めない）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_text IS '項目本文（追加時のみ設定、以後不変。修正したい場合は削除ではなく新規追加で対応する運用とする）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.is_done IS '完了フラグ（生徒本人のみ更新可能）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.done_at IS '完了操作日時（is_done=falseに戻すとNULLに戻る）';

CREATE INDEX idx_homework_checklist_item_homework ON public.com_t_session_homework_checklist_item (homework_id, item_no);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_homework_checklist_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item;
DROP POLICY IF EXISTS "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item;
DROP POLICY IF EXISTS "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item;

-- [参照] 対象宿題の担当コーチ本人・対象生徒本人・管理者が閲覧可能
CREATE POLICY "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- [追加] なりすまし防止: 自分が担当する宿題にのみ項目を追加可能（item_noの上限・重複はアプリ側で採番して防止）。
-- さらに「対象宿題に既存項目が1件もない場合のみ」に制限することで、宿題本体作成時の一括登録のみを許可し、
-- 投稿後の追加はDBレベルで拒否する（同一INSERT文内の複数行は互いにこの時点でまだ見えないため、
-- 一度の作成呼び出しでの複数件登録は妨げない）。
CREATE POLICY "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.coach_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.com_t_session_homework_checklist_item existing
      WHERE existing.homework_id = com_t_session_homework_checklist_item.homework_id
    )
);

-- [更新] 対象生徒本人のみ、is_done/done_at列に限り更新可能（item_text/item_noは列単位GRANTで保護）
CREATE POLICY "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item
FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.student_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.student_id = auth.uid()
    )
);

-- 生徒が更新できる列を is_done/done_at/update_date のみに制限する
-- （item_text/item_no/homework_idの改ざんを防止。com_m_user.sqlの自己更新パターンと同様）
REVOKE UPDATE ON public.com_t_session_homework_checklist_item FROM authenticated, anon;
GRANT UPDATE (is_done, done_at, update_date) ON public.com_t_session_homework_checklist_item TO authenticated;

-- 削除・item_text/item_noの変更、および宿題本体作成後の項目追加は許可しない
-- （コーチであっても不可。本体作成時の一括登録のみで運用する。以後の連絡はcom_t_session_homework_commentで行う）。
