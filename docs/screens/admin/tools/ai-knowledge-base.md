# AI Knowledge Base（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/tools/ai-knowledge-base`
- 対象ロール: `admin`, `content_manager`（サイドバーの「Tools」グループ配下）
- 目的: AIチャット（RAG検索）が回答の根拠として参照するナレッジ（ヘルプ記事・AIコーチ知識・
  ロールプレイシナリオ）を登録・編集・削除する。

## この画面に来る経路

- サイドバーメニューの「Tools」グループ内「AI Knowledge Base」から遷移する。

## 画面の構成

1. **ヘッダー** — 画面タイトル、説明文、「新規ナレッジ登録」ボタン
2. **ナレッジ一覧** — 表形式（更新の新しい順）。検索・区分の絞り込み・条件のクリア・件数・ページ送りの操作欄と、
   区分バッジ・タイトルと本文の抜粋・Embeddingのモデル（未生成は「未Embedding」）・編集／削除アイコンの列
3. **登録・編集ダイアログ**
4. **削除確認ダイアログ**

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 検索ボックス | 常時表示 | タイトル・本文の部分一致で検索。Enterまたは「検索」ボタンで確定し、URLの`q`に反映する（1ページ目に戻る）。入力した文字はそのまま文字として検索する（`%`・`,`等も特別な意味を持たない） |
| 区分フィルタ | 常時表示（すべての区分／ヘルプ記事／AIコーチ知識／ロールプレイシナリオ） | 選択した区分のみに絞り込む（URLの`type`。1ページ目に戻る） |
| 「条件をクリア」ボタン | 常時表示（検索語・絞り込みが無いときは押せない） | 検索語・絞り込み・ページをすべて外し、初期状態の一覧に戻す |
| 「未Embedding」バッジ | そのエントリにEmbeddingが未生成の場合 | — |
| 「新規ナレッジ登録」ボタン | 常時表示 | 登録ダイアログを開く |
| 各行の編集アイコン | 各行に表示 | 編集ダイアログを開く（区分・タイトル・本文が初期値として入る） |
| 各行の削除アイコン | 各行に表示 | 削除確認ダイアログを開く |
| 件数・ページ送り（前へ・次へ） | 常時表示（「全 n 件」、1ページ10件。先頭・末尾では該当ボタンが無効） | 前後のページへ移る（URLの`page`） |

## 登録・編集ダイアログ

- 入力項目: 区分（ヘルプ記事／AIコーチ知識／ロールプレイシナリオ）、タイトル、本文
- 「保存する」を押すと本文からEmbeddingが自動生成され、保存完了後にAIチャットのRAG検索対象になる
  （保存中はボタンが「保存中（Embedding生成）...」と表示される）

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| ナレッジ0件（未登録） | 「ナレッジがまだ登録されていません」 | 検索・絞り込みの条件が無く、ナレッジが1件も登録されていない場合 |
| 検索結果0件 | 「該当するナレッジが見つかりません」 | 検索・絞り込み条件に一致するナレッジが無い場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/tools/ai-knowledge-base/page.tsx`
- `apps/admin/app/(app)/tools/ai-knowledge-base/_components/KnowledgeEntryDataTable.tsx`, `_components/columns.tsx`, `_lib/list.ts`（絞り込みのURLのクエリ名）
- `apps/admin/components/list/`（一覧の共通部品）, `apps/admin/lib/list.ts`。E2E: `testing/e2e/tests/admin/list-filters.spec.ts`（仕様: `testing/e2e/specs/admin/list-filters.md`）
- `apps/admin/app/(app)/tools/ai-knowledge-base/_components/KnowledgeEntryFormDialog.tsx`
- `apps/admin/app/(app)/tools/ai-knowledge-base/_lib/knowledgeSourceTypes.ts`
- `apps/admin/actions/aiKnowledgeBaseAction.ts`（`getKnowledgeEntries`,
  `saveKnowledgeEntry`, `deleteKnowledgeEntry`。RPCは使わず`com_m_ai_knowledge_base`
  テーブルを直接操作する。保存時にEmbeddingをこのサーバーアクション内で生成する）
