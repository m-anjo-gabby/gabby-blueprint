-- =========================================================================
-- com_t_trial_application: Webトライアルの申込
-- =========================================================================
-- 【流れ】
-- 申込フォーム（apps/student /trial）からの申込を1行で持ち、招待（com_t_invitation）を作ってトライアル用の
-- 招待メールを送る。ユーザー・ライセンスは本人がパスワードを設定した時点（acceptInvitationCore）で作り、
-- その時に user_id・accepted_at を記録する。申込だけで本登録していない人はマスタ（com_m_user 等）に現れない。
-- 所属は固定の顧客「Webトライアル」（web_trial_client_id()）、契約は本登録の月ごとに
-- fn_resolve_web_trial_contract() が探す（無ければ作る）。
--
-- 【氏名】
-- 姓・名とそれぞれのローマ字表記を持つ（いずれも必須。意味は com_m_user_legal と同じで、山田 太郎 → last_name = 山田）。
-- 本登録時に、正式な氏名（com_m_user_legal）をこの4項目から作る。画面に出す名前（com_m_user.user_name。
-- コーチも見る）はローマ字の「名 姓」（例: Taro Yamada）にする（fn_submit_trial_application が招待に入れる）。
-- 登録済みのアドレスからの再申込では、正式な氏名・画面の名前は変えない。
--
-- 【個人情報保護方針への同意】
-- 申込フォームは個人情報保護方針（packages/lib/contact.ts の PRIVACY_POLICY_URL）への同意を必須にしている。
-- 同意が無いと申し込めないため列には持たず、同意の日時は申込の日時（last_applied_at）として扱う。
--
-- 【再申込】
-- メールアドレスごとに1行（email は小文字にそろえて保存）。同じアドレスの再申込は同じ行を最新の入力で更新し、
-- apply_count を増やす（本登録前なら招待を出し直す）。
--
-- 【状態】（admin の一覧で表示。列には持たず、次の順で判定する）
-- accepted_at あり → 登録済み / 招待（invitation_id）が有効期限内 → 招待中 / それ以外 → 期限切れ
--
-- 【参照できる範囲】
-- 申込者の個人情報のため、参照は管理者のみ。登録・更新は申込フォーム・本登録の処理（service_role）だけで行う。
-- =========================================================================

-- @schema public.com_t_trial_application
CREATE TABLE public.com_t_trial_application (
    application_id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    email                    text         NOT NULL UNIQUE,
    last_name                text         NOT NULL,
    first_name               text         NOT NULL,
    last_name_latin          text         NOT NULL,
    first_name_latin         text         NOT NULL,
    timezone                 text         NOT NULL REFERENCES public.com_m_timezone(timezone),
    country_city             text,
    occupation               smallint     NOT NULL,
    occupation_other         text,
    referral_source          smallint     NOT NULL,
    referral_source_other    text,
    message                  text,
    invitation_id            uuid         UNIQUE REFERENCES public.com_t_invitation(id) ON DELETE SET NULL,
    user_id                  uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    apply_count              integer      NOT NULL DEFAULT 1,
    last_applied_at          timestamp with time zone NOT NULL DEFAULT now(),
    accepted_at              timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_trial_application_email_lower CHECK (email = lower(email))
);

COMMENT ON TABLE public.com_t_trial_application IS 'Webトライアルの申込（メールアドレスごとに1行。再申込は同じ行を更新）';
COMMENT ON COLUMN public.com_t_trial_application.application_id IS '申込ID';
COMMENT ON COLUMN public.com_t_trial_application.email IS 'メールアドレス（小文字）';
COMMENT ON COLUMN public.com_t_trial_application.last_name IS '姓（本登録時に com_m_user_legal.last_name へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.first_name IS '名（本登録時に com_m_user_legal.first_name へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.last_name_latin IS '姓のローマ字表記（本登録時に com_m_user_legal.last_name_latin へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.first_name_latin IS '名のローマ字表記（本登録時に com_m_user_legal.first_name_latin へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.timezone IS 'タイムゾーン（本登録時に com_m_user.timezone へ設定）';
COMMENT ON COLUMN public.com_t_trial_application.country_city IS '国・都市';
COMMENT ON COLUMN public.com_t_trial_application.occupation IS '業種・職業のコード（正本は packages/types/trialApplication.ts の TRIAL_OCCUPATIONS）';
COMMENT ON COLUMN public.com_t_trial_application.occupation_other IS '業種・職業が「その他」の場合の記入内容';
COMMENT ON COLUMN public.com_t_trial_application.referral_source IS '知ったきっかけのコード（正本は packages/types/trialApplication.ts の TRIAL_REFERRAL_SOURCES）';
COMMENT ON COLUMN public.com_t_trial_application.referral_source_other IS '知ったきっかけが「その他」の場合の記入内容';
COMMENT ON COLUMN public.com_t_trial_application.message IS 'ご要望・ご質問（自由記入）';
COMMENT ON COLUMN public.com_t_trial_application.invitation_id IS '招待ID (com_t_invitation.id)';
COMMENT ON COLUMN public.com_t_trial_application.user_id IS '本登録したユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_trial_application.apply_count IS '申込の回数（再申込で増える）';
COMMENT ON COLUMN public.com_t_trial_application.last_applied_at IS '最後に申し込んだ日時';
COMMENT ON COLUMN public.com_t_trial_application.accepted_at IS '本登録（パスワード設定）の日時';
COMMENT ON COLUMN public.com_t_trial_application.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_trial_application.update_date IS '更新日時';

ALTER TABLE public.com_t_trial_application ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trial applications" ON public.com_t_trial_application FOR SELECT TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
);
-- @end-schema
