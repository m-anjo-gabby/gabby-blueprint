-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260904-dev
-- 作成日: 2026-09-04
--
-- 【内容】
--   ライブセッション（Zoom Video SDK）ルームを com_t_session（個別レッスン
--   予約実体）に紐づけ、実施結果（completed/no_show/early_ended）の自動判定、
--   および宿題（コーチ→生徒への自由メッセージ＋添付ファイル）機能を追加する。
--
--   【背景】
--   従来のライブ通話ルームはコーチ⇔生徒の担当関係のみでアクセス可能で、
--   com_t_sessionとは一切紐づいていなかった。Zoomのsession name(topic)も
--   コーチ⇔生徒ペア単位で固定のため、同一ペアの複数レッスンが同一ルームを
--   再利用してしまう問題があった。本リリースでは session_id 単位にルームを
--   分離し、通話の入退室ログから実施結果を自動判定してcom_t_sessionへ反映する。
--
--   1. com_t_session に status_note カラムを追加し、status の CHECK 制約に
--      7(early_ended) を追加する。
--   2. com_t_session_call_log テーブルを新規作成
--      - 通話の入退室1回=1行。再接続を複数行として記録する。joined_at/left_at は
--        いずれもサーバー側(NOW())でのみ確定し、クライアントからの時刻指定経路を
--        持たない（record_session_call_join/record_session_call_leave経由のみ）。
--   3. com_t_session_homework / com_t_session_homework_attachment テーブルを新規作成
--      - レッスン終了後にコーチが投稿する宿題（自由メッセージ＋複数添付ファイル）。
--        com_t_coach_student_note と同様、投稿後の更新・削除は許可しない追記専用。
--        対象生徒本人も閲覧できる（com_t_chat/com_t_chat_attachmentと同型の
--        親子テーブル構成）。
--   4. Storage Bucket "homework" を新規作成（"chat"バケットと同方針の非公開バケット）。
--   5. record_session_call_join() / record_session_call_leave() (SECURITY DEFINER) を新規作成
--      - 通話の入退室記録専用RPC。時刻パラメータを一切受け取らず、常にNOW()で確定させる。
--   6. finalize_session() (SECURITY DEFINER) を新規作成
--      - 「レッスン終了」ボタンの本体。コーチ・生徒双方の在室区間の重複時間から
--        completed(20分以上)/early_ended(20分未満・要理由)/no_show(生徒未入室)を
--        自動判定してcom_t_session.statusへ反映する。completed確定時は
--        com_t_user_session_ticket.used_sessions の加算と
--        com_t_user_session_ticket_history への記録も行う。
--   7. resolve_stale_session() (SECURITY DEFINER) を新規作成
--      - 予定終了時刻を過ぎてもscheduledのまま残ったセッションの唯一の手動解決経路
--        （バッチ処理は導入しない）。理由必須。
--
--   アプリケーションコード側の変更（liveSessionRoomActions.ts のsession_id対応、
--   sessionActions.tsへのRPC呼び出し追加、レッスン結果画面・宿題投稿UI等）は
--   本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】生徒⇔コーチ予約管理（振替・キャンセル・未割当チケット予約）(2026-09-05)
--   ---------------------------------------------------------------------
--   キャンセル時のチケット返還ルール（開始12時間以上前の生徒キャンセルは返還、
--   12時間未満は返還なし、コーチキャンセルは常に返還）と、返還により未割当に戻った
--   チケットを担当コーチ限定で再予約するフローを追加する。
--
--   8. com_t_session に ticket_refunded カラムを追加する。
--   9. cancel_session() を更新し、上記ルールに基づき ticket_refunded を記録する。
--   10. reschedule_session() を更新し、開始12時間以内の振替を生徒・コーチ双方で
--       禁止する。
--   11. fn_schedule_shortfall() (STABLE) を新規作成する
--       - 定期スケジュール(com_m_lesson_schedule)単位で、契約上本来確保できたはずの
--         セッション回数(expected)と、消化済み扱いの回数(actual。ticket_refunded=false
--         のキャンセルは消化済み扱いに含め、trueは未割当として除外する)の差分
--         (shortfall)を算出する。Student Overview画面の未消化枠表示と、
--         book_makeup_session()の予約可否判定の両方がこの関数を単一の真実源として使う。
--   12. book_makeup_session() (SECURITY DEFINER) を新規作成する
--       - 未割当チケットを、そのコマ(schedule_id)の担当コーチ限定で新規に予約するRPC。
--         コーチは com_m_lesson_schedule.coach_id で既に確定しているため、
--         コーチ選択は受け付けない。
--
--   アプリケーションコード側の変更（生徒・コーチ両カレンダーの予約UI、
--   LiveSessionHistoryCardの操作化等）は本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】Lesson Sprintのライブセッション紐づけ、セッション準備/実施ハブ (2026-09-06)
--   ---------------------------------------------------------------------
--   コーチの受講生概要画面から直接ビデオ通話・スプリント実施・セッション終了を
--   行う導線を廃止し、個別レッスンセッション(com_t_session)単位の「セッション
--   準備/実施ハブ」画面（アプリケーションコード側、本SQLの対象外）に集約する。
--   これに伴い、Lesson Sprintの実施回をどのライブセッション中に行ったか記録
--   できるようにする。
--
--   14. lesson_t_sprint に session_id カラムを追加する
--       - NULL許容（アプリ内Zoomが利用できず外部Zoom等で代替実施した場合等の
--         単独実施をケアするため必須にはしない）。指定する場合はRLSの
--         WITH CHECKで「そのコーチが担当し、かつ対象student_idと一致する
--         セッションであること」を検証し、他コーチ・他生徒のセッションへの
--         誤紐づけを防止する。
--
--   ---------------------------------------------------------------------
--   【追加分】セッション準備/実施ハブへの事前情報表示 (2026-09-06)
--   ---------------------------------------------------------------------
--   ハブ画面から、通話開始前後に生徒の直近の状況（前回セッションの宿題・
--   Lesson Sprint実施状況、直近1週間の自主トレ実施状況）を画面遷移せずに
--   確認できるようにする。
--
--   15. self_t_sprint_summary に、担当コーチ向けの閲覧ポリシーを追加する
--       - self_t_sprint（回答内容・個別スコアを含む生ログ）ではなく、日次の
--         実施件数のみを持つ本サマリーテーブルに限定して開示する（最小権限。
--         生徒の自主トレの解答内容そのものはコーチに見せない）。
--
--   アプリケーションコード側の変更（ハブ画面のPrep/Self-Trainingセクション追加、
--   getLessonSprintHistoryCoreへのsession_id追加等）は本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】予約・振替の生徒限定化とコーチ提案機能、通知拡充 (2026-09-07)
--   ---------------------------------------------------------------------
--   予約・振替の決定権を生徒側に一本化する方針とし、reschedule_session()/
--   book_makeup_session()をコーチから実行できないよう変更する。代わりに、
--   コーチがキャンセルする際に候補時間（Availability外も可、最大3件、
--   回答期限48時間）を生徒へ提案できる機能を追加する。あわせて、セッションの
--   キャンセル・予約・振替それぞれのタイミングで相手方へ通知(com_t_notification)
--   を作成するようにする。
--
--   16. com_t_session_reschedule_proposal テーブルを新規作成
--       - 1提案=1候補行。書き込みはcom_t_session本体と同様、SECURITY DEFINER
--         関数経由のみ（直接INSERT/UPDATEのRLSは許可しない）。
--   17. cancel_session() を更新する
--       - p_proposed_slots(jsonb, 最大3件)を追加。コーチキャンセル時のみ有効。
--       - キャンセル完了時、相手方へ通知を作成する
--         (コーチ→生徒: SESSION_CANCELLED_BY_COACH/SESSION_RESCHEDULE_PROPOSED、
--          生徒→コーチ: SESSION_CANCELLED_BY_STUDENT)。
--   18. reschedule_session() を更新する
--       - 生徒本人のみ実行可能に変更（コーチからの実行を拒否）。
--       - 振替完了時、コーチへ通知(SESSION_BOOKED_BY_STUDENT)を作成する。
--   19. book_makeup_session() を更新する
--       - 生徒本人のみ実行可能に変更（コーチからの実行を拒否）。
--       - 予約完了時、コーチへ通知(SESSION_BOOKED_BY_STUDENT)を作成する。
--   20. accept_session_reschedule_proposal() / decline_session_reschedule_proposal()
--       を新規作成する
--       - 生徒がコーチ提案の候補を承諾/却下するRPC。承諾時はAvailabilityチェックを
--         行わず(コーチが明示的に提案した時間のため)、二重予約チェックのみ行う。
--         承諾された候補以外の同一キャンセルの候補は自動的にdeclined化する。
--
--   通知種別(SESSION_CANCELLED_BY_COACH/SESSION_RESCHEDULE_PROPOSED/
--   SESSION_CANCELLED_BY_STUDENT/SESSION_BOOKED_BY_STUDENT)のTS側定義
--   (packages/types/notification.ts、apps/coach/constants/notification.ts)、
--   および各画面のUI変更は本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】ライブ通話チャット履歴の永続化 (2026-09-06)
--   ---------------------------------------------------------------------
--   Zoom Video SDKのin-callチャットはSDK側に永続化機能・取得APIを持たず、
--   client.on('chat-on-message')が両者にリアルタイム配信するのみで通話終了・
--   ページ離脱と共に消失する。レッスン結果画面で通話中のやり取りを振り返れる
--   ようにするため、送信イベントを受け取った時点でアプリ側が都度保存する方式を
--   採用する（Webhookでの事後取得は、Zoom側の保持を前提にできない上、結局
--   自前DBへの保存が必要になる点で本方式と変わらないため不採用）。
--
--   13. com_t_session_chat テーブルを新規作成
--       - com_t_chatと同様、直接INSERT+RLSでなりすましを防止する方式（時刻の
--         真正性がクリティカルなcom_t_session_call_logのようなRPC限定方式は
--         チャット本文には過剰なため採用しない）。書き込みは送信者自身の
--         クライアントからのみ行う想定（chat-on-messageは送信者にもエコー
--         されるため、受信側が重複保存しないようアプリ側でisSelf判定する）。
--         更新・削除は許可しない追記専用の履歴として保持する。
--
--   アプリケーションコード側の変更（useZoomVideoSessionのchatMessagesを起点に
--   LiveSessionRoomView.tsx/LiveSessionRoom.tsxからcom_t_session_chatへ保存、
--   レッスン結果画面へのチャット履歴表示追加等）は本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】契約プランの一本化、プラン英語名・ダイアログプラクティス対応 (2026-09-08)
--   ---------------------------------------------------------------------
--   契約作成を「契約タイプ＋プラン」の2段階選択から「プラン選択のみ」に一本化する。
--   契約タイプ・週回数・チケット数・ダイアログプラクティス（自主トレ・コーチとのセッション
--   両方で使う教材利用可否）提供有無はすべて選択したプランマスタの値に一意に決まり、
--   契約側は個別調整用にコピーを
--   持つ（既存のweekly_frequency/total_sessionsと同じハイブリッド方式）。
--   あわせて、生徒概要等でプラン名を英語表示できるよう英語名カラムを追加する。
--
--   21. com_m_contract_plan に plan_name_en / has_dialogue_practice を追加する
--   22. com_m_contract に plan_name_en / has_dialogue_practice を追加し、plan_id を
--       必須参照化する（既存のBlueprintのみ契約をBLUEPRINT_ONLYプランへ自動紐付け）
--   23. com_t_user_license に has_dialogue_practice を追加する
--       - ライブセッションチケット(com_t_user_session_ticket)とは別に持つ。チケットは
--         消化型のライブセッション予約枠、ダイアログプラクティスはライセンス期間中
--         ずっと有効な利用可否（自主トレ・コーチとのセッション両方が対象）であり、
--         性質が異なるため。
--   24. com_t_user_license_history に has_dialogue_practice を追加する（監査用スナップショット）
--   25. vw_contract_details を再実行する（重要な不具合修正）
--       - 本VIEWは SELECT c.* で列展開しており、PostgreSQLの仕様上VIEWを再実行しない限り
--         元テーブルへの列追加は反映されない。2026-08-15のplan_id等追加時からこの再実行が
--         漏れており、契約編集ダイアログでplan_idが取得できず、プラン選択済みの契約を編集
--         で開いてもプランが空欄に見える不具合が発生していた。VIEWの定義自体は変更せず、
--         再実行のみ行う。
--
--   ---------------------------------------------------------------------
--   【追加分】ライセンス「解除」を廃止し「無効化」に変更 (2026-09-08)
--   ---------------------------------------------------------------------
--   従来のライセンス解除（com_t_user_licenseの物理DELETE）は、ON DELETE CASCADEにより
--   チケット・スケジュール・実施済みセッション（call_log/chat/homework含む）まで連鎖して
--   完全に削除してしまい、復元不能なデータ損失リスクがあった。BtoB運用では契約途中の
--   解除はほぼ発生せず、標準は契約期間満了による自然終了であるため、「削除」ではなく
--   「無効化（停止）」という扱いに変更する。誤割当の是正は、無効化した上で契約編集で
--   max_licensesを増やして正しいユーザーに割り当て直す運用とする（チケット消化数は
--   無効化後もそのまま。返還・復元は行わない）。
--
--   26. com_t_session.status に 8(cancelled_license_ended) を追加する
--       - 無効化に伴う自動キャンセルを、既存のcancelled_by_coach(4)と区別するための専用値。
--         4を流用すると、コーチ側画面で実際には行っていない「Cancelled by you」等の
--         誤解を招く表示になってしまうため。
--   27. invalidate_user_license() (SECURITY DEFINER) を新規作成する
--       - ライセンスをstatus=0にし、紐づく稼働中のスケジュールをterminated(9)にし、
--         まだ実施されていない未来のscheduledセッションのみをキャンセルする。DELETEは
--         一切行わないため、実施済みのセッション結果・チャット・宿題は変更されない。
--
--   アプリケーションコード側の変更（removeLicenseFromUserの廃止、invalidateUserLicense
--   への置き換え、確認ダイアログの文言変更等）は本SQLの対象外（DB変更のみ）。
--
--   アプリケーションコード側の変更（契約登録フォームのプラン一本化、プランマスタ管理
--   画面の追加、生徒概要のプラン名英語表示化等）は本SQLの対象外（DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】カレンダーのキャンセル済み非表示、コーチのLive Sessionsカードの
--   契約単位・担当外セッション参照対応 (2026-09-08)
--   ---------------------------------------------------------------------
--   週2回契約等で1コマ目・2コマ目を別コーチが分担する運用や、生徒が過去に別のコーチから
--   引き継がれた運用があるため、担当外セッションも一覧としては参照できるようにする
--   （結果の詳細=call_log/chat/homeworkは対象外。これらのRLSは変更しない）。
--
--   28. com_t_session の閲覧RLSを拡張する
--       - 従来: student_id=自分 OR coach_id=自分 OR admin
--       - 追加: 担当関係(com_m_coach_student_relationship)がある生徒のセッションも閲覧可能に
--       - 【重要】本拡張により、com_t_sessionをRLSだけに委ねて問い合わせている既存コードが
--         意図せず他コーチのセッションを取得してしまう。packages/lib/session/actions/
--         sessionActions.ts の getMySessionsCore（メインカレンダー・ダッシュボード用）は
--         明示的な .or(coach_id.eq/student_id.eq) フィルタを追加済み。
--
--   アプリケーションコード側の変更（カレンダーでのキャンセル済み等の非表示、コーチの
--   Live Sessionsカードの契約切替・3タブ化、担当外セッションの表示等）は本SQLの対象外
--   （DB変更のみ）。
--
--   ---------------------------------------------------------------------
--   【追加分】アドミンのライブセッション管理画面、契約途中のコーチ交代対応 (2026-09-08)
--   ---------------------------------------------------------------------
--   契約途中で担当コーチを交代する必要が生じた場合に、アドミンが対象の生徒・契約・
--   スケジュール枠を特定して交代を行えるようにする。DELETEは一切行わず、実施済みの
--   セッション結果・チャット・宿題・チケット消化数は一切変更しない。
--
--   29. com_t_matching_request.status に 5(ended) を追加する
--       - コーチ交代等でアドミンが承認済みリクエストを終了させたことを表す専用値。
--         既存の4(cancelled、生徒による取消)とは意味が異なるため区別する。
--   30. com_t_session.status に 9(cancelled_coach_reassigned) を追加する
--       - コーチ交代に伴う自動キャンセルを、既存の8(cancelled_license_ended)や
--         4(cancelled_by_coach)と区別するための専用値。
--   31. release_lesson_schedule_slot() (SECURITY DEFINER) を新規作成する
--       - 対象スケジュールをterminated(9)にし、紐づく承認済みマッチングリクエストを
--         ended(5)にし、まだ実施されていない未来のscheduledセッションのみを
--         キャンセルする。これにより、生徒は同じ(ticket_id, slot_no)へ新しいコーチを
--         改めてリクエストできるようになる。
--
--   アプリケーションコード側の変更（アドミンの「ライブセッション管理」画面新設、
--   顧客/生徒/契約選択、スケジュール枠・セッション一覧表示、コーチ交代ボタン等）は
--   本SQLの対象外（DB変更のみ）。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（CREATE TABLE IF NOT EXISTS /
--   CREATE OR REPLACE / DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS /
--   ON CONFLICT）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_t_session に status_note カラム追加、status CHECK制約の拡張
-- =========================================================================
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS status_note text DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.status_note IS '早期終了理由・停滞セッションの手動解決理由（cancel_reasonとは意味的に分離）';

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6, 7));

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show 7:early_ended(早期終了、status_noteに理由)';

-- =========================================================================
-- 2. com_t_session_call_log 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_call_log (
    call_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.com_m_user(id),
    role text NOT NULL,
    zoom_session_id text DEFAULT NULL,
    joined_at timestamp with time zone NOT NULL DEFAULT NOW(),
    left_at timestamp with time zone DEFAULT NULL,

    CONSTRAINT chk_call_log_role CHECK (role IN ('coach', 'student')),
    CONSTRAINT chk_call_log_left_after_join CHECK (left_at IS NULL OR left_at >= joined_at)
);

COMMENT ON TABLE public.com_t_session_call_log IS 'ライブセッション通話 入退室ログ（1入室=1行、再接続を複数行で表現）';
COMMENT ON COLUMN public.com_t_session_call_log.call_log_id IS '入退室ログID';
COMMENT ON COLUMN public.com_t_session_call_log.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_call_log.user_id IS '入室したユーザID（コーチまたは生徒）';
COMMENT ON COLUMN public.com_t_session_call_log.role IS '入室者の役割 (coach, student)';
COMMENT ON COLUMN public.com_t_session_call_log.zoom_session_id IS 'Zoom Video SDKのgetSessionInfo().sessionId（通話インスタンス単位、相関/デバッグ用途のみで判定には不使用）';
COMMENT ON COLUMN public.com_t_session_call_log.joined_at IS '入室日時（サーバー確定、クライアント指定不可）';
COMMENT ON COLUMN public.com_t_session_call_log.left_at IS '退室日時（サーバー確定、クライアント指定不可。NULLは未クローズ=在室中とみなす）';

CREATE INDEX IF NOT EXISTS idx_session_call_log_session ON public.com_t_session_call_log (session_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_session_call_log_user ON public.com_t_session_call_log (user_id, joined_at);

ALTER TABLE public.com_t_session_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view call log" ON public.com_t_session_call_log;
CREATE POLICY "Involved users can view call log" ON public.com_t_session_call_log
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_call_log.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 3. com_t_session_homework / com_t_session_homework_attachment 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_homework (
    homework_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    homework_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_text_not_blank CHECK (btrim(homework_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework IS 'レッスンセッション単位の宿題（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework.homework_id IS '宿題ID';
COMMENT ON COLUMN public.com_t_session_homework.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_homework.coach_id IS '投稿したコーチのユーザID（com_t_session.coach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.student_id IS '対象の生徒のユーザID（非正規化。com_t_session.student_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.homework_text IS '宿題本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework.insert_date IS '登録日時';

CREATE INDEX IF NOT EXISTS idx_session_homework_session ON public.com_t_session_homework (session_id, insert_date DESC);
CREATE INDEX IF NOT EXISTS idx_session_homework_student ON public.com_t_session_homework (student_id, insert_date DESC);

ALTER TABLE public.com_t_session_homework ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view session homework" ON public.com_t_session_homework;
CREATE POLICY "Coach and student can view session homework" ON public.com_t_session_homework
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Coaches can post homework for their own sessions" ON public.com_t_session_homework;
CREATE POLICY "Coaches can post homework for their own sessions" ON public.com_t_session_homework
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework.session_id
        AND s.coach_id = auth.uid()
        AND s.student_id = com_t_session_homework.student_id
    )
);

CREATE TABLE IF NOT EXISTS public.com_t_session_homework_attachment (
    homework_attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_session_homework_attachment IS '宿題添付ファイル';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_id IS '宿題ID (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_path IS 'Storage上のパス ("homework"バケット)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.created_at IS 'アップロード日時';

CREATE INDEX IF NOT EXISTS idx_session_homework_attachment_homework ON public.com_t_session_homework_attachment (homework_id);

ALTER TABLE public.com_t_session_homework_attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment;
CREATE POLICY "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment;
CREATE POLICY "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND h.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 4. Storage Bucket "homework" 新規作成
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework',
  'homework',
  false,
  10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =========================================================================
-- 5. record_session_call_join() / record_session_call_leave() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_session_call_join(p_session_id uuid, p_zoom_session_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_role text;
    v_call_log_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id = auth.uid() THEN
        v_role := 'coach';
    ELSIF v_session.student_id = auth.uid() THEN
        v_role := 'student';
    ELSE
        RAISE EXCEPTION 'not authorized to join this session';
    END IF;

    INSERT INTO public.com_t_session_call_log (session_id, user_id, role, zoom_session_id)
    VALUES (p_session_id, auth.uid(), v_role, p_zoom_session_id)
    RETURNING call_log_id INTO v_call_log_id;

    RETURN v_call_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_session_call_leave(p_call_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.com_t_session_call_log
    SET left_at = NOW()
    WHERE call_log_id = p_call_log_id
      AND user_id = auth.uid()
      AND left_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_leave(uuid) TO authenticated;

-- =========================================================================
-- 6. finalize_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_new_status smallint;
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to finalize this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap_seconds
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT EXISTS(
      SELECT 1 FROM public.com_t_session_call_log WHERE session_id = p_session_id AND role = 'student'
    ) INTO v_student_joined;

    IF v_overlap_seconds >= 1200 THEN
        v_new_status := 2;
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_new_status := 7;
    ELSE
        v_new_status := 6;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status,
        status_note = CASE WHEN v_new_status = 7 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_new_status = 2 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, NULL, auth.uid());
        END IF;
    END IF;

    RETURN QUERY SELECT v_new_status, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;

-- =========================================================================
-- 7. resolve_stale_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_resolved_status smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_ticket RECORD;
BEGIN
    IF p_resolved_status NOT IN (2, 6, 7) THEN
        RAISE EXCEPTION 'invalid resolved status %', p_resolved_status;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to resolve this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = p_resolved_status, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_resolved_status = 2 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_reason, auth.uid());
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;

-- =========================================================================
-- 8. com_t_session に ticket_refunded カラム追加
-- =========================================================================
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS ticket_refunded boolean DEFAULT NULL;
COMMENT ON COLUMN public.com_t_session.ticket_refunded IS 'キャンセル(status 3/4)時のみ意味を持つ。true:チケット返還(未割当扱いに戻り担当コーチ限定で再予約可能) false:返還なし(消化済み扱い)。生徒キャンセルは開始12時間以上前ならtrue、未満ならfalse。コーチキャンセルは常にtrue。';

-- =========================================================================
-- 9. cancel_session() 更新（チケット返還ルール対応）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_session(p_session_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
    v_refunded boolean;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    IF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text) TO authenticated;

-- =========================================================================
-- 10. reschedule_session() 更新（開始12時間以内の振替を禁止）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reschedule_session(
    p_session_id uuid,
    p_new_date date,
    p_new_start_time time,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_tz text;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime - NOW() < interval '12 hours' THEN
        RAISE EXCEPTION 'cannot reschedule a session within 12 hours of its start time';
    END IF;

    SELECT timezone INTO v_coach_tz FROM public.com_m_user WHERE id = v_session.coach_id;
    v_coach_tz := COALESCE(v_coach_tz, 'Asia/Tokyo');

    v_duration := v_session.end_datetime - v_session.start_datetime;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_coach_tz;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_session.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_session.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_new_start, v_new_end, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) TO authenticated;

-- =========================================================================
-- 11. fn_schedule_shortfall() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_schedule_shortfall(p_schedule_id uuid)
RETURNS TABLE(expected_sessions integer, actual_sessions integer, shortfall integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_cursor_date date;
    v_expected integer := 0;
    v_actual integer;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date LOOP
        v_expected := v_expected + 1;
        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    SELECT COUNT(*) INTO v_actual
    FROM public.com_t_session s
    WHERE s.schedule_id = p_schedule_id
      AND (
        s.status IN (1, 2, 6, 7)
        OR (s.status IN (3, 4) AND s.ticket_refunded = false)
      );

    RETURN QUERY SELECT v_expected, v_actual, GREATEST(v_expected - v_actual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) TO authenticated;

-- =========================================================================
-- 12. book_makeup_session() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.book_makeup_session(
    p_schedule_id uuid,
    p_new_date date,
    p_new_start_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() AND v_schedule.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to book a session for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);
    IF v_shortfall <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    v_duration := v_schedule.end_time - v_schedule.start_time;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_schedule.coach_timezone;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_schedule.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_schedule.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_schedule.coach_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_schedule.student_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        v_new_start, v_new_end, 1
    )
    RETURNING session_id INTO v_new_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) TO authenticated;

-- =========================================================================
-- 13. com_t_session_chat 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_chat (
    chat_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    sender_user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    sender_role text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_chat_sender_role CHECK (sender_role IN ('coach', 'student')),
    CONSTRAINT chk_session_chat_message_not_blank CHECK (btrim(message) <> '')
);

COMMENT ON TABLE public.com_t_session_chat IS 'ライブセッション通話中のチャット履歴（Zoom Video SDKのchat-on-messageイベントを送信者側で都度保存）';
COMMENT ON COLUMN public.com_t_session_chat.chat_id IS 'チャットメッセージID';
COMMENT ON COLUMN public.com_t_session_chat.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_chat.sender_user_id IS '送信者のユーザID（コーチまたは生徒）';
COMMENT ON COLUMN public.com_t_session_chat.sender_role IS '送信者の役割 (coach, student)。com_t_session.coach_id/student_idとの一致をRLSで検証';
COMMENT ON COLUMN public.com_t_session_chat.message IS 'メッセージ本文';
COMMENT ON COLUMN public.com_t_session_chat.created_at IS '送信日時（サーバー確定）';

CREATE INDEX IF NOT EXISTS idx_session_chat_session ON public.com_t_session_chat (session_id, created_at);

ALTER TABLE public.com_t_session_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view session chat" ON public.com_t_session_chat;
CREATE POLICY "Involved users can view session chat" ON public.com_t_session_chat
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Involved users can post session chat as themselves" ON public.com_t_session_chat;
CREATE POLICY "Involved users can post session chat as themselves" ON public.com_t_session_chat
FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id
        AND (
          (s.coach_id = auth.uid() AND com_t_session_chat.sender_role = 'coach')
          OR (s.student_id = auth.uid() AND com_t_session_chat.sender_role = 'student')
        )
    )
);

-- =========================================================================
-- 14. lesson_t_sprint に session_id カラムを追加
-- =========================================================================
ALTER TABLE public.lesson_t_sprint
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.com_t_session(session_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesson_t_sprint.session_id IS '実施したライブセッション (com_t_session)。NULL許容（単独実施・外部Zoom実施等はNULL）';

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_session ON public.lesson_t_sprint (session_id, insert_date);

DROP POLICY IF EXISTS "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint;
CREATE POLICY "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint
FOR ALL TO authenticated
USING (coach_id = auth.uid() OR public.get_jwt_user_type() = '0')
WITH CHECK (
    coach_id = auth.uid()
    AND (
      session_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.session_id = lesson_t_sprint.session_id
          AND s.coach_id = auth.uid()
          AND s.student_id = lesson_t_sprint.student_id
      )
    )
);

-- =========================================================================
-- 15. self_t_sprint_summary に担当コーチ向け閲覧ポリシーを追加
-- =========================================================================
DROP POLICY IF EXISTS "Coaches can view their assigned students' sprint summaries" ON public.self_t_sprint_summary;
CREATE POLICY "Coaches can view their assigned students' sprint summaries" ON public.self_t_sprint_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = public.self_t_sprint_summary.user_id
          AND r.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 16. com_t_session_reschedule_proposal 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session_reschedule_proposal (
    proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    proposed_start_datetime timestamp with time zone NOT NULL,
    proposed_end_datetime timestamp with time zone NOT NULL,
    status smallint NOT NULL DEFAULT 1,
    expires_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_proposal_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_proposal_time_range CHECK (proposed_end_datetime > proposed_start_datetime)
);

COMMENT ON TABLE public.com_t_session_reschedule_proposal IS 'コーチがキャンセル時に生徒へ提案する振替候補時間（決定権は生徒側。最大3件/キャンセル）';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.status IS 'ステータス 1:pending(未回答) 2:accepted(承諾済み) 3:declined(却下/他候補の承諾により自動不採用) 4:expired(期限切れ)';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.expires_at IS '回答期限。cancel_session実行時に決定した固定値';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.resulting_session_id IS '承諾により新規作成されたcom_t_session行（accepted以外はNULL）';

CREATE INDEX IF NOT EXISTS idx_session_reschedule_proposal_session ON public.com_t_session_reschedule_proposal (session_id);
CREATE INDEX IF NOT EXISTS idx_session_reschedule_proposal_student_status ON public.com_t_session_reschedule_proposal (student_id, status);

ALTER TABLE public.com_t_session_reschedule_proposal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view reschedule proposals" ON public.com_t_session_reschedule_proposal;
CREATE POLICY "Involved users can view reschedule proposals" ON public.com_t_session_reschedule_proposal
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 17. cancel_session() 更新（提案スロット対応・通知追加）
-- =========================================================================
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
    v_refunded boolean;
    v_is_coach boolean;
    v_coach_name text;
    v_student_name text;
    v_slot jsonb;
    v_slot_start timestamptz;
    v_slot_end timestamptz;
    v_proposal_count integer := 0;
    v_proposal_validity_hours CONSTANT integer := 48;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    v_is_coach := (v_session.coach_id = auth.uid());

    IF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_session.student_id;

    IF v_is_coach THEN
        IF p_proposed_slots IS NOT NULL THEN
            v_proposal_count := jsonb_array_length(p_proposed_slots);
            IF v_proposal_count > 3 THEN
                RAISE EXCEPTION 'cannot propose more than 3 alternative times';
            END IF;

            FOR v_slot IN SELECT * FROM jsonb_array_elements(p_proposed_slots) LOOP
                v_slot_start := (v_slot->>'start_datetime')::timestamptz;
                v_slot_end := (v_slot->>'end_datetime')::timestamptz;

                IF v_slot_start <= NOW() THEN
                    RAISE EXCEPTION 'proposed time must be in the future';
                END IF;
                IF v_slot_end <= v_slot_start THEN
                    RAISE EXCEPTION 'invalid proposed time range';
                END IF;

                INSERT INTO public.com_t_session_reschedule_proposal (
                    session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime, expires_at
                ) VALUES (
                    p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                    NOW() + (v_proposal_validity_hours || ' hours')::interval
                );
            END LOOP;
        END IF;

        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
            v_session.student_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED' ELSE 'SESSION_CANCELLED_BY_COACH' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/live-room'
        );
    ELSE
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
            v_session.coach_id,
            'SESSION_CANCELLED_BY_STUDENT',
            jsonb_build_object(
                'session_id', p_session_id,
                'student_name', v_student_name,
                'session_start_datetime', v_session.start_datetime
            ),
            '/students/' || v_session.student_id
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb) TO authenticated;

-- =========================================================================
-- 18. reschedule_session() 更新（生徒限定化・通知追加）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reschedule_session(
    p_session_id uuid,
    p_new_date date,
    p_new_start_time time,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_tz text;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime - NOW() < interval '12 hours' THEN
        RAISE EXCEPTION 'cannot reschedule a session within 12 hours of its start time';
    END IF;

    SELECT timezone INTO v_coach_tz FROM public.com_m_user WHERE id = v_session.coach_id;
    v_coach_tz := COALESCE(v_coach_tz, 'Asia/Tokyo');

    v_duration := v_session.end_datetime - v_session.start_datetime;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_coach_tz;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_session.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_session.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_new_start, v_new_end, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_session.coach_id,
        'SESSION_BOOKED_BY_STUDENT',
        jsonb_build_object(
            'session_id', v_new_session_id,
            'student_name', u.user_name,
            'session_start_datetime', v_new_start
        ),
        '/students/' || v_session.student_id
    FROM public.com_m_user u WHERE u.id = v_session.student_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) TO authenticated;

-- =========================================================================
-- 19. book_makeup_session() 更新（生徒限定化・通知追加）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.book_makeup_session(
    p_schedule_id uuid,
    p_new_date date,
    p_new_start_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to book a session for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);
    IF v_shortfall <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    v_duration := v_schedule.end_time - v_schedule.start_time;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_schedule.coach_timezone;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_schedule.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_schedule.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_schedule.coach_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_schedule.student_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        v_new_start, v_new_end, 1
    )
    RETURNING session_id INTO v_new_session_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_schedule.coach_id,
        'SESSION_BOOKED_BY_STUDENT',
        jsonb_build_object(
            'session_id', v_new_session_id,
            'student_name', u.user_name,
            'session_start_datetime', v_new_start
        ),
        '/students/' || v_schedule.student_id
    FROM public.com_m_user u WHERE u.id = v_schedule.student_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) TO authenticated;

-- =========================================================================
-- 20. accept_session_reschedule_proposal() / decline_session_reschedule_proposal() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.accept_session_reschedule_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_session RECORD;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    IF v_proposal.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    IF v_proposal.status = 4 OR (v_proposal.status = 1 AND v_proposal.expires_at <= NOW()) THEN
        UPDATE public.com_t_session_reschedule_proposal SET status = 4, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = v_proposal.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'original session % not found', v_proposal.session_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.start_datetime < v_proposal.proposed_end_datetime
          AND s.end_datetime > v_proposal.proposed_start_datetime
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.start_datetime < v_proposal.proposed_end_datetime
          AND s.end_datetime > v_proposal.proposed_start_datetime
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = v_proposal.session_id
      AND proposal_id <> p_proposal_id
      AND status = 1;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_session.coach_id,
        'SESSION_BOOKED_BY_STUDENT',
        jsonb_build_object(
            'session_id', v_new_session_id,
            'student_name', u.user_name,
            'session_start_datetime', v_proposal.proposed_start_datetime
        ),
        '/students/' || v_session.student_id
    FROM public.com_m_user u WHERE u.id = v_session.student_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_session_reschedule_proposal(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    IF v_proposal.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE proposal_id = p_proposal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_session_reschedule_proposal(uuid) TO authenticated;

-- =========================================================================
-- 21. com_m_contract_plan に plan_name_en / has_dialogue_practice を追加
-- =========================================================================
ALTER TABLE public.com_m_contract_plan
  ADD COLUMN IF NOT EXISTS plan_name_en text,
  ADD COLUMN IF NOT EXISTS has_dialogue_practice boolean NOT NULL DEFAULT false;

UPDATE public.com_m_contract_plan SET plan_name_en = plan_name WHERE plan_name_en IS NULL;
ALTER TABLE public.com_m_contract_plan ALTER COLUMN plan_name_en SET NOT NULL;

COMMENT ON COLUMN public.com_m_contract_plan.plan_name_en IS 'プラン表示名（英語。coachアプリでの表示用）';
COMMENT ON COLUMN public.com_m_contract_plan.has_dialogue_practice IS 'ダイアログプラクティスの提供有無（自主トレ・コーチとのセッション両方での利用可否に使う）';

ALTER TABLE public.com_m_contract_plan DROP CONSTRAINT IF EXISTS chk_contract_plan_dialogue_requires_coach;
ALTER TABLE public.com_m_contract_plan ADD CONSTRAINT chk_contract_plan_dialogue_requires_coach CHECK (
    NOT has_dialogue_practice OR contract_type = 2
);

-- プラン表示名・ダイアログプラクティス提供有無の実値を投入（plan_codeは変更しない）
INSERT INTO public.com_m_contract_plan (plan_code, plan_name, plan_name_en, contract_type, weekly_frequency, period_months, total_sessions, has_dialogue_practice, sort_no) VALUES
  ('BLUEPRINT_ONLY',   'アプリのみ',       'App only',                 1, NULL, 3, NULL, false, 1),
  ('LIVE_WEEKLY1_3M',  'スピーキング強化', 'Standard',                 2, 1,    3, 12,   false, 2),
  ('LIVE_WEEKLY2_3M',  'ビジネス英語プロ', 'Business Pro (Dialogue)',  2, 2,    3, 24,   true,  3)
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  plan_name_en = EXCLUDED.plan_name_en,
  contract_type = EXCLUDED.contract_type,
  weekly_frequency = EXCLUDED.weekly_frequency,
  period_months = EXCLUDED.period_months,
  total_sessions = EXCLUDED.total_sessions,
  has_dialogue_practice = EXCLUDED.has_dialogue_practice,
  sort_no = EXCLUDED.sort_no,
  update_date = NOW();

-- =========================================================================
-- 22. com_m_contract に plan_name_en / has_dialogue_practice を追加し、plan_id を必須化
-- =========================================================================
ALTER TABLE public.com_m_contract
  ADD COLUMN IF NOT EXISTS plan_name_en text,
  ADD COLUMN IF NOT EXISTS has_dialogue_practice boolean NOT NULL DEFAULT false;

-- 既存のBlueprintのみ契約（plan_id未設定）をBLUEPRINT_ONLYプランへ紐付ける
UPDATE public.com_m_contract c
SET plan_id = p.plan_id,
    plan_name_en = p.plan_name_en
FROM public.com_m_contract_plan p
WHERE c.plan_id IS NULL AND c.contract_type = 1 AND p.plan_code = 'BLUEPRINT_ONLY';

-- 既にplan_idが設定済みの契約（検証環境のLive契約等）は、プランマスタの正しい英語名を
-- そのまま引き継ぐ（日本語名の暫定コピーより優先する）
UPDATE public.com_m_contract c
SET plan_name_en = p.plan_name_en
FROM public.com_m_contract_plan p
WHERE c.plan_id = p.plan_id AND c.plan_name_en IS NULL;

-- 上記でも埋まらなかった行（plan_id未設定のまま残っているcontract_type=2の個別交渉契約が
-- 万一存在する場合）のみ、最終フォールバックとして日本語名を暫定コピーする。該当行があると
-- 直後のNOT NULL化(plan_id)が意図的に失敗するため、事前に次のクエリで確認しておくこと:
-- SELECT contract_id, contract_type, plan_name FROM com_m_contract WHERE plan_id IS NULL;
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

-- =========================================================================
-- 23. com_t_user_license に has_dialogue_practice を追加
-- =========================================================================
ALTER TABLE public.com_t_user_license
  ADD COLUMN IF NOT EXISTS has_dialogue_practice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.com_t_user_license.has_dialogue_practice IS 'ダイアログプラクティスの利用可否（自主トレ・コーチとのセッション両方での利用可否に使う）。ライセンス発行時にcom_m_contractの値をコピーする';

-- =========================================================================
-- 24. com_t_user_license_history に has_dialogue_practice を追加（監査用スナップショット）
-- =========================================================================
ALTER TABLE public.com_t_user_license_history
  ADD COLUMN IF NOT EXISTS has_dialogue_practice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.com_t_user_license_history.has_dialogue_practice IS '記録時点でのダイアログプラクティス利用可否';

-- =========================================================================
-- 25. vw_contract_details を再実行（SELECT c.* が列追加に自動追従しないための再展開）
-- =========================================================================
-- c.* が cl.client_name 等より前に展開されるため、com_m_contractの列が増えるたびに
-- それ以降の列の出力位置がずれ、CREATE OR REPLACE VIEWでは「cannot change name of
-- view column」エラーになる（既存出力列名は後から変更できないため）。そのため
-- DROP → CREATE で作り直す。
DROP VIEW IF EXISTS public.vw_contract_details;
CREATE VIEW public.vw_contract_details AS
SELECT
    c.*,
    cl.client_name,
    COALESCE(stats.total_assigned_count, 0) AS current_assigned_count,
    COALESCE(stats.active_snapshot_count, 0) AS current_active_count,
    c.max_licenses - COALESCE(stats.total_assigned_count, 0) AS remaining_licenses
FROM
    public.com_m_contract c
JOIN
    public.com_m_client cl ON c.client_id = cl.client_id
LEFT JOIN (
    SELECT
        contract_id,
        COUNT(license_id) AS total_assigned_count,
        COUNT(CASE WHEN status = 1 AND NOW() BETWEEN start_date AND end_date THEN 1 END) AS active_snapshot_count
    FROM
        public.com_t_user_license
    GROUP BY
        contract_id
) stats ON c.contract_id = stats.contract_id;

COMMENT ON VIEW public.vw_contract_details IS '統計情報・顧客名を含む契約詳細ビュー';
ALTER VIEW public.vw_contract_details SET (security_invoker = on);

-- =========================================================================
-- 26. com_t_session.status に 8(cancelled_license_ended) を追加
-- =========================================================================
ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6, 7, 8));

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show 7:early_ended(早期終了、status_noteに理由) 8:cancelled_license_ended(ライセンス無効化による自動キャンセル)';

-- =========================================================================
-- 27. invalidate_user_license() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.invalidate_user_license(p_license_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license RECORD;
    v_ticket_id uuid;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to invalidate a license';
    END IF;

    SELECT * INTO v_license FROM public.com_t_user_license WHERE license_id = p_license_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'license % not found', p_license_id;
    END IF;

    IF v_license.status <> 1 THEN
        RAISE EXCEPTION 'license % is not active (status=%)', p_license_id, v_license.status;
    END IF;

    UPDATE public.com_t_user_license
    SET status = 0, update_date = NOW()
    WHERE license_id = p_license_id;

    SELECT ticket_id INTO v_ticket_id
    FROM public.com_t_user_session_ticket
    WHERE license_id = p_license_id;

    IF v_ticket_id IS NOT NULL THEN
        UPDATE public.com_m_lesson_schedule
        SET status = 9, update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;

        UPDATE public.com_t_session
        SET status = 8,
            cancel_reason = 'ライセンス無効化のため',
            cancelled_by = auth.uid(),
            update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;

-- =========================================================================
-- 28. com_t_session の閲覧RLSを拡張（担当関係のある生徒の担当外セッションも参照可）
-- =========================================================================
DROP POLICY IF EXISTS "Involved users can view sessions" ON public.com_t_session;
CREATE POLICY "Involved users can view sessions" ON public.com_t_session
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_session.student_id AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 29. com_t_matching_request.status に 5(ended) を追加
-- =========================================================================
ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4, 5));

ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status_fields;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status_fields CHECK (
    (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
    OR
    (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
    OR
    (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
    OR
    (status = 4)
    OR
    (status = 5 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
);

COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取消) 5:ended(コーチ交代等によりアドミンが終了)';

-- =========================================================================
-- 30. com_t_session.status に 9(cancelled_coach_reassigned) を追加
-- =========================================================================
ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6, 7, 8, 9));

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show 7:early_ended(早期終了、status_noteに理由) 8:cancelled_license_ended(ライセンス無効化による自動キャンセル) 9:cancelled_coach_reassigned(コーチ交代による自動キャンセル)';

-- =========================================================================
-- 31. release_lesson_schedule_slot() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to release a lesson schedule slot';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    UPDATE public.com_m_lesson_schedule
    SET status = 9, update_date = NOW()
    WHERE schedule_id = p_schedule_id;

    IF v_schedule.source_request_id IS NOT NULL THEN
        UPDATE public.com_t_matching_request
        SET status = 5, update_date = NOW()
        WHERE request_id = v_schedule.source_request_id AND status = 2;
    END IF;

    UPDATE public.com_t_session
    SET status = 9,
        cancel_reason = 'コーチ交代のため',
        cancelled_by = auth.uid(),
        update_date = NOW()
    WHERE schedule_id = p_schedule_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;

COMMIT;
