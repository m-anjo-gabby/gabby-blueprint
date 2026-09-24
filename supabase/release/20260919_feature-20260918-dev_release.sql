-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260918-dev
-- 作成日: 2026-09-19
--
-- 【内容】
--   コーチ向け請求書(INVOICE)PDF機能への対応（アプリケーションコード側の変更が主、
--   本SQLはそれに伴うDBの変更のみ）。
--
--   1. com_m_company_profile に tax_registration_number 列を追加
--      - コーチがGST/HST登録事業者である場合の登録番号を印字するための任意項目。
--        既定はNULL（空欄運用）。
--   2. com_m_company_profile の登録データ（シングルトン1行）を、日本本社
--      (Gabby Academy Co., Ltd.) からコーチとの業務委託契約主体であるバンクーバー法人
--      (Global Vision Technology Vancouver, Inc.) へ変更
--      - 本テーブルはコーチ向け月次支払通知書・請求書PDFにのみ使用するため、契約実態に
--        合わせて名義を是正する（支払通知書側の表示もこれに伴い変更される）。
--
--   3. 生徒モニタリング画面（apps/student /monitor）の対象生徒判定を、NOW()基準の
--      「現在activeな契約」から「表示中の対象期間にライセンスが重なっているか」に変更。
--      - get_monitor_user_list に _start_date/_end_date（DATE, 両方省略可）を追加。
--        指定時は対象期間との重なりでユーザーを判定し、未指定時は従来通りNOW()基準の
--        挙動を維持する（後方互換）。シグネチャ変更のためDROP FUNCTION IF EXISTSで
--        旧シグネチャ(BOOLEAN)を削除してから再作成する。
--      - get_monitor_sprint_history / get_monitor_sprint_drill_history は内部で
--        get_monitor_user_list を呼び出して対象ユーザーを絞り込んでいたため、実績データ
--        自体もアクティブ契約者のみに絞られていた。それぞれの _start_date/_end_date を
--        get_monitor_user_list にも渡すよう修正（シグネチャは変更なし）。
--      - これにより、前期のみ契約し後期は契約していない生徒についても、前期の年月を
--        表示している間は一覧・絞り込み・実績（単語ドリル/スプリント）すべてに表示される。
--
-- 対応ファイル: DDL/table/com_m_company_profile.sql（末尾の追加パッチ節）,
--   DML/com_m_company_profile.sql,
--   DDL/function/get_monitor_user_list.sql,
--   DDL/function/get_monitor_sprint_history.sql,
--   DDL/function/get_monitor_sprint_drill_history.sql
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_company_profile: tax_registration_number列の追加
---------------------------------------------
ALTER TABLE public.com_m_company_profile
  ADD COLUMN IF NOT EXISTS tax_registration_number text DEFAULT NULL;

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（コーチ向け月次支払通知書・請求書PDFに使用。運用上は常に1行のみ）';
COMMENT ON COLUMN public.com_m_company_profile.tax_registration_number IS '税務登録番号（例: カナダGST/HST登録番号）。未登録の場合はNULL（任意項目）';

---------------------------------------------
-- 2. com_m_company_profile: バンクーバー法人への名義変更
---------------------------------------------
INSERT INTO public.com_m_company_profile (company_profile_id, company_name, address, logo_path, tax_registration_number) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Global Vision Technology Vancouver, Inc.',
    '555 Burrard St' || E'\n' || 'Vancouver, BC V7X 1M8' || E'\n' || 'Canada',
    'logo-01.png',
    NULL
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  address = EXCLUDED.address,
  logo_path = EXCLUDED.logo_path,
  tax_registration_number = EXCLUDED.tax_registration_number,
  update_date = NOW();

COMMIT;

-- =========================================================================
-- 【追加セクション】ダイアログプラクティス マスタ・進捗管理トランザクション刷新
-- 追加日: 2026-09-20
--
-- 【内容】
--   旧システムのCOM_M_DIALOGUE（汎用）/COM_M_TAILOR_MADE（顧客専用コーパス）という
--   2マスタ体系を廃止し、既存の教材共通マスタ(com_m_contents)へ統合する。あわせて、
--   コーチが生徒へ教材を明示的に割り当て、割当単位・セッション単位で進捗を管理する
--   トランザクションを新設する（旧システムは全教材が常に全生徒に表示され、コーチから
--   進捗状況が分かりづらいという課題があったための刷新）。
--
--   1. com_m_contents に category_id 列を追加
--      - ダイアログプラクティスのセット分類 (1:Beginner, 2:Intermediate, 3:Advanced,
--        4:Corpus) を表現。content_scopeとの整合はCHECK制約で担保。他コンテンツ種別では
--        NULLのまま未使用。content_type=3をダイアログプラクティス用に追加。
--   2. com_m_dialogue_session を新規作成
--      - 旧COM_M_DIALOGUE_DETAIL / COM_M_TAILOR_MADE_DETAILを統合したセッション明細マスタ。
--   3. com_t_dialogue_assignment を新規作成
--      - コーチが生徒へセット単位で教材を割り当てる割当トランザクション。
--   4. com_t_dialogue_session_progress を新規作成
--      - 割当済みセットのセッション単位の完了状態・コーチメモを管理する進捗トランザクション。
--
--   ※ 旧COM_M_DIALOGUE/COM_M_DIALOGUE_DETAIL/COM_M_TAILOR_MADE/COM_M_TAILOR_MADE_DETAIL
--     からのデータ移行（com_m_contents + com_m_dialogue_sessionへの詰め替え）は別途
--     移行スクリプトで対応する（本セクションはスキーマ定義のみ）。
--
-- 対応ファイル:
--   DDL/table/com_m_contents.sql（末尾の追加パッチ節）,
--   DDL/table/com_m_dialogue_session.sql,
--   DDL/table/com_t_dialogue_assignment.sql,
--   DDL/table/com_t_dialogue_session_progress.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_contents: category_id列の追加
---------------------------------------------
ALTER TABLE public.com_m_contents
  ADD COLUMN IF NOT EXISTS category_id SMALLINT DEFAULT NULL;

ALTER TABLE public.com_m_contents
  DROP CONSTRAINT IF EXISTS chk_com_m_contents_category_scope;

ALTER TABLE public.com_m_contents
  ADD CONSTRAINT chk_com_m_contents_category_scope CHECK (
    category_id IS NULL
    OR (category_id IN (1, 2, 3) AND content_scope = 0)
    OR (category_id = 4 AND content_scope = 1)
  );

COMMENT ON COLUMN public.com_m_contents.category_id IS 'セット分類ID（現状ダイアログプラクティスのみで使用。1:Beginner, 2:Intermediate, 3:Advanced, 4:Corpus）。他コンテンツ種別では未使用のためNULL';
COMMENT ON COLUMN public.com_m_contents.content_type IS 'コンテンツ種別 0:単語・フレーズ, 1:ビデオ, 2:Gabbyスプリント, 3:ダイアログプラクティス';

---------------------------------------------
-- 2. com_m_dialogue_session の新規作成
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_dialogue_session (
  dialogue_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id),
  session_no smallint NOT NULL,
  coach_slides_title text,
  coach_slides_link text,
  student_slides_title text,
  student_slides_link text,
  admin_notes text,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(content_id, session_no)
);

COMMENT ON TABLE public.com_m_dialogue_session IS 'ダイアログプラクティス セッション明細マスタ（旧COM_M_DIALOGUE_DETAIL / COM_M_TAILOR_MADE_DETAILを統合）';
COMMENT ON COLUMN public.com_m_dialogue_session.dialogue_session_id IS 'セッション明細ID';
COMMENT ON COLUMN public.com_m_dialogue_session.content_id IS '紐づくセット（教材）ID (com_m_contents.content_id、content_type=3)';
COMMENT ON COLUMN public.com_m_dialogue_session.session_no IS 'セット内でのセッション番号（1始まり）';
COMMENT ON COLUMN public.com_m_dialogue_session.coach_slides_title IS 'コーチ用スライドの表示タイトル';
COMMENT ON COLUMN public.com_m_dialogue_session.coach_slides_link IS 'コーチ用スライドのURL（Google Slides）';
COMMENT ON COLUMN public.com_m_dialogue_session.student_slides_title IS '生徒用スライドの表示タイトル';
COMMENT ON COLUMN public.com_m_dialogue_session.student_slides_link IS '生徒用スライドのURL（Google Slides）。汎用教材ではセット内の全セッションで同一リンクを想定、コーパス教材ではコーチ用と同一リンクとなる場合がある';
COMMENT ON COLUMN public.com_m_dialogue_session.admin_notes IS '教材制作・運用メモ（管理者向け。生徒別の学習進捗メモはcom_t_dialogue_session_progress.notesで別管理）';
COMMENT ON COLUMN public.com_m_dialogue_session.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_dialogue_session.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_dialogue_session.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_dialogue_session_content
  ON public.com_m_dialogue_session (content_id, session_no)
  WHERE delete_flg = '0';

ALTER TABLE public.com_m_dialogue_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select access for authenticated users" ON public.com_m_dialogue_session;

GRANT SELECT ON TABLE public.com_m_dialogue_session TO authenticated;

CREATE POLICY "Allow select access for authenticated users"
ON public.com_m_dialogue_session FOR SELECT TO authenticated
USING (delete_flg = '0');

---------------------------------------------
-- 3. com_t_dialogue_assignment の新規作成
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_t_dialogue_assignment (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.com_m_user(id),
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id),
  assigned_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_dialogue_assignment IS 'ダイアログプラクティス 割当トランザクション（コーチが生徒に対しセット単位で教材を割り当てる）';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assignment_id IS '割当ID';
COMMENT ON COLUMN public.com_t_dialogue_assignment.student_id IS '割当先の生徒ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_dialogue_assignment.content_id IS '割り当てたセット（教材）ID (com_m_contents.content_id、content_type=3)';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assigned_by_coach_id IS '割り当てを行ったコーチのユーザーID（監査・履歴用。編集権限を本人に限定するものではない）';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assigned_date IS '割当日';
COMMENT ON COLUMN public.com_t_dialogue_assignment.delete_flg IS '論理削除フラグ（割当解除="1"）。同一セットの再割当を許容するため、一意性は有効な割当のみを対象にした部分ユニークインデックスで担保する';
COMMENT ON COLUMN public.com_t_dialogue_assignment.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_dialogue_assignment.update_date IS '更新日時';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dialogue_assignment_unique_active
  ON public.com_t_dialogue_assignment (student_id, content_id)
  WHERE delete_flg = '0';

CREATE INDEX IF NOT EXISTS idx_dialogue_assignment_student
  ON public.com_t_dialogue_assignment (student_id)
  WHERE delete_flg = '0';

ALTER TABLE public.com_t_dialogue_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view dialogue assignments" ON public.com_t_dialogue_assignment;
DROP POLICY IF EXISTS "Coaches can assign dialogue sets" ON public.com_t_dialogue_assignment;
DROP POLICY IF EXISTS "Coaches can update dialogue assignments" ON public.com_t_dialogue_assignment;

CREATE POLICY "Involved users can view dialogue assignments" ON public.com_t_dialogue_assignment
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can assign dialogue sets" ON public.com_t_dialogue_assignment
FOR INSERT TO authenticated WITH CHECK (
    assigned_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
);

CREATE POLICY "Coaches can update dialogue assignments" ON public.com_t_dialogue_assignment
FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 4. com_t_dialogue_session_progress の新規作成
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_t_dialogue_session_progress (
  progress_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
  dialogue_session_id uuid NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id),
  is_completed boolean NOT NULL DEFAULT false,
  completed_date date,
  notes text,
  updated_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(assignment_id, dialogue_session_id)
);

COMMENT ON TABLE public.com_t_dialogue_session_progress IS 'ダイアログプラクティス セッション進捗トランザクション（セッション単位の完了状態とコーチメモ）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.progress_id IS '進捗ID';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.assignment_id IS '対象の割当ID (com_t_dialogue_assignment.assignment_id)';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.dialogue_session_id IS '対象のセッション明細ID (com_m_dialogue_session.dialogue_session_id)';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.is_completed IS 'セッション完了フラグ';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.completed_date IS '完了日（is_completed=true時に設定）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.notes IS 'コーチによる生徒別のセッションメモ（例: "6/30に実施、進行が早い"）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.updated_by_coach_id IS '最終更新を行ったコーチのユーザーID（複数コーチ分担時の追跡用）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_dialogue_session_progress_assignment
  ON public.com_t_dialogue_session_progress (assignment_id);

ALTER TABLE public.com_t_dialogue_session_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view their own dialogue session progress" ON public.com_t_dialogue_session_progress;
DROP POLICY IF EXISTS "Coaches can manage dialogue session progress for their students" ON public.com_t_dialogue_session_progress;

CREATE POLICY "Students can view their own dialogue session progress" ON public.com_t_dialogue_session_progress
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND a.student_id = auth.uid()
    )
);

CREATE POLICY "Coaches can manage dialogue session progress for their students" ON public.com_t_dialogue_session_progress
FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    updated_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND r.coach_id = auth.uid()
    )
);

COMMIT;

-- =========================================================================
-- 【追加セクション】旧ダイアログプラクティスデータ移行 (DML)
-- 追加日: 2026-09-20
--
-- 【内容】
--   旧システムのCOM_M_DIALOGUE(_DETAIL)/COM_M_TAILOR_MADE(_DETAIL)を、上記セクションで
--   作成したcom_m_contents(category_id)/com_m_dialogue_sessionへ移行する。コーパス3件は
--   システムテナント(client_id=276a456c-a7e5-4987-be15-c94be9ae89a5)へcom_m_contents_access
--   経由でアクセス権を付与する（2026-09-20 開発者確認済みのテナント紐づけ）。
--   正本・生成スクリプト: DML/com_m_dialogue_migration.sql, DML/gen_com_m_dialogue_migration.py
--   冪等性: content_id/dialogue_session_idは移行元IDから決定論的に生成したUUIDのため、
--   再実行してもON CONFLICTで同じ行に収束する（resumable）。
-- =========================================================================

-- =========================================================================
-- DML: com_m_dialogue_migration (旧ダイアログプラクティスデータ移行)
-- 前提: DDL/table/com_m_contents.sql（category_id追加パッチ）,
--   DDL/table/com_m_dialogue_session.sql, DDL/table/com_m_contents_access.sql の実行が
--   完了していること。
--
-- 【内容】
--   旧システムのCOM_M_DIALOGUE（汎用、LEVEL 1-3）/COM_M_DIALOGUE_DETAIL、および
--   COM_M_TAILOR_MADE（コーパス/Blueprint専用）/COM_M_TAILOR_MADE_DETAILを、
--   com_m_contents（content_type=3、category_id 1-4）+ com_m_dialogue_sessionへ移行する。
--   コーパス教材3件は、顧客への紐づけ先として「システムテナント」
--   (client_id=276a456c-a7e5-4987-be15-c94be9ae89a5、2026-09-20 開発者確認済み)を
--   com_m_contents_access経由で付与する。
--
-- 生成元: gen_com_m_dialogue_migration.py（同ディレクトリ。本ファイルはスクリプトによる
--   自動生成のため、内容を修正する場合は生成元スクリプト側を直し再生成すること）。
--
-- 冪等性: content_id/dialogue_session_idは、移行元のDIALOGUEID/TAILOR_MADE_ID/SESSION_NOから
--   固定名前空間UUID（uuid5）で決定論的に生成しているため、再実行しても同じ行に
--   ON CONFLICT DO UPDATEで収束する（resumable）。
--
-- 検証結果 (2026-09-20, blueprint-dev): 汎用28セット/106セッション、コーパス3セット/12セッション、
--   アクセス権3件をsupabase db queryで適用・件数確認済み。
-- =========================================================================

BEGIN;

-- 1. 汎用ダイアログ教材セット (COM_M_DIALOGUE -> com_m_contents)
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('bb525357-3bdf-5f6f-a41e-67b3bc56dc7c', 'A1 Scheduling a Meeting', NULL, 3, 0, 1, 1, 'A1 Scheduling a Meeting', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('2ecade7c-dc3b-591e-acac-12d735c06ff5', 'A1 Set A Self-Introduction at the Office: Introducing your Department', NULL, 3, 0, 1, 2, 'A1 Set A Self-Introduction at the Office: Introducing your Department', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('5e767eb6-f52d-568b-8b00-deacdf796151', 'A1 Set B Self-Introduction at the Office: Introducing your Job', NULL, 3, 0, 1, 3, 'A1 Set B Self-Introduction at the Office: Introducing your Job', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('86d5abba-9758-513d-8f66-707af0f50e14', 'A2 At the Grocery Store', NULL, 3, 0, 1, 4, 'A2 At the Grocery Store', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('c252bfc0-9167-51e1-be54-ae165fa95520', 'A2 Describing Locations', NULL, 3, 0, 1, 5, 'A2 Describing Locations', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('865e3a96-0005-53e7-a44d-4210d75d0ce6', 'A2 Business Trip', NULL, 3, 0, 1, 6, 'A2 Business Trip', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('60f24927-07a5-50ac-b6b3-4c130b5ee921', 'A2 Making Polite Requests', NULL, 3, 0, 2, 1, 'A2 Making Polite Requests', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('dd2e066c-dd35-5701-a49c-d05a3e78baf2', 'A2-B1 Set A Small Talk at the Office: Mondays', NULL, 3, 0, 2, 2, 'A2-B1 Set A Small Talk at the Office: Mondays', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('9061c447-9542-55cb-aafd-61f59f5cde37', 'A2-B1 Set B Small Talk at the Office: Midweek', NULL, 3, 0, 2, 3, 'A2-B1 Set B Small Talk at the Office: Midweek', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('f580f7b0-d225-5a18-bee3-286c9f0f003f', 'A2-B1 Confirming Project Deadlines', NULL, 3, 0, 2, 4, 'A2-B1 Confirming Project Deadlines', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('3209c6d9-a8d6-54b2-81f1-d8078c321408', 'B1 Taking a Taxi', NULL, 3, 0, 2, 5, 'B1 Taking a Taxi', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('437f67a0-441a-5660-8964-0a1a3208e0a8', 'B1 Polite Disagreement', NULL, 3, 0, 2, 6, 'B1 Polite Disagreement', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('e6093472-bcc5-57aa-948e-4cadabccd4e2', 'B1 Polite Refusal', NULL, 3, 0, 2, 7, 'B1 Polite Refusal', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('d5e609e9-6733-58f2-9051-b3c9f743b527', 'B1 Giving an Opinion', NULL, 3, 0, 2, 8, 'B1 Giving an Opinion', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('aa8bdce5-e888-5cf8-aa6e-4b0627027009', 'B1 Giving Advice', NULL, 3, 0, 2, 9, 'B1 Giving Advice', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('5717e7e9-35e9-5825-88eb-8fb327bdf05a', 'B1 Three Ways to Use "Should"', NULL, 3, 0, 2, 10, 'B1 Three Ways to Use "Should"', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('f48dcaba-5e8d-558e-a674-619d7f2843a1', 'B1+ Weighing the Pros and Cons', NULL, 3, 0, 2, 11, 'B1+ Weighing the Pros and Cons', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('99e04d92-8c0d-5723-ab1d-1a220cb5098a', 'B1-B2 Set A Attending a Job Interview: Describing Yourself in a Job Interview', NULL, 3, 0, 2, 12, 'B1-B2 Set A Attending a Job Interview: Describing Yourself in a Job Interview', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('8bfd5ae3-0a2f-5fd1-8bfe-dea483e6ddee', 'B1-B2 Set B Attending a Job Interview: Describing Your Strengths in a Job Interview', NULL, 3, 0, 2, 13, 'B1-B2 Set B Attending a Job Interview: Describing Your Strengths in a Job Interview', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('37b7fc7b-8269-5a46-97a2-1d4d2caad7eb', 'B1-B2 Set C Attending a Job Interview: Describing Your Weaknesses in a Job Interview', NULL, 3, 0, 2, 14, 'B1-B2 Set C Attending a Job Interview: Describing Your Weaknesses in a Job Interview', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('53cb5b38-7c77-5495-af4a-82a4394aa4a8', 'B1 Conversation Over Lunch', NULL, 3, 0, 3, 1, 'B1 Conversation Over Lunch', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('2a52c504-f93e-55c2-97a5-d86f4a10d38b', 'B1 Company Dinner', NULL, 3, 0, 3, 2, 'B1 Company Dinner', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('4a82da12-dded-5b9c-9e66-c400015defc0', 'B1 Giving Constructive Feedback', NULL, 3, 0, 3, 3, 'B1 Giving Constructive Feedback', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('86ffa91f-a17a-548b-be7e-169f97d9e346', 'B1 Negotiation Language', NULL, 3, 0, 3, 4, 'B1 Negotiation Language', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('4bd3d102-cc7c-5763-881b-5b42412a5058', 'B1-B2 Asking for and Receiving Direct Feedback', NULL, 3, 0, 3, 5, 'B1-B2 Asking for and Receiving Direct Feedback', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('f91d3238-639e-5a24-b6fc-630321058118', 'B2 Different Uses of "Sorry"', NULL, 3, 0, 3, 6, 'B2 Different Uses of "Sorry"', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 'B2 Delivering Bad News', NULL, 3, 0, 3, 7, 'B2 Delivering Bad News', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('442437e5-eeb4-588d-a166-9b8609bc35ad', 'B2 Describing Graphs and Charts', NULL, 3, 0, 3, 8, 'B2 Describing Graphs and Charts', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();

-- 2. 汎用ダイアログ セッション明細 (COM_M_DIALOGUE_DETAIL -> com_m_dialogue_session)
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('4943d3c3-4230-5c66-9597-a12919e3977c', 'bb525357-3bdf-5f6f-a41e-67b3bc56dc7c', 1, '1. (Coach Slides) Session 1: Scheduling a Meeting', 'https://docs.google.com/presentation/d/1f7iqNxkzmeLLdMGmQAxc-Wvmj9L38PqrMwvy35jYyXQ/edit?usp=sharing', 'Student Slides: Scheduling a Meeting', 'https://docs.google.com/presentation/d/18Nv_nSVehWNR8dMwikLSzh-HcSECOsAoEmElpPU2tqM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('0ac0b882-b0b6-5943-aedf-703775ea33f5', 'bb525357-3bdf-5f6f-a41e-67b3bc56dc7c', 2, '2. (Coach Slides) Session 2: Scheduling a meeting', 'https://docs.google.com/presentation/d/1xolbsOn7K_oBudk7x4mq4V5Eu4BME9OmlYyOiAurtkc/edit?usp=drive_link', 'Student Slides: Scheduling a Meeting', 'https://docs.google.com/presentation/d/18Nv_nSVehWNR8dMwikLSzh-HcSECOsAoEmElpPU2tqM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5d0931ad-58f2-5f9b-866a-f0aa3d65d6a1', 'bb525357-3bdf-5f6f-a41e-67b3bc56dc7c', 3, '3. (Coach Slides) Session 3: Scheduling a meeting', 'https://docs.google.com/presentation/d/1R92sGd-noV3549WRMivyvW-hnTS3HiPNttGZbSwYuhk/edit?usp=drive_link', 'Student Slides: Scheduling a Meeting', 'https://docs.google.com/presentation/d/18Nv_nSVehWNR8dMwikLSzh-HcSECOsAoEmElpPU2tqM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('2d88345b-4350-5d13-a95d-9bf4d9de7f4c', 'bb525357-3bdf-5f6f-a41e-67b3bc56dc7c', 4, '4. (Coach Slides) Session 3: Scheduling a meeting', 'https://docs.google.com/presentation/d/1w6iurN1M3f2h2PNAhKAasdvJiQZ7B9ws14axtCbBiSg/edit?usp=drive_link', 'Student Slides: Scheduling a Meeting', 'https://docs.google.com/presentation/d/18Nv_nSVehWNR8dMwikLSzh-HcSECOsAoEmElpPU2tqM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('fc9a1ddd-5e5c-5eda-a248-8bb1bbdb5093', '2ecade7c-dc3b-591e-acac-12d735c06ff5', 1, '1. Set A (Coach Slides) Session 1: Introducing your department', 'https://docs.google.com/presentation/d/1DfYU5tdwqz6oxpFkgF0mHxb4FtBfqDhayuKjgVkewwU/edit?usp=drive_link', 'Set A (Student Slides) Introducing your department', 'https://docs.google.com/presentation/d/1IGZQKk8_y4P0O4lgHTIIyAITxGXgouJw1u0M8yxjNWI/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('b1dbfbf1-86a0-5e33-afed-d1c91a210cd7', '2ecade7c-dc3b-591e-acac-12d735c06ff5', 2, '2. Set A (Coach Slides) Session 2: Introducing your department', 'https://docs.google.com/presentation/d/1r50LugkQR0odfISuhhLW0lpM39mIn2bPNsHsxM3VjDE/edit?usp=drive_link', 'Set A (Student Slides) Introducing your department', 'https://docs.google.com/presentation/d/1IGZQKk8_y4P0O4lgHTIIyAITxGXgouJw1u0M8yxjNWI/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('95bc0a94-ae60-5689-b673-912a97811008', '2ecade7c-dc3b-591e-acac-12d735c06ff5', 3, '3. Set A (Coach Slides) Session 3: Introducing your department', 'https://docs.google.com/presentation/d/1FWjefIs1F69sHJsmJU7HmXStJNSJnI8o49FDfpQpH3U/edit?usp=drive_link', 'Set A (Student Slides) Introducing your department', 'https://docs.google.com/presentation/d/1IGZQKk8_y4P0O4lgHTIIyAITxGXgouJw1u0M8yxjNWI/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5c9570b1-ec1c-5cff-8ccc-2a2946d4cc9f', '2ecade7c-dc3b-591e-acac-12d735c06ff5', 4, '4. Set A (Coach Slides) Session 4: Introducing your department', 'https://docs.google.com/presentation/d/1_Sx__NCBk9eGsIkuYvomNx3shMZWcjbdT9yV9UhQZ6s/edit?usp=drive_link', 'Set A (Student Slides) Introducing your department', 'https://docs.google.com/presentation/d/1IGZQKk8_y4P0O4lgHTIIyAITxGXgouJw1u0M8yxjNWI/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('14b8db3e-4988-5122-b7bd-d33ed831e441', '5e767eb6-f52d-568b-8b00-deacdf796151', 1, '1. Set B (Coach Slides) Session 1: Introducing your job', 'https://docs.google.com/presentation/d/1c12a9saZJ5kpZVfC7LuhKWXQXPJae0cC_68P0Tt3WKc/edit?usp=drive_link', 'Set B (Student Slides) Introducing your job', 'https://docs.google.com/presentation/d/1Alq-RP7a1gYgof1aV2lsBX3W9oXcl8Bq333AfLxTpqE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('ff6b5cd5-31b3-5bd1-91c6-c74e8877f445', '5e767eb6-f52d-568b-8b00-deacdf796151', 2, '2. Set B (Coach Slides) Session 2: Introducing your job', 'https://docs.google.com/presentation/d/128AhookQBcH0wY4WTZkFggW--qMLRarrGde6lP2xgK8/edit?usp=drive_link', 'Set B (Student Slides) Introducing your job', 'https://docs.google.com/presentation/d/1Alq-RP7a1gYgof1aV2lsBX3W9oXcl8Bq333AfLxTpqE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('b3539444-824c-5bc7-afc7-5b1540088cc7', '5e767eb6-f52d-568b-8b00-deacdf796151', 3, '3. Set B (Coach Slides) Session 3: Introducing your job', 'https://docs.google.com/presentation/d/1l5R7oDxhAZaZOHys5TuRZOwEso2rzyS9Z_3c0e9aZaA/edit?usp=drive_link', 'Set B (Student Slides) Introducing your job', 'https://docs.google.com/presentation/d/1Alq-RP7a1gYgof1aV2lsBX3W9oXcl8Bq333AfLxTpqE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('8f9400de-62cd-5bbb-a05e-7432d089d971', '5e767eb6-f52d-568b-8b00-deacdf796151', 4, '4. Set B (Coach Slides) Session 4: Introducing your job', 'https://docs.google.com/presentation/d/1-dxOsE0_k2edrW7Ge3wSwQ0u0wd1Ek25sbaCoOQNrQI/edit?usp=drive_link', 'Set B (Student Slides) Introducing your job', 'https://docs.google.com/presentation/d/1Alq-RP7a1gYgof1aV2lsBX3W9oXcl8Bq333AfLxTpqE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('ab3650e3-0d4a-58e6-91d7-18bdf41f9741', '86d5abba-9758-513d-8f66-707af0f50e14', 1, '1. (Coach Slides) Session 1: At the Grocery store', 'https://docs.google.com/presentation/d/1dH_kww9tnO_usUvDsEhyKWWZ4UppY3Saxe1I-qX_oec/edit?usp=drive_link', 'Student Slides: At the grocery store', 'https://docs.google.com/presentation/d/17JR5lywvPd5PwJ9TUVWQW6SfR5Np2uK8C4tZO74_iO8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('f6ad82e1-13cd-543d-9f6f-9373ee3bf56a', '86d5abba-9758-513d-8f66-707af0f50e14', 2, '2. (Coach Slides) Session 2: At the Grocery store', 'https://docs.google.com/presentation/d/1XaVnrt1rpJI82gcfji59BR5nN650SYxwDpN6TRWNPrI/edit?usp=drive_link', 'Student Slides: At the grocery store', 'https://docs.google.com/presentation/d/17JR5lywvPd5PwJ9TUVWQW6SfR5Np2uK8C4tZO74_iO8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('44cb846a-92ed-5457-8198-7cefc2e2e34b', '86d5abba-9758-513d-8f66-707af0f50e14', 3, '3. (Coach Slides) Session 3: At the Grocery store', 'https://docs.google.com/presentation/d/15fekWDbMfM2JB0SEzlwpLA7efbyUIB00QJ3Fj0W8UTs/edit?usp=drive_link', 'Student Slides: At the grocery store', 'https://docs.google.com/presentation/d/17JR5lywvPd5PwJ9TUVWQW6SfR5Np2uK8C4tZO74_iO8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('3a7b4574-418e-53dc-ba66-c40907978e78', 'c252bfc0-9167-51e1-be54-ae165fa95520', 1, '1. (Coach Slides) Session 1: Describing locations', 'https://docs.google.com/presentation/d/1kjTLZJ5Zj7au7k2nV3vtoIATtJbFxLvAO1FKU7-WTes/edit?usp=drive_link', 'Student Slides: Describing Locations', 'https://docs.google.com/presentation/d/1VN85u7ftWUmyFKCTzNrgdWFkYM-MvOFY-otpZinU6yA/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('913a36fd-c2e5-551b-9060-d6db1c524452', 'c252bfc0-9167-51e1-be54-ae165fa95520', 2, '2. (Coach Slides) Session 2: Describing Locations', 'https://docs.google.com/presentation/d/1UxerCUKnZ5MiTMra4QF3u4DCJMsZn2hKL6iE5AxdeHs/edit?usp=drive_link', 'Student Slides: Describing Locations', 'https://docs.google.com/presentation/d/1VN85u7ftWUmyFKCTzNrgdWFkYM-MvOFY-otpZinU6yA/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('278f2181-d5f7-5390-99ce-ba6035f853e7', 'c252bfc0-9167-51e1-be54-ae165fa95520', 3, '3. (Coach Slides) Session 3: Describing locations', 'https://docs.google.com/presentation/d/13miogGL_KPRPGGlXX8D7FGH2L3GFk_GOfpfv4a8mh10/edit?usp=drive_link', 'Student Slides: Describing Locations', 'https://docs.google.com/presentation/d/1VN85u7ftWUmyFKCTzNrgdWFkYM-MvOFY-otpZinU6yA/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('c25622a1-836a-5e9a-8f23-b496464aa852', 'c252bfc0-9167-51e1-be54-ae165fa95520', 4, '4. (Coach Slides) Session 4: Describing Locations Practice', 'https://docs.google.com/presentation/d/1lrNHIwB8srfeimRDDQPLYgan0hkvuZSSDS63JJGHzzQ/edit?usp=drive_link', 'Student Slides: Describing Locations', 'https://docs.google.com/presentation/d/1VN85u7ftWUmyFKCTzNrgdWFkYM-MvOFY-otpZinU6yA/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a63a854c-a4aa-5b8f-8921-80608c38581b', '865e3a96-0005-53e7-a44d-4210d75d0ce6', 1, '1. (Coach Slides) Session 1: Business Trip', 'https://docs.google.com/presentation/d/1i8q09Fnch40hL25YA9aQCFnEiLB1kl621pqKB9O5xgI/edit?usp=drive_link', '(Student Slides) Business Trip', 'https://docs.google.com/presentation/d/1VI2_T3Nn6fUllXxmbSSKqtDiKMAlSS4wtWDjxdJzPIM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('e7b251b0-fa4c-5c6e-becd-444fb77221b2', '865e3a96-0005-53e7-a44d-4210d75d0ce6', 2, '2. (Coach Slides) Session 2: Business Trip', 'https://docs.google.com/presentation/d/1wdNCbSKEXSwu273LZC2OQ5mJHqarvAkdxrfQczAIuGo/edit?usp=drive_link', '(Student Slides) Business Trip', 'https://docs.google.com/presentation/d/1VI2_T3Nn6fUllXxmbSSKqtDiKMAlSS4wtWDjxdJzPIM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('d63138a0-7b5b-5007-bb21-ddb3fe6cbbff', '865e3a96-0005-53e7-a44d-4210d75d0ce6', 3, '3. (Coach Slides) Session 3: Business Trip', 'https://docs.google.com/presentation/d/1Kb5-y_fhCjbgz4l2UIA3qHyqtG9D0tT_8YRLzK2mYZI/edit?usp=drive_link', '(Student Slides) Business Trip', 'https://docs.google.com/presentation/d/1VI2_T3Nn6fUllXxmbSSKqtDiKMAlSS4wtWDjxdJzPIM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('deefac29-bda9-5191-8b8e-bbdd52341295', '865e3a96-0005-53e7-a44d-4210d75d0ce6', 4, '4. (Coach Slides) Session 4: Business Trip', 'https://docs.google.com/presentation/d/16UwGj1aIXH3NWY7YEzBlf90YN4hbUzy-e0OwTw8G6lQ/edit?usp=drive_link', '(Student Slides) Business Trip', 'https://docs.google.com/presentation/d/1VI2_T3Nn6fUllXxmbSSKqtDiKMAlSS4wtWDjxdJzPIM/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('ed86e0c8-70f1-54eb-b067-33351860198b', '60f24927-07a5-50ac-b6b3-4c130b5ee921', 1, '(Coach slides) Session 1: Making polite requests', 'https://docs.google.com/presentation/d/1y8zRCdzMgHvUbVz-x26D01lMO2XexYc3FfJe5Dr4YrY/edit?usp=drive_link', '(Student slides)  Sessions 1-3:  Making polite requests', 'https://docs.google.com/presentation/d/19LCcS3OP--4hoK4hkPW_Pl2Suu_t8AVSS6NpylIRhxY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('3079711a-b113-589a-8261-9675aa2dd94a', '60f24927-07a5-50ac-b6b3-4c130b5ee921', 2, '(Coach slides) Session 2: Making polite requests', 'https://docs.google.com/presentation/d/1AUFaB1dc2qkv8dM4lvYzOKkRaI5yKLW9dpg-c9N0SP0/edit?usp=drive_link', '(Student slides)  Sessions 1-3:  Making polite requests', 'https://docs.google.com/presentation/d/19LCcS3OP--4hoK4hkPW_Pl2Suu_t8AVSS6NpylIRhxY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('2e7f3acf-bf1f-50bb-a34f-9c3c8f563a78', '60f24927-07a5-50ac-b6b3-4c130b5ee921', 3, '(Coach slides) Session 3: Making polite requests', 'https://docs.google.com/presentation/d/1zFRWPv2KLFjl8XdGoKXJJ8fPAGLqUbslWrd1UmL_d-8/edit?usp=drive_link', '(Student slides)  Sessions 1-3:  Making polite requests', 'https://docs.google.com/presentation/d/19LCcS3OP--4hoK4hkPW_Pl2Suu_t8AVSS6NpylIRhxY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('df314eb8-6360-5699-9507-4e4633729ea8', 'dd2e066c-dd35-5701-a49c-d05a3e78baf2', 1, '1. (Coach Slides) Session 1: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1AzWe3KuA6tmH8au8oujxRUO2f3kpPl8YFMsTgZkY6Qg/edit?usp=drive_link', 'Student Slides: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1R6sVGAKFKKjdEG9KPRJqoiGKopAYxWDsQE7dwVPWMWU/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('f9bacdfe-b990-5a2c-9779-7a39c27f48c8', 'dd2e066c-dd35-5701-a49c-d05a3e78baf2', 2, '2. (Coach Slides) Session 2: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1qAE2Y-DOzW42YuIPIeZpdrA7yzs5SmIh4CkjCFYvL5k/edit?usp=drive_link', 'Student Slides: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1R6sVGAKFKKjdEG9KPRJqoiGKopAYxWDsQE7dwVPWMWU/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('37aa54f8-f6d2-56bb-b883-3ff46e71fc20', 'dd2e066c-dd35-5701-a49c-d05a3e78baf2', 3, '3. (Coach Slides) Session 3: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1LI8b7VRZDCwyd6tQWhOHLZ0OSdaxy-vs9fg-04QCb80/edit?usp=drive_link', 'Student Slides: Small Talk at the Office (Monday)', 'https://docs.google.com/presentation/d/1R6sVGAKFKKjdEG9KPRJqoiGKopAYxWDsQE7dwVPWMWU/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('1568b928-4355-5c69-9096-32e4e3731849', '9061c447-9542-55cb-aafd-61f59f5cde37', 1, 'Session 1: (Mid-week) Making Small talk at the Office', 'https://docs.google.com/presentation/d/1idpXSvM6Y-rhk74HH839UMGOD92K0LfcWzTcTkNwRVM/edit?usp=drive_link', '(Student Slides): (Midweek) Small Talk at the Office', 'https://docs.google.com/presentation/d/1l3k-69qXTV0Gjfb9LjGsT4P6ugT1POjtvz3QX101214/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('20929b02-f25c-5e38-aee7-8d3b78364c4f', '9061c447-9542-55cb-aafd-61f59f5cde37', 2, 'Session 2: (Mid-week) Making Small Talk at the Office', 'https://docs.google.com/presentation/d/1Rp6g_Hd1NP4briKB8CruSRnBzUcnkfeP5_IW5hFFVBA/edit?usp=drive_link', '(Student Slides): (Midweek) Small Talk at the Office', 'https://docs.google.com/presentation/d/1l3k-69qXTV0Gjfb9LjGsT4P6ugT1POjtvz3QX101214/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('60843c91-cd5c-562b-8ceb-debf759038b6', '9061c447-9542-55cb-aafd-61f59f5cde37', 3, 'Session 3: (Midweek) Making Small Talk at the Office', 'https://docs.google.com/presentation/d/1Glenejnxpe94WaAFiPpdKIeQKzV9jDxB0V_gSxbL4zE/edit?usp=drive_link', '(Student Slides): (Midweek) Small Talk at the Office', 'https://docs.google.com/presentation/d/1l3k-69qXTV0Gjfb9LjGsT4P6ugT1POjtvz3QX101214/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('55bb4d35-ece1-5327-964f-b23b0d78c775', '9061c447-9542-55cb-aafd-61f59f5cde37', 4, 'Session 4: (Midweek) Making Small Talk at the Office', 'https://docs.google.com/presentation/d/1g-3T4AYWHLRW-YNuY3YvLbgDBCIC3f1m-V3e_ck6Sn4/edit?usp=drive_link', '(Student Slides): (Midweek) Small Talk at the Office', 'https://docs.google.com/presentation/d/1l3k-69qXTV0Gjfb9LjGsT4P6ugT1POjtvz3QX101214/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('b783e5f4-ad0b-59f5-a0f6-8b6b64641e19', 'f580f7b0-d225-5a18-bee3-286c9f0f003f', 1, 'Session 1 (Coach slides) Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1hPHd_-s_fKo5EAsZn5YxjVpaOw553aRhyZ4Vh7IPgCQ/edit?usp=drive_link', '(Student slides) Sessions 1-4: Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1JXPkTPmnE4C9MHz692hTUAZP8JhLL5drcDmz4NvW_Ms/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('64625780-263d-5a22-9faa-afd16c4340af', 'f580f7b0-d225-5a18-bee3-286c9f0f003f', 2, 'Session 2 (Coach Slides) Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1z0Av1gzhpSR964tXzt-s19-xPycuUxUBl8pjpPDnLGk/edit?usp=drive_link', '(Student slides) Sessions 1-4: Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1JXPkTPmnE4C9MHz692hTUAZP8JhLL5drcDmz4NvW_Ms/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5c3852e1-5245-50a9-90ef-7ef45ccf056a', 'f580f7b0-d225-5a18-bee3-286c9f0f003f', 3, 'Session 3 (Coach Slides) Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1VZ55fFpSdzUOTEUi0KlBMK6lQ1lYfj7PF9eKtNXQsB4/edit?usp=drive_link', '(Student slides) Sessions 1-4: Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1JXPkTPmnE4C9MHz692hTUAZP8JhLL5drcDmz4NvW_Ms/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('72a5909c-328e-531a-bd37-2d2bccb84611', 'f580f7b0-d225-5a18-bee3-286c9f0f003f', 4, 'Session 4 (Coach Slides) Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1sOs-UYB-TkKgdsygYTInC2o3404MEcLgpBVAtCSUvOs/edit?usp=drive_link', '(Student slides) Sessions 1-4: Confirming Project Deadlines', 'https://docs.google.com/presentation/d/1JXPkTPmnE4C9MHz692hTUAZP8JhLL5drcDmz4NvW_Ms/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a561e56b-b7d7-5a50-9e70-42383cfdc38c', '3209c6d9-a8d6-54b2-81f1-d8078c321408', 1, '1. (Coach Slides) Session 1: Taking a Taxi', 'https://docs.google.com/presentation/d/1rj2Z9jR6TrrIabIlfi-624gx8zu5LB-9RJw4u1xcbQk/edit?usp=drive_link', '(Student Slides) Set: Taking a Taxi', 'https://docs.google.com/presentation/d/1q8CazEWRT0KQRGYBTsVqr1iAEk1CrR6WkTm12fRkM3o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5f01a69f-90e0-5711-ad3a-6b97c8934035', '3209c6d9-a8d6-54b2-81f1-d8078c321408', 2, '2. (Coach Slides) Session 2: Taking a Taxi', 'https://docs.google.com/presentation/d/1ilFPZUNs0qUvXT6UgfhwZ72QW48kd0EVBv-WFUNW62U/edit?usp=drive_link', '(Student Slides) Set: Taking a Taxi', 'https://docs.google.com/presentation/d/1q8CazEWRT0KQRGYBTsVqr1iAEk1CrR6WkTm12fRkM3o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('97b48e31-c82a-542f-a82a-60eb63bc9d3b', '3209c6d9-a8d6-54b2-81f1-d8078c321408', 3, '3. (Coach Slides) Session 3: Taking a Taxi', 'https://docs.google.com/presentation/d/1UuveKy8oSapjwfAy0sPcqbfgNdYvXa7sOu5u0b52E-Q/edit?usp=drive_link', '(Student Slides) Set: Taking a Taxi', 'https://docs.google.com/presentation/d/1q8CazEWRT0KQRGYBTsVqr1iAEk1CrR6WkTm12fRkM3o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('b690aab5-03b2-5d68-a0bb-14ec5ed104f7', '3209c6d9-a8d6-54b2-81f1-d8078c321408', 4, '4. (Coach Slides) Session 4: Taking a Taxi', 'https://docs.google.com/presentation/d/1sP7ZsDm9v4vlXOc-nO3rPDJ4xhC_E5VMXGOiW7A_O4w/edit?usp=drive_link', '(Student Slides) Set: Taking a Taxi', 'https://docs.google.com/presentation/d/1q8CazEWRT0KQRGYBTsVqr1iAEk1CrR6WkTm12fRkM3o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('fded6c8d-eadd-514b-a738-05e452168ee1', '437f67a0-441a-5660-8964-0a1a3208e0a8', 1, '(Coach Slides) Session 1: Polite disagreement', 'https://docs.google.com/presentation/d/1m6lLGfnoV4iKhnW1x5UGgvq8s2cnGRIsqIYKBcYOq9A/edit?usp=drive_link', '(Student slides) Polite disagreement', 'https://docs.google.com/presentation/d/1wZIHGa9MB__256TWHxp1nP5cv-OoYLBgaFPw1wzcKDI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('de866c8a-1959-5a5f-a2e3-e6f2cbad4f75', '437f67a0-441a-5660-8964-0a1a3208e0a8', 2, '(Coach Slides) Session 2: Polite disagreement', 'https://docs.google.com/presentation/d/1-t-WQF0zVR9mKF5Fcpn7K7oTIUy7oXWhx5QcuGYeSFA/edit?usp=drive_link', '(Student slides) Polite disagreement', 'https://docs.google.com/presentation/d/1wZIHGa9MB__256TWHxp1nP5cv-OoYLBgaFPw1wzcKDI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('11d75ded-b3b8-58df-b39b-1e63d5701693', '437f67a0-441a-5660-8964-0a1a3208e0a8', 3, '(Coach Slides) Session 3: Polite disagreement', 'https://docs.google.com/presentation/d/19nq4-eN7Lz0IJ2Kn5maRbpcLThlUHBE90AKX62FaDao/edit?usp=drive_link', '(Student slides) Polite disagreement', 'https://docs.google.com/presentation/d/1wZIHGa9MB__256TWHxp1nP5cv-OoYLBgaFPw1wzcKDI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('ed98800a-de81-51fb-926f-c3c8ede696a5', 'e6093472-bcc5-57aa-948e-4cadabccd4e2', 1, '(Coach Slides) Session 1: Polite refusal', 'https://docs.google.com/presentation/d/1AtaXHJOhR_1L76aSxMKpjUe8QWEupNie8xpE5iUoA78/edit?usp=drive_link', '(Student slides) Polite refusal', 'https://docs.google.com/presentation/d/16397PvrdgxmBaaPTKR4iSBkpfTXgy9YyZg9hvwzVyNY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('15087fc5-0a46-51ab-88aa-e25534f6e1e8', 'e6093472-bcc5-57aa-948e-4cadabccd4e2', 2, '(Coach Slides) Session 2: Polite refusal', 'https://docs.google.com/presentation/d/1psw3XWb89c6j7lFznaz8BFPKAOXSaObxrnoIt14HO0M/edit?usp=sharing', '(Student slides) Polite refusal', 'https://docs.google.com/presentation/d/16397PvrdgxmBaaPTKR4iSBkpfTXgy9YyZg9hvwzVyNY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('70829cdb-458b-5441-a010-04c244c00892', 'e6093472-bcc5-57aa-948e-4cadabccd4e2', 3, '(Coach Slides) Session 3: Polite refusal', 'https://docs.google.com/presentation/d/1jBHaZKr8GeMdORQQqYiOq7U1dvf3jqvovOo5dcu82u0/edit?usp=drive_link', '(Student slides) Polite refusal', 'https://docs.google.com/presentation/d/16397PvrdgxmBaaPTKR4iSBkpfTXgy9YyZg9hvwzVyNY/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a9e5cf8d-fdd7-5854-8693-357984a45ed2', 'd5e609e9-6733-58f2-9051-b3c9f743b527', 1, '(Coach Slides) Session 1: Giving an opinion', 'https://docs.google.com/presentation/d/1OHeCknXNCb0KLY3xR-oWenRdPmyTXoPkeGTNeKW1Zd0/edit?usp=drive_link', '(Student Slides) Giving an opinion', 'https://docs.google.com/presentation/d/1yrdPQDWn1rgqoYYUH_m4JQCMUUv0cUwEYj6UBZfRlY8/edit?slide=id.g237ace82dec_0_0#slide=id.g237ace82dec_0_0', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('f204fece-d2e3-585f-b29a-0b2265462251', 'd5e609e9-6733-58f2-9051-b3c9f743b527', 2, '(Coach Slides) Session 2: Giving an opinion', 'https://docs.google.com/presentation/d/1qKUkeppAPdyuP4QeVwaUNC96ZbSCQjMoLlhQKjJdQtI/edit?usp=drive_link', '(Student Slides) Giving an opinion', 'https://docs.google.com/presentation/d/13DGqYHl0CeH6bNq-Em-WxpVJj2VL3Lxvs1mCS6l5aHw/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('746532d7-2302-5aac-b3f0-5332125392e0', 'd5e609e9-6733-58f2-9051-b3c9f743b527', 3, '(Coach Slides) Session 3: Giving an opinion', 'https://docs.google.com/presentation/d/1b_2rK4GeM3TK1qowDSqgglbci9fXyono1w3PVkEydbY/edit?usp=drive_link', '(Student Slides) Giving an opinion', 'https://docs.google.com/presentation/d/13DGqYHl0CeH6bNq-Em-WxpVJj2VL3Lxvs1mCS6l5aHw/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('432db56e-8211-5a87-8723-a75b16ec13d7', 'aa8bdce5-e888-5cf8-aa6e-4b0627027009', 1, '(Coach Slides) Session 1: Giving advice', 'https://docs.google.com/presentation/d/1jCSj7wNZ5gBnzoPTBOnw0sjO3fuQY6k7kN58mSFkkik/edit?usp=drive_link', '(Student Slides) Giving advice', 'https://docs.google.com/presentation/d/1aLT4Q5VJqrTmUZ2QeTGXkrXd2YkISaP5JXPX-pkWkeI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('c0de5ba0-7003-54dd-ba05-7d0186e2af8b', 'aa8bdce5-e888-5cf8-aa6e-4b0627027009', 2, '(Coach Slides) Session 2: Giving advice', 'https://docs.google.com/presentation/d/1tYEpiIMfq7MgWzZhxF5gjh4AYHrPjraBehlQ7qI6lq4/edit?usp=drive_link', '(Student Slides) Giving advice', 'https://docs.google.com/presentation/d/1aLT4Q5VJqrTmUZ2QeTGXkrXd2YkISaP5JXPX-pkWkeI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('074d0983-3291-5064-9ba3-f334dfdce080', 'aa8bdce5-e888-5cf8-aa6e-4b0627027009', 3, '(Coach Slides) Session 3: Giving advice', 'https://docs.google.com/presentation/d/1dm0mAsi9_8cFhbH90FvHVSaeulv1gcKs-prO4100zRk/edit?usp=drive_link', '(Student Slides) Giving advice', 'https://docs.google.com/presentation/d/1aLT4Q5VJqrTmUZ2QeTGXkrXd2YkISaP5JXPX-pkWkeI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('48869e30-10d3-5c50-934c-f1a995f73192', '5717e7e9-35e9-5825-88eb-8fb327bdf05a', 1, '(Coach slides) Session 1: Three ways to use "should"', 'https://docs.google.com/presentation/d/1ZiiWfy0nTD6oWXlvAlWpSXc59G0x9T-PTzBZ_6zDRzI/edit?usp=drive_link', '(Student slides) Three ways to use "should"', 'https://docs.google.com/presentation/d/17P_2MsTfuPKqwEHrXO0Dz_UXFLZjNlpA8UXZVov8nlI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6ee2a72e-43fe-5585-824c-283a2299c493', '5717e7e9-35e9-5825-88eb-8fb327bdf05a', 2, '(Coach slides) Session 2: Three ways to use "should"', 'https://docs.google.com/presentation/d/1M1Ybtki7WgdKjCHxXfhQbhYQQWlkqMgyS8xYuoGdfqY/edit?usp=drive_link', '(Student slides) Three ways to use "should"', 'https://docs.google.com/presentation/d/17P_2MsTfuPKqwEHrXO0Dz_UXFLZjNlpA8UXZVov8nlI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('14f4e582-6938-54d0-bc39-b0a08c7bff35', '5717e7e9-35e9-5825-88eb-8fb327bdf05a', 3, '(Coach slides) Session 3: Three ways to use "should"', 'https://docs.google.com/presentation/d/1ikbHWhYkYdNomibUJtVfMo1kglMqnMUja1XmTm0XtL4/edit?usp=drive_link', '(Student slides) Three ways to use "should"', 'https://docs.google.com/presentation/d/17P_2MsTfuPKqwEHrXO0Dz_UXFLZjNlpA8UXZVov8nlI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('7314b13a-f838-565a-a14e-5e2f26caaecd', 'f48dcaba-5e8d-558e-a674-619d7f2843a1', 1, 'Session 1: Weighing the Pros and Cons (Coach Slides)', 'https://docs.google.com/presentation/d/1jE65sUPezDga1NnPYusihyfwPEjrjI2RObA-8RthQaY/edit?usp=drive_link', 'Student Slides: Weighing the Pros and Cons', 'https://docs.google.com/presentation/d/1SVJ3o7yWmZCxOt8Htii1iWQCtrIpRZmWbXiZ1kpfMGE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('eaeefb94-124f-5da5-b53b-ad8dba137172', 'f48dcaba-5e8d-558e-a674-619d7f2843a1', 2, 'Session 2: Weighing the Pros and Cons (Coach Slides)', 'https://docs.google.com/presentation/d/1--ptPUcPq3QENm-IqB1aJytfLTNiYnMMpmkf5ZGsx-o/edit?usp=drive_link', 'Student Slides: Weighing the Pros and Cons', 'https://docs.google.com/presentation/d/1SVJ3o7yWmZCxOt8Htii1iWQCtrIpRZmWbXiZ1kpfMGE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('48206efd-ba1e-5dc9-a918-313f16d471bb', 'f48dcaba-5e8d-558e-a674-619d7f2843a1', 3, 'Session 3: Weighing the Pros and Cons (Coach Slides)', 'https://docs.google.com/presentation/d/1wccpPr4gUDZicxNtHgXQack2_oJWJaCTVLF40-UVew0/edit?usp=drive_link', 'Student Slides: Weighing the Pros and Cons', 'https://docs.google.com/presentation/d/1SVJ3o7yWmZCxOt8Htii1iWQCtrIpRZmWbXiZ1kpfMGE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('423cbc40-5165-56c7-904f-1aac2b964405', 'f48dcaba-5e8d-558e-a674-619d7f2843a1', 4, 'Session 4: Weighing the Pros and Cons (Coach Slides)', 'https://docs.google.com/presentation/d/1i6HSBrx3nvGT6_tpOp3E4YYSn1rgLOg49sMJ5ByWvcs/edit?usp=drive_link', 'Student Slides: Weighing the Pros and Cons', 'https://docs.google.com/presentation/d/1SVJ3o7yWmZCxOt8Htii1iWQCtrIpRZmWbXiZ1kpfMGE/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('e2396459-bd2f-5969-9ca0-0adeaa1f766e', '99e04d92-8c0d-5723-ab1d-1a220cb5098a', 1, '1. (Coach Slides) Session 1: Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1LD-NvRSU8xmtuTJ0SsKiEhWOYGAXs1iVvBwXIGHJMXU/edit?usp=drive_link', 'Set A (Student Slides) Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1PVGBhbh0UywJ9C7phtsklDDsW8xqOl_W0Jv-4KSPf1k/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('90b205bb-85f9-5de8-9863-2fe7714ee229', '99e04d92-8c0d-5723-ab1d-1a220cb5098a', 2, '2. (Coach Slides) Session 2: Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1NZgarJxxQZ7xM6JyJyWj1EfPaukqSV0o-bXViyD2nRc/edit?usp=drive_link', 'Set A (Student Slides) Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1PVGBhbh0UywJ9C7phtsklDDsW8xqOl_W0Jv-4KSPf1k/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('d8ee7271-b70b-5ed4-9c04-9ec81fb94a93', '99e04d92-8c0d-5723-ab1d-1a220cb5098a', 3, '3. (Coach Slides) Session 3: Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1ZNtHmTNL-QkMToMatihRMKsIT4cz-ZLp3XU18z9_wqw/edit?usp=drive_link', 'Set A (Student Slides) Describing Yourself in a Job Interview', 'https://docs.google.com/presentation/d/1PVGBhbh0UywJ9C7phtsklDDsW8xqOl_W0Jv-4KSPf1k/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('e552cf91-58d6-57f5-b9d2-c08aa14e9677', '8bfd5ae3-0a2f-5fd1-8bfe-dea483e6ddee', 1, '1. (Coach Slides) Session 1: Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1D3EVok7wXzWFk3RasnmMw_a73AIFTNVkd8wfU4YFZOk/edit?usp=drive_link', 'Set B (Student Slides) Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1dqsRhEeZQah0FyZcpa5sctKg-8cuSolTuNM9IgFuZcc/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('57a4958a-6af9-5990-acfa-2c320bcb76ac', '8bfd5ae3-0a2f-5fd1-8bfe-dea483e6ddee', 2, '2. (Coach Slides) Session 2: Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1APDRbyKKPW0rIhMzhyupKeja3NE86IxSUdA8MdRpMBc/edit?usp=drive_link', 'Set B (Student Slides) Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1dqsRhEeZQah0FyZcpa5sctKg-8cuSolTuNM9IgFuZcc/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('1081e73f-1d4e-5f2e-9c61-be0c310c110a', '8bfd5ae3-0a2f-5fd1-8bfe-dea483e6ddee', 3, '3. (Coach Slides) Session 3: Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1tXiv2LIxxuxdpQjZTKtIzQdTAFB8IwMZRloWY9DUcIM/edit?usp=drive_link', 'Set B (Student Slides) Describing Strengths in a Job Interview', 'https://docs.google.com/presentation/d/1dqsRhEeZQah0FyZcpa5sctKg-8cuSolTuNM9IgFuZcc/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('75482f5a-d277-5e7d-ab08-11ff42009b38', '37b7fc7b-8269-5a46-97a2-1d4d2caad7eb', 1, '1. (Coach Slides) Session 1: Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/12eOs5x_N016lKBToZTd6d2chLzerpoaz4yb4p9EH6mA/edit?usp=drive_link', 'Set C (Student Slides) Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/1tJeYOD_oLFM9llNA-ORIEAVQryVIHWrz0i0ouP99EeE/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a7b10e01-4a21-5eda-9237-6ded29b0d586', '37b7fc7b-8269-5a46-97a2-1d4d2caad7eb', 2, '2. (Coach Slides) Session 2: Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/1IQikgEeRol__JTkfwz1hApqIUUW_QNUAWYNxXQJM-Mo/edit?usp=drive_link', 'Set C (Student Slides) Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/1tJeYOD_oLFM9llNA-ORIEAVQryVIHWrz0i0ouP99EeE/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a648dbb3-42a0-5a5a-9e8c-0a354a846fa6', '37b7fc7b-8269-5a46-97a2-1d4d2caad7eb', 3, '3. (Coach Slides) Session 3: Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/1MBWUrFxNRw3_vIAB8Ex8a5BXUAAMz_4JMHv4MLcNJRI/edit?usp=drive_link', 'Set C (Student Slides) Describing Weaknesses in a Job Interview', 'https://docs.google.com/presentation/d/1tJeYOD_oLFM9llNA-ORIEAVQryVIHWrz0i0ouP99EeE/edit?usp=sharing', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('41baf241-1484-5f93-b75b-e13735f6139c', '53cb5b38-7c77-5495-af4a-82a4394aa4a8', 1, 'Session 1 (Coach Slides): Conversation Over Lunch', 'https://docs.google.com/presentation/d/1VPgysTopByDZR0ZIR9jTfUurprIjR_WFZreUP6RL4bs/edit?usp=drive_link', 'Student Slides: 1 Conversation Over Lunch', 'https://docs.google.com/presentation/d/1tA85-tp_ikL9_VebTdU8TK3wrjjHMznzGleWhYZS-ik/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('7fcc1896-1a43-5395-b8de-e388faca3854', '53cb5b38-7c77-5495-af4a-82a4394aa4a8', 2, 'Session 2 (Coach Slides): Conversation Over Lunch', 'https://docs.google.com/presentation/d/10I3ivXU7SEsdjylffY9ZXBqM7uvhIkAr1l6gj4fEvJE/edit?usp=drive_link', 'Student Slides: 1 Conversation Over Lunch', 'https://docs.google.com/presentation/d/1tA85-tp_ikL9_VebTdU8TK3wrjjHMznzGleWhYZS-ik/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6d4c5859-f522-5873-b87d-314054a65509', '53cb5b38-7c77-5495-af4a-82a4394aa4a8', 3, 'Session 3 (Coach Slides): Conversation Over Lunch', 'https://docs.google.com/presentation/d/1wReDJNKb_5sApMiq5JXGK_vD_85fta_nIMYQosjtYLc/edit?usp=drive_link', 'Student Slides: 1 Conversation Over Lunch', 'https://docs.google.com/presentation/d/1tA85-tp_ikL9_VebTdU8TK3wrjjHMznzGleWhYZS-ik/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('00bb8d6b-fbc6-52ea-a444-7086451e0b1c', '53cb5b38-7c77-5495-af4a-82a4394aa4a8', 4, 'Session 4 (Coach Slides): Conversation Over Lunch', 'https://docs.google.com/presentation/d/1Csrfr6sLQtlGE2paPHMjUgdorp-OqaHwWkqw3rLz1HY/edit?usp=drive_link', 'Student Slides: 1 Conversation Over Lunch', 'https://docs.google.com/presentation/d/1tA85-tp_ikL9_VebTdU8TK3wrjjHMznzGleWhYZS-ik/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('f0a6cad8-d991-5ddf-a920-cc8a48e78255', '2a52c504-f93e-55c2-97a5-d86f4a10d38b', 1, '(Coach Slides) Session 1: Company Dinner', 'https://docs.google.com/presentation/d/1Mkirjmm6F4GBrzMWngEFsm44lAwfirVsfcZsXDPE3KE/edit?usp=drive_link', '(Student Slides) Company Dinner', 'https://docs.google.com/presentation/d/1WcFLHUI27nKexHEl1uIr8DGxfJAG0c_BbGBBAIcGDN4/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('70246fd1-ecf7-593e-bf69-1a55725c6bd8', '2a52c504-f93e-55c2-97a5-d86f4a10d38b', 2, '(Coach Slides) Session 2: Company Dinner', 'https://docs.google.com/presentation/d/182auihf8-7bMAHIaRBnsEJzbm05qDeOLRWLI2Js1ieQ/edit?usp=drive_link', '(Student Slides) Company Dinner', 'https://docs.google.com/presentation/d/1WcFLHUI27nKexHEl1uIr8DGxfJAG0c_BbGBBAIcGDN4/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('17016f96-bff0-5e11-9626-a14a389b86eb', '2a52c504-f93e-55c2-97a5-d86f4a10d38b', 3, '(Coach Slides) Session 3: Company Dinner', 'https://docs.google.com/presentation/d/1DQCr0zYO1CKcYmEMRdZiA23uzt-4gMQe7u7yNGJ_aVg/edit?usp=drive_link', '(Student Slides) Company Dinner', 'https://docs.google.com/presentation/d/1WcFLHUI27nKexHEl1uIr8DGxfJAG0c_BbGBBAIcGDN4/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('50be54e0-5961-53e7-ac75-f14e843edc03', '2a52c504-f93e-55c2-97a5-d86f4a10d38b', 4, '(Coach Slides) Session 4: Company Dinner', 'https://docs.google.com/presentation/d/1F4rtAy_5zbczZeEye71IKulNI7BaELxLOHLTWgCgiA4/edit?usp=drive_link', '(Student Slides) Company Dinner', 'https://docs.google.com/presentation/d/1WcFLHUI27nKexHEl1uIr8DGxfJAG0c_BbGBBAIcGDN4/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('66db2c6c-76b1-5daf-9340-43ed0ba7840e', '4a82da12-dded-5b9c-9e66-c400015defc0', 1, '1. Giving Constructive Feedback', 'https://docs.google.com/presentation/d/1wfmbuz36rjLWegZmItKkojzA1F55-7PyGjdhk2gdDHM/edit?usp=drive_link', '(Student slides)  Sessions 1-4:  Constructive Feedback', 'https://docs.google.com/presentation/d/1U5VGWkKTxQgoheu-UG-e27z_1gz4gnYGY9dZhWGlp7o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5d03ed08-74c1-504f-b810-607c593fc43a', '4a82da12-dded-5b9c-9e66-c400015defc0', 2, '2. Giving Constructive Feedback', 'https://docs.google.com/presentation/d/14N8HGOHBOBzDmKYayBfErlIIeyPxYuJz2oNIv9pylCg/edit?usp=drive_link', '(Student slides)  Sessions 1-4:  Constructive Feedback', 'https://docs.google.com/presentation/d/1U5VGWkKTxQgoheu-UG-e27z_1gz4gnYGY9dZhWGlp7o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('df704a51-d378-5153-b1e7-46571108f508', '4a82da12-dded-5b9c-9e66-c400015defc0', 3, '3. Giving Constructive Feedback', 'https://docs.google.com/presentation/d/1o5p4zXLWjBNnbOGcqYOneZCdLhgCSKy-y8QVscA5xBs/edit?usp=drive_link', '(Student slides)  Sessions 1-4:  Constructive Feedback', 'https://docs.google.com/presentation/d/1U5VGWkKTxQgoheu-UG-e27z_1gz4gnYGY9dZhWGlp7o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('e26a9e9a-f10d-5454-9d4e-33285f1f8fac', '4a82da12-dded-5b9c-9e66-c400015defc0', 4, '4. Giving Constructive Feedback', 'https://docs.google.com/presentation/d/1dCc_IeFFhssD5HzSfi7utLo2lch0cxsxfOSEuA5Tt4k/edit?usp=drive_link', '(Student slides)  Sessions 1-4:  Constructive Feedback', 'https://docs.google.com/presentation/d/1U5VGWkKTxQgoheu-UG-e27z_1gz4gnYGY9dZhWGlp7o/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('0e303490-d3fe-5382-ad62-00c3b4a9d6dc', '86ffa91f-a17a-548b-be7e-169f97d9e346', 1, 'Session 1 (Coach slides): Negotiation Language', 'https://docs.google.com/presentation/d/1EkRCO8ysPYPfeMoZQshxW01EF3LRdTO7Ny8gHJmYleY/edit?usp=drive_link', '(Student slides) Negotiation Language', 'https://docs.google.com/presentation/d/1a47t8D48BUZrPQxzb5U0GJPaeU8jM3eyzNyeuAKs_0w/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6056b30e-f5a6-5ae9-8e3d-9915c325ad1c', '86ffa91f-a17a-548b-be7e-169f97d9e346', 2, 'Session 2 (Coach slides): Negotiation Language', 'https://docs.google.com/presentation/d/1l8qycnZ9ceex3FEvOT1-Fl_mDsuIOOP_yZSTmwA62B0/edit?usp=drive_link', '(Student slides) Negotiation Language', 'https://docs.google.com/presentation/d/1a47t8D48BUZrPQxzb5U0GJPaeU8jM3eyzNyeuAKs_0w/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5c59d69c-4ba7-54d2-936e-0d030c8c46f5', '86ffa91f-a17a-548b-be7e-169f97d9e346', 3, 'Session 3 (Coach slides): Negotiation Language', 'https://docs.google.com/presentation/d/1Ni6GmCNn5orJOur1Cw4kLDTeU21B1Keu_aHu287BGmg/edit?usp=drive_link', '(Student slides) Negotiation Language', 'https://docs.google.com/presentation/d/1a47t8D48BUZrPQxzb5U0GJPaeU8jM3eyzNyeuAKs_0w/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('bde78e48-2f47-56b2-935a-de5b35c16bfb', '86ffa91f-a17a-548b-be7e-169f97d9e346', 4, 'Session 4 (Coach slides): Negotiation Language', 'https://docs.google.com/presentation/d/1xqUFKf3BbnfoWGMSnSUAjPuhTNKA4B-DEU-CMZk-vVA/edit?usp=drive_link', '(Student slides) Negotiation Language', 'https://docs.google.com/presentation/d/1a47t8D48BUZrPQxzb5U0GJPaeU8jM3eyzNyeuAKs_0w/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('b39fab66-9019-5119-8b35-8e930cae1a55', '4bd3d102-cc7c-5763-881b-5b42412a5058', 1, '(Coach Slides) Session 1: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1Q4AqaXsx5pJcTiBqcLdaVFGA3HrRZIVvhxJi4n7fOW8/edit?usp=share_link', '(Student slides) Session 1: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1suub3ovLWPUl9BlD_PbNrE1gOKYKnbNJBaC_Cw2_gDw/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('32a88b6a-bb7b-594d-862f-8b48547c7b2b', '4bd3d102-cc7c-5763-881b-5b42412a5058', 2, '(Coach slides) Session 2: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1wYoUqVdwTqgIKlMyx_cq6WfKzjqMxi2SOMXVOCIU3xw/edit?usp=share_link', '(Student slides) Session 2: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/13jotk5zpZnGkl0AON3P-iGvPjdtvLE7_IENwggTlp58/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('f147d2b5-26dc-596d-b6b9-dad93cc706a1', '4bd3d102-cc7c-5763-881b-5b42412a5058', 3, '(Coach Slides) Session 3: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1AHhy8lnhQ0AIHLxzaNVzsWTYurBLG7EbDQEN_abPtl0/edit?usp=share_link', '(Student Slides) Session 3: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1uIcvh1wRDLPB8B025LFuJxj6ofTPLDixUo0448xEEj0/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('c049e27e-bb3f-5e2b-aac7-0c755f223882', '4bd3d102-cc7c-5763-881b-5b42412a5058', 4, '(Coach slides) Session 4: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1-xoYNSjfyS39T9rVAqpgEvI5H_U--6djU92-ayRvaAM/edit?usp=share_link', '(Student slides) Session 4: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1CO6nPPU82KmBzLOyWnp_4-D0IeFUjKzfcNtiku6gFt4/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('41ffb176-dac0-586f-bf55-c69ad92a41f3', '4bd3d102-cc7c-5763-881b-5b42412a5058', 5, '(Coach slides) Session 5: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1C0D4gojVEpbluLYIwy5-JXSD7oBQGGVnZHxg53gnx7o/edit?usp=share_link', '(Student slides) Session 5: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1tw5Y2wX9Mfpr8N-eICKDJTRkDmXfRnksNgZCNasLtu0/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('28804f85-c861-53c2-b12b-c990ebe76f9c', '4bd3d102-cc7c-5763-881b-5b42412a5058', 6, '(Coach slides) Session 6: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1AYihG1yv1FObmnTUCOaYCeH-aeJTptnjqE_rLtMDVLc/edit?usp=share_link', '(Student slides) Session 6: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1kebWuXP-cLvGG7C2jkoYEXxA3ebn_H3Cd62BFRZ_ksI/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('cd762153-50a9-5d64-ab71-f80e3db9f609', '4bd3d102-cc7c-5763-881b-5b42412a5058', 7, '(Coach slides) Session 7: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1QW1wON4tp24TpzdN2g8ybAX1rGkMoX83LXgYkorAc6I/edit?usp=share_link', '(Student slides) Session 7: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1KsqGnCSHavpe8vVOidNHGWOIHlzOIOiwEPmbP-r-_E0/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('3fb92907-a891-5ae6-8963-e8996e4ccad0', '4bd3d102-cc7c-5763-881b-5b42412a5058', 8, '(Coach slides) Session 8: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1mkPkxGVIawEUNWLf5Q5bjkoWhyx411vi8pROJzhEp0M/edit?usp=share_link', '(Student slides) Session 8: Asking for and receiving direct feedback', 'https://docs.google.com/presentation/d/1lE8lkj__e8ZSbkJGa28MM7VanqT8E9tZ7HuMT00hIvo/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('3ba5ff01-93f5-514e-9d31-5015f2193070', 'f91d3238-639e-5a24-b6fc-630321058118', 1, '(Coach Slides) Session 1: Different uses of "sorry"', 'https://docs.google.com/presentation/d/1jkwHrXASZydVBJxwOPvX6kLJYvl2UqHVoaJokDlxCCU/edit?usp=drive_link', '(Student Slides) Different uses of "sorry"', 'https://docs.google.com/presentation/d/1lPO7eTVsdQU3AVUsEJVLzkIbdZgD-E2AMHrtZe3n-d8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('e585411a-47ba-5ad2-97fe-87b4672735dc', 'f91d3238-639e-5a24-b6fc-630321058118', 2, '(Coach Slides) Session 2: Different uses of "sorry"', 'https://docs.google.com/presentation/d/1EvIWIAeVc-IEX_RriqiMmsSmYXj48YDJEXeIehgKwzQ/edit?usp=drive_link', '(Student Slides) Different uses of "sorry"', 'https://docs.google.com/presentation/d/1lPO7eTVsdQU3AVUsEJVLzkIbdZgD-E2AMHrtZe3n-d8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('c84968f8-b180-5cf0-a6f6-df516e86f78b', 'f91d3238-639e-5a24-b6fc-630321058118', 3, '(Coach Slides) Session 3: Different uses of "sorry"', 'https://docs.google.com/presentation/d/1lH1J3TwYeuFYfRC-zjsacssxBz6yBD-Ig14crvujYRk/edit?usp=drive_link', '(Student Slides) Different uses of "sorry"', 'https://docs.google.com/presentation/d/1lPO7eTVsdQU3AVUsEJVLzkIbdZgD-E2AMHrtZe3n-d8/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6d43149b-fd72-5a52-9099-36ed62a098cd', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 1, '(Coach Slides) Session 1: Delivering Bad News', 'https://docs.google.com/presentation/d/1IoiEBUDIW0b6afF2ihEMgFZgWTwbHt4WryNrVWL69OY/edit?usp=drive_link', '(Student Slides) Session 1: Delivering Bad News', 'https://docs.google.com/presentation/d/1jlEXmorWuHkumAC2xqSI7QOlswM7f71a44pcja52lRI/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6e62c314-9de2-54e4-8ff1-0c95302eb441', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 2, '(Coach Slides) Session 2: Delivering Bad News', 'https://docs.google.com/presentation/d/1OjXNOY4QK5_H6msSVF6EMMhYhbP6DRDDV9yVrI9RMoI/edit?usp=drive_link', '(Student Slides) Session 2: Delivering Bad News', 'https://docs.google.com/presentation/d/1kksLKEwl59s3MRpWIf8l6WI-maa_Wsf46r2HCmPspFc/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('5bfcb08d-27c5-527c-bf7e-ae96ec230744', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 3, '(Coach Slides) Session 3: Delivering Bad News', 'https://docs.google.com/presentation/d/1IHMd0OfkFZxUBdwDc269k3xM4PxM7M8j8_pR7ettv5s/edit?usp=drive_link', '(Student Slides) Session 3: Delivering Bad News', 'https://docs.google.com/presentation/d/1U4-H5an_T1ws_zoSgvC7sHUiN-IpxfDecvXuM4LRtGQ/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('3922aba7-fc6e-5d6d-b66a-b98e58d65ded', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 4, '(Coach Slides) Session 4: Delivering Bad News', 'https://docs.google.com/presentation/d/1A6Bve9Pfd1snBvY17PZ2m9ViOInzOnVQJ9iuIHxBz9Y/edit?usp=drive_link', '(Student Slides) Session 4: Delivering Bad News', 'https://docs.google.com/presentation/d/1-id0Tlq8VQcVEVKU-vUqwwsm5xDY18Zr0Qqe5kDMAJk/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('c00a2564-954a-5bed-a9ae-6bd31c2982f6', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 5, '(Coach Slides) Session 5: Delivering Bad News', 'https://docs.google.com/presentation/d/1UXa1ycuMJrxBB5_xNhj_GK6gX9aaxMT3XTKvPsnZKIM/edit?usp=drive_link', '(Student Slides) Session 5: Delivering Bad News', 'https://docs.google.com/presentation/d/1oV1-xbXxYuSxRY9c4s4bMvuSXZJzsVD9hy0ICtjmqKs/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('19128c31-ba32-5f20-b657-a7c14b9b3805', '1f9a77c2-4d7c-5a22-abff-3f74ff3f7b75', 6, '(Coach Slides) Session 6: Delivering Bad News', 'https://docs.google.com/presentation/d/10UDDUL5rtK5UL9I1PPQZPBY4mMZTTQl6N2KdqMV7_Kc/edit?usp=drive_link', '(Student Slides) Session 6: Delivering Bad News', 'https://docs.google.com/presentation/d/1yd74j4wO06feT1hvYeXF7OA4PFE0U_XVvW3FL9nMb-Y/edit?usp=drive_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('a34e7559-a8a6-55b0-8574-c2d155752755', '442437e5-eeb4-588d-a166-9b8609bc35ad', 1, '(Coach Slides) Session 1: Describing graphs and charts', 'https://docs.google.com/presentation/d/1hJ0Jl6hmDNsUfoqv7EsHvWOFhqczBt__oyozjVrWPhI/edit?usp=share_link', '(Student Slides) Session 1: Describing graphs and charts', 'https://docs.google.com/presentation/d/1QMwEhoKmpUm5kEnGgDFAK2pjQ1eoi5VJquTbpC39DGA/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('6bc5f6b7-0bb3-52cb-88f9-d010f8b14de7', '442437e5-eeb4-588d-a166-9b8609bc35ad', 2, '(Coach slides) Session 2: Describing graphs and charts', 'https://docs.google.com/presentation/d/139eaeiId-jB1caBRYQtmIjtPvOZqqaDoMhzvz6zF6uM/edit?usp=share_link', '(Student slides) Session 2: Describing graphs and charts', 'https://docs.google.com/presentation/d/1xIF8Mz5Pq2gfuLdg5o64GvWDPq_Uvp0WdGd5dp6lVSY/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('2f8d638a-a404-5e37-9a42-85d99f8ed7c3', '442437e5-eeb4-588d-a166-9b8609bc35ad', 3, '(Coach slides) Session 3: Describing graphs and charts', 'https://docs.google.com/presentation/d/1vlzlJLO4P6ZsAWwdMxWjrtzPFve1o7r6R4VWAsEhQ7I/edit?usp=share_link', '(Student slides) Session 3: Describing graphs and charts', 'https://docs.google.com/presentation/d/1WEpQXk8lx-KXD3y_m7bcspWjsOmxeQfGDqPeaene8mk/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES ('10b92d05-2aad-5de1-8983-842e7d2805b0', '442437e5-eeb4-588d-a166-9b8609bc35ad', 4, '(Coach slides) Session 4: Describing graphs and charts', 'https://docs.google.com/presentation/d/1LP_kU_E6_vT8SxiYI2dkaSiDSl1kEwMPhAtKOZV31Vc/edit?usp=share_link', '(Student slides) Session 4: Describing graphs and charts', 'https://docs.google.com/presentation/d/1xLvJ4V5ojX5d_JTm_a472KNl-nXCSa6GGDdldGJuwo0/edit?usp=share_link', '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, delete_flg = EXCLUDED.delete_flg, update_date = NOW();

-- 3. コーパス(Corpus)ダイアログ教材セット (COM_M_TAILOR_MADE -> com_m_contents, テナント: システムテナント)
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('efa8c2cf-1918-5246-a51e-98c5e0ef5429', 'Quarterly Store Performance Review', NULL, 3, 1, 4, 1, 'システムテナント', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('f5a548a0-1fe7-571b-821b-184f5c01f1bf', 'Set B: Explaining Competitive Advantages', NULL, 3, 1, 4, 2, 'システムテナント', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_contents (content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES ('628736d3-3ff9-5204-9b65-ead1a9c9e773', 'Set C: Proposing a Strategic Initiatives', NULL, 3, 1, 4, 3, 'システムテナント', '0')
ON CONFLICT (content_id) DO UPDATE SET content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, delete_flg = EXCLUDED.delete_flg, update_date = NOW();

-- 4. コーパスダイアログ セット -> システムテナントへのアクセス権付与 (com_m_contents_access)
INSERT INTO public.com_m_contents_access (client_id, content_id, notes) VALUES ('276a456c-a7e5-4987-be15-c94be9ae89a5', 'efa8c2cf-1918-5246-a51e-98c5e0ef5429', '旧COM_M_TAILOR_MADEからの移行分')
ON CONFLICT (client_id, content_id) DO NOTHING;
INSERT INTO public.com_m_contents_access (client_id, content_id, notes) VALUES ('276a456c-a7e5-4987-be15-c94be9ae89a5', 'f5a548a0-1fe7-571b-821b-184f5c01f1bf', '旧COM_M_TAILOR_MADEからの移行分')
ON CONFLICT (client_id, content_id) DO NOTHING;
INSERT INTO public.com_m_contents_access (client_id, content_id, notes) VALUES ('276a456c-a7e5-4987-be15-c94be9ae89a5', '628736d3-3ff9-5204-9b65-ead1a9c9e773', '旧COM_M_TAILOR_MADEからの移行分')
ON CONFLICT (client_id, content_id) DO NOTHING;

-- 5. コーパスダイアログ セッション明細 (COM_M_TAILOR_MADE_DETAIL -> com_m_dialogue_session)
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('c3699490-ac39-5723-900e-a4ad5e246ffa', 'efa8c2cf-1918-5246-a51e-98c5e0ef5429', 1, 'Session 1: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/18WG2LwpwLLgItUKjTikkVCaA1QTE8E8FwBbopawDZjw/edit?usp=drive_link', 'Session 1: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/18WG2LwpwLLgItUKjTikkVCaA1QTE8E8FwBbopawDZjw/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('bbed1779-f798-5fa9-8aaf-625576d53128', 'efa8c2cf-1918-5246-a51e-98c5e0ef5429', 2, 'Session 2: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1EtL9J-I56UjrV48MFAzBKM8_FVG75wAvRrWcx5eTbPI/edit?usp=drive_link', 'Session 2: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1EtL9J-I56UjrV48MFAzBKM8_FVG75wAvRrWcx5eTbPI/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('c1322ef2-5227-567f-906e-fca806a7f073', 'efa8c2cf-1918-5246-a51e-98c5e0ef5429', 3, 'Session 3: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1mSmpTnXHqm3O3xrVQqHppV2sN8ANO2juhLm9QTk_HZE/edit?usp=drive_link', 'Session 3: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1mSmpTnXHqm3O3xrVQqHppV2sN8ANO2juhLm9QTk_HZE/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('4417b5fe-6757-53e9-b276-9c6c02eb5520', 'efa8c2cf-1918-5246-a51e-98c5e0ef5429', 4, 'Session 4: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1XxvoeD5CGo9543ZFrHGFmNsxlo2vwurIDcS1pAT0d4k/edit?usp=drive_link', 'Session 4: Quarterly Store Performance Review', 'https://docs.google.com/presentation/d/1XxvoeD5CGo9543ZFrHGFmNsxlo2vwurIDcS1pAT0d4k/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('c07aa02a-8500-5d50-a80a-66f709dce5d4', 'f5a548a0-1fe7-571b-821b-184f5c01f1bf', 1, 'Session 1: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1N53QUEXvMaZx1wDXE8eiBZuElsoFdenyLpymUfdb94s/edit?usp=drive_link', 'Session 1: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1N53QUEXvMaZx1wDXE8eiBZuElsoFdenyLpymUfdb94s/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('faa876d4-4b8e-5fcc-b25c-0f73ca0c24a0', 'f5a548a0-1fe7-571b-821b-184f5c01f1bf', 2, 'Session 2: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1HKRAW1hbTdW_6yo6zJRyXq-RpwcHOs42im1_SrqaB04/edit?usp=drive_link', 'Session 2: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1HKRAW1hbTdW_6yo6zJRyXq-RpwcHOs42im1_SrqaB04/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('525a5e67-48a0-5ba6-aa8d-6e599743bd12', 'f5a548a0-1fe7-571b-821b-184f5c01f1bf', 3, 'Session 3: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/10e2Qh_RJ58OOHXeimwRwj52MhQZabx2c-Sg6go4eEfs/edit?usp=drive_link', 'Session 3: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/10e2Qh_RJ58OOHXeimwRwj52MhQZabx2c-Sg6go4eEfs/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('8305b199-f3a8-5c07-a3f3-9f3a0b1e2745', 'f5a548a0-1fe7-571b-821b-184f5c01f1bf', 4, 'Session 4: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1D-yeesY8monyONxdRUd8zh6wjcoodW4GPaGj8Wc4eNk/edit?usp=drive_link', 'Session 4: Explaining Competitive Advantages', 'https://docs.google.com/presentation/d/1D-yeesY8monyONxdRUd8zh6wjcoodW4GPaGj8Wc4eNk/edit?usp=drive_link', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('c7ea4ea2-52ea-5024-9ea6-e85f3bdb91f4', '628736d3-3ff9-5204-9b65-ead1a9c9e773', 1, 'Session 1：Introduction', 'https://docs.google.com/presentation/d/12jHXOK2rSqkGEH9jxZyFoniW3r-VRVcn-sM5mqnqd38/edit', 'Session 1：Introduction', 'https://docs.google.com/presentation/d/12jHXOK2rSqkGEH9jxZyFoniW3r-VRVcn-sM5mqnqd38/edit', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('3dcb0c8c-03c8-571d-a94a-d1aa58a10fa2', '628736d3-3ff9-5204-9b65-ead1a9c9e773', 2, 'Session 2：Addressing concerns and engaging stakeholders', 'https://docs.google.com/presentation/d/1wPfRU9pk_HjlxLyB_snO1NlgHXJ5XIXY4NthzEXzvoM/edit', 'Session 2：Addressing concerns and engaging stakeholders', 'https://docs.google.com/presentation/d/1wPfRU9pk_HjlxLyB_snO1NlgHXJ5XIXY4NthzEXzvoM/edit', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('1cda7799-e940-51a5-81bc-4663d7875e9c', '628736d3-3ff9-5204-9b65-ead1a9c9e773', 3, 'Session 3：Explaining Pilot Results', 'https://docs.google.com/presentation/d/15yNT4uFHwH2IvNZU6p-HjJYZMwEg2G0-QbNdzMuS9O0/edit', 'Session 3：Explaining Pilot Results', 'https://docs.google.com/presentation/d/15yNT4uFHwH2IvNZU6p-HjJYZMwEg2G0-QbNdzMuS9O0/edit', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();
INSERT INTO public.com_m_dialogue_session (dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES ('099e5d99-15f8-5baf-a7df-f1caf424b999', '628736d3-3ff9-5204-9b65-ead1a9c9e773', 4, 'Session 4：Presenting a strategic recommendation', 'https://docs.google.com/presentation/d/1QgCa-2j0G4jpeFvNFMehc8ZdQvlwckGyqqUSXwdW63I/edit', 'Session 4：Presenting a strategic recommendation', 'https://docs.google.com/presentation/d/1QgCa-2j0G4jpeFvNFMehc8ZdQvlwckGyqqUSXwdW63I/edit', NULL, '0')
ON CONFLICT (dialogue_session_id) DO UPDATE SET coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();

COMMIT;

-- =========================================================================
-- 【追加セクション】セッションハブ/結果画面へのダイアログプラクティス組み込み
-- 追加日: 2026-09-21
--
-- 【内容】
--   セッションハブ（コーチ）にダイアログプラクティスの割当・進捗操作パネルを追加し、
--   セッション結果画面にはそのセッション中に開いた教材の履歴（Dialog Practice History）を
--   追加する。Google Slidesを別タブで開く方式のため「完了したか」はアプリ側から検知できず、
--   セッションハブでコーチがスライドリンクをクリックした時点の「オープンの事実」のみを
--   com_t_session_dialogue_logに記録する（重複・誤クリックも含めそのまま記録し、上書き・
--   重複排除はしない）。
--
--   1. com_t_session_dialogue_log を新規作成
--      - session_id・assignment_id・dialogue_session_idを保持する追記専用の履歴テーブル。
--
-- 対応ファイル: DDL/table/com_t_session_dialogue_log.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_t_session_dialogue_log の新規作成
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_t_session_dialogue_log (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
  dialogue_session_id uuid NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id),
  opened_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_session_dialogue_log IS 'ライブセッション中にコーチがダイアログプラクティス教材のスライドリンクを開いた履歴（オープンの事実のみを記録。完了の意味は持たない）';
COMMENT ON COLUMN public.com_t_session_dialogue_log.log_id IS 'ログID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.session_id IS '対象のライブセッションID (com_t_session.session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.assignment_id IS '対象の割当ID (com_t_dialogue_assignment.assignment_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.dialogue_session_id IS '開かれたセッション明細ID (com_m_dialogue_session.dialogue_session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.opened_by_coach_id IS 'リンクを開いたコーチのユーザーID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.insert_date IS 'オープン日時（=登録日時。更新は行わないためupdate_dateは持たない）';

CREATE INDEX IF NOT EXISTS idx_session_dialogue_log_session
  ON public.com_t_session_dialogue_log (session_id, insert_date);

ALTER TABLE public.com_t_session_dialogue_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage session dialogue logs they created" ON public.com_t_session_dialogue_log;
DROP POLICY IF EXISTS "Students can view their own session dialogue logs" ON public.com_t_session_dialogue_log;

CREATE POLICY "Coaches can manage session dialogue logs they created" ON public.com_t_session_dialogue_log
FOR ALL TO authenticated
USING (
    opened_by_coach_id = auth.uid() OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    opened_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_t_session s
        JOIN public.com_t_dialogue_assignment a ON a.assignment_id = com_t_session_dialogue_log.assignment_id
        WHERE s.session_id = com_t_session_dialogue_log.session_id
          AND s.coach_id = auth.uid()
          AND s.student_id = a.student_id
    )
);

CREATE POLICY "Students can view their own session dialogue logs" ON public.com_t_session_dialogue_log
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.session_id = com_t_session_dialogue_log.session_id
          AND s.student_id = auth.uid()
    )
);

---------------------------------------------
-- 3. 生徒モニタリング画面: 対象生徒判定を private.get_monitor_target_users に一本化
---------------------------------------------
-- 【2026-09-22 抜本改修】当初は各RPCが個別に「対象生徒とは何か」を判定しており、
-- 単語ドリル履歴だけライセンス状態を見ていない・当月/来月の判定にNOW()基準とperiod基準が
-- 混在する等、仕様の一貫性が崩れていた。対象生徒の判定ロジックを private スキーマの
-- 内部共通ヘルパー get_monitor_target_users に一本化し、受講生一覧・単語ドリル履歴・
-- スプリント履歴・スプリントドリル履歴の4つのRPCすべてがこれを利用する構成に変更する。
--
-- 【対象生徒の定義（4RPC共通）】
--   1. 指定クライアントに所属する受講生（user_type に '1' を含む）
--   2. デモユーザーではない
--   3. _include_monitor = FALSE の場合、モニターロールを持たない
--   4. status = 1（有効）のライセンスを持ち、そのライセンス期間が対象期間と重なっている
--      （停止・満了ステータス、または期間が重ならないライセンスは対象外）
-- _start_date/_end_date は4RPCすべてで必須パラメータとし、NOW()基準のフォールバックは廃止。

---------------------------------------------
-- 3-0. get_monitor_target_users（新規: 内部共通ヘルパー）
---------------------------------------------
CREATE OR REPLACE FUNCTION private.get_monitor_target_users(
    _client_id UUID,
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    user_id UUID,
    contract_id UUID,
    license_id UUID,
    license_status SMALLINT,
    license_start_date TIMESTAMPTZ,
    license_end_date TIMESTAMPTZ,
    plan_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT ON (u.id)
      u.id AS user_id,
      l.contract_id,
      l.license_id,
      l.status AS license_status,
      l.start_date AS license_start_date,
      l.end_date AS license_end_date,
      con.plan_name
    FROM public.com_m_user u
    INNER JOIN public.com_t_user_license l
      ON l.user_id = u.id
     AND l.status = 1 -- 💡 有効なライセンスのみを対象とする（停止・満了は日付が重なっていても除外）
     AND l.start_date < (_end_date + 1)::timestamptz -- 対象期間の終了日いっぱいまでを含める
     AND l.end_date >= _start_date::timestamptz
    LEFT JOIN public.com_m_contract con ON con.contract_id = l.contract_id
    WHERE u.client_id = _client_id
      AND u.user_type ~ '1'
      -- 💡 デモユーザーはどんな時でも絶対に含めない
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターロールの切り替えロジック
      AND (
        _include_monitor = TRUE -- ONならモニターロールの人も通過させる
        OR
        NOT EXISTS ( -- OFFならモニターロールの人も弾く（通常表示）
          SELECT 1 FROM public.com_t_user_role r
          WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
    ORDER BY
      u.id,
      -- 対象期間内での重なりが最大のライセンスを代表として採用
      LEAST(l.end_date, (_end_date + 1)::timestamptz) - GREATEST(l.start_date, _start_date::timestamptz) DESC,
      l.end_date DESC;
$$;

-- 🚨 内部ヘルパーのため外部公開しない（SECURITY DEFINER関数の内部からのみ呼び出される）
REVOKE ALL ON FUNCTION private.get_monitor_target_users(UUID, DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 3-1. get_monitor_user_list（対象生徒判定を private.get_monitor_target_users に集約）
---------------------------------------------
-- _start_date/_end_date は必須パラメータとし（省略時のNOW()基準フォールバックは廃止）、
-- 常に「対象期間とライセンス期間が重なっているか」で統一する。呼び出し漏れ・分岐の複雑化を
-- 避けるため、省略した場合はPostgREST層で明確にエラーとなる。
--
-- 【2026-09-22 追加修正】招待中・承認待ちユーザー（com_t_invitation、本登録未完了＝ライセンス
-- 未発行）を対象から除外した。招待は一度も本登録・ライセンス発行されていないため、
-- 「対象期間に有効な生徒」の定義に本質的に当てはまらない。従来は対象期間を無視して常に
-- 結果に含めていたため、招待リンクが失効済み（expires_at < NOW()）で二度と本登録されない
-- 招待までもが、過去・当月・未来のどの対象期間を見ても一覧に出続けてしまっていた。

-- 🚨 シグネチャ変更のため、旧シグネチャを明示的に削除してから再作成する
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN);
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_monitor_user_list(
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF private.vw_user_list
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    -- =============================================================
    -- 対象期間に有効な契約を持っていた本登録済みユーザー
    -- （招待中・承認待ちユーザーは com_t_invitation にのみ存在しライセンス未発行のため、
    --   「対象期間に有効な生徒」には該当しない＝本関数の対象外とする）
    -- =============================================================
    SELECT
      u.id AS id,
      u.user_id AS user_id,
      u.user_name AS user_name,
      u.user_type AS user_type,
      u.client_id AS client_id,
      c.client_name AS client_name,
      au.email AS email,
      au.last_sign_in_at AS last_sign_in_at,
      au.confirmed_at AS confirmed_at,
      r.roles AS roles,
      t.contract_id AS contract_id,
      t.license_id AS license_id,
      t.license_status AS license_status,
      t.license_start_date AS license_start_date,
      t.license_end_date AS license_end_date,
      t.plan_name AS plan_name,
      NULL::timestamptz AS mail_sent_at,
      NULL::text AS last_mail_error,
      CASE
        WHEN t.license_start_date > NOW() THEN 'future'
        WHEN t.license_end_date < NOW() THEN 'expired'
        ELSE 'active'
      END AS license_state,
      u.insert_date AS insert_date
    FROM
      private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
      INNER JOIN public.com_m_user u ON u.id = t.user_id
      INNER JOIN auth.users au ON u.id = au.id
      LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
      LEFT JOIN LATERAL (
        SELECT array_agg(role_id) AS roles
        FROM public.com_t_user_role
        WHERE user_id = u.id
      ) r ON true

    ORDER BY insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) TO authenticated;

---------------------------------------------
-- 3-2. get_monitor_word_history（対象生徒判定を private.get_monitor_target_users に集約）
---------------------------------------------
-- 従来はライセンス状態を一切見ず client_id の一致のみで絞り込んでいたため、対象期間に
-- 有効な契約を持っていない生徒の履歴も表示され得た。他のモニターRPCと同じ
-- 「対象期間に有効な契約を持っていた生徒」の定義に揃える。
CREATE OR REPLACE FUNCTION public.get_monitor_word_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
    )
    SELECT jsonb_build_object(
        'summary_id', w.summary_id,
        'content_id', w.content_id,
        'user_id', w.user_id,
        'training_date', w.training_date,
        'word_count', w.word_count,
        'phrase_count', w.phrase_count,
        'assessment_count', w.assessment_count,
        'update_date', w.update_date,
        'content_name', c.content_name,
        'user_name', u.user_name
    )
    FROM public.self_t_word_summary w
    INNER JOIN target_users tu ON tu.user_id = w.user_id
    INNER JOIN public.com_m_user u ON u.id = w.user_id
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE w.training_date BETWEEN _start_date AND _end_date
      AND (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR w.user_id = ANY(_user_ids))
    ORDER BY w.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

---------------------------------------------
-- 3-3. get_monitor_sprint_history（対象生徒判定を private.get_monitor_target_users に集約）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_history(
    _start_date TIMESTAMP WITH TIME ZONE,
    _end_date TIMESTAMP WITH TIME ZONE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date::date, _end_date::date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'user_id', s.user_id,
        'sprint_type', s.sprint_type,
        'content_id', s.content_id,
        'question_type', s.question_type,
        'answer_type', s.answer_type,
        'difficulty_level', s.difficulty_level,
        'time_limit_sec', s.time_limit_sec,
        'total_answered', s.total_answered,
        'total_assessments', s.total_assessments,
        'insert_date', s.insert_date,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint s
    INNER JOIN target_users tu ON tu.user_id = s.user_id
    INNER JOIN public.com_m_user u ON u.id = s.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = s.content_id
    WHERE s.insert_date BETWEEN _start_date AND _end_date
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) TO authenticated;

---------------------------------------------
-- 3-4. get_monitor_sprint_drill_history（対象生徒判定を private.get_monitor_target_users に集約）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_drill_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'summary_id', d.summary_id,
        'user_id', d.user_id,
        'content_id', d.content_id,
        'training_date', d.training_date,
        'question_count', d.question_count,
        'assessment_count', d.assessment_count,
        'speed_count', d.speed_count,
        'structure_count', d.structure_count,
        'builders_count', d.builders_count,
        'mastery_count', d.mastery_count,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint_summary d
    INNER JOIN target_users tu ON tu.user_id = d.user_id
    INNER JOIN public.com_m_user u ON u.id = d.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = d.content_id
    WHERE d.training_date BETWEEN _start_date AND _end_date
    ORDER BY d.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】契約ユーザーライセンス管理の見直し
-- 追加日: 2026-09-23
--
-- 【内容】
--   「有効なライセンスは生徒に対して1件のみ」というルールを、これまでアプリ側の
--   事前チェック（check-then-insert）のみに頼っていた状態から、DB側の排他制約
--   (EXCLUDE constraint)による最終防衛線を追加して強化する。複数管理者による
--   同時操作等のレースコンディションでも、期間の重なる有効(status=1)ライセンスを
--   二重登録できないことをDBレベルで保証する。
--   契約更新に伴う次タームライセンスの前倒し登録（期間が重ならない複数ライセンスの
--   事前登録）自体は引き続き許容する運用のため、業務フロー・アプリ側の重複判定
--   ロジックへの変更はない（アプリケーションコード側は
--   apps/admin/actions/adminContractAction.ts の updateUserLicense/
--   assignLicenseToUser/bulkAssignLicenses に排他制約違反(23P01)発生時の
--   フレンドリーなエラーメッセージ返却のみ追加）。
--
--   なお、個別の生徒に対するライセンス期限の延長（契約の終了日を超える延長を含む）は
--   既存のライセンス編集機能(updateUserLicense)で元々対応可能だったため、DB変更は
--   不要（アプリ側のみ、編集時に契約期間内チェックを行わないよう修正。詳細は
--   adminContractAction.ts の updateUserLicense 冒頭コメント参照）。
--
-- 対応ファイル: DDL/table/com_t_user_license.sql（末尾の追加パッチ節）
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_t_user_license: 同一ユーザーへの重複した有効ライセンス防止（排他制約）
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 適用前に、既に重複が存在しないかを確認する（通常はアプリ側の検証により存在しないはず）
DO $$
DECLARE
  v_conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.com_t_user_license a
  JOIN public.com_t_user_license b
    ON a.user_id = b.user_id
   AND a.license_id < b.license_id
   AND a.status = 1 AND b.status = 1
   AND tstzrange(a.start_date, a.end_date, '[]') && tstzrange(b.start_date, b.end_date, '[]');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION '期間が重なる有効ライセンスが%組見つかりました。制約追加前に解消してください。', v_conflict_count;
  END IF;
END $$;

ALTER TABLE public.com_t_user_license
  DROP CONSTRAINT IF EXISTS excl_user_license_active_overlap;

ALTER TABLE public.com_t_user_license
  ADD CONSTRAINT excl_user_license_active_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status = 1);

COMMENT ON CONSTRAINT excl_user_license_active_overlap ON public.com_t_user_license IS
  '同一ユーザーに対し、期間が重なる有効(status=1)ライセンスを同時に複数登録できないようにするDB側の最終防衛線（アプリ側のfindOverlappingLicenseと二重の防御。無効化済み(status=0)は対象外）';

COMMIT;

-- =========================================================================
-- 【追加セクション】ライブセッション管理: 定期スケジュール枠のtarget_sessions個別調整
-- 追加日: 2026-09-23
--
-- 【内容】
--   com_m_lesson_schedule.target_sessions（コマ別セッション目標数）は承認時に確定後
--   不変という前提だったが、admin_adjust_schedule_target_sessions()を新設し、
--   正当な理由がある追加予約を、契約全体のtotal_sessionsを変更せずに特定の1枠のみ
--   個別に引き上げられるようにする（あくまで契約上の想定を超える例外措置。DB側の
--   履歴テーブルは追加せず、直近のライセンス個別延長の前例を踏襲する）。
--
-- 対応ファイル: DDL/function/admin_adjust_schedule_target_sessions.sql（新規）,
--   DDL/table/com_m_lesson_schedule.sql（target_sessionsのCOMMENT更新）
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_lesson_schedule.target_sessions: 不変前提のコメントを更新
---------------------------------------------
COMMENT ON COLUMN public.com_m_lesson_schedule.target_sessions IS 'このコマ(slot_no)が契約上持つべき目標セッション数。承認時にtotal_sessions/weekly_frequencyの均等割り(余りはslot_no昇順に配分)で確定し、以後は不変。fn_generate_sessions_for_schedule()の生成上限、fn_schedule_shortfall()の期待値として使う唯一の真実源。正当な理由がある追加予約の例外措置として、admin_adjust_schedule_target_sessions()経由でtotal_sessionsを変更せずに個別枠のみ引き上げ可能（詳細は同関数のコメント参照）。';

---------------------------------------------
-- 2. admin_adjust_schedule_target_sessions: アドミンによるtarget_sessions個別引き上げRPC
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_schedule_target_sessions(
    p_schedule_id uuid,
    p_new_target_sessions smallint,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to adjust target sessions');

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason is required';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'cannot adjust target_sessions on a non-active schedule slot';
    END IF;

    IF p_new_target_sessions <= v_schedule.target_sessions THEN
        RAISE EXCEPTION 'new target_sessions (%) must be greater than current (%)', p_new_target_sessions, v_schedule.target_sessions;
    END IF;

    UPDATE public.com_m_lesson_schedule
    SET target_sessions = p_new_target_sessions,
        update_date = NOW()
    WHERE schedule_id = p_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_schedule_target_sessions(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_schedule_target_sessions(uuid, smallint, text) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】教材管理: ダイアログプラクティスの公開範囲とセット分類の分離
-- 追加日: 2026-09-24
--
-- 【内容】
--   com_m_contents.category_id（セット分類）と content_scope（公開範囲）を一意に対応させて
--   いた chk_com_m_contents_category_scope 制約を削除し、公開範囲をセット分類とは独立して
--   設定できるようにする（例: Beginnerセットを限定公開、Corpusセットを共通公開、
--   作成途中のセットを非公開にする等）。
--
-- 対応ファイル: DDL/table/com_m_contents.sql（ダイアログプラクティス対応パッチ節）
-- =========================================================================

BEGIN;

ALTER TABLE public.com_m_contents
  DROP CONSTRAINT IF EXISTS chk_com_m_contents_category_scope;

COMMIT;
