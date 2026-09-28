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
| 1 | normal（正常終了、コーチ・生徒の通話重複が20分以上） |
| 2 | early_ended（早期終了。20分未満だが生徒入室あり。理由は`status_note`） |
| 3 | no_show（生徒欠席。入室記録なし） |

### cancel_category（status=3の場合のみ意味を持つ）

| 値 | 意味 |
|---|---|
| 1 | student（生徒本人によるキャンセル） |
| 2 | coach（コーチ本人によるキャンセル。コーチ自身の無断欠席事後処理もこの値になる） |
| 3 | admin（アドミン代理操作） |
| 4 | license_ended（ライセンス無効化による自動キャンセル） |
| 5 | coach_reassigned（コーチ交代による自動キャンセル） |

### ticket_refunded（status=3の場合のみ意味を持つ）

チケット（消化枠）を未割当に戻すかどうか。true: 返還（同じコマへ再予約可能）/
false: 返還なし（消化済み扱い）。生徒都合キャンセルは開始12時間以上前ならtrue、
未満ならfalse。コーチ都合・アドミン代理・ライセンス無効化・コーチ交代は常にtrue
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
| 4 | cancelled（生徒による取消） |
| 5 | ended（コーチ交代等によりアドミンが終了） |

## 共通ビジネスルール

- **24時間ルール**: 生徒が自ら日時を指定する操作（個別予約リクエストの作成、振替候補の提案）は、
  開始時刻が現在から24時間以上先でなければならない。アドミン代理操作は対象外。
- **12時間ルール（返還可否）**: 生徒都合のキャンセルは、開始12時間以上前なら`ticket_refunded=true`、
  未満なら`false`。
- **ダブルブッキング防止**: コーチ・生徒それぞれの既存の`scheduled`セッションと時間帯が重複する
  日時は、提案・承認のいずれの段階でも拒否される（`check_session_conflict`）。
- **本人 or アドミンのみ操作可**: 予約・提案系RPCは、当事者本人（申請元・応答先）または
  管理者ロールのみが実行できる。第三者による操作は権限エラーになる。
