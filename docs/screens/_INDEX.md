<!--
  画面仕様書の索引。目的は「この画面の仕様書はあるか」を、各ファイルを開かずにこの1ファイルの
  一覧だけで特定できるようにすること。新規画面仕様書を追加・大幅変更したら、この表も更新する。
  状態列: ✅ 作成済み / ⏳ 作成中（並行作業で対応中）
-->

# 画面仕様書 索引

## student

| ファイル | パス | 概要 | 状態 |
|---|---|---|---|
| [calendar.md](student/calendar.md) | `/calendar` | 予定の月表示、セッションキャンセル、未消化枠の予約リクエスト | ✅ |
| [dashboard.md](student/dashboard.md) | `/dashboard` | ログイン後の起点画面。各機能への導線・次回セッション表示 | ✅ |
| [chat/list.md](student/chat/list.md) | `/chat` | 参加中チャットルーム一覧（個別/グループ） | ✅ |
| [chat/room.md](student/chat/room.md) | `/chat/[roomId]` | 個別チャットルーム（送受信・添付） | ✅ |
| [coach-matching.md](student/coach-matching.md) | `/coach-matching` | 専属コーチへのマッチングリクエスト | ✅ |
| [favorites.md](student/favorites.md) | `/favorites` | お気に入り教材・フレーズ | ✅ |
| [library.md](student/library.md) | `/library` | 教材一覧（検索・絞り込み） | ✅ |
| [notice.md](student/notice.md) | `/notice` | お知らせ一覧 | ✅ |
| [notification.md](student/notification.md) | `/notification` | 通知一覧 | ✅ |
| [profile.md](student/profile.md) | `/profile` | アイコン・タイムゾーン設定 | ✅ |
| [profile-password.md](student/profile-password.md) | `/profile/password` | パスワード変更 | ✅ |
| [live-room/hub.md](student/live-room/hub.md) | `/live-room` | セッション一覧・キャンセル・予約リクエスト作成・振替応答の起点画面 | ✅ |
| [live-room/call-room.md](student/live-room/call-room.md) | `/live-room/[sessionId]` | ビデオ通話画面（Zoom Video SDK） | ✅ |
| [live-room/session-result.md](student/live-room/session-result.md) | `/live-room/sessions/[sessionId]/result` | セッション結果・宿題・Live Sprint実績 | ✅ |
| [monitor.md](student/monitor.md) | `/monitor` | 同一契約先ユーザー横断モニタリング | ✅ |
| [training/performance.md](student/training/performance.md) | `/training/performance` | 月間トレーニング成果ダッシュボード | ✅ |
| [training/sprint-history.md](student/training/sprint-history.md) | `/training/sprint/history` | スプリント履歴 | ✅ |
| [training/sprint-play.md](student/training/sprint-play.md) | `/training/sprint/play` | スプリント実施画面 | ✅ |
| [training/sprint-result.md](student/training/sprint-result.md) | `/training/sprint/result/[id]` | スプリント結果 | ✅ |
| [training/word-detail.md](student/training/word-detail.md) | `/training/word/[id]` | 単語帳カード学習画面 | ✅ |
| [training/word-history.md](student/training/word-history.md) | `/training/word/history` | 単語ドリル履歴 | ✅ |

## coach

| ファイル | パス | 概要 | 状態 |
|---|---|---|---|
| [dashboard.md](coach/dashboard.md) | `/dashboard` | Attentionタイル・直近セッション・Session Tasks | ✅ |
| [calendar.md](coach/calendar.md) | `/calendar` | 月間カレンダー＋Pending Requestsパネル | ✅ |
| [chat/list.md](coach/chat/list.md) | `/chat` | チャットルーム一覧（顧客フィルター） | ✅ |
| [chat/room.md](coach/chat/room.md) | `/chat/[roomId]` | チャット詳細 | ✅ |
| [availability.md](coach/availability.md) | `/availability` | 週次対応可能時間帯の設定 | ✅ |
| [matching-requests.md](coach/matching-requests.md) | `/matching-requests` | マッチング申請・予約・振替候補の承認/却下 | ✅ |
| [monthly-reports.md](coach/monthly-reports.md) | `/monthly-reports` | 月次セッション件数マトリクス・支払通知 | ✅ |
| [notice.md](coach/notice.md) | `/notice` | お知らせ一覧 | ✅ |
| [notification.md](coach/notification.md) | `/notification` | 通知一覧（要確認事項あり） | ✅ |
| [profile.md](coach/profile.md) | `/profile` | 基本情報＋公開プロフィール編集 | ✅ |
| [profile-password.md](coach/profile-password.md) | `/profile/password` | パスワード変更 | ✅ |
| [students/list.md](coach/students/list.md) | `/students` | 担当生徒一覧（Active/Past） | ✅ |
| [students/overview.md](coach/students/overview.md) | `/students/[id]` | 生徒概要ハブ（各サブ画面への導線） | ✅ |
| [students/coach-notes.md](coach/students/coach-notes.md) | `/students/[id]/coach-notes` | コーチノート全件閲覧 | ✅ |
| [students/training-reports.md](coach/students/training-reports.md) | `/students/[id]/training-reports` | トレーニングレポートの編集・確定 | ✅ |
| [students/lesson-sprint.md](coach/students/lesson-sprint.md) | `/students/[id]/lesson-sprint` | Live Sprintの設定〜実施 | ✅ |
| [students/lesson-sprint-history.md](coach/students/lesson-sprint-history.md) | `/students/[id]/lesson-sprint/history` | Live Sprint実施履歴（月別） | ✅ |
| [students/lesson-sprint-result.md](coach/students/lesson-sprint-result.md) | `/students/[id]/lesson-sprint/result/[sprintId]` | Live Sprint結果詳細 | ✅ |
| [students/dialogue-practice.md](coach/students/dialogue-practice.md) | `/students/[id]/dialogue-practice` | ダイアログプラクティス教材の割当・セッション進捗管理 | ✅ |
| [students/session-detail.md](coach/students/session-detail.md) | `/students/[id]/sessions/[sessionId]` | セッションハブ（通話開始・終了処理・要確認事項あり） | ✅ |
| [students/session-result.md](coach/students/session-result.md) | `/students/[id]/sessions/[sessionId]/result` | セッション結果・宿題投稿 | ✅ |

## admin

| ファイル | パス | 概要 | 状態 |
|---|---|---|---|
| [dashboard.md](admin/dashboard.md) | `/dashboard` | 5モジュールの件数・要対応件数サマリー | ✅ |
| [clients.md](admin/clients.md) | `/clients` | 顧客（テナント）マスタ管理（要確認事項あり） | ✅ |
| [contracts/list.md](admin/contracts/list.md) | `/contracts` | 契約管理（プラン紐付け・ライセンス割当） | ✅ |
| [contracts/plans.md](admin/contracts/plans.md) | `/contracts/plans` | 契約プランマスタ管理 | ✅ |
| [live-sessions.md](admin/live-sessions.md) | `/live-sessions` | セッションの代理キャンセル/予約/マッチング/コーチ交代 | ✅ |
| [monthly-reports.md](admin/monthly-reports.md) | `/monthly-reports` | コーチ稼働実績の承認・承認取消 | ✅ |
| [notification.md](admin/notification.md) | `/notification` | 通知一覧 | ✅ |
| [payment-settings.md](admin/payment-settings.md) | `/payment-settings` | 会社情報・セッション単価設定 | ✅ |
| [profile.md](admin/profile.md) | `/profile` | アイコン・タイムゾーン設定 | ✅ |
| [profile-password.md](admin/profile-password.md) | `/profile/password` | パスワード変更 | ✅ |
| [timezones.md](admin/timezones.md) | `/timezones` | タイムゾーンマスタ管理 | ✅ |
| [users.md](admin/users.md) | `/users` | ユーザーCRUD・ライセンス・代理ログイン（要確認事項あり） | ✅ |
| [calendar-events/list.md](admin/calendar-events/list.md) | `/calendar-events` | 共有カレンダーイベントの登録・編集・削除 | ✅ |
| [calendar-events/participants.md](admin/calendar-events/participants.md) | `/calendar-events/[id]/participants` | イベント参加者(RSVP)確認・アナウンス配信 | ✅ |
| [chat/list.md](admin/chat/list.md) | `/chat` | 管理者用チャットルーム一覧（査閲モード有） | ✅ |
| [chat/room.md](admin/chat/room.md) | `/chat/[roomId]` | チャット詳細（査閲・グループ参加者管理） | ✅ |
| [contents/list.md](admin/contents/list.md) | `/contents` | 学習教材の基本情報・公開範囲・タグ管理（要確認事項あり） | ✅ |
| [contents/detail.md](admin/contents/detail.md) | `/contents/[id]` | 教材中身の編集（単語帳/スプリント等） | ✅ |
| [contents/tags.md](admin/contents/tags.md) | `/contents/tags` | 教材タグのマスタ管理 | ✅ |
| [notice/list.md](admin/notice/list.md) | `/notice` | お知らせ一覧・検索・削除 | ✅ |
| [notice/new.md](admin/notice/new.md) | `/notice/new` | お知らせ新規作成（正本） | ✅ |
| [notice/edit.md](admin/notice/edit.md) | `/notice/[id]/edit` | お知らせ編集（new.mdとの差分） | ✅ |
| [notice/reads.md](admin/notice/reads.md) | `/notice/[id]/reads` | お知らせ既読状況確認 | ✅ |
| [terms/list.md](admin/terms/list.md) | `/terms` | 規約バージョン一覧・新規作成・削除 | ✅ |
| [terms/edit.md](admin/terms/edit.md) | `/terms/[id]/edit` | 規約本文の編集・プレビュー | ✅ |
| [tools/ai-knowledge-base.md](admin/tools/ai-knowledge-base.md) | `/tools/ai-knowledge-base` | RAG検索対象ナレッジの登録・編集 | ✅ |
| [tools/ai-playground.md](admin/tools/ai-playground.md) | `/tools/ai-playground` | Gemini APIチャット・翻訳の検証ツール | ✅ |
| [tools/cv-dictionary.md](admin/tools/cv-dictionary.md) | `/tools/cv-dictionary` | ColorVowel辞書管理・TTS音声生成 | ✅ |
| [tools/tts-designer.md](admin/tools/tts-designer.md) | `/tools/tts-designer` | 汎用AI音声アセットの作成・管理 | ✅ |
| [speachPoc.md](admin/speachPoc.md) | `/speachPoc` | 音声認識・TTSの比較検証ページ（要確認事項あり） | ✅ |
