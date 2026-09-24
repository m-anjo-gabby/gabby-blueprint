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
- セッションキャンセルダイアログで「Resolve Manually」を選び解決した後、通常扱い
  （normal/early_ended/no_show）であれば結果画面へ、コーチ無断欠席（coach_no_show）扱いに
  すると生徒概要へ遷移する（このハブには戻らない）

## 画面の構成

ヘッダー/サイドバーを覆う没入表示（`ImmersiveHeader` + 常時表示）で、以下のセクションから成る。

1. **Session Info** — セッションのステータス・日時、通話開始・End Session・（必要時）
   Resolve Manuallyの操作
2. **Training**（実施予定かつ操作可能な間のみ表示） — Live Sprintの開始導線（Dialog Practiceは
   準備中で無効表示）
3. **Prep** — 前回のLive Sprint（このセッション自身の実施分を除く直近3件）、前回の宿題
   （このセッション自身の投稿を除く直近分）
4. **Self-Training** — 直近数日間の自主トレ状況（アクティブ日数・回答数・スピーキング評価回数）

このハブ自体は、通話前後に画面遷移せず「前回までの状況」を確認できることを目的としており、
このセッション自身の実施記録（入退室ログ・チャット履歴・スプリント履歴）はセッション結果画面
（`.../result`）側の役割として重複させていない。

## Session Info：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| ステータスバッジ | 実施予定は「Scheduled」。終了予定時刻を過ぎてもEnd Session/Resolveされていない場合は「Action Needed」に切り替わる | — |
| 「You joined」バッジ | 自分（コーチ）がこのセッションのビデオ通話に一度でも入室した記録がある場合 | — |
| 「The call ended in the other tab.」通知 | 別タブ（通話ルーム）で通話が終了したことをRealtimeで検知した場合 | End Sessionを押すよう促す表示のみ |
| 「Start Live Session」ボタン | 終了予定時刻＋規定の猶予時間（Video SDKの最大通話時間相当）を過ぎていない場合 | 別タブでビデオ通話ルーム（`/students/[id]/room/[sessionId]`）を開く。開始可能時刻（開始予定の一定時間前）より早い場合はクリックしても遷移せず、「Not yet — you can start at ...」という注意が出る |
| 「End Session」ボタン | 常時表示。有効化条件は「自分が一度でも入室した記録がある」こと | 確認ダイアログの上で`finalize_session`を呼び、コーチ・生徒双方の入退室ログの重複時間から実施結果（実施完了/早期終了/無断欠席）を自動判定する。重複時間が20分未満の場合は理由入力が必須になり、理由入力ダイアログが追加で表示される。成功するとセッション結果画面へ遷移する |
| 「Resolve Manually」ボタン | 終了予定時刻を過ぎており、かつ自分がまだ入室していない場合のみ表示 | セッション解決ダイアログを開く（下記参照） |
| 「This lesson has already been finalized.」 | 既に確定済みの場合（例: 別タブで先にEnd Session済みだった場合） | 「View Session Result」リンクで結果画面へ遷移するのみで、これ以上の操作はできない |

### セッション解決ダイアログ（Resolve Manually）

終了予定時刻を過ぎても`scheduled`のまま残ったセッション（アプリ外Zoom等で代替実施した、
またはEnd Sessionを押し忘れてクラッシュした等）を、コーチが理由付きで手動解決する唯一の手段。

- **Outcome（結果）選択肢は次の3つ**（早期終了(early_ended)を明示的に選ぶ選択肢は無い）
  - 「Completed (conducted outside the app)」— 実施完了として記録
  - 「No-show (the student never showed up)」— 生徒の無断欠席として記録
  - 「I missed this session (cancels it — the student's ticket is refunded)」— コーチ無断欠席。
    この場合のみ「完了」ではなく**コーチ起因のキャンセル扱い**になり、生徒のチケットが返還される
- Reason（理由）は必須項目
- 送信すると`resolve_stale_session`が呼ばれ、コーチ無断欠席以外は結果画面へ、コーチ無断欠席の
  場合は生徒概要画面へ遷移する

## Training：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Live Sprintカード「Start」ボタン | セッションが操作可能（実施予定かつ猶予期間内）な間のみ表示 | このセッションに紐づくLive Sprint実施画面（`?session_id=`付き）へ遷移する |
| Dialog Practiceカード | 生徒概要画面のDialogue Practiceパネル（`DialoguePracticeCard`）と同一コンポーネント。ただし「Manage」リンクは無い | 「+ Assign」で教材選択ダイアログをその場で開ける。未完了セット行をクリックするとセッション詳細ダイアログが開き、完了操作・メモ編集ができる（詳細は[生徒概要の仕様書](overview.md)のDialogue Practiceカードの節、[Dialogue Practice管理画面の仕様書](dialogue-practice.md)を参照）。**このハブでのみ**、セッション詳細ダイアログでCoach Materials/Student Materialsリンクを開くと、その事実（オープンイベント）がこのライブセッションに紐づけて記録され、セッション結果画面のDialog Practice Historyに反映される |

## Prep・Self-Training：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Last Live Sprint | このセッション自身の実施分を除く直近3件。無ければ「No previous Live Sprint on record.」 | 行をクリックするとLive Sprint結果画面へ、このハブへ戻る文脈を引き継いだ状態（没入表示）で遷移する |
| Last Homework | このセッション自身の投稿を除く直近の宿題。無ければ「No homework posted yet.」 | 操作なし（閲覧のみ） |
| Self-Training（直近n日間） | 自主トレ活動が無い場合は「No self-training activity in the last n days.」、あれば活動日数・総回答数・スピーキング評価回数を表示 | 操作なし |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 終了予定時刻超過・未対応 | 「Action Needed」バッジ＋「This session's scheduled end time has passed. Please press End Session once you're done...」という警告文 | 実施予定のまま終了予定時刻を過ぎている場合 |
| 操作可能期間の終了 | 「Start Live Session」ボタンと「Training」セクションが非表示になり、「Starting a new call or Live Sprint is no longer available for this session — press End Session to record the outcome.」の案内のみ | 終了予定時刻から規定の猶予時間（Video SDKの最大通話時間相当）を過ぎた場合 |
| 確定済み | 通常操作エリアの代わりに「This lesson has already been finalized.」＋結果画面へのリンク | 既にfinalize_session/resolve_stale_sessionで確定済みの場合（このハブへの通常の導線は生じないが、別タブで先に確定された場合等に発生しうる） |
| 該当データが無い | 404ページ | 指定した`sessionId`が存在しない、または生徒との担当関係が無い場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/page.tsx`
- `apps/coach/app/(app)/students/[id]/sessions/[sessionId]/_components/SessionHub.tsx`
- `apps/coach/hooks/useEndLesson.ts`
- `apps/coach/components/session/EndLessonReasonDialog.tsx`
- 共通ダイアログ: `apps/coach/app/(app)/calendar/_components/SessionActionDialog.tsx`
  （実体は `packages/lib/components/common/SessionActionDialog.tsx`、`mode: 'resolve'`）
- 共通コンポーネント: `apps/coach/components/common/ImmersiveShell.tsx`,
  `apps/coach/components/common/ImmersiveHeader.tsx`, `apps/coach/components/common/Section.tsx`
- Dialog Practiceカード: `apps/coach/app/(app)/students/[id]/_components/DialoguePracticeCard.tsx`
  （生徒概要画面と共有。詳細は[Dialogue Practice管理画面の仕様書](dialogue-practice.md)参照）
- 関連RPC: `finalize_session`, `resolve_stale_session`
- サーバーアクション: `getSessionResultSummary`（`apps/coach/actions/sessionAction.ts`）,
  `getRecentSessionHomework`（`apps/coach/actions/sessionHomeworkAction.ts`）,
  `getLessonSprintHistory`（`apps/coach/actions/lessonSprintAction.ts`）,
  `getSelfTrainingWeekSummary`（`apps/coach/actions/studentAction.ts`）,
  `finalizeSession`, `resolveStaleSession`, `hasCoachJoinedSessions`
  （`apps/coach/actions/sessionAction.ts`）,
  `getStudentDialogueAssignments`, `getAvailableDialogueContents`, `logSessionDialogueOpen`
  （`apps/coach/actions/dialogueAction.ts`）
- DB: `com_t_session_dialogue_log`（このハブで教材リンクを開いた事実を記録する追記専用の
  履歴テーブル。詳細は[セッション結果画面の仕様書](session-result.md)を参照）
