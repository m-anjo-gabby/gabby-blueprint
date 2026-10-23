# 運営向けの資料を置く

変更概要資料（`release-summary`）・メール文面カタログ（`mail-catalog`）のPDFや、マニュアル等のGoogleドキュメントを B_運営共有 に置く。

## 1. 置き場所と名前を決める

[../reference/rules.md](../reference/rules.md) の「形式」と [../reference/drive-map.md](../reference/drive-map.md) で決める。

| 資料 | フォルダ | 形式・名前 |
|---|---|---|
| 変更概要資料 | 50_リリース情報 | PDF `リリース情報_<ブランチの日付>_YYYYMMDD.pdf`（日付は対象期間の終わり） |
| メール文面カタログ | 60_アプリの文言/メール文面 | PDF `メール文面カタログ_YYYYMMDD.pdf`（日付は作った日） |
| 発話評価コメントの確認の一覧 | 60_アプリの文言/発話評価コメント | xlsx `発話評価コメント一覧_YYYYMMDD.xlsx`（日付は作った日。Excel のまま置く） |
| 判断をお願いする提案 | 40_検討中の提案 | PDF `<提案の名前>_YYYYMMDD.pdf` |
| 変更概要資料（開発側の控え） | A_開発/30_リリース/`<リリース日>` | PDF `リリース情報_<ブランチの日付>_YYYYMMDD.pdf`（日付は対象期間の終わり） |
| スプリントMTGの資料 | A_開発/20_スプリントMTG/`<MTGの日付>` | PDF `<資料の名前>_YYYYMMDD.pdf`（日付は資料の基準日） |
| マニュアル・業務フロー・機能の説明 | 10 / 20 / 30 | Googleドキュメント、日付なし |

置き場所が決まらない資料は、ユーザーに確かめてから置く。

## 2. 中身を確かめる

rules.md の「運営向けの資料に書かないもの」が入っていないかを確かめる（RPC名・接続先URL・認証情報・個人情報）。

## 3. 置く

- **PDF（PC版Googleドライブがある場合・優先）**: 共有ドライブは `G:\共有ドライブ\Gabby Blueprint` にマウントされている。フォルダを作ってファイルをコピーするだけで置ける（`ls` で同名のファイルが無いことを先に確かめる）。Drive の接続より速く、トークンも使わない。
- **PDF（接続を使う場合）**: フォルダに同じ名前のファイルが無いことを `search_files`（`parentId = '<フォルダID>' and title contains '<名前>'`）で確かめる。あれば上書きせずにユーザーに確かめる。
  - Drive の `create_file` に `base64Content`・`contentMimeType: application/pdf`・`disableConversionToGoogleType: true`・`parentId` を渡す。
  - ファイルの中身を1回の呼び出しで送るため、大きいPDFは失敗しやすい。失敗したら、ローカルのパスと置き先フォルダのリンクをユーザーに伝え、画面でドラッグして置いてもらう。
- **Googleドキュメント**: Drive の `create_file` に HTML（`contentMimeType: text/html`）を渡して作る。直すときは同じファイルを Docs の接続で編集し、作り直さない（リンクが変わるため）。

## 4. 案内と記録

- 新しい種類の資料を置いた場合は、「はじめにお読みください」のフォルダの案内に合うかを確かめる（[update-guide.md](update-guide.md)）。
- 変更概要資料は、`release-summary` の HISTORY.md の行に Drive のリンクも足す。
- 報告で、置いたファイルをリンク付きで伝える。
