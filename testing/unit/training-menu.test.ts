import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTrainingMenuItemProgress, sprintSessionKey } from '@gabby/lib/trainingMenu/progress';
import { buildStandardMenu, type StandardMenuInput } from '@gabby/lib/trainingMenu/standardMenu';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';
import type { SprintAvailableLevels } from '@gabby/types/sprint';
import { TRAINING_MENU_ITEM_TYPE } from '@gabby/types/trainingMenu';

/** 今日のトレーニングメニュー（標準メニューの組み方・やることの完了の判定） */

const ALL_LEVELS: SprintAvailableLevels = {
  '0': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  '4': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  '5': [1, 2, 3, 4, 5],
  '6': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

const progress = (overrides: Partial<StudentSprintProgress> = {}): StudentSprintProgress => ({
  stage: 0,
  level_speed: 0,
  level_structure: 0,
  level_builders: 0,
  level_mastery: 0,
  level_managed: true,
  ...overrides,
});

const input = (overrides: Partial<StandardMenuInput> = {}): StandardMenuInput => ({
  sprint: { contentId: 'nlt', availableLevels: ALL_LEVELS },
  progress: null,
  recentSessionCounts: {},
  videos: [],
  random: () => 0,
  ...overrides,
});

const sprintItems = (items: ReturnType<typeof buildStandardMenu>) =>
  items.flatMap((i) => (i.item_type === TRAINING_MENU_ITEM_TYPE.SPRINT ? [i] : []));

test('ステージ0の生徒: 次のステージの条件の Speed・Builders を、到達レベルの次（Lv.1）で出す', () => {
  const items = sprintItems(buildStandardMenu(input()));
  assert.deepEqual(
    items.map((i) => [i.question_type, i.difficulty_level, i.target_count]),
    [
      ['0', 1, 2],
      ['5', 1, 1],
    ],
  );
});

test('1つ目は直近7日で練習の少ない種別、同数なら次のステージまでの差が大きい種別', () => {
  const fewer = sprintItems(buildStandardMenu(input({ recentSessionCounts: { '0': 5, '5': 1 } })));
  assert.equal(fewer[0].question_type, '5');

  // ステージ3 → 次は Speed4・Builders4・Structure2・Mastery2。Structure は到達0で差が2、Speed は到達4で差が0
  const stage3 = progress({ stage: 3, level_speed: 4, level_builders: 3, level_structure: 0, level_mastery: 1 });
  const tied = sprintItems(buildStandardMenu(input({ progress: stage3 })));
  assert.equal(tied[0].question_type, '4');
});

test('2つ目は残りの種別から無作為に選ぶ（乱数で決まる）', () => {
  const stage3 = progress({ stage: 3, level_speed: 3, level_builders: 3, level_structure: 1, level_mastery: 1 });
  const pick = (r: number) => sprintItems(buildStandardMenu(input({ progress: stage3, random: () => r })))[1];
  const seconds = new Set([0, 0.4, 0.7, 0.99].map((r) => pick(r).question_type));
  assert.ok(seconds.size > 1);
  assert.ok(![...seconds].includes(sprintItems(buildStandardMenu(input({ progress: stage3 })))[0].question_type));
});

test('レベル: 問題の無いレベルは避け、レベル管理ありの生徒には到達レベル+1を超えるレベルを出さない', () => {
  const levels: SprintAvailableLevels = { '0': [0, 1, 3], '5': [1, 2] };
  const items = sprintItems(
    buildStandardMenu(
      input({ sprint: { contentId: 'nlt', availableLevels: levels }, progress: progress({ level_speed: 1 }) }),
    ),
  );
  // Speed の到達1 → 次の Lv.2 は問題が無いため、選べる中で問題のある最も低いレベル
  assert.equal(items.find((i) => i.question_type === '0')?.difficulty_level, 0);
});

test('教材に問題の無い種別は出さず、スプリントの教材が無ければスプリントを出さない', () => {
  const onlySpeed = sprintItems(
    buildStandardMenu(input({ sprint: { contentId: 'nlt', availableLevels: { '0': [0, 1, 2] } } })),
  );
  assert.deepEqual(
    onlySpeed.map((i) => i.question_type),
    ['0'],
  );
  assert.deepEqual(buildStandardMenu(input({ sprint: null })), []);
});

test('ビデオ: 未視聴の最初の1本と、同じセクションの続きの1本までを、スプリントの後に出す', () => {
  const videos = [
    { contentId: 'f1', sectionId: 's1', videoId: 'v1' },
    { contentId: 'f1', sectionId: 's1', videoId: 'v2' },
    { contentId: 'f1', sectionId: 's1', videoId: 'v3' },
  ];
  const items = buildStandardMenu(input({ videos }));
  assert.deepEqual(
    items.map((i) => [i.seq_no, i.item_type === TRAINING_MENU_ITEM_TYPE.VIDEO ? i.video_id : i.question_type]),
    [
      [1, '0'],
      [2, '5'],
      [3, 'v1'],
      [4, 'v2'],
    ],
  );

  const nextSection = buildStandardMenu(
    input({
      sprint: null,
      videos: [
        { contentId: 'f1', sectionId: 's1', videoId: 'v9' },
        { contentId: 'f1', sectionId: 's2', videoId: 'v10' },
      ],
    }),
  );
  assert.deepEqual(
    nextSection.map((i) => (i.item_type === TRAINING_MENU_ITEM_TYPE.VIDEO ? i.video_id : null)),
    ['v9'],
  );
});

test('完了の判定: スプリントは同じ教材・種別・レベルの回数、ビデオは最後まで見たか', () => {
  const sprint = {
    item_type: TRAINING_MENU_ITEM_TYPE.SPRINT,
    content_id: 'nlt',
    video_id: null,
    question_type: '0' as const,
    difficulty_level: 1,
    target_count: 2,
  };
  const facts = (count: number, videoIds: string[] = []) => ({
    sprintSessionCounts: new Map([
      [sprintSessionKey('nlt', '0', 1), count],
      [sprintSessionKey('nlt', '0', 2), 9],
    ]),
    completedVideoIds: new Set(videoIds),
  });
  assert.deepEqual(resolveTrainingMenuItemProgress(sprint, facts(1)), { doneCount: 1, isCompleted: false });
  assert.deepEqual(resolveTrainingMenuItemProgress(sprint, facts(3)), { doneCount: 2, isCompleted: true });

  const video = {
    ...sprint,
    item_type: TRAINING_MENU_ITEM_TYPE.VIDEO,
    video_id: 'v1',
    question_type: null,
    difficulty_level: null,
    target_count: 1,
  };
  assert.deepEqual(resolveTrainingMenuItemProgress(video, facts(0)), { doneCount: 0, isCompleted: false });
  assert.deepEqual(resolveTrainingMenuItemProgress(video, facts(0, ['v1'])), { doneCount: 1, isCompleted: true });
});
