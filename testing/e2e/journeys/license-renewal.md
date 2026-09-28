# 既存顧客の契約継続フロー

## 概要

- 対象ロール: アドミン、生徒（ライブセッション付プランの場合はコーチも関与）
- なぜ重要か: 既存顧客の生徒が契約を継続できなければ解約に直結するため、新規利用開始と並んで最優先で検証すべきフロー。既存顧客に新規生徒を追加する場合も、顧客（テナント）作成・教材紐づけが不要な点を除きほぼ同じ流れになる（[new-customer-onboarding.md](./new-customer-onboarding.md)のステップ4〜8を参照）。

## ステップ

| # | 実行者 | 操作 | 参照仕様書 | 補足 |
|---|---|---|---|---|
| 1 | アドミン | 継続用の契約を作成する | [docs/screens/admin/contracts/list.md](../../../docs/screens/admin/contracts/list.md)（画面仕様のみ）。業務フロー仕様書は未整備 | |
| 2 | 生徒 | 継続用の契約ライセンスでコーチマッチングを申請する | [docs/screens/student/coach-matching.md](../../../docs/screens/student/coach-matching.md), [docs/screens/coach/matching-requests.md](../../../docs/screens/coach/matching-requests.md)（画面仕様のみ）。業務フロー仕様書は未整備（`matching/`ドメイン） | 契約ライセンスごとにマッチングが必要（前の契約のマッチングは引き継がれない） |

## 業務ルール（要検証）

- **「有効な契約ライセンスは期間内に1件のみ」** とユーザーから共有されたが、`com_t_user_license`テーブルのDDLを確認した限り、これを強制する一意制約（例: `user_id`+期間の重複防止）は見当たらなかった。アプリケーション側のロジック（契約作成・ライセンス発行のサーバーアクション）で担保しているのか、実際には未強制なのかを確認してから、[_GLOSSARY.md](../specs/_GLOSSARY.md)の共通ビジネスルールに追記する。

## 未整備の依存ドメイン

- **顧客・契約管理**（継続用契約の作成） — [new-customer-onboarding.md](./new-customer-onboarding.md)と共通の依存
- **マッチング（継続）** — `matching/`ドメインの業務フロー仕様書が無い。新規マッチングと継続マッチングで承認フロー自体は同じRPC（`approve_matching_request`）と思われるが、「契約ライセンス単位」という前提の検証も含めて別途整理が必要
