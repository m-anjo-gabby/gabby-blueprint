-- =========================================================================
-- student_t_training_menu: 今日のトレーニングメニュー
-- 前提: com_m_user
-- =========================================================================
-- 【役割】
-- 生徒 × 生徒のタイムゾーンでの日付で1行。ホームの「今日のトレーニングメニュー」に出す、その日のやることの並び
-- （student_t_training_menu_item）の親。その日に初めてホームを開いた時に作り、同じ日の中では作り直さない。
--
-- 【作り方（menu_source）】
-- 1: 標準メニュー。旧システムのメニュー（RunNow）を引き継ぎ、スプリントの到達レベルと視聴の記録から決まりで組む
--    （packages/lib/trainingMenu/standardMenu.ts）。コース（はじめの2週間等）を作る時に値を足す。
--
-- 【書き込み】
-- 作成は create_training_menu（SECURITY DEFINER。メニューとやることを1トランザクションで作る）だけ。
-- 生徒本人は completed_at だけを書ける（列単位の UPDATE の権限）。完了は各トレーニングの記録から判定し、
-- ホームを開いた時にサーバーアクションが書く。
--
-- 【削除】
-- ユーザーからは CASCADE。退会ではユーザーの行が残るため、この表も残る（docs/DATA-DELETION.md）。
-- =========================================================================

-- @schema public.student_t_training_menu
CREATE TABLE public.student_t_training_menu (
    menu_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    menu_date                date         NOT NULL,
    menu_source              smallint     NOT NULL DEFAULT 1,
    completed_at             timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_training_menu_user_date UNIQUE (user_id, menu_date),
    CONSTRAINT chk_training_menu_menu_source CHECK (menu_source = 1)
);

COMMENT ON TABLE public.student_t_training_menu IS '今日のトレーニングメニュー（生徒 × 日付）';
COMMENT ON COLUMN public.student_t_training_menu.menu_id IS 'メニューID';
COMMENT ON COLUMN public.student_t_training_menu.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_t_training_menu.menu_date IS 'メニューの日付（生徒のタイムゾーンでの日付）';
COMMENT ON COLUMN public.student_t_training_menu.menu_source IS 'メニューの作り方（1:標準メニュー）';
COMMENT ON COLUMN public.student_t_training_menu.completed_at IS 'すべてのやることを終えた日時（NULL:未完了）';
COMMENT ON COLUMN public.student_t_training_menu.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_t_training_menu.update_date IS '更新日時';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_t_training_menu FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_t_training_menu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can complete their own training menus" ON public.student_t_training_menu FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

CREATE POLICY "Users can view their own training menus" ON public.student_t_training_menu FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

REVOKE ALL ON public.student_t_training_menu FROM authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.student_t_training_menu TO authenticated;
GRANT UPDATE (completed_at) ON public.student_t_training_menu TO authenticated;
-- @end-schema
