<!--
  E2E・データ主体テスト共通の固定アカウント/環境前提カタログ。
  ソースコードだけでは読み取れない「前提・決め事」を集約する（役割・命名規則・テナント・
  コーチのタイムゾーン/Availability・対象ブラウザ等）。テストシナリオ固有の一時データ
  （ブランチ検証用の${TAG}付きアカウント等）はここに書かない（testing/features/branches/を参照）。
  最新の決め事のみを保つ（変更履歴は書かない。開発者から新情報が来たら該当箇所を上書きする）。
-->

# 固定アカウント・環境前提カタログ

## 固定アカウント と 都度シードの使い分け

| | 固定アカウント（本ファイル） | 都度シード（`testing/features/branches/`方式） |
|---|---|---|
| 用途 | ロールの基本的な振る舞いの確認（ログイン、一覧表示、基本操作） | 機能追加・改修時の特定シナリオ、新規アカウント特有のケース（契約なし、コーチ交代等） |
| 生存期間 | 恒久的（削除しない） | ブランチ検証単位（`${TAG}`付き、再実行可能・使い捨て前提） |
| 命名 | `qa-<role>-<seq>@gabby-qa-test.example`（TAGなし） | `${TAG}-<用途>@gabby-qa-test.example`（`testing/CONVENTIONS.md`参照） |

**重要**: 固定アカウントは「いつ誰が使っても同じ前提で動く」ことが価値なので、状態を破壊する
操作（チケット消化、キャンセル、契約状態の変更等）を伴うテストは固定アカウントに対して
直接行わない。そのようなテストは都度シードのアカウントを使うか、固定アカウントを使う場合は
テスト後に元の状態へ戻す。

## 固定アカウント一覧

メールドメインは`testing/features/`側の既存資産と揃えて`@gabby-qa-test.example`を使う
（パスワードは共通環境変数`QA_LIVE_SESSION_TEST_PASSWORD`。`testing/CONVENTIONS.md`参照）。

| アカウント | ロール(user_type) | メール | 主な用途 |
|---|---|---|---|
| QA生徒01 | student(1) | `qa-student-01@gabby-qa-test.example` | 生徒の基本フロー（カレンダー閲覧、予約、キャンセル等）の土台。`testing/features/fixtures/seed-fixed-accounts.ts`で投入済み（dev環境）。QAコーチCA01との担当関係（週1回契約・月曜18:00バンクーバー時間）も同スクリプトで確立 |
| QA生徒02（モニター） | student(1)、`com_t_user_role`に`role_id='monitor'`を付与 | `qa-student-02@gabby-qa-test.example` | 生徒モニタリング画面（`/monitor`）の横断閲覧検証用。QA生徒01と同じ【QA固定】クライアントに所属させ、QA生徒01を「対象生徒」として閲覧できる状態にする。有効なライセンスも必要（`/monitor`アクセスには`is_licensed=true`も要る）。**未投入**（投入スクリプト未対応。必要になった時点で`seed-fixed-accounts.ts`に追加する） |
| QAコーチCA01 | coach(2) | `qa-coach-ca-01@gabby-qa-test.example` | カナダ人コーチペルソナ（下記参照）。`testing/features/fixtures/seed-fixed-accounts.ts`で投入済み（dev環境） |
| QAコーチUS01 | coach(2) | `qa-coach-us-01@gabby-qa-test.example` | アメリカ人コーチペルソナ（下記参照）。**未投入**（投入スクリプト未対応。必要になった時点で`seed-fixed-accounts.ts`に追加する） |
| QAアドミン | admin(0) | `qa-admin@gabby-qa-test.example` | 既存の共有フィクスチャをそのまま採用（`testing/features/branches/feature-20260904-dev/seed.ts`で作成済み・テナントに紐づかない） |

## テナント（`com_m_client`）

固定アカウント専用のテナントを1つ用意する。生徒・コーチはここに所属させる
（アドミンはテナントに紐づかない。既存の`qa-admin`と同じ扱い）。

- クライアント名: `【QA固定】E2E/データ主体共通アカウント`

## コーチペルソナ（タイムゾーン・Availability）

`com_m_user.timezone`（IANA名）と`com_m_coach_availability`（週次繰り返しの対応可能時間帯、
コーチのローカル時刻basis）で表現する。国籍・拠点は仕様上のデータ項目ではなく、ペルソナを
区別するための命名上の設定。

| アカウント | 拠点 / timezone | Availability（現地時刻、初期値） |
|---|---|---|
| qa-coach-ca-01 | バンクーバー / `America/Vancouver` | 月・水・金 18:00〜22:00（平日夜間中心） |
| qa-coach-us-01 | ニューヨーク / `America/New_York` | 火・木 10:00〜16:00（平日昼間中心） |

Availabilityの初期値は仮値。実際にシードスクリプトを実装する際、必要なテストケースに
合わせて調整してよい（変更したらこの表を上書きする）。

## 対象ブラウザ・デバイス（E2E）

| OS | ブラウザ |
|---|---|
| Windows | Chrome, Edge |
| Mac | Chrome, Safari, Edge |
| モバイル（Android/iOS） | Chrome, Safari, Edge |

**Playwright実装時の注意（着手時に判断すればよい先読み情報）**: PlaywrightのブラウザエンジンはChromium/Firefox/WebKitの3種類のみで、「Safari」「Edge」という名前のエンジンは無い。実務上は
Edge = Chromiumを`channel: 'msedge'`で起動、Safari = WebKitエンジンで近似（実機Safariそのものではない）という対応になる。モバイルは`devices['iPhone 14']`等のデバイスエミュレーションが基本で、実機に近い検証をしたい場合はBrowserStack等の実機クラウドとの併用を検討する。どこまで厳密にやるかはPlaywright着手時に相談する。

## 更新履歴の書き方

このファイルは「今の決め事」のみを保つ。変更履歴は書かない。過去の値との違いを知りたい
場合はgit historyを見る。判断に迷った経緯や失敗事例は
[`TEST-JUDGEMENT-GUIDE.md`](./TEST-JUDGEMENT-GUIDE.md)に記録する（本ファイルとの役割分担は
[`README.md`](./README.md)の「情報を追加・更新してほしいとき」を参照）。
