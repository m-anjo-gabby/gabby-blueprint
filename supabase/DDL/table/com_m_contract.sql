-- =========================================================================
-- com_m_contract: 契約（顧客ごと）
-- =========================================================================
-- 【プランとの関係】
-- 契約は必ずプラン（com_m_contract_plan）を選んで作る。契約種別・週の回数・回数・ダイアログプラクティスの
-- 有無はプランで決まり、その値を契約側にコピーして持つ（期間・数値・名称は契約ごとに調整できる）。
-- ライブセッションは Blueprint の契約に付く前提のため、ライブセッションの有効期間は持たず、
-- 契約・ライセンスの期間をそのまま使う。
--
-- 【名前】
-- plan_name / plan_name_en は生徒・コーチに見せる商品名。contract_name はアドミンが契約を区別する
-- 管理名で、アドミン画面だけに出す（同じ顧客の中で一意）。RLS 上は顧客側のユーザー・担当コーチも
-- 行を参照できるため、contract_name に社外秘の情報を書かない。
--
-- 【参照できる範囲】
-- 顧客側のユーザーは自分の顧客の契約、コーチは担当生徒のライセンスが紐づく契約を参照できる。
-- コーチの判定は is_coach_of_contract_license()（SECURITY DEFINER）を使う
-- （com_t_user_license の RLS が本テーブルを参照しているため、直接 EXISTS で書くと循環する）。
-- =========================================================================

-- @schema public.com_m_contract
CREATE TABLE public.com_m_contract (
    contract_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id                uuid         NOT NULL REFERENCES public.com_m_client(client_id),
    plan_name                text         NOT NULL,
    max_licenses             integer      NOT NULL,
    start_date               timestamp with time zone NOT NULL,
    end_date                 timestamp with time zone NOT NULL,
    status                   smallint     DEFAULT 1,
    note                     text,
    insert_date              timestamp with time zone DEFAULT now(),
    update_date              timestamp with time zone DEFAULT now(),
    contract_type            smallint     NOT NULL DEFAULT 1,
    plan_id                  uuid         NOT NULL REFERENCES public.com_m_contract_plan(plan_id),
    weekly_frequency         smallint,
    total_sessions           smallint,
    plan_name_en             text         NOT NULL,
    has_dialogue_practice    boolean      NOT NULL DEFAULT false,
    contract_name            text         NOT NULL,
    CONSTRAINT chk_contract_dialogue_requires_coach CHECK (NOT has_dialogue_practice OR contract_type = 2),
    CONSTRAINT chk_contract_live_fields CHECK (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL OR contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL),
    CONSTRAINT chk_contract_type CHECK (contract_type = ANY (ARRAY[1, 2]))
);

COMMENT ON TABLE public.com_m_contract IS '契約情報マスタ';
COMMENT ON COLUMN public.com_m_contract.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_m_contract.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用。生徒アプリ等に表示される商品名）';
COMMENT ON COLUMN public.com_m_contract.max_licenses IS 'この契約で発行可能な最大ユーザー数';
COMMENT ON COLUMN public.com_m_contract.start_date IS '開始日';
COMMENT ON COLUMN public.com_m_contract.end_date IS '終了日';
COMMENT ON COLUMN public.com_m_contract.status IS 'ステータス 1: 有効, 0: 無効, 9: 解約';
COMMENT ON COLUMN public.com_m_contract.note IS '運用管理者用のメモ';
COMMENT ON COLUMN public.com_m_contract.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_contract.contract_type IS '契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション';
COMMENT ON COLUMN public.com_m_contract.plan_id IS '契約プランマスタ参照（com_m_contract_plan）。契約作成時は必須選択で、他の実値カラムはここからのコピーを起点に個別調整する';
COMMENT ON COLUMN public.com_m_contract.weekly_frequency IS '週あたりのライブセッション回数（1以上）。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract.total_sessions IS '契約期間内の総チケット数。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract.plan_name_en IS 'プラン名称（表示・制御用、英語。coachアプリでの表示用）';
COMMENT ON COLUMN public.com_m_contract.has_dialogue_practice IS 'ダイアログプラクティス（自主トレコンテンツ）の提供有無。プラン選択時にマスタ値をコピー、契約側で上書き可';
COMMENT ON COLUMN public.com_m_contract.contract_name IS '契約名（アドミン管理用。例: 顧客A 2026年度上期）。生徒・コーチには表示しない。顧客内で一意';

CREATE INDEX idx_contract_client_id ON public.com_m_contract (client_id, status);
CREATE UNIQUE INDEX uq_contract_client_contract_name ON public.com_m_contract (client_id, contract_name);

ALTER TABLE public.com_m_contract ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view contracts of their students' licenses" ON public.com_m_contract FOR SELECT TO authenticated
USING (
    public.is_coach_of_contract_license(contract_id)
);

CREATE POLICY "Users can view their own client contracts" ON public.com_m_contract FOR SELECT TO authenticated
USING (
    client_id = public.get_jwt_client_id()
);
-- @end-schema
