-- =========================================================================
-- com_t_coach_rating: コーチの評価
-- =========================================================================
-- 【役割】
-- 生徒が専属コーチを契約の終わりに星1〜5で評価する（3項目＋運営向けの任意のコメント）。
-- 1件の単位は「契約（チケット）× コーチ」。週n回契約で同じコーチを複数の枠に選んでいても1回だけ。
-- 同じコーチで継続した場合は契約ごとに評価する（推移として残る）。
--
-- 【source】
-- 1: アプリからの評価（整数のみ。必ず契約・生徒に紐づく）
-- 2: 移行元システムの評価（COM_T_COACH_EVALUATION）。生徒・契約が特定できなくてもよく、0.5刻みを許す
-- 3: 新人コーチの初期値（3項目とも4）。コーチのプロフィール作成時に fn_create_initial_coach_rating() が登録する。
--    コーチ1人につき1件まで。評価0件のコーチが選ばれにくくなるのを防ぐためで、件数・平均にも含める。
--
-- 【書き込み・参照】
-- 評価の対象・受付期間の判定は fn_coach_rating_targets()、登録は submit_coach_rating() で行う（RLS で書き込みは許可しない）。
-- 行（特に feedback）は評価した生徒本人とアドミンだけが参照できる。コーチ・他の生徒には集計（com_t_coach_stats）だけを見せ、
-- 集計は評価の登録・変更・削除と同時にトリガーで作り直す。
-- =========================================================================

-- @schema public.com_t_coach_rating
CREATE TABLE public.com_t_coach_rating (
    rating_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    student_id               uuid         REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    ticket_id                uuid         REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE RESTRICT,
    coaching_score           numeric(2,1) NOT NULL,
    friendliness_score       numeric(2,1) NOT NULL,
    recommendation_score     numeric(2,1) NOT NULL,
    feedback                 text,
    source                   smallint     NOT NULL DEFAULT 1,
    legacy_evaluation_id     bigint,
    rated_at                 timestamp with time zone NOT NULL DEFAULT now(),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_coach_rating_app_refs CHECK (source <> 1 OR ticket_id IS NOT NULL AND student_id IS NOT NULL),
    CONSTRAINT chk_coach_rating_scores CHECK (coaching_score >= 1::numeric AND coaching_score <= 5::numeric AND (coaching_score * 2::numeric) = trunc(coaching_score * 2::numeric) AND friendliness_score >= 1::numeric AND friendliness_score <= 5::numeric AND (friendliness_score * 2::numeric) = trunc(friendliness_score * 2::numeric) AND recommendation_score >= 1::numeric AND recommendation_score <= 5::numeric AND (recommendation_score * 2::numeric) = trunc(recommendation_score * 2::numeric)),
    CONSTRAINT chk_coach_rating_source CHECK (source = ANY (ARRAY[1, 2, 3]))
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

CREATE INDEX idx_coach_rating_coach ON public.com_t_coach_rating (coach_id, rated_at DESC);
CREATE INDEX idx_coach_rating_student ON public.com_t_coach_rating (student_id);
CREATE UNIQUE INDEX uq_coach_rating_initial ON public.com_t_coach_rating (coach_id) WHERE source = 3;
CREATE UNIQUE INDEX uq_coach_rating_legacy_id ON public.com_t_coach_rating (legacy_evaluation_id) WHERE legacy_evaluation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_coach_rating_ticket_coach ON public.com_t_coach_rating (ticket_id, coach_id) WHERE ticket_id IS NOT NULL;

CREATE TRIGGER trg_coach_rating_refresh_stats AFTER INSERT OR DELETE OR UPDATE ON public.com_t_coach_rating FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_coach_rating_stats();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_coach_rating FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_coach_rating ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students and admins can view coach ratings" ON public.com_t_coach_rating FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR public.is_system_admin()
);
-- @end-schema
