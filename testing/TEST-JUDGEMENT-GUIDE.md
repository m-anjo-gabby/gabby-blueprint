# テスト判断基準ガイド(TEST-JUDGEMENT-GUIDE)

テスト実施中に得られた気づき・失敗事例を蓄積し、同じ種類のミスを繰り返さないためのファイル。
新しい事例は本ファイル末尾に追記する。技術的な標準ルールは [CONVENTIONS.md](./CONVENTIONS.md) を参照。

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

<!-- 新しい事例はこの下に追記していく -->
