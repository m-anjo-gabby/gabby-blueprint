# セッション結果・宿題入力（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/sessions/[sessionId]/result`
- 対象ロール: コーチ
- 目的: 確定済み（実施完了・早期終了・生徒の欠席等）の
  ライブセッション1件について、実施記録（入退室ログ・チャット履歴・Live Sprint実施履歴）を
  確認し、生徒への宿題を投稿・追記する。**この画面自体にセッションを確定させる操作は無い**
  （確定はセッションハブの「End Session」で行う。本画面はその後の記録
  閲覧と宿題投稿に特化している）。

## この画面に来る経路

- セッションハブの End Session で、実施した結果（Completed / Ended early / Student didn’t show up）を記録した直後
- 生徒概要画面のLive Sessionsカードで、確定済み（実施予定以外）のセッション行をクリック
- セッションハブの「This lesson has already been finalized.」に添えられた「View Session
  Result」リンクから

## 画面の構成

1. **ヘッダー** — 「← Back to Overview」リンクと「Session Result」という見出し
2. **Summaryセクション** — Session Info（ステータス・日時・相手名・ステータス注記）、
   Join / Leave Timeline（入退室ログ）
3. **Homeworkセクション** — 宿題の投稿・チェックリスト・フォローアップコメント
4. **Trainingセクション** — このセッション中に実施したLive Sprintの一覧と、セッションハブで開いた
   ダイアログ教材の履歴（Dialog Practice History）
5. **Otherセクション** — In-call Chat History（通話中のチャット履歴）

## Summary：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| ステータスバッジ | Completed / Ended early / No-show / Cancelled by student / Cancelled by you 等、確定結果に応じた表示 | 操作なし |
| 実施方法 | 外部のZoomで実施と記録した場合のみ「Held on an external Zoom (the in-app call wasn’t used)」 | 操作なし |
| Note | End Session で入力した理由（早期終了・外部のZoom・推定と違う結果の理由等）がある場合に表示 | 操作なし |
| Join / Leave Timeline | コーチ・生徒それぞれの入室/退室ログを時系列で表示。通話が記録されなかった場合は「No call activity was recorded for this session.」 | 操作なし |

## Homework：表示要素・操作

宿題は「本体（Instructions、必須・添付可）＋チェックリスト（任意、最大件数あり）」を1セット
として一度だけ作成し、以後は本体・チェックリストとも編集不可（追記専用のフォローアップ
コメントのみ追加できる）という設計になっている。

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| New Homework フォーム | まだ宿題が投稿されていない場合のみ表示。指示文（必須）、添付ファイル（複数可、1ファイル10MBまで）、チェックリスト項目（任意、追加時にドラフトへ蓄積） | 「Post Homework」で本体・チェックリスト・添付をまとめて1回で登録する。登録すると生徒に通知が送られる |
| Instructions（投稿済み） | 投稿済みの指示文＋添付ファイル | 表示のみ（編集不可） |
| Checklist（投稿済み） | 本体作成時に確定した項目一覧と進捗（n/m done、プログレスバー） | このコーチ画面からは項目の追加・完了チェックはできない（チェックは生徒側の操作） |
| Follow-up Comments | 過去のコメント一覧（新しい順）＋新規コメント入力欄（テキスト・添付ファイル） | 送信すると一覧の先頭に追加され、生徒に表示される。宿題本体と異なり、コメントは何度でも追加できる |
| 添付ファイルのプレビュー | 画像は縮小プレビュー＋タップで別タブ表示、それ以外はファイル名リンク | クリック/タップで別タブに開く |

## Training・Other：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Live Sprint History | このセッション中に実施したLive Sprintの一覧（無ければ「No Live Sprint was run in this session.」） | 行をクリックするとLive Sprint結果画面へ遷移する（戻り先はこのセッション結果画面） |
| Dialog Practice History | このセッション中にセッションハブでコーチが開いた教材リンクの履歴（教材名・Session番号・オープン日時。無ければ「No Dialogue Practice material was opened in this session.」） | 表示のみ（行のクリックによる遷移は無い） |
| In-call Chat History | 通話中のチャットメッセージ一覧（コーチ発言は右寄せ、生徒発言は左寄せ）。無ければ「No chat messages were sent during this call.」 | 操作なし（閲覧のみ） |

**Dialog Practice Historyは「開いた」事実の記録であり、「完了した」ことを保証するものではない。**
ダイアログプラクティス教材はGoogle Slidesを別タブで開く方式のため、実際に何を行ったかをアプリ側
から検知することはできない。そのため、セッションハブでコーチがCoach Materials/Student Materialsリンクを
クリックした時点をそのまま1行として記録しており（`com_t_session_dialogue_log`）、誤って別教材を
開いた・同じ教材を開き直した場合も重複排除せずそのまま複数行として残る。教材が「完了したか」は
Dialogue Practiceカード側の進捗（`com_t_dialogue_session_progress`）が別途管理しており、本履歴とは
連動しない。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中（画面遷移直後・再読み込み） | 戻るリンク・見出し・区分・各カードの見出しは本物、各カードの中身を骨組みで表示 | 同上 |
| 宿題未投稿 | New Homeworkフォームのみ表示 | このセッションに宿題がまだ1件も投稿されていない場合 |
| 宿題投稿済み | Instructions/Checklist/Follow-up Commentsの表示に切り替わる | 宿題本体が既に投稿されている場合。以後この画面を再訪しても常にこちらの表示になる（本体フォームには戻れない） |
| 該当データが無い | 404ページ | 指定した`sessionId`が存在しない、または生徒との担当関係が無い場合 |

## セッション確定処理そのものについて（参考）

この結果画面自体には確定操作は無い。確定はセッションハブの End Session（`record_session_outcome`）で、
コーチが結果・実施方法を申告して行う（入退室ログからの推定は初期選択と確認の材料）。確定後の修正はアドミンが行う。
結果の種類・理由が必須の条件は [session-completion.md](../../../../testing/e2e/specs/session-lifecycle/session-completion.md)、
操作画面は[セッションハブ](session-detail.md)を参照。

## 関連する業務フロー仕様書

- [ライブセッションの宿題](../../../../testing/e2e/specs/homework/session-homework.md)
  — 宿題の投稿・チェックリスト・追記のコメント・生徒への通知・異常系の一覧
- [ライブセッションの実施・終了処理](../../../../testing/e2e/specs/session-lifecycle/session-completion.md)
  — 結果（Summary）の元になる確定処理

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/result/page.tsx`
- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/result/_components/SessionResult.tsx`
- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/result/_components/HomeworkComposer.tsx`
- 関連RPC（確定処理自体。本画面からは呼ばれないが結果表示の前提となる）: `record_session_outcome`
- サーバーアクション: `getSessionResultSummary`（`apps/coach/actions/sessionAction.ts`）,
  `getSessionHomework`, `getSessionHomeworkChecklist`, `createSessionHomework`,
  `addHomeworkComment`, `uploadSessionHomeworkAttachment`（`apps/coach/actions/sessionHomeworkAction.ts`。
  添付の失敗は理由のコードを受け取り英語の文言で表示）, `getSessionHomeworkAttachmentUrl`
  （`packages/lib/sessionHomework/actions/homeworkAttachmentActions.ts`）
- DB: `com_t_session_dialogue_log`（Dialog Practice Historyの記録元。追記専用、
  `session_id`・`assignment_id`・`dialogue_session_id`を保持。登録元は
  [セッションハブ](session-detail.md)の`logSessionDialogueOpen`アクション）
