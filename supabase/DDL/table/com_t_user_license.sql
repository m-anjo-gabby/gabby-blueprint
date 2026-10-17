-- =========================================================================
-- com_t_user_license: ライセンス（生徒への契約の割当）
-- =========================================================================
-- 【有効なライセンスは同時に1件】
-- 有効（status=1）なライセンスの期間が重ならないことを排他制約（excl_user_license_active_overlap）で保証する。
-- 契約更新に備えた次のタームの前倒し登録（期間が重ならない複数のライセンス）はできる。
-- アプリ側（findOverlappingLicense）でも事前に判定しているが、同時操作の競合はこの制約で防ぐ。
--
-- 【ダイアログプラクティス】
-- has_dialogue_practice はライセンス発行時に com_m_contract からコピーする。ライセンス期間中ずっと有効な
-- 利用可否で、自主トレ（生徒本人）とライブセッション中の教材（担当コーチ）の両方の判定に使う
-- （消化型の com_t_user_session_ticket とは性質が違うため、そちらには持たない）。
--
-- 【参照できる範囲】
-- 本人・契約先の顧客に加えて、担当関係（com_m_coach_student_relationship。交代後も含む）にあるコーチが
-- 参照できる。変更時はトリガー（sync_user_license_metadata）がユーザーのライセンス情報を同期する。
-- =========================================================================

-- @schema public.com_t_user_license
CREATE TABLE public.com_t_user_license (
    license_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id              uuid         NOT NULL REFERENCES public.com_m_contract(contract_id) ON DELETE RESTRICT,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    status                   smallint     NOT NULL DEFAULT 1,
    start_date               timestamp with time zone NOT NULL,
    end_date                 timestamp with time zone NOT NULL,
    note                     text,
    insert_date              timestamp with time zone DEFAULT now(),
    update_date              timestamp with time zone DEFAULT now(),
    has_dialogue_practice    boolean      NOT NULL DEFAULT false,
    CONSTRAINT excl_user_license_active_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(start_date, end_date, '[]'::text) WITH &&) WHERE (status = 1),
    CONSTRAINT unique_user_contract UNIQUE (user_id, contract_id),
    CONSTRAINT chk_user_license_status CHECK (status = ANY (ARRAY[0, 1]))
);

COMMENT ON TABLE public.com_t_user_license IS 'ユーザーライセンス割当情報';
COMMENT ON COLUMN public.com_t_user_license.license_id IS 'ライセンスID';
COMMENT ON COLUMN public.com_t_user_license.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_t_user_license.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_license.status IS 'ステータス 1:有効 0:停止';
COMMENT ON COLUMN public.com_t_user_license.start_date IS '開始日';
COMMENT ON COLUMN public.com_t_user_license.end_date IS '終了日';
COMMENT ON COLUMN public.com_t_user_license.note IS '個別対応時のメモ';
COMMENT ON COLUMN public.com_t_user_license.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_license.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_user_license.has_dialogue_practice IS 'ダイアログプラクティス（自主トレコンテンツ）の利用可否。ライセンス発行時にcom_m_contractの値をコピーする';

CREATE INDEX idx_license_contract_stats ON public.com_t_user_license (contract_id, status, start_date, end_date);
CREATE INDEX idx_user_license_auth ON public.com_t_user_license (user_id, status, start_date, end_date);

CREATE TRIGGER on_license_change AFTER INSERT OR DELETE OR UPDATE ON public.com_t_user_license FOR EACH ROW EXECUTE FUNCTION public.sync_user_license_metadata();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_user_license FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_user_license ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view licenses of their students" ON public.com_t_user_license FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_user_license.user_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Users can view their own licenses" ON public.com_t_user_license FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
