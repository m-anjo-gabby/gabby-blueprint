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

<!-- 新しい事例はこの下に追記していく -->
