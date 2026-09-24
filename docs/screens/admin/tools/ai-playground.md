# AI Playground（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/tools/ai-playground`
- 対象ロール: `admin`, `content_manager`（サイドバーの「Tools」グループ配下）
- 目的: Gemini APIを使ったAI機能（チャット応答・英文翻訳）の挙動を検証するための内部ツール。

## この画面に来る経路

- サイドバーメニューの「Tools」グループ内「AI Playground」から遷移する。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文
2. **タブ切り替え** — 「AI Chat」／「英文翻訳」の2タブ

### AI Chatタブ

- 「ヘルプ記事を参照する（RAG）」のON/OFFスイッチ、会話をクリアするボタン
- チャット欄（ユーザー発言・AI応答を吹き出し形式で表示、AI応答はストリーミングで逐次表示される）
- AI応答がAI Knowledge Baseのナレッジを参照した場合、その記事タイトルのバッジが応答の下に表示される
- メッセージ入力欄（Shift+Enterで改行、Enterで送信）

### 英文翻訳タブ

- 英文入力欄
- 「学習者向け補足説明を含める」ON/OFFスイッチ
- 「翻訳する」ボタン
- 翻訳結果表示欄（日本語訳、補足説明を含めた場合はその説明も表示）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「ヘルプ記事を参照する（RAG）」スイッチ | AI Chatタブ常時表示 | ONの場合、送信した質問に対してAI Knowledge Baseの検索結果を踏まえた回答が返る |
| Clearボタン | AI Chatタブ、メッセージが1件以上ある場合のみ有効 | 会話履歴と参照ナレッジ表示をすべて消去する |
| メッセージ送信 | AI Chatタブ、入力欄に文字がある場合 | `/api/ai/chat`にリクエストし、AI応答をストリーミングで表示する。失敗時はトースト通知が出て、直前のユーザー発言は履歴に残るがAI応答枠は取り消される |
| 「翻訳する」ボタン | 英文翻訳タブ、入力欄に文字がある場合 | `/api/ai/translate`にリクエストし、結果欄に日本語訳（と補足説明）を表示する |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| チャット初期状態 | 「質問を入力してヘルプアシスタントの回答を検証できます。」 | メッセージが1件も無い場合 |
| チャット応答待ち | AI発言の吹き出しにローディングアイコン | 送信直後、応答本文がまだ届いていない間 |
| チャットエラー | 「Geminiへのリクエストに失敗しました」のトースト | `/api/ai/chat`がエラーを返した場合 |
| 翻訳エラー | 「翻訳リクエストに失敗しました」のトースト | `/api/ai/translate`がエラーを返した場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/tools/ai-playground/page.tsx`
- `apps/admin/app/(app)/tools/ai-playground/_components/AIPlaygroundTabs.tsx`
- `apps/admin/app/(app)/tools/ai-playground/_components/ChatPlayground.tsx`
- `apps/admin/app/(app)/tools/ai-playground/_components/TranslatePlayground.tsx`
- APIルート: `/api/ai/chat`（ストリーミング応答、RAG検索結果は`X-Knowledge-Sources`ヘッダーで返す）,
  `/api/ai/translate`
