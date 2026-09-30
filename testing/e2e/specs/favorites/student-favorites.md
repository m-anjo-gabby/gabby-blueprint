# お気に入り（教材・フレーズ・スプリント問題）

## 概要

生徒が教材・単語帳のフレーズ・スプリント問題をお気に入りに登録し、お気に入り画面で種別ごとに検索・絞り込み・音声での復習・解除を行う。
登録は1人・種別ごとに1,000件まで。出典の教材が見えなくなったもの（非公開・削除・利用権なし）は表示しない。
各画面は開くたびにサーバーで取得するため、他の画面での登録・解除は次に開いた時（「戻る・進む」を含む）に反映される。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | お気に入り | `student` `/favorites?kind=contents\|phrases\|sprintQuestions` | `FavoritesView`, `FavoriteKindSection`, `favoriteKinds.tsx`（種別の定義）。画面仕様: [docs/screens/student/favorites.md](../../../../docs/screens/student/favorites.md) |
| 生徒 | 教材一覧（教材の登録） | `student` `/library` | `LibraryView`, `toggleContentFavorite`。画面仕様: [docs/screens/student/library.md](../../../../docs/screens/student/library.md) |
| 生徒 | 単語帳トレーニング（フレーズの登録） | `student` `/training/word/[id]` | `WordCard`, `toggleFavorite`。画面仕様: [docs/screens/student/training/word-detail.md](../../../../docs/screens/student/training/word-detail.md) |
| 生徒 | スプリント結果（問題の登録。実施直後・履歴から） | `student` `/training/sprint/result/[id]`, `/training/sprint/history/[id]` | `SprintResultQuestionList`, `toggleSprintQuestionFavorite`。画面仕様: [docs/screens/student/training/sprint-result.md](../../../../docs/screens/student/training/sprint-result.md) |

## 前提条件

- 固定アカウント（[FIXTURES.md](../../../FIXTURES.md)）の生徒01には、dev でお気に入り（教材2件・フレーズ60件・スプリント問題12件）と、
  実在する問題で作ったスプリント結果が入っている。汎用スプリント（「Gabby NLT」。レベルの絞り込みに必要）は、
  `seed-fixed-accounts.ts` が固定テナントに利用権を付与する。
- 登録・解除は状態を変更するため、固定アカウントで行うテストは直列化し、終了時に元の件数へ戻す（[CONVENTIONS.md](../../CONVENTIONS.md) 3章）。
  上限（1,000件）の検証は、件数を埋めるデータ投入と後始末を伴うため、使い捨てのアカウントか、テスト内で追加分を必ず削除する形にする。
- 画面の外での変更（別端末相当）を再現する場合は、同じ生徒の実JWTでテーブルを直接操作する。後始末のサインアウトは
  `signOutRole`（`scope: 'local'`）を使い、ブラウザ側のログインを切らない（[TEST-JUDGEMENT-GUIDE.md](../../../TEST-JUDGEMENT-GUIDE.md) KJ-2026-0930-02）。

## フロー（正常系）

1. 生徒が登録する。
   - 1a. 教材一覧の教材カードの☆ → 教材
   - 1b. 単語帳トレーニングのカードの☆ → フレーズ
   - 1c. スプリント結果（実施直後・履歴）の各問題の☆ → スプリント問題
   いずれも☆は即座に切り替わり、トーストを表示する（失敗時は元に戻す）。
2. お気に入り画面を開く。種別の指定（`?kind=`）が無ければ、登録がある最初の種別（教材→フレーズ→スプリント問題）を開く。
   ピルに種別ごとの件数を表示する。
3. 検索・絞り込みで探す。絞り込みは選択肢が2つ以上ある項目だけを出し、前の項目で絞った結果から次の選択肢を作る。
   - 教材: 種別
   - フレーズ: 教材
   - スプリント問題: 教材 → 問題種別（UG Speed／Builders／Structure／Mastery の順）→ レベル（問題種別を選んだ後。レベル分けのある教材の問題だけ）
   絞り込みはURL（`content`・`type`・`level`）に保持し、再読み込みでも残る。種別を切り替えると外れる。
4. 復習する。フレーズ・スプリント問題は音声を再生でき（一覧で1つのプレイヤーを共有し、同時には鳴らない）、スプリント問題は文ごとに英文⇔日本語訳を切り替えられる。
   教材は「トレーニングを始める」で各トレーニングへ移る。一覧は50件ずつ表示し、「さらに表示」で続きを出す。
5. 解除する。お気に入り画面のゴミ箱（確認ダイアログあり）、または登録元の☆で解除する。
6. 他の画面での登録・解除は、次にお気に入り画面・教材一覧を開いた時に反映される。ブラウザの「戻る・進む」でキャッシュ済みの画面が
   表示された場合も、表示後に取り直して最新に差し替える。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 種別ごとの登録件数が1,000件の状態で、新しく登録する | 登録されない（SQLSTATE `GBF01`）。各画面は「お気に入りは1,000件まで登録できます…」のトーストを出し☆を戻す。お気に入り画面は上限の案内を表示する | 両方（DBトリガー `fn_check_favorite_limit`） |
| 2 | 1,000件の状態で、登録済みのものを登録し直す（upsert） | 拒否されない（件数が増えないため） | DB |
| 3 | 1,000件の種別とは別の種別に登録する | 登録できる（上限は種別ごと） | DB |
| 4 | 出典の教材が非公開（`content_scope=9`）・論理削除・利用権なしになる | そのお気に入りは表示されない（件数にも含まない）。行は残り、再公開すれば再び表示される | RLS・取得処理 |
| 5 | 単語・フレーズが準備中（`status='pending'`）、スプリント問題が論理削除になる | 表示されない | RLS |
| 6 | 同じ顧客の別の生徒が、他人のお気に入りを読もうとする | 0件（本人の行しか見えない） | RLS（UI導線なし） |
| 7 | 登録・解除の通信に失敗する | ☆・一覧を元の状態に戻し、エラーのトーストを出す | UI |
| 8 | URLの絞り込みに存在しない値（手入力・削除で無くなった値）を指定する | 「すべて」として扱う | UI |
| 9 | ブラウザに音声合成（`speechSynthesis`）が無い環境（Android WebView・一部のアプリ内ブラウザ等） | 画面はエラーにならない（音声ファイルが無い文の読み上げだけ無効） | UI |

## 関連RPC・テーブル

- RPC: なし（登録・解除は Server Action からテーブルを直接操作。本人の行に限定）
- テーブル: `com_t_favorite_contents`, `com_t_favorite_phrase`, `com_t_favorite_sprint_question`（いずれも本人のみのRLS、
  対象の削除で `ON DELETE CASCADE`）
- 関数・トリガー: `fn_check_favorite_limit`（各テーブルの BEFORE INSERT。1人・種別ごと1,000件）
- 実装参照: `apps/student/lib/favoriteToggle.ts`（登録・解除の共通処理。上限は `{ ok: false, reason: 'limit' }`）,
  `apps/student/constants/favorites.ts`（上限・文言）, `apps/student/actions/sprintFavoriteAction.ts`,
  `apps/student/app/(app)/(shell)/favorites/_components/favoriteFilters.ts`（絞り込みの計算。単体テスト `testing/unit/favorite-filters.test.ts`）,
  `packages/lib/hooks/useRefreshOnRestoredRender.ts`（「戻る・進む」での取り直し）
- 用語: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

WebKit（mobile）では、画面を開いた直後の操作がハイドレーション前に行われて無視されることがあるため、
読み込み完了を待ってから操作する（[TEST-JUDGEMENT-GUIDE.md](../../../TEST-JUDGEMENT-GUIDE.md) KJ-2026-0928-02）。

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | スプリント結果の☆で登録 → お気に入りに表示 → お気に入りで解除 → 結果画面の☆に反映 | 登録元とお気に入り画面の往復。固定アカウント・直列化・元の件数に戻す |
| 高 | 教材一覧で☆ → 「戻る」でお気に入りに戻ると件数が増えている | キャッシュ済み画面の取り直し（フロー6） |
| 高 | 種別の切り替えとURL（`?kind=`）・初期表示の種別 | 閲覧のみ |
| 中 | スプリント問題の連動する絞り込み（教材→問題種別→レベル）、コーパスではレベルが出ない、条件がURLに残る | PCはセレクト、mobile は「絞り込み」シートとチップ。閲覧のみ |
| 中 | 検索の該当なし → 「条件をクリア」 | 閲覧のみ |
| 中 | 50件を超える種別で「さらに表示」 | フレーズ60件で確認できる。閲覧のみ |
| 中 | 上限: 1,000件で登録するとトーストが出て☆が戻る、お気に入り画面に案内が出る（異常系1） | 1,000件の投入と削除を伴う。使い捨てアカウント推奨 |
| 低 | 画面の外での登録・解除が、次に教材一覧を開いた時・「戻る・進む」の時に反映される | 実JWTで直接操作（`signOutRole` は local） |
| 低 | mobile で選択中のピルが見切れない（件数が多く初回描画が重い場合を含む） | 表示確認 |
