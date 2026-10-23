# 共有ドライブの地図

フォルダ・ファイルを足した・消した・名前を変えたら、同じ作業の中でこのファイルを直す。
URL は `https://drive.google.com/drive/folders/<ID>`（フォルダ）、`https://docs.google.com/document/d/<ID>/edit`（ドキュメント）等で組み立てる。

- 共有ドライブ: `0AJl6sh9TKtcWUk9PVA`

## A_開発（開発チームだけが見る）

`10GI6tvqvGZcDSkTOMeVSJzXDCRLqC490`

| フォルダ | ID | 役割 |
|---|---|---|
| 00_案件台帳 | `1gsiyONaJAnL4SAFQcWZ6Psbv3TKeTBXt` | 案件の一覧 |
| 10_案件 | `1CpPnhNj0zH3yqMJ-gCw8pjmysTOthpdH` | 案件ごとの資料（ヒアリング・Claude Docs の下書き等） |
| 20_スプリントMTG | `12nVtJFxG4up8ky5RNzZKgh8mnMp9Tb5f` | スプリントMTGの資料・議事。回ごとに `YYYYMMDD`（MTGの日付）のフォルダを作って置く（地図には載せない） |
| 30_リリース | `1k6_-RuRBYp7xrRaycpd_QMJO44xDN8pT` | リリースの開発側の資料。リリース日ごとのフォルダ（例: `20261019`）に変更概要資料のPDFを置く |
| 40_テスト・UAT | `1ImYniUwHaqXntyXd9hHwrN78CU1juSB5` | テスト・受け入れテストの資料 |
| 50_外部サービス | `1nnq-ZBW-Lesfanw5sTFwBgc97ZkTd7FL` | 外部サービスの契約・設定の控え |
| 60_旧システム移行 | `19IBynMbxbuLYay2v6vSWWiKpNKt66TEP` | 旧システムからの移行の資料 |
| 90_アーカイブ | `1Btixn9B1V0rl1wXUVfo9hWn2O67AaDmb` | 古くなった資料 |

50_外部サービス は、サービスごとにフォルダを作り、設定と方針の控え（Googleドキュメント。正本はリポジトリ）を置く。

| 50_外部サービスの中 | ID | 中身 |
|---|---|---|
| Axiom | `14LWo0CudP-lRPdYnxy7OrwXfW1vzT2Di` | `Axiom（ログの保存とエラーの通知）`（`1mbK7k5jJY3RH6d2uSXX0XN7Z8oeYlY3H13QZGD3053I`。正本は docs/LOGGING.md） |
| （直下） | — | `会社アカウントへの移行手順`（`1jPyKsLfGtEFIgZsPFVIYe6PpJArlFWuNfqBNx4bJH3s`。全サービス共通の作業の手順。終わったら 90_アーカイブ へ移す） |

| 60_旧システム移行の中 | ID | 中身 |
|---|---|---|
| ビデオ教材 | `12oHJI8ytpIttL5Xuh_o8io4E8ICmW-3A` | 最初に作った `ビデオ教材 確認表`（`1O_GaOBdTzdXUkBYecRRV9-y12A_HdKwoRndAP-dgkIM`）が残っている。正は B_運営共有/80_システム移行 の写し。消すかはユーザーの判断待ち |

A_開発の各フォルダの細かい使い方はまだ決めていない（HISTORY.md の未決事項）。

## B_運営共有（運営スタッフも見る）

`1-PD-mm36qFRDwOe9GEuywCzFaal-7_Zm`

| フォルダ | ID | 役割 |
|---|---|---|
| 00_はじめにお読みください | `1vSuSMeEwWhouc8j0ujD2AD8qcx3ufKpI` | フォルダの使い方の案内 |
| 10_操作マニュアル | `1KPlQouFMpxHU_4hWMfnqqQVcz7SIgiAF` | 生徒アプリ・コーチアプリ・管理画面の操作方法 |
| 20_業務フロー | `1kxvK89ew19L3EkYDP-2I-llg2ghJSvNy` | 契約〜招待〜マッチング〜契約終了などの運用手順 |
| 30_機能の説明 | `1T8ab5be_KVo9denslezn3cykUlMRE90M` | 機能ごとの「できること・できないこと」 |
| 40_検討中の提案 | `1Hl23mvC--PD4l5AK9SCiq2f7ZXwQ8Cj9` | 判断をお願いしている案 |
| 50_リリース情報 | `1g7AA-mLxDcHscS3jyplwQMNnuaE0Y92h` | リリースごとの変更内容（変更概要資料のPDF） |
| 60_アプリの文言 | `1IB0X9BVsT_ozIGQ6RYWk6B7RYCBIU0VS` | アプリが出す文言の一覧と、運営に文言を確かめてもらう一覧（題材ごとにフォルダ） |
| 60_…/メール文面 | `1hugnsBcTmUyjak1p_AEYkaG3pfSdRQS1` | アプリが送るメールの一覧（メール文面カタログのPDF） |
| 60_…/発話評価コメント | `1pdfH4dUKPtbvijlsdF8vcSs8_VrVJTAL` | 発話の評価のコメントの確認の一覧（xlsx。`speech-feedback` スキル） |
| 70_要望・不具合の受付 | `1Gs5vpWWA5XvgzTSmXxeZGdrNg51y2qLF` | 受付フォームと受付台帳 |
| 70_…/補足資料 | `1YFgRw0w1khdTwulxnB4IqXYn8U3lGhZO` | 起票者がスクリーンショット・ログを1件1フォルダで置く |
| 80_システム移行 | `1E7oZfksdbUcLP-KRz8rA_Bf2F7JN12tB` | 旧システムからの移行で運営に確認してもらう資料（題材ごとにフォルダ） |
| 80_…/ビデオ教材 | `1MJrPHYMFA4YVO70hdBJOd3hPopAEWv_q` | ビデオ教材の名前・説明の確認 |
| 90_アーカイブ | `1Kk0KDvMZR87Jm4p25bDY7XJe9k3Nc8Zy` | 古くなった資料 |

### 主なファイル

| ファイル | 種類 | ID | 備考 |
|---|---|---|---|
| はじめにお読みください | ドキュメント | `13uTP3XkhEPljGRRCc2DAANNuyjB_42u9qadbXxT2gS8` | 00 フォルダ。タブは `t.0` の1つ、ページなし形式 |
| Gabby Blueprint 要望・不具合の受付 | フォーム | `1DLcRf7JdhzHgwfEAXP1jS5XCMI8wH8UosVaW6dUfdsg` | 70 フォルダ。回答用は `…/forms/d/<ID>/viewform` |
| ビデオ教材 確認表 | スプレッドシート | `17YISzHc4ZlHLixTPLZ7fMVdRUr2pjv8v3rIaokRljM4` | 80_…/ビデオ教材。タブ: 説明・教材一覧・セクション一覧（sheetId 2）・ビデオ一覧（sheetId 3）。リポジトリの `scripts/video-import/catalog.json` から作り、回答は開発チームが catalog.json に反映する |
| 発話評価コメント一覧_YYYYMMDD.xlsx | Excel | 例: `1QqhUP7f90SW-Ira_gZjyQB017ObolfVH`（20261023） | 60_…/発話評価コメント。`scripts/speech-feedback/review_xlsx.py` で作り、運営が「修正案」を書いたものを G: から `apply_xlsx.py` で取り込む。Googleスプレッドシートに変えない（取り込めなくなる） |
| 要望・不具合の受付台帳 | スプレッドシート | `1zDKOht5jWxq0nEdvuMbDDf9KR5FkijE7aoW3wpPUOkI` | 70 フォルダ。シート「受付台帳」（sheetId `1156693813`） |

## C_教材制作（コンテンツチームと開発チーム）

`10IZhnEa-ls1KfxbkTqkJVkL5XTgCdp_X`（旧 `11_教材データ管理`。ID は同じ）

| フォルダ | ID | 役割 |
|---|---|---|
| 10_教材データ | `14VGrg_kXpTHlq4R9wX5d8ZAVf3kwt_0L` | 教材の受け渡し。回ごとに `YYYYMMDD_顧客名` のフォルダ（元データ・変換したTSV/CSV・辞書の作業フォルダ） |
| 20_CV辞書 | `1i5XSWV4gtr_-IbMmwzd1jqvuTutzMk8q` | CV辞書の確認依頼・補正結果の Excel（顧客をまたぐ1つの辞書のため、回のフォルダに置かずここに集める。`cv-dictionary-tsv` スキル） |
| 30_変換ツール | `1r3VOS636bLVZ7PMcDqwqiaCKquC_doIr` | 変換ブック（.xlsm）・データ連携フォーマットの見本の最新版。回のフォルダの変換ブックはその回の控え |
