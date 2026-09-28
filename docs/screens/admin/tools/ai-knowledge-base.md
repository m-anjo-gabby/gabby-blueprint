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

1. **ヘッダー** — 画面タイトルと説明文
2. **検索・絞り込みバー** — タイトル／本文でのキーワード検索、区分（ヘルプ記事／AIコーチ知識／
   ロールプレイシナリオ）での絞り込み、「新規ナレッジ登録」ボタン
3. **ナレッジ一覧** — カード形式。区分アイコン・区分バッジ・タイトル・本文の抜粋、各カード
   ホバー時に編集／削除アイコンが表示される
4. **登録・編集ダイアログ**
5. **削除確認ダイアログ**

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 検索ボックス | 常時表示 | タイトル・本文で絞り込み、Enterで検索を実行する |
| 区分フィルタ | 常時表示（すべての区分／ヘルプ記事／AIコーチ知識／ロールプレイシナリオ） | 選択した区分のみに絞り込む |
| 「未Embedding」バッジ | そのエントリにEmbeddingが未生成の場合 | — |
| 「新規ナレッジ登録」ボタン | 常時表示 | 登録ダイアログを開く |
| 各カードの編集アイコン | カードホバー時に表示 | 編集ダイアログを開く（区分・タイトル・本文が初期値として入る） |
| 各カードの削除アイコン | カードホバー時に表示 | 削除確認ダイアログを開く |
| ページ送り | 全件数が0件より多い場合に表示（1ページ10件） | 前後のページへ遷移する |

## 登録・編集ダイアログ

- 入力項目: 区分（ヘルプ記事／AIコーチ知識／ロールプレイシナリオ）、タイトル、本文
- 「保存する」を押すと本文からEmbeddingが自動生成され、保存完了後にAIチャットのRAG検索対象になる
  （保存中はボタンが「保存中（Embedding生成）...」と表示される）

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| ナレッジ0件（未登録） | 「ナレッジがまだ登録されていません」 | 全体でナレッジが1件も登録されていない場合 |
| 検索結果0件 | 「該当するナレッジが見つかりません」 | 検索・絞り込み条件に一致するナレッジが無い場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/tools/ai-knowledge-base/page.tsx`
- `apps/admin/app/(app)/tools/ai-knowledge-base/_components/KnowledgeEntryList.tsx`
- `apps/admin/app/(app)/tools/ai-knowledge-base/_components/KnowledgeEntryFormDialog.tsx`
- `apps/admin/app/(app)/tools/ai-knowledge-base/_lib/knowledgeSourceTypes.ts`
- `apps/admin/actions/aiKnowledgeBaseAction.ts`（`getKnowledgeEntries`,
  `saveKnowledgeEntryAction`, `deleteKnowledgeEntryAction`。RPCは使わず`com_m_ai_knowledge_base`
  テーブルを直接操作する。保存時にEmbeddingをこのサーバーアクション内で生成する）
