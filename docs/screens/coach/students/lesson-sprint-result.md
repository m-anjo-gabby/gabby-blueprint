# Live Sprint 結果画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/lesson-sprint/result/[sprintId]`
  （クエリ: `?session_id=...`, `?back=...`, `?back_label=...` — 遷移元によって付与される）
- 対象ロール: コーチ
- 目的: 1回分のLive Sprint実施結果（設問ごとの正誤・スコア・ハイライトした単語）を確認し、
  実施メモ（Session Notes）を編集する。

## この画面に来る経路

- 生徒概要画面のLive Sprintカード、Live Sprint履歴一覧、セッション結果画面のLive Sprint
  History、セッションハブのPrepセクションなど、Live Sprintの実施履歴が一覧表示される
  あらゆる画面から、履歴行をクリックして遷移する
- Live Sprint実施画面（Player）で1本完走した直後、自動的にこの画面へ遷移する

## 画面の構成（2パターン）

この画面は「セッションハブ発（`?session_id=`が有効な場合）」か「それ以外（履歴からの単発
参照）」かで見た目が変わる。

- **セッションハブ発（没入表示）**: ヘッダー/サイドバーを覆う没入シェルで表示され、専用の
  共通ヘッダー（生徒名・アバター・「Back to Hub」・平均スコア）が付く。実施直後の完走、および
  セッションハブの「Prep」セクションから過去記録を振り返る場合の両方が該当する
- **それ以外（通常表示）**: 通常のHeader/Sidebar付きページとして表示され、画面上部に
  「← Back to ...」リンクとページタイトルが出る

いずれも本文は左右2カラム構成。

1. **左カラム: Summary** — 教材名、種別・レベル・制限時間、実施日時、回答数・平均スコア
2. **左カラム: Session Notes** — 実施中に入力したメモの表示・編集
3. **左カラム: 次のアクション**（没入表示時のみ） — 「Repeat Same Settings」「Start Another
   Live Sprint」「Done for now — back to Hub」
4. **右カラム: Answer History** — 設問ごとのカード（Question/Answer/スコアまたはSkipped、
   ハイライトした単語）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Summaryカード | 教材名・種別・レベル・制限時間・実施日時・回答数・平均スコア（未評価のみの場合は「—」） | 操作なし |
| Session Notesカード | 実施中に記録したメモ（無ければ「No session notes yet.」） | 「Edit」ボタンで編集モードに入り、「Save」で保存できる |
| 「Repeat Same Settings」ボタン | セッションハブ発の場合のみ | 同じ教材・種別・レベル・制限時間・秒数で新しい問題セットを取得し、Setup画面を経由せず直接Player画面へ遷移する |
| 「Start Another Live Sprint」ボタン | セッションハブ発の場合のみ | Live Sprint実施画面のSetupから新規に開始する |
| 「Done for now — back to Hub」リンク | セッションハブ発の場合のみ | セッションハブへ戻る |
| Answer Historyの各設問カード | 設問文・Answer本文（ハイライトした単語を再現表示）、スコアバッジまたは「Skipped」バッジ | 操作なし（閲覧専用） |

## 戻り先の決まり方

- セッションハブ発（`?session_id=`が有効）の場合は常に「Back to Hub」でセッションハブに固定される
- それ以外は、`?back=`/`?back_label=`が指定されていればそこへ戻る（履歴一覧・セッション結果
  画面など、実際に遷移してきた画面）
- どちらも無い場合、この実施記録が何らかのライブセッションに紐づいていればそのセッション結果
  画面、紐づきが無い（単独実施）場合は生徒概要画面へ戻る、という推測にフォールバックする

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 該当データが無い | 404ページ | 指定した`sprintId`の結果が存在しない、または生徒との担当関係が無い場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/lesson-sprint/result/[sprintId]/page.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/result/[sprintId]/_components/LessonSprintResult.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/result/[sprintId]/_components/RepeatSprintButton.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/result/[sprintId]/_components/SessionNoteCard.tsx`
- 共通コンポーネント: `apps/coach/components/common/ImmersiveShell.tsx`,
  `apps/coach/components/common/ImmersiveHeader.tsx`
- サーバーアクション: `getLessonSprintResult`, `getAvailableSprintContents`,
  `getLessonSprintQuestions`, `updateLessonSprintSessionNote`
  （`apps/coach/actions/lessonSprintAction.ts`）, `getStudentOverview`
  （`apps/coach/actions/studentAction.ts`）
