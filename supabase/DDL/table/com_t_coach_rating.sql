---------------------------------------------
-- コーチ評価 (2026-10-10 追加)
-- 前提: table/com_t_user_session_ticket.sql, table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒が専属コーチを契約の終わりに星1〜5で評価する（3項目＋運営向けの任意コメント）。
--   - 1件の単位は「契約（チケット）× コーチ」。週n回契約で同じコーチを複数のコマに選んでいても1回だけ評価する。
--     同じコーチで継続した場合は契約ごとに評価する（推移として残る）。
--   - 評価の対象・受付期間の判定は fn_coach_rating_targets()、登録は submit_coach_rating() に一本化する
--     （RLSでのINSERT/UPDATEは許可しない）。
--   - コーチ・他の生徒へは集計（com_t_coach_stats）だけを見せる。本テーブルの行（特に feedback）は
--     評価した生徒本人とアドミンだけが参照できる。
--   - 移行元システムの評価（COM_T_COACH_EVALUATION）を移行する前提で、source=2（移行）の行は
--     生徒・契約を特定できなくてもよい（名寄せは別タスク）。点数も移行元に合わせ0.5刻みを許可する
--     （アプリからの評価は整数のみ。submit_coach_rating() で検証）。
--   - 新人コーチ対応として、コーチのプロフィール作成時に初期値の評価（source=3、3項目とも4）を1件自動で登録する
--     （fn_create_initial_coach_rating()。評価0件のコーチが「評価なし」と表示され、選ばれにくくなるのを防ぐ）。
--     初期値の評価も件数・平均に含める。コーチ1人につき1件まで。
---------------------------------------------
CREATE TABLE public.com_t_coach_rating (
    rating_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    student_id uuid REFERENCES public.com_m_user(id),
    ticket_id uuid REFERENCES public.com_t_user_session_ticket(ticket_id),
    coaching_score numeric(2,1) NOT NULL,
    friendliness_score numeric(2,1) NOT NULL,
    recommendation_score numeric(2,1) NOT NULL,
    feedback text DEFAULT NULL,
    source smallint NOT NULL DEFAULT 1, -- 1:app 2:legacy(移行元システム) 3:initial(新人コーチの初期値)
    legacy_evaluation_id bigint DEFAULT NULL,
    rated_at timestamp with time zone NOT NULL DEFAULT NOW(),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_coach_rating_scores CHECK (
        coaching_score BETWEEN 1 AND 5 AND coaching_score * 2 = trunc(coaching_score * 2)
        AND friendliness_score BETWEEN 1 AND 5 AND friendliness_score * 2 = trunc(friendliness_score * 2)
        AND recommendation_score BETWEEN 1 AND 5 AND recommendation_score * 2 = trunc(recommendation_score * 2)
    ),
    CONSTRAINT chk_coach_rating_source CHECK (source IN (1, 2, 3)),
    -- アプリからの評価は必ず契約・生徒に紐づく（移行分・初期値は空を許可）
    CONSTRAINT chk_coach_rating_app_refs CHECK (source <> 1 OR (ticket_id IS NOT NULL AND student_id IS NOT NULL))
);

COMMENT ON TABLE public.com_t_coach_rating IS 'コーチ評価（生徒が契約×コーチにつき1回。集計はcom_t_coach_stats、登録はsubmit_coach_rating()）';
COMMENT ON COLUMN public.com_t_coach_rating.rating_id IS '評価ID';
COMMENT ON COLUMN public.com_t_coach_rating.coach_id IS '評価されたコーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_rating.student_id IS '評価した生徒のユーザID（移行分で特定できない場合はNULL）';
COMMENT ON COLUMN public.com_t_coach_rating.ticket_id IS '対象の契約（ライブセッションチケット。移行分で特定できない場合はNULL）';
COMMENT ON COLUMN public.com_t_coach_rating.coaching_score IS 'コーチング（1〜5。アプリは整数、移行分は0.5刻み）';
COMMENT ON COLUMN public.com_t_coach_rating.friendliness_score IS '親近感（1〜5）';
COMMENT ON COLUMN public.com_t_coach_rating.recommendation_score IS 'おすすめ度（他の受講者にすすめたいか。1〜5）';
COMMENT ON COLUMN public.com_t_coach_rating.feedback IS '運営向けのフィードバック（任意。コーチ・他の生徒には公開しない）';
COMMENT ON COLUMN public.com_t_coach_rating.source IS '登録元 1:app(生徒アプリ) 2:legacy(移行元システム) 3:initial(新人コーチの初期値。プロフィール作成時に自動登録)';
COMMENT ON COLUMN public.com_t_coach_rating.legacy_evaluation_id IS '移行元のCOM_T_COACH_EVALUATION.EVALUATIONID（移行分のみ。二重移行の防止用）';
COMMENT ON COLUMN public.com_t_coach_rating.rated_at IS '評価日時（移行分は移行元のEVALUATIONDATE）';
COMMENT ON COLUMN public.com_t_coach_rating.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_rating.update_date IS '更新日時';

-- 契約×コーチにつき1回（移行分は ticket_id が NULL になり得るため対象外）
CREATE UNIQUE INDEX uq_coach_rating_ticket_coach ON public.com_t_coach_rating (ticket_id, coach_id) WHERE ticket_id IS NOT NULL;
-- 初期値の評価はコーチ1人につき1件まで
CREATE UNIQUE INDEX uq_coach_rating_initial ON public.com_t_coach_rating (coach_id) WHERE source = 3;
CREATE UNIQUE INDEX uq_coach_rating_legacy_id ON public.com_t_coach_rating (legacy_evaluation_id) WHERE legacy_evaluation_id IS NOT NULL;
CREATE INDEX idx_coach_rating_coach ON public.com_t_coach_rating (coach_id, rated_at DESC);
CREATE INDEX idx_coach_rating_student ON public.com_t_coach_rating (student_id);

ALTER TABLE public.com_t_coach_rating ENABLE ROW LEVEL SECURITY;

-- 参照は評価した生徒本人とアドミンのみ。コーチには行を見せない（集計は com_t_coach_stats）
DROP POLICY IF EXISTS "Students and admins can view coach ratings" ON public.com_t_coach_rating;
CREATE POLICY "Students and admins can view coach ratings" ON public.com_t_coach_rating
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- 集計（com_t_coach_stats）を評価の登録・変更・削除と同時に作り直す（すぐ反映する）
DROP TRIGGER IF EXISTS trg_coach_rating_refresh_stats ON public.com_t_coach_rating;
CREATE TRIGGER trg_coach_rating_refresh_stats
AFTER INSERT OR UPDATE OR DELETE ON public.com_t_coach_rating
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_coach_rating_stats();
