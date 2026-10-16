# セッションハブ（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/sessions/[sessionId]`
- 対象ロール: コーチ
- 目的: 実施予定（scheduled）のライブセッション1件について、通話開始・Live Sprint等の
  トレーニング実施・セッション終了（結果確定）までを1画面に集約したハブ。生徒概要画面から
  各機能に直接飛ぶ導線は廃止されており、実施予定セッションに関する操作は必ずこの画面を経由する。

**このハブは実施予定（scheduled）セッション専用。** 既に確定済み（実施完了・キャンセル等）の
セッションは、呼び出し元（生徒概要画面等）が常にセッション結果画面（`/sessions/[sessionId]/result`）
へ直接遷移させる。

## この画面に来る経路

- 生徒概要画面ヘッダーの「Open Session」ボタン（次回実施可能なセッションがある場合）
- 生徒概要画面のLive Sessionsカードで、実施予定セッションの行をクリック

## 画面の構成

ヘッダー/サイドバーを覆う没入表示（`ImmersiveHeader` + 常時表示）で、以下のセクションから成る。

1. **Session Info** — セッションのステータス・日時、通話開始・End Session（実施結果の記録）の操作
2. **Training**（実施予定かつ操作可能な間のみ表示） — Live Sprintの開始導線と、Dialogue Practiceカード
   （教材の割当・セッションの完了操作・教材リンクを開いた記録）
3. **Prep** — 前回のLive Sprint（このセッション自身の実施分を除く直近3件）、前回の宿題
   （このセッション自身の投稿を除く直近分）
4. **Self-Training** — 直近数日間の自主トレ状況（アクティブ日数・回答数・スピーキング評価回数）

このハブ自体は、通話前後に画面遷移せず「前回までの状況」を確認できることを目的としており、
このセッション自身の実施記録（入退室ログ・チャット履歴・スプリント履歴）はセッション結果画面
（`.../result`）側の役割として重複させていない。

## Session Info：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| ステータスバッジ | 実施予定は「Scheduled」。終了予定時刻を過ぎてもEnd Sessionで記録されていない場合は「Action Needed」に切り替わる | — |
| 「You joined」バッジ | 自分（コーチ）がこのセッションのビデオ通話に一度でも入室した記録がある場合（画面を開いた時点の記録） | — |
| 「The call ended in the other tab.」通知 | 別タブ（通話ルーム）で通話が終了したことをRealtimeで検知した場合 | End Sessionを押すよう促す表示のみ |
| 「Start Live Session」ボタン | 終了予定時刻＋規定の猶予時間（Video SDKの最大通話時間相当）を過ぎていない場合 | 別タブでビデオ通話ルーム（`/students/[id]/room/[sessionId]`）を開く。開始可能時刻（開始予定の一定時間前）より早い場合はクリックしても遷移せず、「Not yet — you can start at ...」という注意が出る |
| 「End Session」ボタン | 実施予定の間は常時表示・常に押せる | 開始予定時刻より前に押すと「You can record the outcome once the session has started (…)」の案内を出すだけでダイアログは開かない。開始後は End Session ダイアログ（下記）を開く |
| 「This lesson has already been finalized.」 | 既に確定済みの場合（例: 別タブで先にEnd Session済みだった場合） | 「View Session Result」リンクで結果画面へ遷移するのみで、これ以上の操作はできない |

### End Session ダイアログ

実施結果を記録する唯一の手段（アプリ内の通話で実施した場合も、外部のZoomで実施した場合も、実施できなかった場合も同じ）。
結果はコーチの申告で確定し、入退室ログからの推定は初期選択と確認の材料に使う（業務フローは
[session-completion.md](../../../../testing/e2e/specs/session-lifecycle/session-completion.md)）。

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| In-app call record | 開いた時に取得した入退室ログの根拠（「You and the student were connected together for n min.」「…the student never joined.」「You did not join the in-app call…」） | — |
| What happened?（結果） | Completed / Ended early (student’s reason) / Student didn’t show up / I missed this session / Couldn’t hold the lesson (technical issues) の5つ。推定（重なり20分以上 → Completed、20分未満で生徒の入室あり → Ended early、生徒の入室なし → Student didn’t show up）を初期選択にし「Suggested by call log」の印を付ける。コーチの入室記録が無い場合は Completed が初期選択 | 選び直せる。各選択肢にチケットの扱いの説明を添える |
| How was it held?（実施方法） | 結果が Completed / Ended early / Student didn’t show up の場合のみ。In the app / External Zoom。初期値はコーチの入室記録があれば In the app、無ければ External Zoom | — |
| Note（理由） | Ended early・I missed・Couldn’t hold・External Zoom、またはアプリ内で実施と申告して推定と違う結果の場合は必須（理由が必須になった訳を上に表示）。それ以外は任意 | — |
| 「Record Outcome」ボタン | 必須の理由が入っていれば押せる | `record_session_outcome` を呼ぶ。実施した結果（Completed / Ended early / no-show）は結果画面へ、I missed・Couldn’t hold は生徒概要へ遷移する。I missed のみ生徒へ通知（`SESSION_CANCELLED_BY_COACH`）が届く |

記録後の誤りは、コーチ側では直せない（ダイアログの案内のとおりアドミンに依頼し、アドミンがライブセッション管理で修正する）。

## Training：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Live Sprintカード「Start」ボタン | セッションが操作可能（実施予定かつ猶予期間内）な間のみ表示 | このセッションに紐づくLive Sprint実施画面（`?session_id=`付き）へ遷移する |
| Dialog Practiceカード | 生徒概要画面のDialogue Practiceパネル（`DialoguePracticeCard`）と同一コンポーネント。ただし「Manage」リンクは無い | 「+ Assign」で教材選択ダイアログをその場で開ける。未完了セット行をクリックするとセッション詳細ダイアログが開き、完了操作・メモ編集ができる（詳細は[生徒概要の仕様書](overview.md)のDialogue Practiceカードの節、[Dialogue Practice管理画面の仕様書](dialogue-practice.md)を参照）。**このハブでのみ**、セッション詳細ダイアログでCoach Materials/Student Materialsリンクを開くと、その事実（オープンイベント）がこのライブセッションに紐づけて記録され、セッション結果画面のDialog Practice Historyに反映される |

## Prep・Self-Training：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Last Live Sprint | このセッション自身の実施分を除く直近3件。無ければ「No previous Live Sprint on record.」 | 行をクリックするとLive Sprint結果画面へ、このハブへ戻る文脈を引き継いだ状態（没入表示）で遷移する |
| Last Homework | このセッション自身の投稿を除く直近の宿題と、生徒が見たか（「Not viewed by the student yet」／「Viewed by the student · 日時」）。無ければ「No homework posted yet.」 | 操作なし（閲覧のみ） |
| Self-Training（直近n日間） | 自主トレ活動が無い場合は「No self-training activity in the last n days.」、あれば活動日数・総回答数・スピーキング評価回数を表示 | 操作なし |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中（画面遷移直後・再読み込み） | 本番と同じ没入表示（Header/Sidebarなし）で、見出しの画面名・戻るボタン・案内文・区分と各カードの見出しは本物、生徒名・ステータス・日時・操作ボタン・各区画の中身を骨組みで表示。区分は実施前（Trainingあり）の並びで描く | 生徒配下の `loading.tsx` と `(app)/loading.tsx`（表示中のパスで出し分け） |
| 終了予定時刻超過・未対応 | 「Action Needed」バッジ＋「This session's scheduled end time has passed. Please press End Session to record what happened (including if the lesson was held on an external Zoom, or didn't take place).」という警告文 | 実施予定のまま終了予定時刻を過ぎている場合 |
| 操作可能期間の終了 | 「Start Live Session」ボタンと「Training」セクションが非表示になり、「Starting a new call or Live Sprint is no longer available for this session — press End Session to record the outcome.」の案内のみ | 終了予定時刻から規定の猶予時間（Video SDKの最大通話時間相当）を過ぎた場合 |
| 確定済み | 通常操作エリアの代わりに「This lesson has already been finalized.」＋結果画面へのリンク | 既に record_session_outcome（またはアドミンの修正）で確定済みの場合（このハブへの通常の導線は生じないが、別タブで先に記録された場合等に発生しうる） |
| 該当データが無い | 404ページ | 指定した`sessionId`が存在しない、または生徒との担当関係が無い場合 |
| 読み込み中 | Session Info（通話開始・終了の操作）を先に表示し、Dialogue Practice・Prep・Self-Trainingの各区画は骨組みから取得が終わった順に置き換わる | セッション情報の取得後、区画ごとに個別の `Suspense` で遅延表示 |

## 関連する業務フロー仕様書

- [ライブセッションの実施・終了処理](../../../../testing/e2e/specs/session-lifecycle/session-completion.md)
  — End Session の結果の種類・理由が必須の条件・チケットの消化・アドミンの修正・異常系の一覧
- [ライブセッションの宿題](../../../../testing/e2e/specs/homework/session-homework.md)
  — 前回の宿題（Last Homework）の元になる宿題の業務フロー

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/page.tsx`
- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/_components/SessionHub.tsx`
- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/_components/HubSections.tsx` / `LastHomeworkList.tsx`（区画ごとのデータ取得。page.tsx が `Suspense` で包んで SessionHub の差し込み口に渡す）
- `apps/coach/components/session/EndSessionDialog.tsx`（文言: `apps/coach/constants/sessionOutcome.ts`）
- 共通の入力欄: `packages/lib/components/common/SessionOutcomeFields.tsx`、理由が必須の条件・初期値: `packages/lib/session/outcome.ts`
- 共通コンポーネント: `apps/coach/components/common/ImmersiveShell.tsx`,
  `apps/coach/components/common/ImmersiveHeader.tsx`, `apps/coach/components/common/Section.tsx`
- Dialog Practiceカード: `apps/coach/app/(app)/students/[id]/_components/DialoguePracticeCard.tsx`
  （生徒概要画面と共有。詳細は[Dialogue Practice管理画面の仕様書](dialogue-practice.md)参照）
- 関連RPC: `record_session_outcome`, `get_session_outcome_evidence`
- サーバーアクション: `getSessionResultSummary`（`apps/coach/actions/sessionAction.ts`）,
  `getRecentSessionHomework`（`apps/coach/actions/sessionHomeworkAction.ts`）,
  `getLessonSprintHistory`（`apps/coach/actions/lessonSprintAction.ts`）,
  `getSelfTrainingWeekSummary`（`apps/coach/actions/studentAction.ts`）,
  `recordSessionOutcome`, `getSessionOutcomeEvidence`
  （`apps/coach/actions/sessionAction.ts`）,
  `getStudentDialogueAssignments`, `getAvailableDialogueContents`, `logSessionDialogueOpen`
  （`apps/coach/actions/dialogueAction.ts`）
- DB: `com_t_session_dialogue_log`（このハブで教材リンクを開いた事実を記録する追記専用の
  履歴テーブル。詳細は[セッション結果画面の仕様書](session-result.md)を参照）
