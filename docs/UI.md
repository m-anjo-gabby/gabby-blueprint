# 画面の作り方（全アプリ共通）

admin / coach / student と共通部品（`packages/lib/components`）の画面の作り方の正本。各アプリと `packages/lib` の `CLAUDE.md` が読み込む。アプリ別の決まりは [UI-ADMIN.md](./UI-ADMIN.md)・[UI-STUDENT.md](./UI-STUDENT.md)、コードの書き方は [CODING.md](./CODING.md)。

## ブランド色（全アプリ共通）

画面・共通UIのブランド色は `brand` / `brand-strong` / `brand-soft` / `brand-N`（および `gold`）トークンで書き、パレット名（`indigo-*` 等）を直接書かない。色の実体は `packages/lib/styles/brand-theme.css`（コーポレートカラー #0e3196 基準）で一元定義し、各アプリの `app/globals.css` から読み込む。アプリごとにテーマカラーを変える場合は、そのアプリの `globals.css` で同名トークンを上書きする。coach/admin の shadcn 標準ボタン（`--primary`）は黒系のままとし、ブランド色はアクセントに限定する。青・紫等の分類色・状態色（タグ種別・ステータスバッジ等）はブランド色とは別扱い。

## ローディング表示（全アプリ共通）

基本の考え方は「**画面の枠は本物、データに依存する部分だけを区画単位の骨組みにする**」。ページ見出し・タブ・検索欄・フィルター・データに依存しないメニューや案内は即座に本物を描き、カード・一覧・表などデータで中身が決まる区画だけを骨組みにする。骨組みは本番と同じ枠・グリッド・高さで描き、骨組み→本番の切り替えが「中身が埋まるだけ」になるようにする（形の違う骨組みはちらつきの原因になる）。次の4種類に分けて実装する。部品は `packages/lib/components/common/`（`Skeleton` / `PageSkeleton`・`CardSkeleton`・`LoadingScreen`）に集約し、各アプリは `RouteLoading`（admin/coach は `components/common/`、student は `components/shell/`）経由で使う。スケルトンの色は `brand-theme.css` の `skeleton` トークン。

- A. 画面遷移: サーバーで取得する画面は、遷移直後に骨組みを出すため `loading.tsx` を置く。Next.js（PPR無効）の先読みは最初の `loading.tsx` で止まるため、画面のフォルダ（その画面の `layout.tsx` と同じ階層）に置くと、layout の枠（`ContentFrame` の幅等）を先に描いたうえで中に骨組みが出る。ルートグループ直下の `loading.tsx` は、自前の `loading.tsx` を持たない画面の予備として残す（layout の外に出るため枠の幅は `frame` で指定する）。`layout.tsx` を持たない中間のフォルダ（例: student `training/`）には `loading.tsx` を置かない。置くと外からの遷移で先読みがそこで止まり、配下の画面の layout と `loading.tsx` が使われない（配下の各画面に置く）。中身は次のどちらか。
  - 汎用: `<RouteLoading variant=... />` の1行。形が汎用の型（list / cards / table / chat）に近い画面用。
  - 画面専用: 形が汎用の型と違う（列数・主役カード・固定ヘッダー等）画面や、毎日開く入口の画面は、画面の隣に `_components/XxxSkeleton.tsx` を作る（student は `RouteSkeleton` で包む）。見出し・タブ等は本物の部品で描き、グリッドの定義は本番と定数で共有する（例: student `dashboard/_components/HomeSkeleton.tsx` と `HOME_LAYOUT`、`library/_components/LibrarySkeleton.tsx`）。カード1枚の骨組みはカード部品の隣に置いて使い回す（例: student `components/common/ContentCardSkeleton.tsx`）。画面の大半がデータに依存しない場合は、別の骨組みを書かず本番の部品を「データ無し（`null`）＝読み込み中」で描けるようにする（例: student `TrainingPerformance`・`WordHistoryView`、`StatTile` / `CountBadge` の `null`）。本番の構成を変えたら骨組みも合わせて直す。student はシェル内の全画面を画面専用にする。
  - 1つの `loading.tsx` が複数の画面を受け持つフォルダ（外からの遷移では子の画面でも親フォルダの `loading.tsx` が出る。例: student `profile/`・`live-room/`・`training/sprint/history/`、coach `students/`）は、`usePathname` で骨組みを出し分ける。
  - ページを直接開いた・再読み込みした直後は、最も外側の `loading.tsx` が先に表示される。coach は `(app)/loading.tsx` も `CoachRouteSkeleton`（`components/common/`）で表示中のパスから各画面の骨組みを出す。student は `(app)/loading.tsx` を `AppRouteLoading`（没入画面は全画面の読み込み表示、シェルの画面は本物のシェル＋画面の骨組み）、`(shell)/loading.tsx` を `ShellRouteSkeleton`（`components/shell/ShellRouteSkeleton.tsx`）にする。画面を追加したらこれらの対応表にも加え、student の没入画面は `constants/navigation.ts` の `isImmersivePath` にも加える。student は `proxy.ts` の `VALID_STUDENT_ROUTES`（許可リスト。無いパスはホームへ転送される）にも加える。
  - student のシェルの画面の枠の幅は `constants/shellLayout.ts` の `SHELL_CONTENT_WIDTH` で定義し、各 `layout.tsx` と骨組みで共有する。ナビ項目の表示可否（ライブ契約・モニター）は `(app)/layout.tsx` で取得して `ShellNavProvider` で渡す（外側の骨組みの段階から本物のナビを出すため。`(shell)/layout.tsx` では取得を待たない）。`ContentFrame` には表示時のアニメーションを付けない（骨組みの枠から本番の枠へ置き換わるたびに再生され、ちらついて見える）。
  - Header/Sidebar を覆う没入表示（coach の `ImmersiveShell`：セッションハブ・Live Sprint 等）の画面は、骨組みも同じ没入表示で描く（通常の枠の骨組みを挟むと Header/Sidebar が一瞬現れて消える）。例: coach `students/[id]/_components/LiveSessionSkeletons.tsx`。
  - 骨組み→本番の切り替えは「その場で置き換える」。本番側の初回表示でフェードイン（`initial={{ opacity: 0 }}`）や `AnimatePresence mode="wait"` を使わない（一瞬空白になる）。一覧のカードのアニメーションは `AnimatePresence initial={false}` にする。
  - クライアント側でストアから取得する画面（student のお知らせ・通知）は `useFetchOnMount`（`packages/lib/hooks/`）で「開いてからの取得が終わるまで骨組み」にする（ストアに残った古い一覧や「0件」を一瞬出さない）。月切替など画面内の再取得でも、枠を残して中身だけを骨組みにする（例: student `CalendarMonthCard`）。
  - `loading.tsx` は**そのフォルダ直下の区間が切り替わる遷移でしか表示されない**（Next.jsの仕様）ため、一覧→詳細など複数の子を行き来するフォルダにも置く。新しい子ルート・詳細画面を追加したら、親フォルダに `loading.tsx` があるか確認する。
- 初期表示に必要なデータを、表示後にブラウザからサーバーアクションで取りに行かない（`useEffect` での取得等）。サーバーアクションはブラウザから1つずつ順番に実行されるため、表示後の往復が増えるうえ他の取得も後ろに並ばされ、海外のユーザーほど遅くなる。画面のデータはサーバーで取得して区画単位で表示し（B）、アプリシェル（ヘッダー・サイドバー）の未読・件数はレイアウトでサーバー取得した Promise を await せずに渡してストアに流し込む（例: coach・admin の `lib/shellData.ts` と `components/common/ShellDataLoader.tsx`。各ストアの `apply…` で反映する）。サーバーとブラウザの両方で使う定数（取得する項目の設定等）は `'use client'` のファイルに置かない（サーバー側からはクライアント部品の参照になり、値として読めない。型エラーにもならない）。利用者の操作をきっかけにした取得（ダイアログを開いた時の選択肢・入力中の候補・ボタンでの再読み込み等）と、Realtime・定期的な取り直しによる更新はこのルールの対象外（ただし、一覧の各行に置く部品が画面を開いた時点でそれぞれ取得すると行の数だけ順番待ちが積み重なるため、選択肢は画面でサーバー取得して渡すか、開いた時に取得する）。
- B. 画面内の区画単位の遅延表示: 独立した区画（カード）が並び、区画ごとに取得の重さが違う画面は、ページで全件を `await` せずカード・区画ごとの async コンポーネントに分けて `<Suspense fallback={<CardSkeleton />}>` で包む（例: coach `students/[id]/page.tsx`）。区画の骨組みは本番の区画と同じ枠・高さにし、区画の並び（列数・幅）は遅れて届くデータで変わらないようにする（変わると後から出た区画が周りを押し動かす）。判定に複数の取得を使うなど区画同士でデータが連動する場合は、同じ `Suspense` にまとめる。1種類のデータを一覧する画面は、区画に分けず A の画面専用の骨組み（一覧部分だけ骨組み）で足りる。複数区画で同じ取得を使う場合は React の `cache()` で1回にまとめる。クライアント部品が画面全体を持つ場合は、区画を `ReactNode` の差し込み口にしてサーバー側で `Suspense` を渡す（例: coach `sessions/[sessionId]/page.tsx`）。月切替・検索などURLのクエリだけが変わる遷移では `loading.tsx` が出ないため、結果の区画を条件ごとに `key` を変えた `<Suspense>` で包む（例: admin/coach `monthly-reports/page.tsx`）か、切替操作側で `useTransition` の `isPending` を表示する（例: `useMonthNavigator`）。
- C. 操作中: ボタンの処理中表示は各アプリの `Button` の `pending` プロップ（先頭アイコンは `icon` プロップで渡すと処理中はスピナーに置き換わる）（フォーム送信は `useFormStatus`、それ以外は `useTransition` の `isPending` を渡す）を使い、`Loader2` の個別実装は新規に増やさない。既存の個別実装は、その画面を改修するついでに置き換える。
- D. 没入画面（ドリル・ライブ通話等）の準備中表示は画面専用の実装を許可する。遷移中の汎用表示は `LoadingScreen`（student は `ImmersiveLoading`）。
- 読み込みの失敗: 一覧・主な内容の取得に失敗した区画は、空の一覧（「0件」）にせず `SectionLoadError`（`packages/lib/components/common/`）で出す。補助の区画は出さなくてよい。決まりの正本は [CODING.md](./CODING.md) 6章「画面のデータの取得」。

## ダイアログ・シートを開いた時のフォーカス（全アプリ共通）

開いただけで中の要素（×ボタン等）にフォーカスの枠が出ないよう、各アプリの `components/ui`（dialog / alert-dialog / sheet / drawer）の Content は `onOpenAutoFocus` の既定を `focusDialogContent`（`packages/lib/components/common/dialogFocus.ts`。枠そのものにフォーカスする）にしている。画面ごとに `onOpenAutoFocus={(e) => e.preventDefault()}` を書かない。Radix の Dialog を直接使う場合も `onOpenAutoFocus={focusDialogContent}` を渡す。開いた時に特定の要素へフォーカスが必要な場合（入力が主のダイアログ等）だけ、その要素に `autoFocus` を付ける。

## チャット画面（全アプリ共通）

admin/coach/student のチャットは2ペイン（左: ルーム一覧 / 右: ルーム、狭い画面では一覧とルームを切り替え）で、部品は `packages/lib/components/chat/`（`ChatSplitLayout` / `ChatRoomListPane` / `ChatTimeline` / `ChatComposer` 等）に集約する。各アプリは `chat/layout.tsx` で `ChatSplitLayout` を置き、文言（`ChatLabels`）と2ペインにする画面幅（`CHAT_SPLIT_BREAKPOINT`、`constants/chat.ts`）だけを渡す。アプリ固有の機能（admin の査閲・ルーム作成・参加者管理・顧客フィルター）は `toolbar` / `headerAction` / `headerActions` の差し込み口で足し、共通部品を複製しない。ルームへのリンクは `packages/lib/chat/links.ts`（アプリ内は `getChatRoomPath`、メール等アプリ外からは宛先ユーザーのポータルで組み立てる `getChatRoomUrl`）で作る。未ログインで保護された画面を開いた場合は、proxy が `/login?next=<元のパス>` へ転送し、ログイン後に元の画面へ戻す（`packages/lib/auth/returnTo.ts`。戻り先は必ず `sanitizeReturnTo` を通す）。
