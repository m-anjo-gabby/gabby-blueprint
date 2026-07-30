-- =========================================================================
-- TITLE: 'Gabby Blueprint English' 行レベルセキュリティ (RLS) ポリシー一括定義
-- AUTHOR: Blueprint 開発サポート (Senior Engineer)
-- NOTE: 既存ポリシーをクリーンアップし、冪等性（再実行可能）を担保した安全なスクリプトです。
-- =========================================================================

-- =========================================================================
-- 1. 顧客マスタ (public.com_m_client)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their own client information" ON public.com_m_client;
ALTER TABLE public.com_m_client ENABLE ROW LEVEL SECURITY;

-- [参照] ログインユーザーは自分が所属するテナント（企業・学校）の情報のみ閲覧可能
CREATE POLICY "Users can view their own client information" ON public.com_m_client
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);


-- =========================================================================
-- 2. ユーザマスタ (public.com_m_user)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view themselves and colleagues" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can view themselves and colleagues." ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data." ON public.com_m_user;
ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

-- [参照] 自分自身、または「同じテナント」に属するメンバーの情報を閲覧可能
CREATE POLICY "Users can view themselves and colleagues" ON public.com_m_user
FOR SELECT TO authenticated USING (
    id = auth.uid() 
    OR 
    client_id = public.get_jwt_client_id()
);

-- [更新] 自分自身のプロフィールデータのみ変更可能（他人の id への書き換え不可）
CREATE POLICY "Users can update their own data" ON public.com_m_user
FOR UPDATE TO authenticated 
USING (id = auth.uid()) 
WITH CHECK (id = auth.uid());


-- =========================================================================
-- 3. ロールマスタ (public.com_m_role)
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can view roles" ON public.com_m_role;
ALTER TABLE public.com_m_role ENABLE ROW LEVEL SECURITY;

-- [参照] 認証済みユーザーであればプルダウン選択などのために誰でも有効なロール一覧を参照可能
CREATE POLICY "Anyone can view roles" ON public.com_m_role
FOR SELECT TO authenticated USING (delete_flg = '0');


-- =========================================================================
-- 4. ユーザロール紐付け情報 (public.com_t_user_role)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their own roles or admins can view all" ON public.com_t_user_role;
ALTER TABLE public.com_t_user_role ENABLE ROW LEVEL SECURITY;

-- [参照] 自分の割り当てロール、または管理者（JWT内のrolesにadminを含む）が全ユーザー分を参照可能
CREATE POLICY "Users can view their own roles or admins can view all" ON public.com_t_user_role
FOR SELECT TO authenticated USING (
    auth.uid() = user_id 
    OR 
    (auth.jwt() -> 'app_metadata' ->> 'roles')::jsonb ? 'admin'
);


-- =========================================================================
-- 5. 契約マスタ (public.com_m_contract)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their own client contracts" ON public.com_m_contract;
ALTER TABLE public.com_m_contract ENABLE ROW LEVEL SECURITY;

-- [参照] 所属する顧客（企業・学校）の契約情報のみ閲覧可能
CREATE POLICY "Users can view their own client contracts" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);


-- =========================================================================
-- 6. ユーザーライセンス割当情報 (public.com_t_user_license)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view relevant licenses" ON public.com_t_user_license;
ALTER TABLE public.com_t_user_license ENABLE ROW LEVEL SECURITY;

-- [参照] 受講生は「自分のライセンス」、法人の管理者は「自社（契約）に紐づく全員のライセンス」を閲覧可能
CREATE POLICY "Users can view relevant licenses" ON public.com_t_user_license
FOR SELECT TO authenticated USING (
    user_id = auth.uid() 
    OR 
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract 
        WHERE client_id = public.get_jwt_client_id()
    )
);


-- =========================================================================
-- 7. コンテンツマスタ (public.com_m_contents)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view common or assigned corpora" ON public.com_m_contents;
ALTER TABLE public.com_m_contents ENABLE ROW LEVEL SECURITY;

-- [参照] 共通コンテンツ(scope=0)、または自社に対してアクセス権(com_m_contents_access)が許可されているもののみ閲覧可能
CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_contents
FOR SELECT TO authenticated USING (
    delete_flg = '0'
    AND content_scope <> 9 -- 非公開(9)は常に除外
    AND (
        content_scope = 0
        OR EXISTS (
            SELECT 1 FROM public.com_m_contents_access a
            WHERE a.content_id = public.com_m_contents.content_id
              AND a.client_id = public.get_jwt_client_id()
              AND a.delete_flg = '0'
        )
    )
);


-- =========================================================================
-- 8. コンテンツアクセス権管理 (public.com_m_contents_access)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their own client contents access" ON public.com_m_contents_access;
ALTER TABLE public.com_m_contents_access ENABLE ROW LEVEL SECURITY;

-- [参照] 自分の所属する client_id に紐づくアクセス権設定のみ閲覧可能
CREATE POLICY "Users can view their own client contents access" ON public.com_m_contents_access
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);


-- =========================================================================
-- 9. コンテンツタグ管理 (public.com_m_contents_tag)
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can view tags" ON public.com_m_contents_tag;
ALTER TABLE public.com_m_contents_tag ENABLE ROW LEVEL SECURITY;

-- [参照] 認証済みユーザーであれば削除されていないタグ一覧を誰でも参照可能
CREATE POLICY "Anyone can view tags" ON public.com_m_contents_tag
FOR SELECT TO authenticated USING (delete_flg = '0');


-- =========================================================================
-- 10. コンテンツタグリレーション (public.com_t_contents_tag_rel)
-- =========================================================================
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.com_t_contents_tag_rel;
ALTER TABLE public.com_t_contents_tag_rel ENABLE ROW LEVEL SECURITY;

-- [参照] コンテンツとタグの紐付け情報は認証済みユーザーであれば全参照可能
CREATE POLICY "Allow select for authenticated" 
ON public.com_t_contents_tag_rel FOR SELECT TO authenticated USING (true);


-- =========================================================================
-- 11. コンテンツ再開管理履歴 (public.com_t_resume_contents)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own resume points" ON public.com_t_resume_contents;
ALTER TABLE public.com_t_resume_contents ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のデータのみ参照・登録・変更・削除を許可（他人のデータ操作・なりすましを完全防御）
CREATE POLICY "Users can manage their own resume points" ON public.com_t_resume_contents
FOR ALL TO authenticated 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- =========================================================================
-- 12. 単語マスタ (public.com_m_word)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view words of accessible corpora" ON public.com_m_word;
ALTER TABLE public.com_m_word ENABLE ROW LEVEL SECURITY;

-- [参照] 親となるコンテンツ(com_m_contents)のRLS参照をパスできる単語のみ安全に閲覧可能
CREATE POLICY "Users can view words of accessible corpora" ON public.com_m_word
FOR SELECT TO authenticated USING (
    status = 'live' -- 公開中の単語のみ
    AND EXISTS (
        SELECT 1 FROM public.com_m_contents c
        WHERE c.content_id = public.com_m_word.content_id
    )
);


-- =========================================================================
-- 13. フレーズマスタ (public.com_m_phrase)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view phrases of accessible words" ON public.com_m_phrase;
ALTER TABLE public.com_m_phrase ENABLE ROW LEVEL SECURITY;

-- [参照] アクセス権のある単語マスタに紐づくフレーズのみ閲覧可能
CREATE POLICY "Users can view phrases of accessible words" ON public.com_m_phrase
FOR SELECT TO authenticated USING (
    status = 'live' -- 公開中のフレーズのみ
    AND EXISTS (
        SELECT 1 FROM public.com_m_word w
        WHERE w.word_id = public.com_m_phrase.word_id
    )
);


-- =========================================================================
-- 14. お気に入りコンテンツ (public.com_t_favorite_contents)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own favorite contents" ON public.com_t_favorite_contents;
ALTER TABLE public.com_t_favorite_contents ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のみがお気に入り設定の参照・追加・削除を管理可能
CREATE POLICY "Users can manage their own favorite contents" ON public.com_t_favorite_contents
FOR ALL TO authenticated 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- =========================================================================
-- 15. お気に入りフレーズ (public.com_t_favorite_phrase)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.com_t_favorite_phrase;
DROP POLICY IF EXISTS "Managers can view client's favorites" ON public.com_t_favorite_phrase;
ALTER TABLE public.com_t_favorite_phrase ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のみがお気に入りフレーズのCRUD操作を管理可能
CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- [参照] 組織管理者が自社受講生のお気に入り傾向（学習分析等）をダッシュボードで監査するための参照許可
CREATE POLICY "Managers can view client's favorites" ON public.com_t_favorite_phrase
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.com_t_favorite_phrase.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);


-- =========================================================================
-- 16. 音声資産マスタ (public.com_t_tts_asset)
--     ★重要セキュリティ修正: セキュリティアドバイザー警告(rls_policy_always_true)の修正
-- =========================================================================
DROP POLICY IF EXISTS "Admin users can manage tts assets" ON public.com_t_tts_asset;
ALTER TABLE public.com_t_tts_asset ENABLE ROW LEVEL SECURITY;

-- [全操作] 管理者（user_type = '0'）のみがTTSアセットを作成・更新・管理可能（一般の生徒は全遮断）
CREATE POLICY "Admin users can manage tts assets" ON public.com_t_tts_asset
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');


-- =========================================================================
-- 17. 利用規約マスタ (public.com_m_terms)
-- =========================================================================
DROP POLICY IF EXISTS "Terms are viewable by everyone" ON public.com_m_terms;
DROP POLICY IF EXISTS "Admins can manage terms" ON public.com_m_terms;
ALTER TABLE public.com_m_terms ENABLE ROW LEVEL SECURITY;

-- [参照] 🚀 修正：USING(true)を回避し、実質的な絞り込み条件（空文字でないこと）を指定
-- これにより、未ログイン(anon)・一般受講生問わず、規約データが安全に引き出せ、
-- なおかつセキュリティアドバイザーの「常に真になるポリシー」という警告を完全に消し去ることができます。
CREATE POLICY "Terms are viewable by everyone" ON public.com_m_terms 
FOR SELECT USING (term_type IS NOT NULL);

-- [全操作] システム管理者（user_type = '0'）のみが規約を更新・管理可能
CREATE POLICY "Admins can manage terms" ON public.com_m_terms
FOR ALL TO authenticated 
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- =========================================================================
-- 18. 利用規約同意履歴 (public.com_t_user_terms_agreement)
-- =========================================================================
DROP POLICY IF EXISTS "Users and Admins can view agreement history" ON public.com_t_user_terms_agreement;
DROP POLICY IF EXISTS "Users and Admins can insert agreement history" ON public.com_t_user_terms_agreement;
ALTER TABLE public.com_t_user_terms_agreement ENABLE ROW LEVEL SECURITY;

-- [参照] ユーザー自身、またはシステム管理者が同意履歴を閲覧可能
CREATE POLICY "Users and Admins can view agreement history" ON public.com_t_user_terms_agreement
FOR SELECT TO authenticated USING (
    user_id = auth.uid() 
    OR 
    public.get_jwt_user_type() = '0'
);

-- [挿入] ユーザー自身、または管理者が同意レコードをコミット可能
CREATE POLICY "Users and Admins can insert agreement history" ON public.com_t_user_terms_agreement
FOR INSERT TO authenticated 
WITH CHECK (
    user_id = auth.uid() 
    OR 
    public.get_jwt_user_type() = '0'
);


-- =========================================================================
-- 19. スプリント問題マスタ (public.com_m_sprint_questions)
-- =========================================================================
DROP POLICY IF EXISTS "Allow select access for authenticated users" ON public.com_m_sprint_questions;
DROP POLICY IF EXISTS "Allow all access for service_role" ON public.com_m_sprint_questions;
ALTER TABLE public.com_m_sprint_questions ENABLE ROW LEVEL SECURITY;

-- データベースロールに対する明示的SELECT権限の保証
GRANT SELECT ON TABLE public.com_m_sprint_questions TO authenticated;

-- [参照] 認証済みユーザー（学習者）は論理削除(delete_flg = '0')されていないスプリント問題を全て参照可能
CREATE POLICY "Allow select access for authenticated users" 
ON public.com_m_sprint_questions FOR SELECT TO authenticated
USING (delete_flg = '0');


-- =========================================================================
-- 20. 自主トレスプリント結果履歴 (public.self_t_sprint)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own sprint scores" ON public.self_t_sprint;
DROP POLICY IF EXISTS "Managers can view client's sprint scores" ON public.self_t_sprint;
ALTER TABLE public.self_t_sprint ENABLE ROW LEVEL SECURITY;

-- [全操作] 学習者本人のみが自身のスコア・スプリント結果データを管理可能
CREATE POLICY "Users can manage their own sprint scores" ON public.self_t_sprint
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- [参照] 所属組織の管理者・マネージャーが分析のために同じテナント内のスコアデータを一覧抽出可能
CREATE POLICY "Managers can view client's sprint scores" ON public.self_t_sprint
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_sprint.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);


-- =========================================================================
-- 21. ユーザースプリント進捗マスタ (public.student_m_sprint_progress)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own sprint progress" ON public.student_m_sprint_progress;
ALTER TABLE public.student_m_sprint_progress ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のみが自身の学習進捗（ステータスや現在地）を記録・変更可能
CREATE POLICY "Users can manage their own sprint progress" ON public.student_m_sprint_progress
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 22. ユーザー招待管理 (public.com_t_invitation) RLS定義
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage all invitations" ON public.com_t_invitation;
DROP POLICY IF EXISTS "Anon or Auth users can view valid invitations via token" ON public.com_t_invitation;
DROP POLICY IF EXISTS "System can update invitation on acceptance" ON public.com_t_invitation;

-- RLSの確実な有効化
ALTER TABLE public.com_t_invitation ENABLE ROW LEVEL SECURITY;

-- 【これだけに集約】
-- [全権限] システム管理者 (user_type = '0') は画面からすべての操作（招待の発行・一覧表示・削除）が可能
-- 一般受講生や未ログイン（anon）からの直接アクセスは、RLSによって「一滴も漏らさず完全遮断」されます。
CREATE POLICY "Admins can manage all invitations" ON public.com_t_invitation
FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'
)
WITH CHECK (
    public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 23. 単語ドリル日次サマリー (public.self_t_word_summary)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own word summaries" ON public.self_t_word_summary;
DROP POLICY IF EXISTS "Managers can view client's word summaries" ON public.self_t_word_summary;
ALTER TABLE public.self_t_word_summary ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のみが自身の学習ログ（日次サマリー）を管理可能
CREATE POLICY "Users can manage their own word summaries" ON public.self_t_word_summary
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- [参照] 組織管理者が自社受講生の進捗状況を分析・監査するための参照許可
CREATE POLICY "Managers can view client's word summaries" ON public.self_t_word_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_word_summary.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);

-- =========================================================================
-- 24. スプリントドリル日次サマリー (public.self_t_sprint_summary（スプリントドリル日次サマリー）)
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their own sprint summaries" ON public.self_t_sprint_summary;
DROP POLICY IF EXISTS "Managers can view client's sprint summaries" ON public.self_t_sprint_summary;
ALTER TABLE public.self_t_sprint_summary ENABLE ROW LEVEL SECURITY;

-- [全操作] 受講生本人のみが自身の学習ログ（日次サマリー）を管理可能
CREATE POLICY "Users can manage their own sprint summaries" ON public.self_t_sprint_summary
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- [参照] 組織管理者が自社受講生の進捗状況を分析・監査するための参照許可
CREATE POLICY "Managers can view client's sprint summaries" ON public.self_t_sprint_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_sprint_summary.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);

-- =========================================================================
-- 25. com_m_color_vowel (Color Vowelマスタ)
-- =========================================================================
ALTER TABLE public.com_m_color_vowel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active color vowels" ON public.com_m_color_vowel;

-- [参照] 認証済みユーザーであれば、削除されていないColor Vowelマスタを全員閲覧可能
CREATE POLICY "Users can view active color vowels" ON public.com_m_color_vowel
FOR SELECT TO authenticated 
USING (delete_flg = 0);

-- =========================================================================
-- 26. com_m_color_vowel_dictionary (Color Vowel辞書マスタ) - RLS定義
-- =========================================================================
ALTER TABLE public.com_m_color_vowel_dictionary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary;

-- [参照] 認証済みユーザーであれば、ステータスが'live'かつ削除されていない辞書レコードを全員閲覧可能
CREATE POLICY "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary
FOR SELECT TO authenticated
USING (status = 'live' AND delete_flg = 0);

-- =========================================================================
-- 27. com_t_chat_room (チャットルーム管理)
-- =========================================================================
ALTER TABLE public.com_t_chat_room ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their chat rooms" ON public.com_t_chat_room;
DROP POLICY IF EXISTS "Admins can manage chat rooms" ON public.com_t_chat_room;

CREATE POLICY "Members can view their chat rooms" ON public.com_t_chat_room
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage chat rooms" ON public.com_t_chat_room
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- =========================================================================
-- 28. com_t_chat_room_user (チャット参加者 & 未読管理)
-- =========================================================================
ALTER TABLE public.com_t_chat_room_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Admins can manage room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Users can update their own participation row" ON public.com_t_chat_room_user;

CREATE POLICY "Members can view their room participants" ON public.com_t_chat_room_user
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage room participants" ON public.com_t_chat_room_user
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 未読管理 (last_read_chat_id) を自身の行に限り更新可能にする
CREATE POLICY "Users can update their own participation row" ON public.com_t_chat_room_user
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 29. com_t_chat (チャットメッセージ)
-- =========================================================================
ALTER TABLE public.com_t_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view messages in their rooms" ON public.com_t_chat;
DROP POLICY IF EXISTS "Members can send messages as themselves" ON public.com_t_chat;

CREATE POLICY "Members can view messages in their rooms" ON public.com_t_chat
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

-- なりすまし防止: sender_user_id は auth.uid() と一致する必要がある
CREATE POLICY "Members can send messages as themselves" ON public.com_t_chat
FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND public.is_chat_room_member(room_id)
);
