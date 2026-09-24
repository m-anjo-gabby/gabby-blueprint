# Dialogue Practice 管理画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/dialogue-practice`
- 対象ロール: コーチ（対象生徒と現在または過去に担当関係があるコーチのみ）
- 目的: 生徒にダイアログプラクティス教材（セット）を割り当て、セット内の各セッションの
  完了状態・メモをコーチが記録する。旧システムでは全教材が常に全生徒に表示されていたが、
  本画面では「割り当てたものだけが一覧に並ぶ」方式に刷新している。
- 生徒側にも同じ割当データを参照する読み取り専用の
  [ダイアログ専用画面](../../student/training/dialogue-practice.md)（`/training/dialogue/[assignmentId]`）
  があり、自主トレーニング・復習用に教材リンクへアクセスできる（進捗編集は本画面のみ）。

## この画面に来る経路

- 生徒概要画面（`/students/[id]`）のDialogue Practiceカードの「Manage」リンクから
- 生徒概要画面のDialogue Practiceカードの「Assign」ボタンからも、この画面へ遷移せずに
  その場で教材割当が完結する（下記「生徒概要カードとの関係」参照）

## 画面の構成

1. **カテゴリフィルタ（カプセル型タブ）＋「Assign Set」ボタン** — 画面上部
2. **割当済みセットのカード一覧** — セットごとに1枚のカード。各カードは展開/折りたたみ可能で、
   展開するとセット内の全セッション（Complete/Cancelボタン・教材リンク・メモ）が並ぶ

## カテゴリフィルタ・Assign Set

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| フィルタタブ（All / Beginner / Intermediate / Advanced / Corpus） | この生徒に1件以上の割当がある場合のみ表示 | 選択したカテゴリの割当セットのみ一覧に表示する（Allは全件）。該当0件の場合は「No {カテゴリ} sets assigned」と表示 |
| 「+ Assign Set」ボタン | 常時 | 教材選択ダイアログ（下記）を開く |

### 教材選択ダイアログ（Assign a Dialogue Practice set）

- カテゴリタブ（Beginner / Intermediate / Advanced / Corpus）で教材セットを絞り込む。
  一覧エリアは常に同じ高さを確保しており、カテゴリごとの件数差でダイアログの高さがガタつかない
  （4件しか無いカテゴリでも、20件あるカテゴリと同じ枠の高さで、余白またはスクロールになる）
- 各行に教材名（省略せず折り返し表示）・セッション数・（Session 1のコーチ用教材リンクが
  登録されている場合のみ）「Session 1」参考リンク・「Assign」ボタンを表示。参考リンクは
  新しいタブでGoogle Slidesを開き、割り当てる前に教材内容を確認できる
  （Session 1にリンクが無い教材では表示されない）
- **この生徒に既に割り当て済みの教材は一覧から除外される**
- Corpusタブは、コーチが担当する生徒のテナントに紐づく専用教材のみが表示される
  （テナントに紐づく専用教材が無ければ「No unassigned sets in this category.」）
- 「Assign」を押すと即座に割り当てられ、ダイアログが閉じてカード一覧に反映される
  （確認ダイアログは無い＝割当は取り消しが容易な操作という位置づけ。ただし進捗が付いた後の
  解除には制限がある。下記「割当済みセットカード」参照）

## 割当済みセットカード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| ヘッダー（教材名・カテゴリバッジ・割当日） | 常時。全セッション完了時は緑の「Completed」バッジが追加表示される | クリックでカードの展開/折りたたみを切り替える |
| 進捗バー＋「n/m」表示 | 常時 | 操作なし（完了セッション数の自動集計） |
| 削除（ゴミ箱）ボタン | 常時表示だが、**1件でも完了セッションがあるとdisabled**（ホバーで「Sets with recorded progress cannot be unassigned」と表示） | 完了セッションが無い場合のみクリック可能。確認ダイアログ（「Unassign this set?」／danger）で確定すると割当を解除し、カードが一覧から消える |
| セッション行（展開時のみ表示） | セッションごとに1行 | 下記「セッション行」参照 |

## セッション行

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 完了バッジ | 完了時のみ「Session n」の隣に緑の「Completed」バッジを表示（未完了時はバッジ無し） | 表示のみ |
| 「Complete」／「Cancel」ボタン | 未完了時は黒背景の「Complete」、完了時は枠線のみの「Cancel」（取消アイコン付き）に切り替わる | クリックで完了状態を即時トグルする。完了にした瞬間の日付が「Completed yyyy-mm-dd」として記録され、取消すると消える。**この操作はメモの未保存の下書きを巻き込まない**（メモは最後に保存された内容のまま維持される） |
| Coach Materials / Student Materials リンク | リンクが登録されているセッションのみ | 新しいタブでGoogle Slidesを開く |
| メモ欄（テキストエリア） | 常時 | 自由入力。**入力しただけでは保存されない** |
| 「Save Note」ボタン | 常時表示だが、メモ内容が保存済みの値と同じ場合はdisabled | クリックで明示的に保存する（自動保存・blur時保存は行わない） |

## 生徒概要カードとの関係

生徒概要画面（`/students/[id]`）のDialogue Practiceカードにも「+ Assign」ボタンがあり、
この画面に遷移しなくても、その場で同じ教材選択ダイアログを開いて割り当てられる。
さらに、カード上の未完了セット行をクリックするとダイアログが開き、セッション単位の完了操作・
メモ編集もこの画面に遷移せず行える（`DialogueSessionRow`をそのまま共有しているため、挙動は
この管理画面の展開カードと同一）。**割当解除（Unassign）のみ、この管理画面でしか行えない**
（詳細は [生徒概要の仕様書](overview.md) のDialogue Practiceカードの節を参照）。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 割当が1件も無い | 「No dialogue sets assigned yet」＋案内文。フィルタタブも非表示 | この生徒にダイアログプラクティス教材が1件も割り当てられていない場合 |
| フィルタ選択カテゴリに該当なし | 「No {カテゴリ} sets assigned」 | 割当自体は1件以上あるが、選択中のカテゴリに一致する割当が無い場合 |
| 生徒が見つからない/担当関係が無い | 404ページ | 指定した生徒IDに対して自分が一度も担当関係を持ったことが無い場合 |

## 補足（設計上の注意点）

- 教材マスタは`com_m_contents`（`content_type=3`）に統合されており、`category_id`
  （1:Beginner, 2:Intermediate, 3:Advanced, 4:Corpus）で汎用/コーパスを問わず一律に扱う。
  Corpus（`content_scope=1`）の可視範囲は`com_m_contents`側のRLSに委ねている。
- 割当（`com_t_dialogue_assignment`）は論理削除方式。一度解除した教材を再度Assignした場合は、
  同じ行を再利用する（`assigned_by_coach_id`・`assigned_date`は再割当時点の値に更新される）。
- セッション進捗（`com_t_dialogue_session_progress`）は、進捗が発生した行のみ作成される
  （未着手セッションはレコード自体が存在せず、UI側で「未完了」として扱う）。
- 割当解除の「進捗があるとdisabled」は、UI側の制御に加えてサーバーアクション側でも同条件を
  再検証している（直接呼び出し・競合更新への防御）。
- 教材選択ダイアログの「Session 1」参考リンクは、`getAvailableDialogueContentsCore`が
  `com_m_dialogue_session`から`session_no=1`のコーチ用教材リンクを教材ごとに1件だけ
  集計して返している（`DialogueContentSummary.session1_coach_slides_link`）。生徒用教材は
  対象外。

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/dialogue-practice/page.tsx`
- `apps/coach/app/(app)/students/[id]/dialogue-practice/_components/DialoguePracticeManager.tsx`
- `apps/coach/app/(app)/students/[id]/dialogue-practice/_components/DialogueAssignmentCard.tsx`
- `apps/coach/app/(app)/students/[id]/dialogue-practice/_components/DialogueSessionRow.tsx`
- `apps/coach/app/(app)/students/[id]/_components/AssignDialogueDialog.tsx`（生徒概要カードと共有）
- `apps/coach/app/(app)/students/[id]/_components/DialoguePracticeCard.tsx`（`DialogueSessionRow`を
  このディレクトリ外から直接importして共有している。生徒概要画面（`manageHref`指定、Manageリンクあり）
  と[セッションハブ](session-detail.md)（`liveSessionId`指定、Manageリンク無し・教材オープンを
  ログする）の2箇所から使われる汎用コンポーネント）
- `apps/coach/app/(app)/students/[id]/_hooks/useDialoguePracticeAssignments.ts`
  （割当一覧の状態管理・更新ロジック。管理画面・生徒概要カード・セッションハブで共有）
- サーバーアクション: `getAvailableDialogueContents`, `assignDialogueContent`,
  `unassignDialogueContent`, `getStudentDialogueAssignments`, `updateDialogueSessionProgress`,
  `logSessionDialogueOpen`（セッションハブでのみ使用。詳細は[セッション結果画面の仕様書](session-result.md)
  のDialog Practice History節を参照）
  （`apps/coach/actions/dialogueAction.ts` → Core実装は
  `packages/lib/coachStudent/actions/dialogueActions.ts`）
- DB: `com_m_contents`（`content_type=3`）, `com_m_dialogue_session`,
  `com_t_dialogue_assignment`, `com_t_dialogue_session_progress`, `com_t_session_dialogue_log`
  （セッションハブでの教材オープン履歴。セッション結果画面のDialog Practice History用）
