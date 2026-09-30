---------------------------------------------
-- DDL: com_m_contract (契約マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contract (
    contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
    plan_name TEXT NOT NULL,          -- 'Standard', 'Premium' 等
    max_licenses INTEGER NOT NULL,    -- 契約ライセンス上限数
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status SMALLINT DEFAULT 1,        -- 1: 有効, 0: 無効, 9: 解約
    note TEXT DEFAULT NULL,           -- アドミン用管理メモ
    insert_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contract IS '契約情報マスタ';
COMMENT ON COLUMN public.com_m_contract.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_m_contract.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用）';
COMMENT ON COLUMN public.com_m_contract.max_licenses IS 'この契約で発行可能な最大ユーザー数';
COMMENT ON COLUMN public.com_m_contract.start_date IS '開始日';
COMMENT ON COLUMN public.com_m_contract.end_date IS '終了日';
COMMENT ON COLUMN public.com_m_contract.status IS 'ステータス 1: 有効, 0: 無効, 9: 解約';
COMMENT ON COLUMN public.com_m_contract.note IS '運用管理者用のメモ';
COMMENT ON COLUMN public.com_m_contract.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract.update_date IS '更新日時';

-- 顧客単位での契約検索を高速化
CREATE INDEX idx_contract_client_id ON public.com_m_contract (client_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own client contracts" ON public.com_m_contract;

CREATE POLICY "Users can view their own client contracts" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);

---------------------------------------------
-- 追加パッチ: ライブセッション（オンラインレッスン）付き契約への対応 (2026-08-13)
-- 前提: table/com_m_contract_plan.sql の作成が完了していること。
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
--
-- 【方針】
-- 標準プラン（週1回・3か月・全12回／週2回・3か月・全24回）は
-- com_m_contract_plan マスタで定義しつつ、契約側は実値
-- (weekly_frequency / total_sessions) をコピーして保持するハイブリッド方式とする。
-- plan_id が NULL の場合は個別交渉によるカスタム契約を表す。
-- ライブセッションは常にBlueprint契約に付帯する前提のため、
-- ライブセッションの有効期間は独立して持たず、契約・ライセンスの期間をそのまま用いる。
---------------------------------------------
ALTER TABLE public.com_m_contract
  ADD COLUMN IF NOT EXISTS contract_type smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.com_m_contract_plan(plan_id),
  ADD COLUMN IF NOT EXISTS weekly_frequency smallint,
  ADD COLUMN IF NOT EXISTS total_sessions smallint;

COMMENT ON COLUMN public.com_m_contract.contract_type IS '契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション';
COMMENT ON COLUMN public.com_m_contract.plan_id IS '契約プランマスタ参照（com_m_contract_plan）。カスタム契約の場合はNULL';
COMMENT ON COLUMN public.com_m_contract.weekly_frequency IS '週あたりのライブセッション回数（1 or 2）。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract.total_sessions IS '契約期間内の総チケット数。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contract_type'
  ) THEN
    ALTER TABLE public.com_m_contract
      ADD CONSTRAINT chk_contract_type CHECK (contract_type IN (1, 2));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contract_live_fields'
  ) THEN
    ALTER TABLE public.com_m_contract
      ADD CONSTRAINT chk_contract_live_fields CHECK (
        (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
        OR
        (contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL)
      );
  END IF;
END $$;

---------------------------------------------
-- 追加パッチ: 週3回以上のカスタムプランに対応 (2026-08-15)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 前提: table/com_m_contract_plan.sql の同日パッチが適用済みであること。
---------------------------------------------
ALTER TABLE public.com_m_contract DROP CONSTRAINT IF EXISTS chk_contract_live_fields;
ALTER TABLE public.com_m_contract ADD CONSTRAINT chk_contract_live_fields CHECK (
    (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
    OR
    (contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL)
);

COMMENT ON COLUMN public.com_m_contract.weekly_frequency IS '週あたりのライブセッション回数（1以上）。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';

---------------------------------------------
-- 追加パッチ: Student Overview画面 契約情報表示対応 (2026-08-29)
-- 既存環境に対しては、このCREATE POLICY文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- [参照] コーチが担当生徒のライセンス(com_t_user_license)経由で、そのライセンスが紐づく
-- 契約(plan_name・期間等)を参照できるようにする。既存の顧客側ポリシーはそのまま残るため、
-- 契約先クライアントのアクセスは変わらない（追加の許可のみ）。
-- 前提: function/is_coach_of_contract_license.sql の作成が完了していること。
-- com_t_user_licenseを直接EXISTSで参照すると、com_t_user_license側の既存ポリシーが
-- com_m_contractを参照しているため循環参照(infinite recursion)になる。
-- SECURITY DEFINER関数経由にすることでこれを回避している。
DROP POLICY IF EXISTS "Coaches can view contracts of their students' licenses" ON public.com_m_contract;
CREATE POLICY "Coaches can view contracts of their students' licenses" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    public.is_coach_of_contract_license(com_m_contract.contract_id)
);

---------------------------------------------
-- 追加パッチ: 契約作成のプラン一本化、プラン英語名・ダイアログプラクティス対応 (2026-09-08)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 前提: table/com_m_contract_plan.sql / DML/com_m_contract_plan.sql の同日パッチが
--       適用済みであること。
---------------------------------------------
-- 【背景】
-- これまで契約作成時は「契約タイプ（Blueprintのみ/ライブセッション付き）」と
-- 「プラン」を別々に選択する必要があり、後者は前者がライブセッション付きの場合のみ
-- 表示される煩雑なUIになっていた。今後はプラン選択のみで契約タイプ・週回数・
-- チケット数・ダイアログプラクティス提供有無が一意に決まるよう一本化し、
-- plan_id を必須参照に変更する。選択したプランの値は契約側にコピーされ、
-- 期間・数値・名称は契約ごとに個別調整できるハイブリッド方式を維持する
-- （weekly_frequency/total_sessionsで既に採用している方式と同じ）。
ALTER TABLE public.com_m_contract
  ADD COLUMN IF NOT EXISTS plan_name_en text,
  ADD COLUMN IF NOT EXISTS has_dialogue_practice boolean NOT NULL DEFAULT false;

-- 既存契約（本パッチ適用時点では本番はBlueprintのみ契約=contract_type 1、plan_id NULLの
-- みが存在する想定）を対応するプランマスタ行へ紐付ける。contract_type=2でplan_idが
-- 未設定の個別交渉契約が万一存在する場合はこのUPDATEの対象外となり、後続のNOT NULL化で
-- 意図的にエラーとして検出される（該当契約へ手動でplan_idを設定してから再実行すること）。
UPDATE public.com_m_contract c
SET plan_id = p.plan_id,
    plan_name_en = p.plan_name_en
FROM public.com_m_contract_plan p
WHERE c.plan_id IS NULL AND c.contract_type = 1 AND p.plan_code = 'BLUEPRINT_ONLY';

-- 既にplan_idが設定済みの契約（開発環境で検証中のLive契約等）は、プランマスタの正しい
-- 英語名をそのまま引き継ぐ（日本語名の暫定コピーより優先する）
UPDATE public.com_m_contract c
SET plan_name_en = p.plan_name_en
FROM public.com_m_contract_plan p
WHERE c.plan_id = p.plan_id AND c.plan_name_en IS NULL;

-- 上記2つのUPDATEでも埋まらなかった行（plan_idが未設定のまま残っているcontract_type=2の
-- 個別交渉契約が万一存在する場合）だけ、最終フォールバックとして日本語名を暫定コピーする。
-- そのような行が存在する場合、直後のNOT NULL化(plan_id)は意図的に失敗するため、
-- 事前に以下で該当契約の有無を確認し、あれば先にplan_idを手動設定してから本パッチを
-- 実行すること: SELECT contract_id, contract_type, plan_name FROM com_m_contract WHERE plan_id IS NULL;
UPDATE public.com_m_contract SET plan_name_en = plan_name WHERE plan_name_en IS NULL;
ALTER TABLE public.com_m_contract ALTER COLUMN plan_name_en SET NOT NULL;
ALTER TABLE public.com_m_contract ALTER COLUMN plan_id SET NOT NULL;

COMMENT ON COLUMN public.com_m_contract.plan_name_en IS 'プラン名称（表示・制御用、英語。coachアプリでの表示用）';
COMMENT ON COLUMN public.com_m_contract.plan_id IS '契約プランマスタ参照（com_m_contract_plan）。契約作成時は必須選択で、他の実値カラムはここからのコピーを起点に個別調整する';
COMMENT ON COLUMN public.com_m_contract.has_dialogue_practice IS 'ダイアログプラクティスの提供有無（自主トレ・コーチとのセッション両方での利用可否に使う）。プラン選択時にマスタ値をコピー、契約側で上書き可';

ALTER TABLE public.com_m_contract DROP CONSTRAINT IF EXISTS chk_contract_dialogue_requires_coach;
ALTER TABLE public.com_m_contract ADD CONSTRAINT chk_contract_dialogue_requires_coach CHECK (
    NOT has_dialogue_practice OR contract_type = 2
);

---------------------------------------------
-- 追加パッチ: 契約名（アドミン管理用）の追加 (2026-09-30)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 適用後は view/vw_contract_details.sql（DROP→CREATE）と view/vw_user_list.sql の再実行が必要。
---------------------------------------------
-- 【背景】
-- これまでは plan_name を契約の識別名として兼用していたため、「顧客A 上期」のような
-- 管理上の名前を付けると、そのまま生徒・コーチ画面にプラン名として表示されてしまっていた。
-- 生徒・コーチに見せる商品名（plan_name / plan_name_en）と、アドミンが契約を区別するための
-- 管理名（contract_name）を分ける。contract_name はアドミン画面でのみ表示する。
-- ※ RLS上は顧客側ユーザー・担当コーチも com_m_contract の行を参照できるため、
--    contract_name には社外秘の情報を書かない運用とする。
ALTER TABLE public.com_m_contract
  ADD COLUMN IF NOT EXISTS contract_name text;

-- 既存契約は「{顧客名} {開始年月(JST)}〜 {プラン名}」で埋める。
-- 同じ顧客で同じ名前になる契約（同月開始・同プラン）は、2件目以降に「 (2)」等の連番を付けて
-- 後続の一意制約に違反しないようにする。
WITH named AS (
  SELECT
    c.contract_id,
    cl.client_name || ' ' || to_char(c.start_date AT TIME ZONE 'Asia/Tokyo', 'YYYY/MM') || '〜 ' || c.plan_name AS base_name,
    c.client_id
  FROM public.com_m_contract c
  JOIN public.com_m_client cl ON cl.client_id = c.client_id
  WHERE c.contract_name IS NULL
), numbered AS (
  SELECT
    contract_id,
    base_name,
    ROW_NUMBER() OVER (PARTITION BY client_id, base_name ORDER BY contract_id) AS seq
  FROM named
)
UPDATE public.com_m_contract c
SET contract_name = CASE WHEN n.seq = 1 THEN n.base_name ELSE n.base_name || ' (' || n.seq || ')' END
FROM numbered n
WHERE c.contract_id = n.contract_id;

ALTER TABLE public.com_m_contract ALTER COLUMN contract_name SET NOT NULL;

-- 同じ顧客内で契約名を一意にする（ライセンス割当時の契約選択・削除確認で契約を取り違えないため）
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_client_contract_name
  ON public.com_m_contract (client_id, contract_name);

COMMENT ON COLUMN public.com_m_contract.contract_name IS '契約名（アドミン管理用。例: 顧客A 2026年度上期）。生徒・コーチには表示しない。顧客内で一意';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用。生徒アプリ等に表示される商品名）';
