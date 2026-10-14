<!--
  status値・共通ビジネスルールの唯一の参照先。各機能仕様書はここへリンクし、
  値の意味を重複して書かない。値の意味が変わったら、ここだけを書き換える
  （このファイル自体も「今の値」のみを記載し、旧値・変更履歴は書かない）。
  正本は supabase/DDL/table/*.sql のCOMMENT ON COLUMN。乖離に気付いたらそちらを正として更新する。
-->

# 用語・status値集

## com_t_session.status（セッション本体）

| 値 | 意味 |
|---|---|
| 1 | scheduled（予定） |
| 2 | completed（完了。内訳は`completion_result`） |
| 3 | cancelled（キャンセル。起因は`cancel_category`、返還有無は`ticket_refunded`） |

### completion_result（status=2の場合のみ意味を持つ）

| 値 | 意味 |
|---|---|
| 1 | normal（実施完了） |
| 2 | early_ended（生徒の都合で早く終了。理由は`status_note`） |
| 3 | no_show（生徒の欠席。生徒の画面では「未参加」） |

いずれもコーチの申告（End Session = `record_session_outcome`）またはアドミンの修正で決まり、チケットを消化する
（2026-10-14より前に確定した2・3は消化していない。消化の有無は`ticket_consumed`）。
入退室の重なりからの推定は`suggested_outcome`（1: 20分以上 / 2: 20分未満・生徒の入室あり / 3: 生徒の入室なし / NULL: コーチの入室記録なし）。

### conducted_via（status=2の場合のみ意味を持つ）

| 値 | 意味 |
|---|---|
| 1 | アプリ内の通話 |
| 2 | 外部のZoom（アプリの通話が使えなかった場合の代替。理由は`status_note`） |
| NULL | 不明（2026-10-14より前に確定し、コーチの入室記録が無い行） |

`outcome_mismatch` = true は、アプリ内の通話で実施したと申告した結果が推定と違う（コーチが理由を付けた）。アドミンが修正すると false に戻る。

### cancel_category（status=3の場合のみ意味を持つ）

| 値 | 意味 |
|---|---|
| 1 | student（生徒本人によるキャンセル） |
| 2 | coach（コーチ本人によるキャンセル。開始後に End Session で記録した「コーチの欠席」もこの値になる） |
| 3 | admin（アドミン代理操作） |
| 4 | license_ended（ライセンス無効化による自動キャンセル） |
| 5 | coach_reassigned（コーチ交代による自動キャンセル） |
| 6 | technical（通信トラブル等、こちら側の都合で実施できなかった。開始後に End Session で記録。チケットは返還） |

### ticket_refunded（status=3の場合のみ意味を持つ）

チケット（消化枠）を未割当に戻すかどうか。true: 返還（同じコマへ再予約可能）/
false: 返還なし（消化済み扱い）。生徒都合キャンセルは開始12時間以上前ならtrue、
未満ならfalse。コーチ都合・通信トラブル等・アドミン代理・ライセンス無効化・コーチ交代は常にtrue
（アドミン代理のみ明示パラメータで指定）。

## com_t_session_slot_proposal（個別予約リクエスト・振替候補の統合テーブル）

| 項目 | 値 | 意味 |
|---|---|---|
| status | 1 | pending（未回答） |
| status | 2 | accepted（承諾/承認済み） |
| status | 3 | declined（却下、または他候補の承諾による自動不採用） |
| status | 4 | withdrawn（提案者本人による取り下げ。**自由予約リクエストのみ**、振替候補は取り下げ不可） |
| status | 5 | expired（回答期限切れ。**振替候補のみ**、自由予約リクエストは無期限） |
| proposed_by_role | 1 | 生徒が提案（コーチが応答）。自由予約リクエストは常にこの値 |
| proposed_by_role | 2 | コーチが提案（生徒が応答）。振替候補のみ取り得る |

`source_session_id`がNULLなら自由予約リクエスト、設定されていれば振替候補
（キャンセルされたセッションを起因とする提案）。

## com_m_lesson_schedule.status（定期スケジュール枠）

| 値 | 意味 |
|---|---|
| 1 | active（稼働中） |
| 0 | paused（一時停止） |
| 9 | terminated（終了済み。`release_lesson_schedule_slot`等によるコーチ交代・終了で遷移） |

### target_sessions（コマ別セッション目標数）

このコマ(slot_no)が契約上持つべき目標セッション数。承認時に`total_sessions/weekly_frequency`の
均等割り（余りはslot_no昇順に配分）で確定し、以後は不変が原則。`fn_schedule_shortfall()`の
期待値、`fn_generate_sessions_for_schedule()`の生成上限として使う唯一の真実源。管理者が
`admin_adjust_schedule_target_sessions()`で個別枠のみ引き上げ可能（契約全体の`total_sessions`は
変更しない、正当な理由がある追加予約向けの例外措置。引き上げのみ許可、稼働中の枠のみ対象）。

## com_t_matching_request.status（初回マッチング申請）

| 値 | 意味 |
|---|---|
| 1 | pending（承認待ち） |
| 2 | approved（承認） |
| 3 | rejected（否認） |
| 4 | cancelled（生徒による取り下げ。`withdraw_matching_request`、コーチへアプリ内通知） |
| 5 | ended（コーチ交代等によりアドミンが終了） |
| 6 | expired（回答期限切れ。申請から24時間〔`matching_request_ttl()`〕で `fn_expire_matching_requests` が毎分処理。生徒へ `MATCHING_EXPIRED`） |

## 共通ビジネスルール

- **24時間ルール**: 生徒が自ら日時を指定する操作（個別予約リクエストの作成、振替候補の提案）は、
  開始時刻が現在から24時間以上先でなければならない。アドミン代理操作は対象外。
- **12時間ルール（返還可否）**: 生徒都合のキャンセルは、開始12時間以上前なら`ticket_refunded=true`、
  未満なら`false`。
- **ダブルブッキング防止**: コーチ・生徒それぞれの既存の`scheduled`セッションと時間帯が重複する
  日時は、提案・承認のいずれの段階でも拒否される（`check_session_conflict`）。
- **本人 or アドミンのみ操作可**: 予約・提案系RPCは、当事者本人（申請元・応答先）または
  管理者ロールのみが実行できる。第三者による操作は権限エラーになる。
