# Live Sprint 履歴一覧（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/lesson-sprint/history`
- 対象ロール: コーチ
- 目的: 生徒概要画面の「Live Sprint」カードでは直近10件しか見えない実施履歴の全件を、
  月ごとにグルーピングして確認する。

## この画面に来る経路

- 生徒概要画面（`/students/[id]`）のLive Sprintカードにある「View history」リンクから遷移する

## 画面の構成

1. **ヘッダー** — 「← Back to Overview」リンクと「Live Sprint History — {生徒名}」という見出し
2. **月別グルーピングされた履歴一覧** — 20件ずつページング読み込み（無限スクロールではなく
   「Show more」ボタン方式）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 月見出し | 新しい年月に切り替わる行の直前にのみ表示。その月の件数・平均スコア（現時点で読み込み済みの範囲での集計）を併記 | 操作なし |
| 履歴行 | 教材名、種別・レベル・実施日時、平均スコア | クリックでLive Sprint結果画面へ遷移する（戻り先はこの履歴一覧画面） |
| 「Show more」的な追加読み込み | まだ全件を読み込んでいない場合 | 次の20件を追加取得して一覧に加える |

月をまたいだ集計（月ごとの正確な件数・平均）を返す専用クエリは無く、あくまで**その時点で
クライアントに読み込み済みの行**から算出しているため、ページ境界をまたいで追加読み込みが
進むと、既に表示済みの月の件数・平均スコアが後から増えることがある。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 空 | 「No lesson sprint history yet.」 | この生徒のLive Sprint実施記録が1件も無い場合 |
| 生徒が見つからない/担当関係が無い | 404ページ | 指定した生徒IDに対して自分が一度も担当関係を持ったことが無い場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/lesson-sprint/history/page.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/history/_components/LessonSprintHistoryList.tsx`
- `apps/coach/app/(app)/students/[id]/_components/LessonSprintHistoryRow.tsx`（生徒概要カードと共用）
- 共通コンポーネント: `apps/coach/components/common/HistoryList.tsx`
- サーバーアクション: `getStudentOverview`（`apps/coach/actions/studentAction.ts`）,
  `getLessonSprintHistoryPage`（`apps/coach/actions/lessonSprintAction.ts`）
