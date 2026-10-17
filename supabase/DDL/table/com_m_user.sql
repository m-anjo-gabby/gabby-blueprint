-- =========================================================================
-- com_m_user: ユーザー（生徒・コーチ・管理者・顧客の担当者）
-- =========================================================================
-- 【権限の同期】
-- user_type / client_id を変えると、トリガー（sync_user_app_metadata）が auth.users の app_metadata に
-- 反映し、JWT の権限（get_jwt_user_type / get_jwt_client_id）として効く。
--
-- 【本人による更新】
-- authenticated が更新できるのは timezone / icon_path / update_date の3列だけ（列単位の権限で制限）。
-- それ以外の列（user_type・client_id・ロック状態等）は service_role の管理者操作だけで変える。
-- 行の条件だけのポリシーでは、本人が自分を管理者にしたりテナントを変えたりできてしまうため。
--
-- 【参照できる範囲】
-- authenticated が読めるのは、本人・公開中のコーチ・担当関係（com_m_coach_student_relationship）の相手・
-- マッチング申請の相手（コーチから受講生）・同じチャットルームの参加者（is_chat_room_peer）だけ。
-- 同じクライアントというだけでは他の利用者を読めない（Webトライアル等、1つのテナントに互いに無関係な
-- 受講生が集まるため）。クライアント内の受講生の一覧はモニター用RPC（get_monitor_*、モニターロール必須）で読む。
-- ライセンス・チケット・学習実績のテーブルも同じ方針で、本人とコーチ（担当関係）の行だけを読める。
--
-- 【参照できる範囲】
-- 自分と同じ顧客のユーザーに加えて、コーチの基本情報は誰でも参照できる（コーチ一覧・マッチング用）。
-- コーチは、自分にマッチングを申請したことのある生徒の基本情報を参照できる。
--
-- 【その他】
-- timezone は com_m_timezone の IANA タイムゾーン。icon_path は Storage の profile バケット
-- （profile/{user_id}/icon/{uuid}.png）。
-- =========================================================================

-- @schema public.com_m_user
CREATE TABLE public.com_m_user (
    id                       uuid         PRIMARY KEY,
    user_id                  bigserial    NOT NULL UNIQUE,
    client_id                uuid         REFERENCES public.com_m_client(client_id) ON DELETE RESTRICT,
    user_type                text         DEFAULT '1'::text,
    user_name                text,
    locale_id                text         DEFAULT 'ja'::text,
    timezone                 text         NOT NULL DEFAULT 'Asia/Tokyo'::text,
    login_failed_count       integer      NOT NULL DEFAULT 0,
    locked_until             timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    icon_path                text,
    status                   smallint     NOT NULL DEFAULT 1,
    CONSTRAINT fk_com_m_user_timezone FOREIGN KEY (timezone) REFERENCES public.com_m_timezone(timezone) ON DELETE RESTRICT,
    CONSTRAINT chk_user_status CHECK (status = ANY (ARRAY[0, 1, 9]))
);

COMMENT ON TABLE public.com_m_user IS 'ユーザ情報マスタ';
COMMENT ON COLUMN public.com_m_user.id IS '認証システムID (UUID)';
COMMENT ON COLUMN public.com_m_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_m_user.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）';
COMMENT ON COLUMN public.com_m_user.login_failed_count IS 'ログイン連続失敗回数';
COMMENT ON COLUMN public.com_m_user.locked_until IS 'アカウントロックアウト終了日時';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_user.icon_path IS 'プロフィールアイコン画像のStorageパス（profileバケット内、例: profile/{user_id}/icon/xxxx.png）';
COMMENT ON COLUMN public.com_m_user.status IS '状態 1:有効 0:停止（ログインできない） 9:退会済み（個人情報を消去済み）';

CREATE TRIGGER trg_sync_app_meta_m_user AFTER INSERT OR UPDATE OF client_id, user_type ON public.com_m_user FOR EACH ROW EXECUTE FUNCTION public.sync_user_app_metadata();

ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active coach directory" ON public.com_m_user FOR SELECT TO authenticated
USING (
    user_type = '2'::text
);

CREATE POLICY "Chat room members can view each other" ON public.com_m_user FOR SELECT TO authenticated
USING (
    public.is_chat_room_peer(id)
);

CREATE POLICY "Coaches can view names of their matching students" ON public.com_m_user FOR SELECT TO authenticated
USING (
    user_type = '1'::text AND (EXISTS ( SELECT 1
       FROM public.com_t_matching_request r
      WHERE r.student_id = com_m_user.id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Users can update their own data" ON public.com_m_user FOR UPDATE TO authenticated
USING (
    id = auth.uid()
)
WITH CHECK (
    id = auth.uid()
);

CREATE POLICY "Users can view their coach-student counterparts" ON public.com_m_user FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.coach_id = auth.uid() AND r.student_id = com_m_user.id OR r.student_id = auth.uid() AND r.coach_id = com_m_user.id))
);

CREATE POLICY "Users can view themselves" ON public.com_m_user FOR SELECT TO authenticated
USING (
    id = auth.uid()
);

REVOKE ALL ON public.com_m_user FROM anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.com_m_user TO anon;
REVOKE ALL ON public.com_m_user FROM authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.com_m_user TO authenticated;
GRANT UPDATE (timezone, update_date, icon_path) ON public.com_m_user TO authenticated;
-- @end-schema
