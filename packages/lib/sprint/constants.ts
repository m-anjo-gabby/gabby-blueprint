import { SprintQuestionType } from "@gabby/types/sprint";

/**
 * 各スプリント種別の説明（回答ルール・ヒント）
 */
export const SPRINT_NOTES: Record<SprintQuestionType, string> = {
  '0': 'すべての質問に「YES」か「NO」で答えてください。完全な文章で回答しましょう。',
  '4': '指示に従って、聞こえてくる文章を変換してください。',
  '5': '基本形の動詞と聞こえてくる語句を加えて、文法的に正しい文章を作りましょう。',
  '6': '聞こえてくる文について3つの質問をします。最初の2つは文の内容、3つ目は文に関連する質問です。完全な文章で回答しましょう。'
} as const;

/**
 * 種別×レベルの組み合わせによる出題テーママスタ
 */
export const SPRINT_THEMES: Record<string, string> = {
  "0_0": "現在形、現在進行形、過去形、未来形 (will, going to) + 主語 + 形容詞/目的語",
  "0_1": "現在形 (I am, she doesn't want) + 主語 + 形容詞/目的語",
  "0_2": "現在進行形 (I am going, she is running) + 主語 + 形容詞/目的語",
  "0_3": "過去形 (I went, she ate) + 主語 + 形容詞/目的語/動詞",
  "0_4": "未来形 (will, going to) + 主語 + 形容詞/目的語/動詞",
  "0_5": "現在完了形 (I have been, he has eaten) + 主語 + 目的語/副詞",
  "0_6": "現在形/現在進行形 (they are swimming, I do love) + 主語 + 目的語 (より複雑)",
  "0_7": "過去進行形/過去完了形 (they were going, he had been) + 主語 + 目的語/副詞",
  "0_8": "様々な未来時制 (未来進行形、be going to、未来完了形など) + 主語 + 目的語/副詞",
  "0_9": "過去形/過去進行形/過去完了形 + 現在完了形 + 主語 + 目的語 + 否定疑問文 (より複雑)",
  "0_10": "様々な動詞の時制 + 埋め込み節 + 否定疑問文 + TOEIC/TOEFL語彙",
  "5_1": "時制: 現在形 | 1〜3語の短い追加指示",
  "5_2": "時制: 現在形、過去形、未来形、現在進行形 | 1〜3語の短い追加指示",
  "5_3": "時制: これまでの全ての時制 | 1〜4語の短い追加指示句",
  "5_4": "時制: これまでの全ての時制 + 現在完了形 | 1〜5語の短い追加指示句",
  "5_5": "時制: これまでの全ての時制 + 現在完了進行形 | 1〜5語の短い追加指示句",
  "4_0": "現在形、現在進行形、現在完了形、過去形、未来形 (will, going to) | 定冠詞・不定冠詞、主格・目的格代名詞、三人称単数", // Basicを'0'としてマッピング
  "4_1": "現在形、現在進行形、現在完了形 | 定冠詞・不定冠詞、三人称単数-s",
  "4_2": "現在形、現在進行形、現在完了形 | 定冠詞・不定冠詞、直接目的語・間接目的語、三人称単数-s | 前置詞句",
  "4_3": "過去形、過去進行形 | 形容詞・副詞 | 前置詞句",
  "4_4": "過去形、過去進行形、過去完了形 | 形容詞、副詞・副詞句 (より複雑) | 前置詞句 (より複雑)",
  "4_5": "過去形、過去進行形、過去完了形 | 過去の“used to”, “have to”, “able to” | 能力・可能性の助動詞 (can, could, might, may)",
  "4_6": "未来形、未来進行形 | 未来の“going to”, “want to”, “able to” | 許可の助動詞 (can, could, may)",
  "4_7": "未来形、未来進行形、未来完了形 | 義務の助動詞 (must, have to, need to)",
  "4_8": "未来形、未来進行形、未来完了形、現在完了進行形 | 未来の“have to” | 助動詞“should” (助言、義務、可能性、期待)",
  "4_9": "全ての動詞の時制 | 全ての助動詞 | 第1・第2仮定法 | 過去の“going to”",
  "4_10": "全ての動詞の時制 | 全ての助動詞 | 第1・第2仮定法 | 不規則な疑問文の形式 | 一般的な慣用句 | 従属節",
  "6_1": "時制: 現在形、過去形、未来形、現在進行形 | 文の長さ: 4 - 10語",
  "6_2": "時制: 全ての時制 | 文の長さ: 5 - 10語",
  "6_3": "時制: 全ての時制 | 文の長さ: 6 - 12語",
  "6_4": "時制: 全ての時制 + 現在完了進行形 | 文の長さ: 6 - 14語",
  "6_5": "時制: 全ての時制 + 過去進行形 | 文の長さ: 6 - 15語",
  "6_6": "時制: 全ての時制 + 過去完了形 | 文の長さ: 7 - 17語",
  "6_7": "時制: 全ての時制 | 文の長さ: 9 - 17語",
  "6_8": "時制: 全ての時制 + 過去完了進行形、未来進行形、未来完了形 | 文の長さ: 9 - 17語",
  "6_9": "時制: 全ての時制 | 文の長さ: 任意の長さ",
  "6_10": "時制: 全ての時制 | 文の長さ: 任意の長さ"
} as const;

/**
 * コーチ向け Lesson Sprint実施画面の、開始前インストラクション（英語版）1件分。
 * preamble: 強調ブロックの前に読み上げる導入文（Masteryのみ内容が異なる）
 * emphasized: 赤字強調して表示する本文。複数行の場合は改行(\n)区切りで保持する
 */
export interface SprintCoachNote {
  preamble: string;
  emphasized: string;
}

/**
 * コーチが問題種別ごとに、開始前に生徒へ読み上げる説明文（英語版）。
 * 汎用スプリント（sprint_type: '0'）でのみ使用する。コーパススプリントには適用しない。
 */
export const SPRINT_NOTES_EN: Record<SprintQuestionType, SprintCoachNote> = {
  '0': {
    preamble: 'Read the following instructions to your student',
    emphasized: 'Answer YES or NO to all the questions. Use complete sentences for your answers.',
  },
  '5': {
    preamble: 'Read the following instructions to your student',
    emphasized: 'You will be given a main verb in its base form. Add the word and phrases you hear to build a grammatically correct sentence.\n\nExample:\nStart with “have”\n\n1. Add “my office”\nMy office has.\n2. Add “a window”\nMy office has a window.\n3. Add “large”\nMy office has a large window.\n4. Add “two”\nMy office has two large windows.',
  },
  '4': {
    preamble: 'Read the following instructions to your student',
    emphasized: 'Listen to the following sentences and change them according to the instructions you hear.\n・When you hear “use”, I want you to replace another word in the sentence.\n・When you hear “add”, I want you to add more words to the sentence.\n・When you hear “Form a question”, I want you to form a yes/no question using all of the words in the sentence.',
  },
  '6': {
    preamble: 'Read the following instructions to your student',
    emphasized: 'Listen to the following statements. Each statement has three questions. Answer the questions using a complete sentence.',
  },
} as const;

/**
 * 上記SPRINT_NOTES_ENの末尾に共通で表示するフッター文。
 * 汎用スプリントの場合のみ表示し、コーパススプリントの場合は表示しない。
 */
export const SPRINT_NOTE_FOOTER_EN = 'Need more information about this difficulty level, or some example questions? Click the info button above.';

/**
 * SPRINT_THEMES_ENの例文1件分。
 * cue: "Statement" / "Cue 1: Use “movie rentals”" / "Q1: ..." のような、例文の前に付くラベル。無い場合は省略可。
 * prompt: Speed種別のような単純な質問文がある場合のみ使用（Structure/Builders/Masteryはcue+answerのみで表現）。
 */
export interface SprintThemeExample {
  cue?: string;
  prompt?: string;
  answer: string;
}

/**
 * 種別×レベル1件分の出題テーマ詳細（英語版）。
 * summary/bullets/exampleの各テキストは "**text**" で囲んだ範囲だけ太字表示する
 * Markdown風の軽量記法を使う（表示側で共通のパース処理を1つ用意して変換する）。
 */
export interface SprintThemeEntry {
  title: string;
  summary: string;
  bullets?: string[];
  examples: SprintThemeExample[];
}

/**
 * 種別×レベルの組み合わせによる出題テーママスタ（英語版）。
 * SPRINT_THEMESと同じ "${type}_${level}" キー形式。汎用スプリントでのみ使用する。
 */
export const SPRINT_THEMES_EN: Record<string, SprintThemeEntry> = {
  // ─── UG Speed ('0') ───
  '0_0': {
    title: 'Level Basic Info for UG Speed',
    summary: '**Simple present, present continuous, simple past, simple future (will, going to) + subject + adjective/object**',
    bullets: [
      'Simple 3 to 6 word questions',
      'Definite and indefinite articles',
      'Subject and object pronouns',
      'Third person -s',
      'Simple use of the modal verb “can”',
    ],
    examples: [
      { prompt: 'Do you like sushi?', answer: 'Yes, I like sushi. No, I don’t like sushi.' },
      { prompt: 'Is he taking the bus?', answer: 'Yes, he’s taking the bus. No, he isn’t taking the bus.' },
    ],
  },
  '0_1': {
    title: 'Level 1 Info for UG Speed',
    summary: '**Simple present** (I am, she doesn’t want) **+ subject + adjective/object**',
    bullets: [
      'Simple 3 to 5 word questions',
      'Few or no adjectives/adverbs',
      'No irregular grammar forms, other than irregular verbs',
    ],
    examples: [
      { prompt: 'Are you an engineer?', answer: 'Yes, I’m an engineer. No, I’m not an engineer.' },
      { prompt: 'Are you ready?', answer: 'Yes, I’m ready. No, I’m not ready.' },
    ],
  },
  '0_2': {
    title: 'Level 2 Info for UG Speed',
    summary: '**Present progressive** (I am going, she is running) **+ subject + adjective/object**',
    bullets: [
      'Simple 3 to 5 word questions',
      'Few or no adjectives/adverbs',
      'No irregular grammar forms, other than irregular verbs',
    ],
    examples: [
      { prompt: 'Is it raining today?', answer: 'Yes, it’s raining today. No, it isn’t raining today.' },
      { prompt: 'Are they making progress?', answer: 'Yes, they’re making progress. No, they’re not making progress.' },
    ],
  },
  '0_3': {
    title: 'Level 3 Info for UG Speed',
    summary: '**Simple past** (I went, she ate) **+ subject + adjective/object/verb**',
    bullets: [
      'Simple 3 to 6 word questions',
      'Few adjectives/adverbs',
      'No irregular grammar forms, other than irregular verbs',
    ],
    examples: [
      { prompt: 'Were you late this morning?', answer: 'Yes, I was late this morning. No, I wasn’t late this morning.' },
      { prompt: 'Was the client satisfied?', answer: 'Yes, the client was satisfied. No, the client wasn’t satisfied.' },
      { prompt: 'Did you eat breakfast?', answer: 'Yes, I ate breakfast. No, I didn’t eat breakfast.' },
    ],
  },
  '0_4': {
    title: 'Level 4 Info for UG Speed',
    summary: '**Simple future** (I will go…, They won’t finish…, He is going to travel…, etc.) **or going-to future + subject + adjective/object/verb**',
    bullets: [
      '4 to 7 word questions (includes “going to” as future)',
      'Few adjectives/adverbs',
      'Some prepositional phrases',
      'Irregular verbs and usage',
    ],
    examples: [
      { prompt: 'Will he quit the team?', answer: 'Yes, he’ll quit the team. No, he won’t quit the team.' },
      { prompt: 'Will she need to bring her passport?', answer: 'Yes, she’ll need to bring her passport. No, she won’t need to bring her passport.' },
      { prompt: 'Are you going to visit this weekend?', answer: 'Yes, I’m going to visit this weekend. No, I’m not going to visit this weekend.' },
    ],
  },
  '0_5': {
    title: 'Level 5 Info for UG Speed',
    summary: '**Present perfect** (I have been, he has eaten) **+ subject + object/adverb**',
    bullets: [
      '4 to 7 word questions',
      'Adjectives/adverbs',
      'Prepositional phrases',
      'Irregular verbs and usage',
    ],
    examples: [
      { prompt: 'Have you been to Japan recently?', answer: 'Yes, I’ve been to Japan recently. No, I haven’t been to Japan recently.' },
      { prompt: 'Has he gone home already?', answer: 'Yes, he’s gone home already. No, he hasn’t gone home yet.' },
    ],
  },
  '0_6': {
    title: 'Level 6 Info for UG Speed',
    summary: '**Simple present/present progressive** (they are swimming, I do love) **+ subject + object (more complex)**',
    bullets: [
      '5 + word questions',
      'Adjectives/adverbs',
      'Prepositional phrases',
      'Irregular verbs and usage',
    ],
    examples: [
      { prompt: 'Is he winning the primary?', answer: 'Yes, he’s winning the primary. No, he isn’t winning the primary.' },
      { prompt: 'Do you have anything to add to the agenda?', answer: 'Yes, I have something to add to the agenda. No, I don’t have anything to add to the agenda.' },
    ],
  },
  '0_7': {
    title: 'Level 7 Info for UG Speed',
    summary: '**Past progressive/past perfect** (they were going, he had been) **+ subject + object/adverb**',
    bullets: [
      '5 + word questions',
      'Adjectives/adverbs & adverbial phrases',
      'Prepositional phrases & gerunds',
      'Irregular verbs and usage',
      'Intermediate vocabulary',
    ],
    examples: [
      { prompt: 'Were they going to inform you?', answer: 'Yes, they were going to inform me. No, they weren’t going to inform me.' },
      { prompt: 'Had you forgotten about the deadline?', answer: 'Yes, I’d forgotten about the deadline. No, I hadn’t forgotten about the deadline.' },
    ],
  },
  '0_8': {
    title: 'Level 8 Info for UG Speed',
    summary: '**Various future tenses** (future continuous, going to future, future perfect, etc.) **+ subject + object/adverb**',
    bullets: [
      '5 + word questions',
      'Adjectives/adverbs & adverbial phrases',
      'Prepositional phrases & gerunds',
      'Irregular verbs and usage',
      'Irregular answer forms',
      'Intermediate vocabulary, occasional slang and idioms',
    ],
    examples: [
      { prompt: 'Will you be taking the train there?', answer: 'Yes, I’ll be taking the train there. No, I won’t be taking the train there.' },
      { prompt: 'Are they going to be back next week?', answer: 'Yes, they’re going to be back next week. No, they’re not going to be back next week.' },
    ],
  },
  '0_9': {
    title: 'Level 9 Info for UG Speed',
    summary: '**Simple past/past progressive/past perfect** (They realized, he wasn’t listening, I had forgotten) **+ Present perfect** (we have seen, you haven’t tried) **+ subject + object + negative questions (more complex)**',
    bullets: [
      '6 + word questions',
      'Adjectives/adverbs & adverbial phrases',
      'Prepositional phrases & gerunds',
      'Irregular verbs and usage',
      'Irregular answer forms',
      'Advanced & intermediate vocabulary, slang and idioms',
    ],
    examples: [
      { prompt: 'Was he the one causing all these problems?', answer: 'Yes, he was the one causing all these problems. No, he wasn’t the one causing all these problems.' },
      { prompt: 'Hadn’t she been complaining about this for years?', answer: 'Yes, she had been complaining about this for years. No, she hadn’t been complaining about this for years.' },
    ],
  },
  '0_10': {
    title: 'Level 10 Info for UG Speed',
    summary: '**Various verb tenses + embedded clauses + negative questions + TOEIC/TOEFL vocabulary**',
    bullets: [
      '6 + word questions',
      'All verb tenses, forms & phrasal verbs',
      'Adjectives/adverbs & adverbial phrases',
      'Prepositional phrases, gerunds & modals',
      'Irregular verbs and usage',
      'Irregular answer forms/inversions',
      'Advanced vocabulary, slang and idioms',
    ],
    examples: [
      { prompt: 'Didn’t you know he was terminated yesterday?', answer: 'Yes, I knew he was terminated yesterday. No, I didn’t know he was terminated yesterday.' },
      { prompt: 'Will you be taking notes, so I don’t have to?', answer: 'Yes, I’ll be taking notes, so you don’t have to. No, I won’t be taking notes, so you have to.' },
    ],
  },

  // ─── UG Structure ('4') ───
  '4_0': {
    title: 'Level Basic Info for UG Structure',
    summary: '**Simple Present, Present Continuous, Present Perfect, Simple Past, Simple Future (will, going to); definite and indefinite articles, subject and object pronouns, third person -s**',
    bullets: ['Basic 2 to 4 word statements', 'Modal verbs (should & can)'],
    examples: [
      { cue: 'Statement', answer: 'We make dinner.' },
      { cue: 'Cue 1: Use “reservations”', answer: 'We make reservations.' },
      { cue: 'Cue 2: Add “should”', answer: 'We should make reservations.' },
      { cue: 'Cue 3: Form a question', answer: 'Should we make reservations?' },
    ],
  },
  '4_1': {
    title: 'Level 1 Info for UG Structure',
    summary: '**Simple Present, Present Continuous, Present Perfect; definite and indefinite articles, third person -s**',
    bullets: ['Simple 3 to 5 word statements', 'Simple adjectives/adverbs'],
    examples: [
      { cue: 'Statement', answer: 'He is a banker.' },
      { cue: 'Cue 1: Use “they”', answer: 'They are bankers.' },
      { cue: 'Cue 2: Add “successful”', answer: 'They are successful bankers.' },
      { cue: 'Cue 3: Form a question', answer: 'Are they successful bankers?' },
    ],
  },
  '4_2': {
    title: 'Level 2 Info for UG Structure',
    summary: '**Simple Present, Present Continuous, Present Perfect; definite and indefinite Articles, direct and indirect objects, third person -s; prepositional phrases**',
    bullets: ['Simple 3 to 6 word statements', 'Few adjectives/adverbs', 'Few irregular verbs'],
    examples: [
      { cue: 'Statement', answer: 'Our hockey team has lost.' },
      { cue: 'Cue 1: Use “won”', answer: 'Our hockey team has won.' },
      { cue: 'Cue 2: Change to negative', answer: 'Our hockey team hasn’t won.' },
      { cue: 'Cue 3: Add “in weeks”', answer: 'Our hockey team hasn’t won in weeks.' },
    ],
  },
  '4_3': {
    title: 'Level 3 Info for UG Structure',
    summary: '**Simple Past, Past Continuous; adjectives & adverbs; prepositional phrases**',
    bullets: ['Simple 4 to 7 word statements', 'Irregular verbs and usage'],
    examples: [
      { cue: 'Statement', answer: 'My stepsister was dropping out of school.' },
      { cue: 'Cue 1: Use “quitting”', answer: 'My stepsister was quitting school.' },
      { cue: 'Cue 2: Add “to become an actor”', answer: 'My sister was quitting school to become an actor.' },
      { cue: 'Cue 3: Change to negative', answer: 'My sister wasn’t quitting school to become an actor.' },
    ],
  },
  '4_4': {
    title: 'Level 4 Info for UG Structure',
    summary: '**Simple Past, Past Continuous, Past Perfect; adjectives, adverbs & adverbial phrases (more complex), prepositional phrases (more complex)**',
    bullets: ['4 to 7 word statements', 'Irregular verbs and usage', 'Intermediate vocabulary'],
    examples: [
      { cue: 'Statement', answer: 'The leafy vegetables had wilted.' },
      { cue: 'Cue 1: Use “greens”', answer: 'The leafy greens had wilted.' },
      { cue: 'Cue 2: Add “and become soft”', answer: 'The leafy greens had wilted and become soft.' },
      { cue: 'Cue 3: Form a question', answer: 'Had the leafy greens wilted and become soft?' },
    ],
  },
  '4_5': {
    title: 'Level 5 Info for UG Structure',
    summary: '**Simple Past, Past Continuous, Past Perfect; past use of “used to”, “have to”, & “able to”; modals for ability and possibility (can, could, might, may)**',
    bullets: ['5-8 word statements', 'Irregular verbs and usage', 'Intermediate vocabulary'],
    examples: [
      { cue: 'Statement A', answer: 'Netflix used to send DVDs in the mail.' },
      { cue: 'Cue 1: Use “movie rentals”', answer: 'Netflix used to send movie rentals in the mail.' },
      { cue: 'Cue 2: Add “to their customers”', answer: 'Netflix used to send movie rentals to their customers in the mail.' },
      { cue: 'Cue 3: Form a question', answer: 'Did Netflix used to send movie rentals to their customers in the mail?' },
      { cue: 'Statement B', answer: 'The rain might have ruined our friend’s wedding.' },
      { cue: 'Cue 1: Use “Erika’s”', answer: 'The rain might have ruined Erika’s wedding.' },
      { cue: 'Cue 2: Add “heavy” to describe “rain”', answer: 'The heavy rain might have ruined Erika’s wedding.' },
      { cue: 'Cue 3: Add “outdoor” to describe “wedding”', answer: 'The heavy rain might have ruined Erika’s outdoor wedding.' },
    ],
  },
  '4_6': {
    title: 'Level 6 Info for UG Structure',
    summary: '**Simple Future, Future Continuous; future use of “going to”, “want to” and “able to”; modals for permission (can, could, may)**',
    bullets: ['6-10 word statements', 'Irregular verbs and usage', 'Intermediate vocabulary'],
    examples: [
      { cue: 'Statement A', answer: 'The two best friends will be touring.' },
      { cue: 'Cue 1: Use “three”', answer: 'The three best friends will be touring.' },
      { cue: 'Cue 2: Add “the wineries”', answer: 'The three best friends will be touring the wineries.' },
      { cue: 'Cue 3: Add “in California”', answer: 'The three best friends will be touring the wineries in California.' },
      { cue: 'Statement B', answer: 'His responsible ten-year-old brother may cook.' },
      { cue: 'Cue 1: Use “seven-year-old”', answer: 'His responsible seven-year-old brother may cook.' },
      { cue: 'Cue 2: Add “under supervision”', answer: 'His responsible seven-year-old brother may cook under supervision.' },
      { cue: 'Cue 3: Form a question', answer: 'May his responsible seven-year-old brother cook under supervision?' },
    ],
  },
  '4_7': {
    title: 'Level 7 Info for UG Structure',
    summary: '**Simple Future, Future Continuous, Future Perfect; modals for obligation (must, have to, need to)**',
    bullets: ['7-11 word statements', 'Upper-intermediate vocabulary'],
    examples: [
      { cue: 'Statement A', answer: 'America’s home sales will have been impacted.' },
      { cue: 'Cue 1: Use “worldwide”', answer: 'Worldwide home sales will have been impacted.' },
      { cue: 'Cue 2: Add “negatively”', answer: 'Worldwide home sales will have been negatively impacted.' },
      { cue: 'Cue 3: Change to negative', answer: 'Worldwide home sales won’t have been negatively impacted.' },
      { cue: 'Statement B', answer: 'Equal human rights must be top priority.' },
      { cue: 'Cue 1: Use “have to”', answer: 'Equal human rights have to be top priority.' },
      { cue: 'Cue 2: Add “the government’s”', answer: 'Equal human rights have to be the government’s top priority.' },
      { cue: 'Cue 3: Form a question', answer: 'Do equal human rights have to be the government’s top priority?' },
    ],
  },
  '4_8': {
    title: 'Level 8 Info for UG Structure',
    summary: '**Simple Future, Future Continuous, Future Perfect, Present Perfect Continuous; future use of “have to”; modal “should” (for advice, obligation, probability & expectation)**',
    bullets: ['8-12 word statements', 'Upper-intermediate vocabulary'],
    examples: [
      { cue: 'Statement A', answer: 'We have been trying to get a reservation.' },
      { cue: 'Cue 1: Use “the family”', answer: 'The family has been trying to get a reservation.' },
      { cue: 'Cue 2: Form a question', answer: 'Has the family been trying to get a reservation?' },
      { cue: 'Cue 3: Add “at the new pizza place”', answer: 'Has the family been trying to get a reservation at the new pizza place?' },
      { cue: 'Statement B', answer: 'Unhealthy people should stay inside.' },
      { cue: 'Cue 1: Use “home”', answer: 'Unhealthy people should stay home.' },
      { cue: 'Cue 2: Add “and avoid others”', answer: 'Unhealthy people should stay home and avoid others.' },
      { cue: 'Cue 3: Add “during the pandemic”', answer: 'Unhealthy people should stay home and avoid others during the pandemic.' },
    ],
  },
  '4_9': {
    title: 'Level 9 Info for UG Structure',
    summary: '**All verb tenses; modals (all); first and second conditionals; past use of “going to”**',
    bullets: [
      'Longer and more complex statements',
      'Irregular question forms with question words (why, when, where, how, etc)',
      'Advanced vocabulary',
    ],
    examples: [
      { cue: 'Statement A', answer: 'The new printer will help if it works properly.' },
      { cue: 'Cue 1: Form a yes/no question', answer: 'Will the new printer help if it works properly?' },
      { cue: 'Cue 2: Use “plotter”', answer: 'Will the new plotter help if it works properly?' },
      { cue: 'Cue 3: Add “colour”', answer: 'Will the new colour plotter help if it works properly?' },
      { cue: 'Statement B', answer: 'He told the media that he was selling the company.' },
      { cue: 'Cue 1: Use “buying”', answer: 'He told the media that he was buying the company.' },
      { cue: 'Cue 2: Add “tech”', answer: 'He told the media that he was buying the tech company.' },
      { cue: 'Cue 3: Form a question with “when”', answer: 'When did he tell the media that he was buying the tech company?' },
    ],
  },
  '4_10': {
    title: 'Level 10 Info for UG Structure',
    summary: '**All verb tenses; modals, 1st & 2nd conditionals, irregular question forms; common idiomatic phrases, dependent clauses**',
    bullets: ['Significantly longer statements', 'Advanced and TOEIC/TOEFL vocabulary'],
    examples: [
      { cue: 'Statement A', answer: 'She’d paid an arm and a leg for that meal.' },
      { cue: 'Cue 1: Form a yes/no question', answer: 'Had she paid an arm and a leg for that meal?' },
      { cue: 'Cue 2: Add gourmet', answer: 'Had she paid an arm and a leg for that gourmet meal?' },
      { cue: 'Cue 3: Change to negative', answer: 'Hadn’t she paid an arm and a leg for that gourmet meal?' },
      { cue: 'Statement B', answer: 'Even though the arrivals terminal has been renovated, it is still congested.' },
      { cue: 'Cue 1: Add “at Haneda”', answer: 'Even though the arrivals terminal at Haneda has been renovated, it is still congested.' },
      { cue: 'Cue 2: Use “departures”', answer: 'Even though the departures terminal at Haneda has been renovated, it is still congested.' },
      { cue: 'Cue 3: Form a yes/no question', answer: 'Is the departures terminal at Haneda still congested, even though it’s been renovated?' },
    ],
  },

  // ─── UG Builders ('5') ───
  '5_1': {
    title: 'Level 1 Info for UG Builders',
    summary: '**Tenses: Simple present**\n**“Add” cues comprise single words and short phrases of three words or fewer.**',
    examples: [
      { cue: 'Built Sentence', answer: 'My friend and I go to the gym every day.' },
      { cue: 'Base Verb', answer: '“go”' },
      { cue: 'Cue 1: Add “my friend”', answer: 'My friend goes.' },
      { cue: 'Cue 2: Add “and I”', answer: 'My friend and I go.' },
      { cue: 'Cue 3: Add “to the gym”', answer: 'My friend and I go to the gym.' },
      { cue: 'Cue 4: Add “every day”', answer: 'My friend and I go to the gym every day.' },
    ],
  },
  '5_2': {
    title: 'Level 2 Info for UG Builders',
    summary: '**Tenses: Simple past, present, and future tenses, as well as present continuous.**\n**“Add” cues comprise single words and short phrases of three words or fewer.**',
    examples: [
      { cue: 'Built Sentence', answer: 'She’ll bring us some water.' },
      { cue: 'Base Verb', answer: '“bring”' },
      { cue: 'Cue 1: Add “us”', answer: 'Bring us.' },
      { cue: 'Cue 2: Add “some water”', answer: 'Bring us some water.' },
      { cue: 'Cue 3: Add “she”', answer: 'She brings us some water.' },
      { cue: 'Cue 4: Add “will”', answer: 'She’ll bring us some water.' },
    ],
  },
  '5_3': {
    title: 'Level 3 Info for UG Builders',
    summary: '**Tenses: All previous tenses.**\n**“Add” cues comprise single words, short phrases, and short clauses of four words or fewer.**',
    examples: [
      { cue: 'Built Sentence', answer: 'Last night’s dinner was very expensive.' },
      { cue: 'Base Verb', answer: '“be”' },
      { cue: 'Cue 1: Add “dinner”', answer: 'Dinner is.' },
      { cue: 'Cue 2: Add “expensive”', answer: 'Dinner is expensive.' },
      { cue: 'Cue 3: Add “last night’s”', answer: 'Last night’s dinner was expensive.' },
      { cue: 'Cue 4: Add “very”', answer: 'Last night’s dinner was very expensive.' },
    ],
  },
  '5_4': {
    title: 'Level 4 Info for UG Builders',
    summary: '**Tenses: All previous tenses, plus present perfect.**\n**Add cues comprise single words, short phrases, and short clauses of five words or fewer.**',
    examples: [
      { cue: 'Built Sentence', answer: 'We’ve gone to this Italian restaurant before.' },
      { cue: 'Base Verb', answer: '“go”' },
      { cue: 'Cue 1: Add “we”', answer: 'We go.' },
      { cue: 'Cue 2: Add “to this restaurant”', answer: 'We go to this restaurant.' },
      { cue: 'Cue 3: Add “before”', answer: 'We’ve gone to this restaurant before.' },
      { cue: 'Cue 4: Add “Italian”', answer: 'We’ve gone to this Italian restaurant before.' },
    ],
  },
  '5_5': {
    title: 'Level 5 Info for UG Builders',
    summary: '**Tenses: All previous tenses, plus present perfect continuous.**\n**Add cues comprise single words, short phrases, and short clauses of five words or fewer.**',
    examples: [
      { cue: 'Built Sentence', answer: 'The books that we ordered should come today.' },
      { cue: 'Base Verb', answer: '“come”' },
      { cue: 'Cue 1: Add “the books”', answer: 'The books come.' },
      { cue: 'Cue 2: Add “should”', answer: 'The books should come.' },
      { cue: 'Cue 3: Add “today”', answer: 'The books should come today.' },
      { cue: 'Cue 4: Add “that we ordered”', answer: 'The books that we ordered should come today.' },
    ],
  },

  // ─── UG Mastery ('6') ───
  '6_1': {
    title: 'Level 1 Info for UG Mastery',
    summary: '**Tenses: Simple present, past, and future, as well as present continuous**\n**Sentence Length: 4 - 10 words**',
    examples: [
      { cue: 'Statement', answer: 'Jessica studies Japanese every day.' },
      { cue: 'Q1: What does Jessica study?', answer: 'She studies **Japanese**.' },
      { cue: 'Q2: When does Jessica study Japanese?', answer: 'She studies it **every day**.' },
      { cue: 'Q3: Do people use computers or books to study online?', answer: 'They use **computers**.' },
    ],
  },
  '6_2': {
    title: 'Level 2 Info for UG Mastery',
    summary: '**Tenses: All previous tenses**\n**Sentence Length: 5 - 10 words**',
    examples: [
      { cue: 'Statement', answer: 'My sister would like to take the earliest train.' },
      { cue: 'Q1: Who would like to take the earliest train?', answer: '**Your sister** would.' },
      { cue: 'Q2: Which train would my sister like to take?', answer: 'She’d like to take **the earliest one**.' },
      { cue: 'Q3: Do trains leave from a station or a street?', answer: 'They leave from **a station**.' },
    ],
  },
  '6_3': {
    title: 'Level 3 Info for UG Mastery',
    summary: '**Tenses: All previous tenses**\n**Sentence Length: 6 - 12 words**',
    examples: [
      { cue: 'Statement', answer: 'Charlie used to be taller than his son.' },
      { cue: 'Q1: Who did Charlie used to be taller than?', answer: 'He used to be taller than **his son**.' },
      { cue: 'Q2: Who is taller now: Charlie or his son?', answer: '**Charlie’s son** is taller.' },
      { cue: 'Q3: Are sons male or female?', answer: 'Sons are **male**.' },
    ],
  },
  '6_4': {
    title: 'Level 4 Info for UG Mastery',
    summary: '**Tenses: All previous tenses as well as present perfect continuous**\n**Sentence Length: 6 - 14 words**',
    examples: [
      { cue: 'Statement', answer: 'Sarah had to meet her boss before going for lunch.' },
      { cue: 'Q1: What did Sarah have to do?', answer: 'She had to **meet her boss**.' },
      { cue: 'Q2: When did Sarah have to meet with her boss?', answer: 'She had to meet with him **before going for lunch**.' },
      { cue: 'Q3: Do you prefer to have lunch with your boss or your coworkers?', answer: 'I prefer to have lunch with **my boss**. / I prefer to have lunch with **my coworkers**.' },
    ],
  },
  '6_5': {
    title: 'Level 5 Info for UG Mastery',
    summary: '**Tenses: All previous tenses as well as past continuous**\n**Sentence Length: 6 - 15 words**',
    examples: [
      { cue: 'Statement', answer: 'While Mary was printing the reports, I made some calls.' },
      { cue: 'Q1: What was Mary doing?', answer: 'She was **printing the reports**.' },
      { cue: 'Q2: What did I do while Mary was printing the reports?', answer: 'You **made some calls**.' },
      { cue: 'Q3: Do you prefer to make calls or write reports?', answer: 'I prefer to **write reports**. / I prefer to **make calls**.' },
    ],
  },
  '6_6': {
    title: 'Level 6 Info for UG Mastery',
    summary: '**Tenses: All previous tenses as well as past perfect**\n**Sentence Length: 7 - 17 words**',
    examples: [
      { cue: 'Statement', answer: 'We’d already ordered dinner by the time our friends arrived.' },
      { cue: 'Q1: What had we already done?', answer: 'You’d already **ordered dinner**.' },
      { cue: 'Q2: What happened after we’d already ordered dinner?', answer: '**Your friends arrived**.' },
      { cue: 'Q3: How often do you have dinner with your friends?', answer: 'I have dinner with them often. / I sometimes have dinner with them. / I never have dinner with them.' },
    ],
  },
  '6_7': {
    title: 'Level 7 Info for UG Mastery',
    summary: '**Tenses: All previous tenses**\n**Sentence Length: 9 - 17 words**',
    examples: [
      { cue: 'Statement', answer: 'I thought my company was going to pay for some of my moving expenses.' },
      { cue: 'Q1: Who did I think was going to pay for some of my expenses?', answer: 'You thought **your company** was.' },
      { cue: 'Q2: What kind of expenses did I think my company was going to pay for?', answer: 'You thought it was going to pay for some of **your moving expenses**.' },
      { cue: 'Q3: Did my company actually pay for some of my moving expenses?', answer: '**No**, it didn’t.' },
    ],
  },
  '6_8': {
    title: 'Level 8 Info for UG Mastery',
    summary: '**Tenses: All previous tenses as well as past perfect continuous, future continuous, and future perfect**\n**Sentence Length: 9 - 17 words**',
    examples: [
      { cue: 'Statement', answer: 'Kate was thinking of changing jobs; however, no one in her neighborhood was hiring bartenders.' },
      { cue: 'Q1: What was Kate thinking of doing?', answer: 'She was thinking of **changing jobs**.' },
      { cue: 'Q2: Why didn’t Kate change jobs?', answer: 'She didn’t change jobs **because no one in her neighborhood was hiring bartenders**.' },
      { cue: 'Q3: What does Kate do?', answer: '**She’s a bartender**.' },
    ],
  },
  '6_9': {
    title: 'Level 9 Info for UG Mastery',
    summary: '**Tenses: All tenses**\n**Sentences of any length**',
    examples: [
      { cue: 'Statement', answer: 'Since Julie was already going to the pharmacy, I asked her to pick up my prescription.' },
      { cue: 'Q1: What did I ask Julie to do?', answer: 'You asked her to **pick up your prescription**.' },
      { cue: 'Q2: Why did I ask Julie to pick up my prescription?', answer: 'You asked her to pick it up **because she was already going to the pharmacy**.' },
      { cue: 'Q3: Why do people take prescriptions?', answer: 'Because they’re sick. / Because they require medication.' },
    ],
  },
  '6_10': {
    title: 'Level 10 Info for UG Mastery',
    summary: '**Tenses: All tenses**\n**Sentences of any length**',
    examples: [
      { cue: 'Statement', answer: 'Thanks to my efforts, the organization is on its way to realizing its full potential.' },
      { cue: 'Q1: What’s the organization on its way to doing?', answer: 'It’s on its way to **realizing its full potential**.' },
      { cue: 'Q2: Why is the organization on its way to realizing its full potential?', answer: 'It’s on its way **because of your efforts**.' },
      { cue: 'Q3: How might someone realize their full potential?', answer: 'They might realize it with a lot of luck. / They might realize it with a lot of hard work.' },
    ],
  },
} as const;