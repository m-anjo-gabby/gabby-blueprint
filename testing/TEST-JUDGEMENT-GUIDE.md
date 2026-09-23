# テスト判断基準ガイド(TEST-JUDGEMENT-GUIDE)

テスト実施中に得られた気づき・失敗事例を蓄積し、同じ種類のミスを繰り返さないためのファイル。
新しい事例は本ファイル末尾に追記する。技術的な標準ルールは [CONVENTIONS.md](./CONVENTIONS.md) を参照。

データ主体テスト（`testing/features/`）だけでなく、[`testing/e2e/specs/`](../e2e/README.md)の
機能仕様書を使った作業中に見つかった「実装と仕様書の齟齬」「非自明な挙動」もここに記録してよい
（`e2e/specs/`側は現状の仕様のみを保つ方針のため、経緯・気づきの蓄積先は本ファイルに一本化する）。
その場合は「該当シナリオ」の代わりに「該当仕様書」として`testing/e2e/specs/`配下のパスを記載する。
蓄積された内容のうち恒久的に反映すべきものは、次にその仕様書を更新するタイミングで反映する。

## 記入フォーマット

```
### KJ-<YYYYMMDD>-<連番> <短いタイトル>

- **該当シナリオ**: testing/features/... へのパス
- **事象**: 何が起きたか
- **原因**: なぜ起きたか
- **対処**: どう解決したか / 今後どう回避するか
- **判断基準への反映**: この事例から一般化できる教訓
```

---

### KJ-2026-0904-01 リリース未反映によるセッション消化数の不整合(cancel_session 2段階更新)

- **該当シナリオ**: `testing/features/branches/feature-20260904-dev/live-session-data-integrity.feature`
- **事象**: QA生徒5（過去契約+現在契約パターン）のテストで、セッションのステータスは `completed` になっているのに、契約の `used_sessions`（チケット使用数）が実消化数と一致しない不整合が発生した。
- **原因**: `cancel_session` のUPDATE処理が「①ステータス更新」「②チケット使用数更新」の2段階に分かれており、以下2つのリリースstepが未反映のまま進めてしまった。
  - Step33: `com_t_session.status` に値10を追加するCHECK制約の更新
  - Step34: `cancel_session` の新シグネチャ反映
  片方（Step34）だけが未反映の状態で処理が部分的に成功し、ステータスと使用数の更新が食い違う状態が生まれた。
- **対処**: Step33・Step34を適用後、手動で整合性を取り直した（used_sessionsを実消化数に合わせ、契約上限を超えていた1件を `no_show` に変更）。以降は全生徒のライセンス/チケット/スケジュール/セッションの整合性を最終確認してからテスト完了とした。
- **判断基準への反映**:
  - **複数テーブル・複数段階の更新を行うRPCは、一部のstepだけ未反映でも「エラーにならず部分的に成功してしまう」ことがある。** テスト失敗ではなく「一見成功しているが数値が合わない」形で現れるため、結果整合性(used_sessions等の集計値とステータスの実カウント)を必ず突合すること。
  - staging・devどちらでも、**テスト実行前に対象RPCのpreflightチェック（`testing/helpers/preflight.ts`）を必ず行う**。既に定着している運用ではあるが、複数stepにまたがるリリースでは「全stepが揃っているか」を個別に確認すること（1つのRPCが存在する＝関連する全stepが適用済み、とは限らない）。
  - CHECK制約の変更（Step33のような）はRPCの存在確認だけでは検出できない。スキーマ変更を伴うstepがある場合は、RPC存在チェックに加えて「意図した値でのUPDATEが通るか」の軽い動作確認も検討する。

---

### KJ-2026-0910-01 「完了済みセッション」はRPC経由では過去日付を生成できない

- **該当シナリオ**: `testing/features/branches/feature-20260904-dev/seed.ts`（②の自動再投入スクリプト実装時）
- **事象**: `admin_match_student_with_coach` で生徒とコーチを直接マッチングさせても、生成される`com_t_session`は必ず「今日以降」の日付になり、過去に完了済みのセッション（QA生徒1の「完了6件」等）を再現できなかった。
- **原因**: `admin_match_student_with_coach.sql` の `v_start_date := GREATEST(v_license_start, CURRENT_DATE);` が、ライセンスの開始日がどれだけ過去でも、スケジュールの生成起点を常に「今日」にクランプしている。これは意図的な設計（アドミンが過去に遡ってセッションを捏造できないようにする安全策）であり、バグではない。
- **対処**: 「過去に完了した実績」が必要なテストデータは、`com_m_lesson_schedule`・`com_t_session`を`service_role`で直接INSERTして再現し（status=1で仮生成）、その後 `resolve_stale_session` RPC（実際にサインインしたコーチ or アドミンのJWT）を1件ずつ呼んで`completed`に遷移させる、というハイブリッド方式を採用した。`resolve_stale_session`はRPC内で`used_sessions`加算と`com_t_user_session_ticket_history`への記録を自動で行うため、手動でのused_sessions調整は不要だった。一方、「今日以降の予定で足りる」データ（コーチ交代後の新規予定等）は素直に本物のRPC（`admin_match_student_with_coach`等）で生成する方が安全・簡単。
- **判断基準への反映**:
  - **「過去の実績」と「現在〜未来の予定」を明確に分けて設計する。** 前者はservice_role直接INSERT＋RPCでの状態遷移（resolve_stale_session等）のハイブリッド、後者は素直に本物のRPCを使う。全部をRPC経由で作ろうとすると、このようなクランプ制約に阻まれることがある。
  - `cancel_session`・`reschedule_session`・`book_makeup_session`はいずれも「対象セッションが未来（`start_datetime > NOW()`）であること」が前提条件。過去セッションの状態を変えたい場合はこれらのRPCの対象にならない（`resolve_stale_session`または`finalize_session`のみが対象）。
  - 生徒本人によるセルフサービス操作（`reschedule_session`を生徒自身が呼ぶ等）は、`com_m_coach_availability`（コーチの空き時間設定）のチェックを通る必要がある。アドミン代理操作はこのチェックをスキップするため気づきにくいが、**新規に作成したコーチアカウントは空き時間が一件も無い状態**なので、生徒セルフサービスのテストシナリオでは事前に空き時間を作成しておく必要がある（`testing/features/branches/feature-20260904-dev/seed.ts`の`ensureCoachAvailability`を参照）。

---

### KJ-2026-0912-01 廃止RPCの存在確認は42883だけでなくPGRST202も見る必要がある

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/seed.ts`（preflightの`assertRpcRemoved`実装時）
- **事象**: `supabase/release/20260911_feature-20260911-dev_release.sql` 適用後のdev環境に対し、
  `reschedule_session`/`book_makeup_session`/`decline_session_reschedule_proposal`（いずれも
  同リリースでDROP FUNCTIONしたはずの旧RPC）が「まだ存在する」と誤判定され、preflightで
  テストが停止した。
- **原因**: `assertReleaseApplied`と対になる「削除確認」ヘルパー(`assertRpcRemoved`)を、
  既存の`UNDEFINED_FUNCTION = "42883"`（Postgresのundefined_function）とだけ突き合わせる
  実装にしていた。実際に該当RPCを直接呼び出して調べたところ、DROP FUNCTION自体は正しく
  適用済みで、supabase-js経由のエラーコードは`42883`ではなく`PGRST202`
  （`Could not find the function ... in the schema cache`）だった。PostgRESTは関数名+
  引数名の組み合わせをスキーマキャッシュ上で解決できない場合、Postgresに問い合わせる前に
  この時点で弾くため、「本当に存在しない関数」を呼んだ場合は42883まで到達しない。
- **対処**: `testing/helpers/preflight.ts`に`POSTGREST_FUNCTION_NOT_FOUND = "PGRST202"`を追加し、
  `42883`・`PGRST202`のいずれでも「存在しない」と判定する`isFunctionNotFoundError()`に統一した。
  `assertReleaseApplied`（存在確認）・`assertRpcRemoved`（削除確認）の両方をこの関数経由に修正。
- **判断基準への反映**:
  - **RPCの「存在しない」判定は`42883`単独ではなく`PGRST202`も含めて判定すること。**
    `assertReleaseApplied`は「存在する（＝42883以外全部）」を条件にしていたため今まで問題が
    表面化しなかったが、「存在しない」ことを確認する用途（廃止RPCの削除確認、今後追加され得る
    他のnegativeチェック）では同じ考慮が必須。
  - エラーコードの実際の値は必ず一度、対象クライアント（supabase-js等、PostgREST経由）で
    直接叩いて確認してから判定ロジックを書く。Postgresの生のSQLSTATEとPostgREST層が返す
    エラーコードは別物であることを前提にする。

### KJ-2026-0914-01 RPC存在確認(preflight)だけでは関数「本体」の不具合を検出できない

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-seed.ts`
- **事象**: `assertReleaseApplied`でのpreflightは全RPC「存在」を確認しOKだったにも関わらず、
  `admin_match_student_with_coach`（内部で`fn_generate_sessions_for_schedule`を呼ぶ）の
  実行が `42P10 (no unique or exclusion constraint matching the ON CONFLICT specification)`
  で必ず失敗した。
- **原因**: 2026-09-12の「Wブッキング防止の一意制約を有効な予約枠のみに限定」パッチで
  `uq_session_schedule_datetime`を`WHERE status = 1`の部分一意インデックスに変更した際、
  `fn_generate_sessions_for_schedule()`内の`ON CONFLICT (schedule_id, start_datetime)`に
  同じWHERE句を追記し忘れていた。部分一意インデックスをON CONFLICTの推論対象にするには
  INSERT側にも同一のWHERE句が必須というPostgresの仕様により、実際の重複有無に関わらず
  常にエラーになる。2026-09-12以降、本関数を経由するセッション生成が全件失敗する状態が
  続いていたが、それ以降どのテストシナリオもこの経路(実際のセッション生成)を
  通していなかったため発覚しなかった。
- **対処**: `ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING`に修正し、
  リリースSQLに追加パッチとして追記した。
- **判断基準への反映**:
  - **`assertReleaseApplied`（ダミー引数でのRPC呼び出し）は「関数が存在し、シグネチャが
    一致している」ことしか保証しない。関数本体のロジック不具合（今回のようなON CONFLICT
    とインデックスの不一致、CHECK制約の考慮漏れ等)は検出できない。** KJ-2026-0904-01でも
    同様の教訓（CHECK制約変更はRPC存在確認だけでは検出できない）が既出だったが、
    今回は「一意インデックスをWHERE句付きに変更したら、それを参照する全てのON CONFLICT節を
    洗い出して追従させる」という横断的な確認が必要なケースだった。
  - **一意インデックスをpartial(WHERE句付き)に変更するリリースでは、そのインデックスを
    ON CONFLICTの対象にしている全関数を`grep`等で洗い出し、WHERE句を同期させること。**
    今回は該当が1関数のみだったが、対象が複数ある場合は見落としやすい。
  - データ主体テストは「新機能が正しく動くか」だけでなく、「普段テストされていない
    既存の経路が生きているか」も検出できる。今回のように、しばらく誰も通していない
    コードパスをテストで初めて実行すると、無関係な既存の不具合が見つかることがある
    （テスト対象外だからと無視せず、発見した時点で報告・修正すること）。

---

### KJ-2026-0914-02 com_t_session.ticket_idはcom_t_user_session_ticketへのFKにCASCADEが無い

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-cleanup.ts`
- **事象**: テストデータ削除処理で、`com_t_user_license`を削除(CASCADEでticket/scheduleまで
  連鎖する想定)しようとしたところ、`update or delete on table "com_t_user_session_ticket"
  violates foreign key constraint "com_t_session_ticket_id_fkey" on table "com_t_session"`
  (23503)で失敗した。
- **原因**: `com_m_lesson_schedule.ticket_id`は`ON DELETE CASCADE`だが、`com_t_session.ticket_id`
  （集計用の非正規化参照）には`ON DELETE CASCADE`が設定されていない。ticket削除時、
  schedule経由のCASCADEでsession行も連鎖削除される「はず」と考えたが、
  `com_t_session.ticket_id`からticketへの直接のFK制約は独立して評価されるため、
  session側にまだ行が残っている限りticket削除は拒否される。
- **対処**: `com_t_user_license`を削除する前に、対象ticket_idに紐づく`com_t_session`行を
  明示的に削除する一手順を追加した（schedule_id経由のCASCADEに任せず、ticket_id経由で
  直接削除する）。
- **判断基準への反映**:
  - **「主キーAがテーブルBにCASCADEで伝播するはず」という前提を置く前に、削除対象の
    子テーブルが複数の経路(直接のFKと、別テーブル経由の間接的な参照)を持っていないか
    DDLで確認すること。** 今回はcom_t_sessionがschedule_id経由(間接、CASCADEあり)と
    ticket_id経由(直接、CASCADE無し)の両方でticketに関連しており、片方だけ確認して
    「連鎖するはず」と判断したのが誤りだった。
  - テストデータ削除スクリプトを書く際は、DDLの`REFERENCES ... ON DELETE`を
    テーブルごとに全て`grep`し、CASCADE/RESTRICT(デフォルト)を一覧化してから
    削除順序を設計すること。「よく使うテーブルの主要な1本のFKだけ見て判断する」と
    今回のような見落としが起きる。

### KJ-2026-0915-01 com_t_session_booking_request.resulting_session_idはcom_t_sessionへのFKにCASCADEが無い

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-cleanup.ts`
- **事象**: テストデータ削除処理で、`com_t_session`をticket_id経由で一括削除しようとしたところ、
  `update or delete on table "com_t_session" violates foreign key constraint
  "com_t_session_booking_request_resulting_session_id_fkey" on table
  "com_t_session_booking_request"` (23503) で失敗した。
- **原因**: `com_t_session_booking_request`は`schedule_id`/`student_id`/`coach_id`への
  FKはいずれも`ON DELETE CASCADE`だが、承認時に確定した新セッションを指す
  `resulting_session_id`（`com_t_session`への参照）だけは非CASCADEになっている
  （KJ-2026-0914-02の`com_t_session.ticket_id`と同種のパターンが、今度は
  `com_t_session_booking_request`側から`com_t_session`を指す向きで発生していた）。
  削除スクリプトが`com_t_session_booking_request`の削除を`com_t_session`削除の**後**に
  置いていたため、まだ残っている`resulting_session_id`参照がFK違反になった。
- **対処**: `com_t_session_booking_request`の削除を`com_t_session`削除より**前**に
  移動した（`com_t_session_reschedule_proposal`は`session_id`が`ON DELETE CASCADE`のため
  この問題は起きない。`resulting_session_id`という同名カラムを持つが、CASCADE対象の
  `session_id`経由で行ごと連鎖削除されるため実害が出なかった）。
- **判断基準への反映**:
  - **「〜_id」という名前の列が同じテーブルに複数ある場合、片方だけCASCADEでもう片方が
    非CASCADEという非対称なケースがあり得る。** 削除順序を設計する際は、テーブル単位で
    「CASCADEされるか」を一括判断せず、**列単位**でDDLの`REFERENCES ... ON DELETE`を
    確認すること（KJ-2026-0914-02の教訓の延長）。
  - 「申請/リクエスト系テーブル(status管理、pending→resolved)」が、確定後に生成された
    実体（今回は`com_t_session`）を`resulting_*_id`のような形で後から参照するパターンは
    このドメインで複数箇所に存在する(`com_t_session_booking_request`,
    `com_t_session_reschedule_proposal`, `com_t_matching_request`→`com_m_lesson_schedule`等)。
    新しいテストシナリオでテストデータ削除スクリプトを書く際は、対象ドメインの「申請系」
    テーブルすべてについて`resulting_*_id`相当のカラムのCASCADE有無を個別に確認すること。

### KJ-2026-0915-02 RPCへの引数追加は、既存の検証スクリプト側の呼び出しも全箇所洗い出して更新する必要がある

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-verify.ts`
  （シナリオ5: `cancel_session`のアドミン代理キャンセル検証）
- **事象**: スロット提案統合(Phase4)のリグレッションテストで、アドミン代理による
  `cancel_session`呼び出しが`not authorized to cancel this session`で失敗した(NG 3件)。
  DB側の関数自体は正常で、テストスクリプト側の呼び出しに問題があった。
- **原因**: 同日内の別フェーズ(admin-proxy判定の明示化、KJ記載の「29.」セクション)で
  `cancel_session`に`p_as_admin boolean DEFAULT false`パラメータを追加し、アドミン代理操作は
  呼び出し側が明示的に`p_as_admin: true`を渡す設計に変更した。この検証スクリプトの
  該当行は、パラメータ追加より前に書かれたままで更新されておらず、`p_as_admin`を渡さず
  （＝デフォルトfalse＝非アドミン扱い）呼び出していたため、当事者本人チェックに引っかかって
  権限エラーになっていた。
- **対処**: 呼び出し箇所に`p_as_admin: true`を追加。テストデータを作り直して再実行し、
  54件全てOKになることを確認した。
- **判断基準への反映**:
  - **SECURITY DEFINER関数にデフォルト引数を追加する変更（シグネチャの後方互換な拡張）は、
    「エラーにならず動く」ため既存の検証スクリプトのコンパイル・型チェックでは検出できない。**
    デフォルト値が本番の意図と異なる分岐に静かに倒れる（今回は`p_as_admin`のデフォルトfalseが
    「アドミンではない一般ユーザーとしての呼び出し」を意味し、アドミン代理フローのテストが
    誤って非アドミン権限チェックを踏んでしまった）ケースは、実行してassertionが失敗する
    まで気づけない。RPCのパラメータを追加・変更した際は、型チェックが通ることに加えて、
    `grep`等でそのRPCを呼んでいる全てのテストスクリプト（同一シナリオ内だけでなく、
    `testing/features/`配下の他シナリオ・他ブランチのスクリプトも含む）を洗い出し、
    新パラメータが必要な呼び出し箇所を全て更新すること。
  - 検証（verify）スクリプトはシーケンシャルにDB状態を変化させていく（マッチング承認、
    ライセンス無効化等）ため、**一部のcheckだけ修正して同じseedデータに対して再実行する
    ことはできない**（既に承認済みのリクエストを再承認しようとして別の場所で失敗する等）。
    修正後は必ずcleanup→seed→verifyを新しいtagでやり直すこと。
  - **【2026-09-15追記】同じ見落としが`session-lifecycle-refactor-verify.ts`にも存在していた。**
    アドミンの振替(admin_reschedule_session)廃止のリグレッション確認中に発覚。
    `cancel_session`のアドミン代理キャンセル(4-5節、返還あり/なしの明示指定)呼び出し2箇所も
    `p_as_admin: true`が漏れたままだった。session-24h-and-auth-refactor-verify.tsを直した際に
    「同じRPCを呼んでいる他のテストスクリプトも洗い出す」という教訓を得たはずが、その洗い出しが
    不十分だった（グループ全体をgrepで洗い出したつもりが、実際には目視で見つけた1ファイルだけ
    直して終わりにしていた）。**「grepで洗い出す」は一度書いた教訓を次の機会に本当に実行するまでが
    重要**で、教訓を記録しただけでは同じミスを繰り返す。次に同種の修正をする際は、
    `grep -rn "cancel_session.*p_admin_refund_ticket" testing/`のように対象パターンで
    横断検索し、ヒットした全ファイルを機械的にチェックすること。

### KJ-2026-0916-01 com_m_lesson_scheduleへの直接INSERTは、2026-09-14以降target_sessions(NOT NULL)の指定が必須

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/training-report-comment-seed.ts`
- **事象**: `my-students-grouping-seed.ts`の`seedSchedule`をそのまま流用してcom_m_lesson_scheduleへ
  直接INSERTしたところ、`null value in column "target_sessions" of relation
  "com_m_lesson_schedule" violates not-null constraint` (23502)で失敗した。
- **原因**: `supabase/DDL/table/com_m_lesson_schedule.sql`の「コマ別セッション目標数
  (target_sessions)の追加 (2026-09-14)」パッチで、このカラムがNOT NULLになった。既存の
  `my-students-grouping-seed.ts`・`session-24h-and-auth-refactor-seed.ts`等が書かれた時点では
  このカラムが無かった（またはNULL許容だった）ため、当時は素通りしていた。target_sessionsは
  「total_sessions/weekly_frequencyの均等割り、余りはslot_no昇順に配分」という計算値で、
  `admin_match_student_with_coach`等のRPC経由の生成では自動計算されるが、テストスクリプトで
  `com_m_lesson_schedule`に直接INSERTする場合は自分で計算して渡す必要がある。
- **対処**: `seedSchedule`ヘルパーに`plan: Plan`引数を追加し、
  `Math.floor(total_sessions/weekly_frequency) + (slot_no <= total_sessions%weekly_frequency ? 1 : 0)`
  でtarget_sessionsを計算してINSERTに含めるよう修正した。
- **判断基準への反映**:
  - **`com_m_lesson_schedule`へ直接INSERTするテストスクリプトを新規に書く／既存のものを
    今後再実行する際は、必ずtarget_sessionsを計算して渡すこと。** 素直に本物のRPC
    (`admin_match_student_with_coach`等)経由で生成する場合は対応不要（RPC側で自動計算される）。
  - **既存の`my-students-grouping-seed.ts`・`session-24h-and-auth-refactor-seed.ts`等、
    2026-09-14より前に書かれた`com_m_lesson_schedule`直接INSERT系のseedスクリプトは、
    今後再実行すると同じ23502エラーで失敗する可能性が高い。** これらを再実行する機会があれば、
    本シナリオと同様の修正を先に行うこと（`grep -rln "from(\"com_m_lesson_schedule\")\\s*$\|insert({" testing/features/`
    等でcom_m_lesson_scheduleへの直接INSERT箇所を横断的に洗い出せる）。
  - スキーマにNOT NULL列を追加するDDLパッチは、既存のテストスクリプトの「実行が壊れる」形で
    影響することがある。RPC存在確認(preflight)の対象外（RPCを経由しない直接INSERT）である
    ため、事前に気づく手段が無い。DDLパッチのコミット時に「このテーブルに直接INSERTしている
    testing配下のスクリプトが無いか」もざっと確認するのが理想だが、現実的には「他シナリオの
    再実行時に初めて発覚し、その都度本ファイルに追記して共有する」運用で蓄積していく。

### KJ-2026-0917-01 fn_consume_session_ticket()がdev環境に未反映で、resolve_stale_sessionのnormal(1)解決がPostgres 42883で失敗する

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/coach-no-show-resolution-verify.ts`
  （シナリオ2: normal(1)解決の回帰確認。coach_no_show(4)のメイン検証自体は11/11 OK）
- **事象**: `resolve_stale_session(p_session_id, p_resolution=1, p_reason)`をコーチ本人のJWTで
  呼び出すと、`function public.fn_consume_session_ticket(uuid, text) does not exist`で失敗した。
  RPC自体(`resolve_stale_session`)はpreflight(`assertReleaseApplied`)でOKと判定されていたが、
  その内部からPERFORMしている`fn_consume_session_ticket`が原因だった。
- **原因**: `fn_consume_session_ticket(p_ticket_id uuid, p_note text DEFAULT NULL)`は
  `supabase/DDL/function/fn_consume_session_ticket.sql`・リリースSQL(セクション28
  「マッチング成立処理・一括キャンセル処理・チケット消費処理の共通化」)の両方に正しく
  存在するが、dev環境には**そもそも作成されていなかった**（1引数版が別途存在するのでもなく、
  完全に未反映）。診断のため`createAdminClient()`から直接1引数・2引数の両方で叩いたところ、
  どちらも`PGRST202`（PostgRESTのスキーマキャッシュ上に見つからない＝関数が存在しない）で
  一致した。`resolve_stale_session`・`fn_schedule_shortfall`等、本関数を直接呼ばない他のRPCの
  preflightは正常に通っていたため、このギャップは今回のように`fn_consume_session_ticket`を
  実際に経由するテスト（normalでのチケット消費）を通すまで発覚しなかった。
- **対処**: 本ファイル発見時点では未対処。ユーザーへ、`supabase/release/`の
  `fn_consume_session_ticket`定義(uuid, text DEFAULT NULL)をdev環境へ適用するよう報告した。
  なお本セッションで実装した新機能(coach_no_show=4分岐)はこの関数を呼ばない経路(status=3の
  分岐でRETURNする)のため影響を受けておらず、11/11 OKで検証済み。normal(1)側の回帰確認3件
  のみNGとして切り分けて報告した。
- **判断基準への反映**:
  - **`assertReleaseApplied`のpreflightリストには、対象シナリオが呼ぶRPCが「内部で
    PERFORMする別のSECURITY DEFINER関数」も含めること。** 今回は`resolve_stale_session`
    自体の存在確認はOKだったが、その内部が依存する`fn_consume_session_ticket`は
    チェック対象に入れていなかった。RPCの実装を`grep`等で確認し、`PERFORM public\.\w+\(`
    のような内部呼び出しがあれば、それも独立したpreflightチェック項目に加えるべきだった
    （KJ-2026-0914-01の「関数本体の不具合はpreflightでは検出できない」と同種だが、
    今回は「呼び出し先の別関数が丸ごと存在しない」という、より単純だが見落としやすいケース）。
  - **内部専用ヘルパー関数（`REVOKE ... FROM PUBLIC, anon, authenticated`されたもの）も、
    service_roleクライアントからは直接`.rpc()`で疎通確認できる。** authenticated等への
    実行権限が絞られていても、それは「アプリのユーザーから直接叩かせない」ためのアクセス
    制御であり、service_role（テストの疎通確認用）はこの制約を受けない。今回のように
    「対象RPCが正常経路の一部としてしか呼ばれない内部関数」を疑う場合、ダミー引数で
    直接叩いて`PGRST202`かどうかを見るのが手軽な切り分け方法。
  - **通常完了(completion_result=normal)を経由するテストケースは、コーチ無断欠席や
    no_show等の「チケットを消費しない」分岐だけでなく、必ず1つは含めること。**
    使用実績のあるチケット消費(`fn_consume_session_ticket`)は、正常完了パスでしか
    通らない実行経路であるため、そこを避けたテスト設計だと今回のような欠落に
    最後まで気づけない。

### KJ-2026-0917-02 staging環境でfn_cancel_future_sessionsが未反映(release_lesson_schedule_slot/invalidate_user_licenseが内部で失敗)

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-verify.ts`
  （4節: release_lesson_schedule_slot、5節: invalidate_user_license）、
  `session-24h-and-auth-refactor-verify.ts`（アドミン専用RPC権限チェック節）、
  `my-students-grouping-verify.ts`（生徒Cの契約解除〜グルーピング判定）
- **事象**: featureブランチのstagingマージ・リリーススクリプト適用完了後、上記3シナリオで
  `release_lesson_schedule_slot`・`invalidate_user_license`の呼び出しが
  `function public.fn_cancel_future_sessions(uuid, unknown, integer, unknown) does not exist`
  で失敗した。RPC自体（外側の関数）は正常に呼べており、`assertReleaseApplied`のpreflightも
  OKだった。dev環境（2026-09-14検証済み・`dev-lifecycle01`結果ログでOK）では同じ経路が
  正常に動作しているため、staging固有の未反映と判明した。
- **原因**: `supabase/release/20260911_feature-20260911-dev_release.sql`内で
  `fn_cancel_future_sessions(uuid, uuid, smallint, text)`はCREATE OR REPLACEとして
  正しく定義されており（`release_lesson_schedule_slot`・`invalidate_user_license`より前の
  セクション）、それより後方のセクション（33.resolve_stale_sessionのp_resolution変更等）は
  staging側で正常に反映されていた。にもかかわらずこの一関数だけが欠落していたことから、
  リリーススクリプトの実行時にこの関数定義部分のみが（手動でのSQL適用時のコピー範囲の
  誤り等により）スキップされたと推測される。KJ-2026-0917-01（dev環境で
  `fn_consume_session_ticket`が欠落）と同種・同時期の「PERFORM先の内部関数が丸ごと
  未反映」パターンだが、今回はdevでは正常でstagingでのみ欠落していた点が異なる。
- **対処**: 本ファイル発見時点では未対処（DDL適用はユーザー確認の上で実施する必要があるため、
  ユーザーへ報告のみ行った）。影響を受けた3シナリオのうち、この関数を経由しない検証項目は
  全てstagingでも合格した（session-lifecycle-refactor 36/43、session-24h-and-auth-refactor
  49/53、coach-my-students-grouping 11/17。NG件数は全てこの一つの原因に起因することを
  個別に確認済み）。
- **判断基準への反映**:
  - **「dev環境で合格済み」の検証項目がstagingで新たに失敗した場合、まずstaging固有の
    リリース未反映を疑うこと。** 特に内部PERFORM関数（`fn_cancel_future_sessions`・
    `fn_consume_session_ticket`等の非公開ヘルパー）は、外側のRPCのpreflight
    (`assertReleaseApplied`)だけでは検出できないため、実行時エラーで初めて発覚する
    (KJ-2026-0917-01と同じ制約)。
  - 同一の内部ヘルパー関数を複数の異なるシナリオ(seedやverify)が共有している場合、
    1つのシナリオで失敗が確認できたら、そのヘルパーに依存する他の全シナリオも
    同じ原因で失敗する可能性が高い。`grep -rn "<ヘルパー関数名>" testing/features/`で
    横断的に影響範囲を洗い出し、都度「未知の新しい不整合」として個別調査するのではなく
    「既知の原因(X)によるNG」として一括で報告すること。
  - **DDLの再適用（欠落した関数の再作成）は、テストスクリプトから自動で行わず、
    必ずユーザーに報告して判断を委ねること。** staging環境のスキーマ変更はテストデータの
    投入・削除とは異なり、影響範囲が広く元に戻しづらいため。

### KJ-2026-0917-03 resolve_stale_sessionの引数名2段階変更に、複数の既存テストスクリプトが追従していなかった

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-seed.ts`
  （preflightの自己確認ブロックのみ）、`testing/features/branches/feature-20260911-dev/monthly-report-seed.ts`
  （実際のRPC呼び出し3箇所）
- **事象**: feature-20260911-devのstaging検証(②)を実施した際、上記2ファイルで
  `resolve_stale_session`呼び出しがPGRST202（該当シグネチャなし）で失敗した。
  `session-lifecycle-refactor-seed.ts`は`p_completion_result`という2026-09-14時点の
  シグネチャのままpreflightチェックしていた。`monthly-report-seed.ts`はさらに古い
  `p_resolved_status`（値も2/6/7という独自の旧採番）のままRPCを実際に呼び出していた。
  一方、同じ関数を呼ぶ`session-lifecycle-refactor-verify.ts`・`coach-no-show-resolution-seed.ts`
  は既に現行シグネチャ`p_resolution`（KJ-2026-0917-01のタイトルにもある2026-09-17の
  coach_no_show=4対応）に追従済みだった。
- **原因**: `resolve_stale_session`の引数名は開発期間中に
  `p_resolved_status`(値2/6/7,旧採番) → `p_completion_result`(値1/2/3) →
  `p_resolution`(値1/2/3/4, 2026-09-17)と2段階で変更されているが、それぞれの変更時点で
  「その時点までに書かれた全テストスクリプトを横断的に洗い出して更新する」ところまでは
  実施されておらず、変更後に一度も再実行されていなかったスクリプトが古いシグネチャのまま
  取り残されていた。KJ-2026-0915-02と全く同種の教訓（引数変更時の横断的な洗い出し漏れ）が、
  同じ関数の2回目の変更でも再発した。
- **対処**: 3箇所とも現行シグネチャ`p_resolution`に更新した。値の意味(1=normal/2=early_ended/
  3=no_show)は3世代を通じて変わっていないため、`monthly-report-seed.ts`の旧値
  (2→1, 6→3, 7→2)もこの対応表でそのまま置き換えた。修正後、`tsc --noEmit`・`eslint`を
  実行しエラー無しを確認してから再実行し、両シナリオとも意図した検証まで到達した。
- **判断基準への反映**:
  - **KJ-2026-0915-02の教訓（RPC引数変更時は`grep`で全テストスクリプトを横断確認する）は
    「変更した直後の1回」だけでなく、**同じ関数が将来再度変更される度に毎回実行する
    必要がある。** 過去に一度対応済みのスクリプトがあっても、「その後長期間再実行されて
    いない別のスクリプト」は次の変更に追従していない可能性を常に疑うこと。
  - 複数世代にわたって引数名・値の採番が変わっている関数を修正する際は、
    「今回の変更前のシグネチャ」だけでなく「さらに前の世代のシグネチャ」で書かれた
    スクリプトが残っていないか（`grep`のパターンを現行の1世代前だけでなく、
    分かっている全世代分について確認する）。
  - 値の意味（1=normal等）が世代を通じて不変であることをDDL側のコメントで確認できた場合、
    旧シグネチャの値をそのまま現行シグネチャの対応する引数名に置き換えるだけで良い
    （業務ロジックの再設計は不要）。

### KJ-2026-0917-04 サンドボックスの削除禁止により、seedスクリプトの再実行で孤立データが残る

- **該当シナリオ**: `testing/features/branches/feature-20260911-dev/my-students-grouping-seed.ts`、
  `testing/features/branches/feature-20260911-dev/monthly-report-seed.ts`
  （いずれもKJ-2026-0917-03・target_sessions NOT NULL制約への追従修正の再実行時）
- **事象**: スクリプト側のバグを修正して同じ`--tag`で再実行する際、修正前の実行で既に
  コミットされていた契約/ライセンス/チケット/スケジュール/セッション行（後続のRPC呼び出しで
  失敗する前に直接INSERTされた分）を削除してからやり直そうとしたところ、削除スクリプトの
  実行がClaude Codeのサンドボックス（auto mode classifier）に「Modify Shared Resources」として
  ブロックされた。削除を諦めてそのまま再実行した結果、`monthly-report-seed.ts`のケースでは
  前回失敗時に直接INSERT済みだった4件の「未処理セッション(status=1)」が孤立して残り、
  verify.tsの「前月分の未処理セッションは1件のはず」という検証が実際には5件検出してNGに
  なった（RPCの集計自体は正しく、孤立データによる誤検知）。
- **原因**: このプロジェクトのsandbox環境は、shell/chatでの承認有無に関わらずDELETE系の
  操作を一律でブロックする（既知の制約。ユーザーmemory「sandbox_blocks_destructive_db_scripts」
  参照）。再実行前のクリーンアップという用途であっても例外にはならない。
- **対処**: 削除の代替手段を探さず（回避を試みることは指示で禁止されている）、孤立データが
  残ることを許容してそのまま再実行し、検証結果に現れたNGについては原因（自分自身の以前の
  失敗した実行が残した孤立行であり、当該機能のバグではない）をユーザーへ明示的に報告した。
- **判断基準への反映**:
  - **seedスクリプトがRPC呼び出し失敗で中断した場合、それより前に直接INSERTされた行
    （契約・ライセンス・チケット・スケジュール・セッション等）はサンドボックス制約により
    削除できないことを前提に対応する。** 「削除して綺麗にやり直す」という選択肢は
    このプロジェクトでは基本的に取れない。
  - 対応方針は2択：(1)そのまま再実行し、孤立データによる誤検知が疑われるNGが出たら
    「件数が期待より多い」等の症状から孤立データの混入を疑い、実際にDBを確認して
    原因を切り分けた上でユーザーに報告する。(2)可能であればseedスクリプト自体を
    「実行前に同一tagの既存データを検出したら再利用する」冪等設計に直す
    （CONVENTIONS.md 5章の本来の方針）。今回は時間的制約から(1)を選んだが、
    同じscenarioを何度も再実行する見込みがある場合は(2)への改修を検討する価値がある。
  - **verify.tsで「件数がちょうどN件のはず」という検証がNGになった場合、値が
    「期待より多い」パターンは孤立データ混入を、「期待より少ない/0」パターンは
    機能自体の不具合を疑うという切り分けの初手にできる。**

### KJ-2026-0917-05 PL/pgSQLのPERFORM(位置引数)では、整数リテラルがsmallintパラメータへ暗黙変換されない

- **該当シナリオ**: `supabase/release/20260911_feature-20260911-dev_release.sql`の
  `release_lesson_schedule_slot`・`invalidate_user_license`(いずれも内部で
  `fn_cancel_future_sessions(uuid, uuid, smallint, text)`をPERFORM)
- **事象**: KJ-2026-0917-02でfn_cancel_future_sessions自体をstagingに反映した後も、
  `release_lesson_schedule_slot`/`invalidate_user_license`経由での呼び出しが
  `function public.fn_cancel_future_sessions(uuid, unknown, integer, unknown) does not exist`
  で失敗し続けた。fn_cancel_future_sessionsを直接RPCで呼ぶと成功し、`pg_get_functiondef`で
  関数本体・重複オーバーロードの有無を確認しても問題無かったため、当初はコネクション
  プーラー(Supavisor/PgBouncer)側の古いプランキャッシュを疑ったが、Supabase Studioの
  SQL EditorからPostgRESTのプールを経由せず直接`SELECT public.fn_cancel_future_sessions(...,
  5, 'test')`を実行しても同じ42883で失敗し、プーラー起因ではなく決定的なSQL上の型解決の
  問題であることが確定した。
- **原因**: `PERFORM public.fn_cancel_future_sessions(p_schedule_id, NULL, 5, '...')`のように、
  関数呼び出しの引数に裸の整数リテラル(`5`)を渡すと、そのリテラルはPostgresの型解決上
  `integer`として確定してしまう。int4→int2(smallint)のキャストは`pg_cast`上
  `castcontext='a'`(assignment、INSERT/UPDATE等での列代入時のみ自動適用)であり、
  関数呼び出しの引数マッチングで使われる「implicit」カテゴリには含まれないため、
  他に一致するオーバーロードが無くても関数解決自体が失敗し「function ... does not exist」
  になる。`NULL`や文字列リテラルは型未確定("unknown")として扱われ、どの型にも
  自由に適合できるため問題にならないが、数値リテラルは`unknown`にならないという非対称性が
  原因。dev環境では2026-09-14の検証時点でこの2箇所がなぜ成功していたか不明(当時の
  fn_cancel_future_sessionsの実際の型がsmallintではなくintegerだった可能性がある)だが、
  現在のリリースSQL(DDL上のマスタ定義はsmallint)を新規に適用する環境では必ず再現する。
- **対処**: `release_lesson_schedule_slot`・`invalidate_user_license`内の該当PERFORM文で、
  整数リテラルに明示的に`::smallint`キャストを追加した(`5::smallint`, `4::smallint`)。
  リリースSQL本体を修正した上で、ユーザーにstaging環境へ修正後の
  `CREATE OR REPLACE FUNCTION`を再適用してもらった。同種のパターン(smallint引数を持つ
  他の関数: `resolve_stale_session`・`fn_commit_matching_schedule`・
  `admin_match_student_with_coach`)についても`grep`で本リリースファイル内の内部PERFORM
  呼び出しを横断確認したが、該当する裸の整数リテラル渡しは他に無かった。
- **判断基準への反映**:
  - **PL/pgSQL内から他の関数をPERFORM/SELECTで呼ぶ際、smallint型の引数に対して裸の整数
    リテラル(`5`等)を渡すコードは書かないこと。** 必ず`5::smallint`のように明示キャストする。
    文字列リテラルやNULLは型未確定のため問題にならないが、数値リテラルは`integer`に
    確定してしまうため、smallint/bigint等int4以外の数値型パラメータに渡す際は常に
    明示キャストを付ける習慣にする。
  - **「関数は存在するのに"does not exist"で失敗する」場合、コネクションプールの
    古いキャッシュを疑う前に、まず引数の型を1つずつ確認すること。** 特に数値リテラルが
    絡む場合はint4→smallint/int4→bigint等の暗黙変換不可パターンを最初に疑うべきで、
    プーラー再起動待ちのような時間のかかる切り分けは、SQL Editorで同じ呼び出しを
    直接実行して再現するかを確認した後(=プーラー起因ではないと確定した後)に限定すべき
    だった。
  - `assertReleaseApplied`のpreflightチェック(ダミー引数でのRPC呼び出し)は、
    PostgREST経由の名前付き引数呼び出しであるため、このバグを検出できない
    (KJ-2026-0917-02のfn_cancel_future_sessions自体の存在確認と同様に、内部の
    位置引数呼び出しに特有の問題は外側からのRPC疎通確認では検出不可能)。この種の
    バグは実際にその内部経路を通すテストケース(今回のように生徒SE/SFで
    release_lesson_schedule_slot/invalidate_user_licenseを実際に実行する検証)を
    用意して初めて発見できる。

<!-- 新しい事例はこの下に追記していく -->

### KJ-2026-0918-01 生徒のセッションキャンセルは「ライブルーム」ではなく「カレンダー」画面が実体

- **該当仕様書**: `testing/e2e/specs/booking/individual-booking-and-reschedule.md`（画面仕様書
  `docs/screens/student/calendar.md`作成のため実装を確認中に発覚）
- **事象**: 上記E2E仕様書の「関与ロール・画面」表で、生徒のセッションキャンセル操作を
  `apps/student/app/(app)/live-room/_components/LiveSessionHub.tsx`が担うと記載していたが、
  実際にセッションキャンセルのダイアログ（`SessionActionDialog.tsx`、実体は
  `packages/lib/components/common/SessionActionDialog.tsx`）を開く導線は
  `apps/student/app/(app)/calendar/_components/DayDetailDrawer.tsx`（カレンダー画面の
  日別詳細ドロワー）にあり、ライブルーム画面には無かった。
- **原因**: `cancelSession(`という文字列でのgrep一致だけを見て「呼び出し箇所がある画面」と
  即断したが、実際には`LiveSessionHub.tsx`は`cancelSession`を呼んでおらず、
  `withdrawSessionBookingRequest(`（予約リクエストの取り下げ）にマッチしていただけだった。
  複数の関数名をOR条件でgrepした結果、どのパターンにマッチしたかを確認せずに
  「セッションキャンセル」の実装場所として扱ってしまった。
- **対処**: `testing/e2e/specs/booking/individual-booking-and-reschedule.md`の該当箇所を
  修正（生徒のキャンセル操作画面をカレンダーに訂正、ライブルームは「予約リクエストの取り下げ・
  振替候補への応答・過去セッション閲覧」に訂正）。
- **判断基準への反映**:
  - **複数の関数名をOR条件でgrepした場合、どの行がどのパターンにマッチしたかを個別に
    確認してから結論を書くこと。** 「ファイルXがヒットした＝関数Yを呼んでいる」と決めつけず、
    該当関数名単体で再grepして実際の呼び出し箇所を確認する。
  - **画面仕様書（`docs/screens/`）を作るために実装を読み直す作業は、既存のE2E仕様書の
    「関与ロール・画面」記述の裏取り・誤り発見の機会にもなる。** 今回のように、後から
    別目的でコードを読み直したタイミングで齟齬が見つかることがあるため、関連する仕様書が
    無いかを都度確認し、見つかった齟齬はその場で仕様書側も修正する。

### KJ-2026-0918-02 ライブルーム画面はキャンセル・振替候補提案の「サブセット」ではなく、カレンダー画面とほぼ同じ操作一式を提供している

- **該当仕様書**: `testing/e2e/specs/booking/individual-booking-and-reschedule.md`（画面仕様書
  `docs/screens/student/live-room/hub.md`作成のため実装を確認中に発覚。KJ-2026-0918-01の続報）
- **事象**: KJ-2026-0918-01でライブルーム画面の役割を「予約リクエストの取り下げ・振替候補への
  応答・過去セッション閲覧」と訂正したが、これも不完全だった。実際には
  `apps/student/app/(app)/live-room/_components/LiveSessionHub.tsx`はカレンダー画面
  （`apps/student/app/(app)/calendar/_components/DayDetailDrawer.tsx`等）と同じ
  `SessionActionDialog`（セッションキャンセル＋振替候補提案）・`BookMakeupSessionDialog`
  （個別予約リクエストの新規作成）を直接インポートして使っており、今後の予定カードから
  「キャンセル」、未消化枠バナーから「予約リクエスト作成」も行える。つまりライブルーム画面は
  カレンダー画面の機能の一部だけを持つのではなく、ほぼ同じ操作一式（＋振替候補への応答、
  ＋取り下げ、＋過去セッション閲覧）を提供している。
- **原因**: KJ-2026-0918-01の修正時点では、grepでヒットした関数呼び出し（
  `withdrawSessionBookingRequest`, `acceptRescheduleProposal`, `declineRescheduleProposals`）
  だけを見て「この画面が持つ機能はこれで全部」と判断してしまい、同じファイルが他にどの
  共有コンポーネントをimportしているか（＝`SessionActionDialog`・`BookMakeupSessionDialog`も
  同じ画面内で使われている）まで確認していなかった。
- **対処**: `testing/e2e/specs/booking/individual-booking-and-reschedule.md`のライブルーム行を
  再度修正し、カレンダー画面と同じダイアログ一式を内包している旨を明記した。
- **判断基準への反映**:
  - **「この画面はどの機能を持つか」を確認する際は、grepでヒットした関数呼び出しの列挙だけで
    終わらせず、そのファイルのimport文全体（特に共有コンポーネント・共有ダイアログ）まで
    確認すること。** 関数呼び出しの網羅的なgrepは「その画面固有の処理」は拾えるが、
    「他の画面と共用しているダイアログ経由の機能」を見落としやすい。
  - **同じ訂正対象に2回連続で修正が入るケースは、最初の修正が「表面的な事象の解消」に
    留まり、根本（確認方法そのものの甘さ）を直していなかった兆候。** 訂正時は「この確認方法で
    本当に全体像が分かるか」を一段掘り下げて自問する。

### KJ-2026-0922-01 生徒モニタリング画面のアクセス制御主体を、RPCのデータ絞り込みと取り違えていた

- **該当仕様書**: `docs/screens/student/monitor.md`（`testing/e2e/specs/monitoring/
  student-monitor-dashboard.md`新規作成のため実装を確認中に発覚）
- **事象**: `docs/screens/student/monitor.md`の「この画面に来る経路」節が、「閲覧権限を
  持たない受講生には導線・データともに表示されない（`get_monitor_user_list`等のRPCが
  クライアント単位でデータを絞り込む）」と記載していた。しかしこの記述は誤りで、実際に
  画面へのアクセス可否を制御しているのは`apps/student/proxy.ts`のミドルウェア
  （`com_t_user_role.role_id='monitor'`を持たないユーザーを`/monitor`アクセス時に
  `/dashboard`へリダイレクトする処理）と、`apps/student/app/(app)/(main)/dashboard/page.tsx`の
  `isMonitor`判定（ダッシュボード上の導線の出し分け）の2つである。`get_monitor_user_list`が
  行っているのは同一クライアント内での「表示対象データ」の絞り込みであり、画面そのものへの
  入室可否には関与しない（モニターロールを持たない同一クライアントの生徒がURLを直接叩いた
  場合、この記述のままだと「RPCがクライアント単位で絞り込むから安全」と誤解し、実際には
  ミドルウェアのガードが無ければ他生徒のデータが閲覧できてしまうリスクを見落とす）。
- **原因**: この画面のRPC群（`get_monitor_user_list`等）が`get_jwt_client_id()`で
  クライアント単位の絞り込みを行っている実装を見て、「クライアントが違えば見えない＝
  アクセス制御はRPC側で完結している」と早合点した。実際にこの画面へのルーティング自体を
  ガードしている`apps/student/proxy.ts`（ミドルウェア）を確認していなかった。
- **対処**: `docs/screens/student/monitor.md`の当該記述を、実際のアクセス制御主体
  （proxy.tsのリダイレクト＋ダッシュボードの導線出し分け）に修正し、RPCのクライアント絞り込みは
  「画面に入った後のデータ絞り込み」である旨を明記した。あわせて
  `testing/e2e/specs/monitoring/student-monitor-dashboard.md`を新規作成し、モニターロール
  非保有の生徒による直接URLアクセスが拒否されることを異常系ケースとして明記した。
- **判断基準への反映**:
  - **「このデータは見えない」という実装（RLS・RPCのクライアント絞り込み等）を見つけても、
    それが「この画面に入れない」ことの根拠とは限らない。** 同一クライアント内の別ロールが
    URLを直接叩いた場合に何が起きるかは、データ層の絞り込みとは別に、ルーティング層
    （middleware/proxy）のガードの有無を必ず確認すること。
  - **権限まわりの画面仕様書を書く／レビューする際は、「導線が無い（UI上見えない）」と
    「アクセスできない（サーバー側で拒否される）」を明確に書き分ける。** 片方しか確認せずに
    書くと、この事例のように「実装は安全だが仕様書の説明が不正確」という乖離が生まれる。

### KJ-2026-0923-01 排他制約(EXCLUDE)単体を検証するテストで、UNIQUE制約や被検証ユーザー自身の既存データと意図せず衝突した

- **該当シナリオ**: `testing/features/branches/feature-20260918-dev/license-management-overhaul-verify.ts`
  （`com_t_user_license.excl_user_license_active_overlap`排他制約の検証。契約ユーザーライセンス
  管理の見直しで、「有効なライセンスは生徒に対して1件のみ」をDB側の排他制約で最終防衛する
  ようにした対応）
- **事象**: 1回目の実行で7件中3件がNGになった。
  - シナリオ2・4: 「同一ユーザーの既存有効ライセンスと期間が重なる新規ライセンスがINSERT
    できないこと」を確認するつもりが、検証対象のcontract_idとしてそのユーザーが既に
    ライセンスを保有しているcontract_idをそのまま使ったため、`UNIQUE(user_id, contract_id)`
    (23505)が先に発火し、排他制約(23P01)を検証できていなかった。
  - シナリオ5: 「排他制約はuser_id単位で、他ユーザーの同一期間とは独立している」ことを
    確認するつもりで生徒Bへ生徒Aと同じ期間のINSERTを試みたが、seedスクリプトが生徒Bにも
    「生徒Aの現行タームと完全に同じ期間」のライセンスを既に割り当てていたため、実際には
    「生徒B自身の既存有効ライセンスとの重複」を検出してしまい(23P01で失敗はしたが、
    確認したい観点とは別物)、cross-user独立性の検証になっていなかった。
- **原因**: 排他制約は`(user_id WITH =, tstzrange(...) WITH &&)`のANDで初めて発火するため、
  「重複を意図的に起こす」テストでは、①対象ユーザーが未保有のcontract_id（UNIQUE制約との
  混同を避ける）と、②被験者自身の他の既存ライセンスとは重ならない基準期間、の両方を
  同時に満たす必要がある。「同じ期間を使い回せば検証がシンプルになる」という設計が、
  かえって検証したい次元（排他制約単体）以外の制約・データと衝突する結果を招いた。
- **対処**: seed側で生徒Bのライセンス期間を生徒Aとは無関係な期間（200〜260日後）に変更し、
  verify側ではユーザーが未保有のcontract_id（もう一方の生徒のcontract_idを一時的な「予備枠」
  として転用。com_t_user_licenseはcontract_idの所有者を検証しないためFK上問題なく使える）を
  使うよう修正した。新しいtag(licenseoverhaul02)でseed→verifyをやり直し、7/7 OKを確認した。
- **判断基準への反映**:
  - **UNIQUE制約や別のCHECK/EXCLUDE制約と同じテーブルに同居する排他制約を検証する際は、
    「検証したい制約以外の制約には絶対に触れない」ように、対象の主キー・外部キーの組み合わせを
    意図的にずらして設計すること。** 同一user_id×同一contract_idの組み合わせを使い回すと、
    UNIQUE制約が先に発火して排他制約側の検証にたどり着けない。
  - **「AとBが同じ期間を持つ」ことを確認したいテストで、AとBの両方に同じ期間のデータを
    seedしてしまうと、後続の検証操作がその期間で「seed時点で既に存在する自分自身の重複」を
    誤検出することがある。** cross-entity（今回はcross-user）の独立性を確認したい場合は、
    比較対象の基準データ（今回は生徒A）以外のseedデータ（生徒B）は意図的に無関係な値に
    しておき、検証操作の中で初めてその基準データの値を使う設計にするべきだった。
  - 排他制約の検証はauth.uid()に依存しないテーブル制約のため、service_role直接操作で
    dev/staging適用後の実挙動をそのまま再現できる（実サインインJWTは不要。CLAUDE.md 6章の
    「業務ロジックRPCは実サインインJWTを使う」制約は、auth.uid()に依存するSECURITY DEFINER
    関数・RLSが対象であり、テーブル制約には及ばない）。

### KJ-2026-0923-02 Next.jsのServer Action(revalidatePath使用)は、tsxからの直接importでは呼べない

- **該当シナリオ**: 契約ユーザーライセンス管理の見直しで、`apps/admin/actions/adminContractAction.ts`の
  `updateUserLicense()`から契約期間内チェックを削除し、個別編集時のみ契約終了日を超える延長を
  許可する変更を検証する際（DB制約を伴わない純粋なサーバーアクションのロジック変更のため、
  データ主体テストスクリプト(service_role直接操作)では再現できず、実際の関数呼び出しでの
  確認が必要だった）
- **事象**: `apps/admin`配下に一時スクリプトを置き、`updateUserLicense()`をtsxから直接importして
  呼び出したところ、DB上のUPDATE自体（`com_t_user_license`のend_date変更、
  `com_t_user_license_history`への履歴記録）は正しく実行されたにも関わらず、戻り値は
  `{success: false, message: "予期せぬエラーが発生しました"}`になった。ログには
  `Invariant: static generation store missing in revalidatePath /contracts`という内部エラーが
  記録されていた。
- **原因**: `updateUserLicense()`はtry блока内でDB更新後に`revalidatePath('/contracts')`を
  呼んでおり、これは実際のNext.jsリクエスト処理中（App RouterのStatic Generation Store配下）
  でのみ動作する。`next dev`のサーバーを経由せず、tsx等でモジュールをただimportして直接
  呼び出す（=Next.jsのビルド・リクエストパイプラインを一切経由しない）と、この前提が
  満たされずInvariantエラーで例外を投げる。DB書き込み自体は例外より前に完了して
  コミット済みのため、「実際には成功しているのに戻り値だけ失敗扱いになる」という
  紛らわしい結果になった。
- **対処**: この一時スクリプトは「DB更新とバリデーションロジックが意図通り動くか」を
  確認する目的だったため、DBの更新前後の値（end_dateが契約終了日を60日超えて実際に
  更新されたこと）で目的を達成したと判断し、revalidatePathのエラー自体は「tsx直接呼び出し
  特有の制約であり、実際にブラウザ経由でServer Actionとして呼ばれる本番相当の経路では
  発生しない」ものとして報告した。検証後、このアプローチで作成された履歴データ
  (`com_t_user_license_history`)がテストデータ削除スクリプトの想定外の場所に残ったため
  （KJ-2026-0914-02と同種、cleanup.ts側に`com_t_user_license_history`の削除ステップを
  追加してFK違反を解消した）、cleanup.tsを修正した。
- **判断基準への反映**:
  - **`revalidatePath`/`revalidateTag`等、Next.jsのリクエストスコープ（Static Generation
    Store）に依存するAPIを呼んでいるServer Actionは、tsxからの直接importでは正しく
    完走しない。** DB書き込みの検証だけが目的なら「戻り値のsuccessフラグ」ではなく
    実際のDB状態（before/after）で判定すること。UIの実際の保存フロー全体（成功トースト表示等）
    まで確認したい場合は、ブラウザ経由（Playwright等）で本物のリクエストとして実行する必要がある。
  - **DB制約を伴わない、純粋なアプリケーションコード（Server Action）のロジック変更は、
    data-drivenなservice_role直接操作テストでは検証できない。** 検証手段の優先順位は、
    (1)実際にブラウザで操作する、(2)ブラウザ操作の手段が無い場合はtsxからの直接呼び出しで
    DBのbefore/afterだけを見る（revalidatePath等のNext.js依存部分のエラーは無視してよいと
    判断できる場合に限る）、の順。今回はこの環境にPlaywright/chromium-cliが導入されておらず
    (1)が取れなかったため(2)で代替した。
  - **アプリケーションコード経由でテストデータを操作すると、data-driven検証専用の直接INSERT
    では発生しない副作用（`com_t_user_license_history`への履歴記録等）が生まれることがある。**
    cleanup.tsを書く際は、対象機能が経由する可能性のある全てのテーブル（監査ログ・履歴テーブル
    含む）をDDLの`REFERENCES`から洗い出しておくこと（KJ-2026-0914-02の教訓の延長）。
