import { unstable_rethrow } from 'next/navigation';
import 'server-only';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { fetchSprintAvailableLevels } from '@gabby/lib/sprint/availableLevels';
import { getSprintTitle } from '@gabby/lib/sprint/utils';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createServerClient } from '@gabby/lib/supabase/server';
import {
  resolveTrainingMenuItemProgress,
  sprintSessionKey,
  type TrainingMenuFacts,
} from '@gabby/lib/trainingMenu/progress';
import { buildStandardMenu, type StandardMenuVideoCandidate } from '@gabby/lib/trainingMenu/standardMenu';
import type { BasicErrorCode, CoreResult } from '@gabby/types/action';
import { CONTENT_STATUS } from '@gabby/types/content';
import { QUESTION_TYPES, type SprintQuestionType } from '@gabby/types/sprint';
import { TRAINING_MENU_ITEM_TYPE, type TrainingMenuItemType } from '@gabby/types/trainingMenu';
import { VIDEO_CATEGORY } from '@gabby/types/video';
import { getMyTimezone } from './userTimezone';

const logger = createLogger('student');

const SPRINT_CONTENT_TYPE = 2;
const VIDEO_CONTENT_TYPE = 1;
/** 練習の少ない種別を数える期間 */
const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

/** ホームに出す、今日のメニューのやること1件 */
export interface TodayTrainingMenuItem {
  itemId: string;
  itemType: TrainingMenuItemType;
  /** スプリントは「UG Speed Lv.1」、ビデオはビデオのタイトル */
  title: string;
  /** ビデオの教材名（スプリントは null） */
  contentName: string | null;
  doneCount: number;
  targetCount: number;
  isCompleted: boolean;
  /** やることの画面（スプリントは種別・レベルを選んだ状態の選択画面、ビデオはそのビデオ） */
  href: string;
}

/** ホームに出す今日のトレーニングメニュー */
export interface TodayTrainingMenu {
  menuId: string;
  /** 生徒のタイムゾーンでの日付（YYYY-MM-DD） */
  menuDate: string;
  items: TodayTrainingMenuItem[];
  isCompleted: boolean;
}

const MENU_ITEM_SELECT =
  'item_id, seq_no, item_type, content_id, video_id, question_type, difficulty_level, target_count, completed_at, com_m_contents(content_name), com_m_video(title)';

/**
 * 今日のトレーニングメニュー（ホームの主役）。その日に初めて開いた時は標準メニューを組んで作る。
 * やることの完了は各トレーニングの記録から判定し、新しく終えたものの完了の日時を書く。
 * やることが1つも組めない生徒（見える教材が無い等）は data が null。
 */
export async function getTodayTrainingMenu(): Promise<CoreResult<{ data: TodayTrainingMenu | null }, BasicErrorCode>> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };
    const supabase = await createServerClient();
    const timezone = await getMyTimezone();
    const now = Date.now();
    const menuDate = toIsoDateInZone(now, timezone);

    let menu = await selectMenu(supabase, { userId: user.id, menuDate });
    if (!menu) {
      const items = await composeStandardMenu(supabase, user.id, now);
      if (items.length === 0) return { success: true, data: null };
      const { data: menuId, error } = await supabase.rpc('create_training_menu', { p_items: items });
      if (error) throw error;
      // 作る前と同じ問い合わせで読み直すと、1回の描画の中では同じ GET の結果（まだ無い）が使い回されるため、作ったメニューの ID で読む
      menu = await selectMenu(supabase, { menuId });
      if (!menu) throw new Error(`Created training menu was not readable: ${menuId}`);
    }

    const facts = await collectFacts(supabase, user.id, menu.items, menuDate, timezone, now);
    const items = menu.items.map((item) => {
      const progress = resolveTrainingMenuItemProgress(item, facts);
      // 一度終えたやることは、後で記録の日付がずれても（タイムゾーンの変更等）完了のままにする
      const isCompleted = item.completed_at !== null || progress.isCompleted;
      return { row: item, doneCount: isCompleted ? item.target_count : progress.doneCount, isCompleted };
    });

    await markCompleted(
      supabase,
      menu,
      items.filter((i) => i.isCompleted && i.row.completed_at === null).map((i) => i.row.item_id),
      items.every((i) => i.isCompleted),
    );

    return {
      success: true,
      data: {
        menuId: menu.menu_id,
        menuDate,
        isCompleted: items.every((i) => i.isCompleted),
        items: items.map(({ row, doneCount, isCompleted }) => toViewItem(row, doneCount, isCompleted)),
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('training_menu:get_today_failed', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

async function selectMenu(supabase: ServerClient, target: { userId: string; menuDate: string } | { menuId: string }) {
  const query = supabase
    .from('student_t_training_menu')
    .select(`menu_id, completed_at, items:student_t_training_menu_item(${MENU_ITEM_SELECT})`);
  const { data, error } = await (
    'menuId' in target
      ? query.eq('menu_id', target.menuId)
      : query.eq('user_id', target.userId).eq('menu_date', target.menuDate)
  ).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, items: [...data.items].sort((a, b) => a.seq_no - b.seq_no) };
}

type MenuRow = NonNullable<Awaited<ReturnType<typeof selectMenu>>>;
type MenuItemRow = MenuRow['items'][number];

/** 標準メニューの材料（汎用スプリントの教材・到達レベル・直近の練習・未視聴の発音トレーニングのビデオ）を集めて組む */
async function composeStandardMenu(supabase: ServerClient, userId: string, now: number) {
  const [sprintContent, progress, recent, videos] = await Promise.all([
    supabase
      .from('com_m_contents')
      .select('content_id')
      .eq('content_type', SPRINT_CONTENT_TYPE)
      .eq('status', CONTENT_STATUS.PUBLISHED)
      .eq('metadata->sprint->>sprint_type', '0')
      .order('seq_no', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('student_m_sprint_progress')
      .select('stage, level_speed, level_structure, level_builders, level_mastery, level_managed')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('self_t_sprint')
      .select('question_type')
      .eq('user_id', userId)
      .gte('insert_date', new Date(now - RECENT_DAYS * DAY_MS).toISOString()),
    selectUnwatchedPronunciationVideos(supabase, userId),
  ]);
  if (sprintContent.error) throw sprintContent.error;
  if (progress.error) throw progress.error;
  if (recent.error) throw recent.error;

  const sprintContentId = sprintContent.data?.content_id ?? null;
  const availableLevels = sprintContentId
    ? ((await fetchSprintAvailableLevels(supabase, [sprintContentId]))?.get(sprintContentId) ?? null)
    : null;

  const recentSessionCounts: Partial<Record<SprintQuestionType, number>> = {};
  for (const row of recent.data ?? []) {
    const type = row.question_type as SprintQuestionType;
    recentSessionCounts[type] = (recentSessionCounts[type] ?? 0) + 1;
  }

  return buildStandardMenu({
    sprint: sprintContentId ? { contentId: sprintContentId, availableLevels } : null,
    progress: progress.data,
    recentSessionCounts,
    videos,
  });
}

/** 発音トレーニングのビデオのうち、まだ最後まで見ていないものを教材・セクション・ビデオの並び順で返す */
async function selectUnwatchedPronunciationVideos(
  supabase: ServerClient,
  userId: string,
): Promise<StandardMenuVideoCandidate[]> {
  const [{ data: contents, error }, { data: watched, error: watchedError }] = await Promise.all([
    supabase
      .from('com_m_contents')
      .select('content_id, seq_no, com_m_video_section(section_id, seq_no, com_m_video(video_id, seq_no))')
      .eq('content_type', VIDEO_CONTENT_TYPE)
      .eq('category_id', VIDEO_CATEGORY.PRONUNCIATION)
      .eq('status', CONTENT_STATUS.PUBLISHED)
      .order('seq_no', { ascending: true }),
    supabase.from('student_m_video_progress').select('video_id').eq('user_id', userId).not('completed_at', 'is', null),
  ]);
  if (error) throw error;
  if (watchedError) throw watchedError;

  const watchedIds = new Set((watched ?? []).map((w) => w.video_id));
  const bySeq = (a: { seq_no: number }, b: { seq_no: number }) => a.seq_no - b.seq_no;
  return (contents ?? []).flatMap((content) =>
    [...content.com_m_video_section].sort(bySeq).flatMap((section) =>
      [...section.com_m_video]
        .sort(bySeq)
        .filter((video) => !watchedIds.has(video.video_id))
        .map((video) => ({ contentId: content.content_id, sectionId: section.section_id, videoId: video.video_id })),
    ),
  );
}

/** 完了の判定に使う実績（その日のタイムアタックの回数・見終えたビデオ）を集める */
async function collectFacts(
  supabase: ServerClient,
  userId: string,
  items: MenuItemRow[],
  menuDate: string,
  timezone: string,
  now: number,
): Promise<TrainingMenuFacts> {
  const videoIds = items.flatMap((i) => (i.video_id ? [i.video_id] : []));
  const hasSprint = items.some((i) => i.item_type === TRAINING_MENU_ITEM_TYPE.SPRINT);

  const [sessions, videos] = await Promise.all([
    hasSprint
      ? supabase
          .from('self_t_sprint')
          .select('content_id, question_type, difficulty_level, insert_date')
          .eq('user_id', userId)
          // どのタイムゾーンでもその日を覆うよう2日前から取り、生徒のタイムゾーンの日付で絞る
          .gte('insert_date', new Date(now - 2 * DAY_MS).toISOString())
      : Promise.resolve({ data: [], error: null }),
    videoIds.length > 0
      ? supabase
          .from('student_m_video_progress')
          .select('video_id')
          .eq('user_id', userId)
          .in('video_id', videoIds)
          .not('completed_at', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessions.error) throw sessions.error;
  if (videos.error) throw videos.error;

  const sprintSessionCounts = new Map<string, number>();
  for (const s of sessions.data ?? []) {
    if (toIsoDateInZone(s.insert_date, timezone) !== menuDate) continue;
    const key = sprintSessionKey(s.content_id, s.question_type, s.difficulty_level);
    sprintSessionCounts.set(key, (sprintSessionCounts.get(key) ?? 0) + 1);
  }
  return { sprintSessionCounts, completedVideoIds: new Set((videos.data ?? []).map((v) => v.video_id)) };
}

/** 新しく終えたやることと、すべて終えたメニューに完了の日時を書く（本人の権限。書けなくても表示は続ける） */
async function markCompleted(supabase: ServerClient, menu: MenuRow, itemIds: string[], isMenuCompleted: boolean) {
  const completedAt = new Date().toISOString();
  const results = await Promise.all([
    itemIds.length > 0
      ? supabase
          .from('student_t_training_menu_item')
          .update({ completed_at: completedAt })
          .in('item_id', itemIds)
          .is('completed_at', null)
      : null,
    isMenuCompleted && menu.completed_at === null
      ? supabase
          .from('student_t_training_menu')
          .update({ completed_at: completedAt })
          .eq('menu_id', menu.menu_id)
          .is('completed_at', null)
      : null,
  ]);
  const failed = results.find((r) => r?.error);
  if (failed?.error) {
    const ctx = await getLogContext();
    logger.warn('training_menu:mark_completed_failed', failed.error.message, {
      ...ctx,
      err: failed.error,
      payload: { menuId: menu.menu_id },
    });
  }
}

function toViewItem(row: MenuItemRow, doneCount: number, isCompleted: boolean): TodayTrainingMenuItem {
  const base = { itemId: row.item_id, itemType: row.item_type, doneCount, targetCount: row.target_count, isCompleted };
  if (row.item_type === TRAINING_MENU_ITEM_TYPE.VIDEO && row.video_id) {
    return {
      ...base,
      title: row.com_m_video?.title ?? '',
      contentName: row.com_m_contents?.content_name ?? null,
      href: `/training/video/${row.content_id}?v=${row.video_id}`,
    };
  }
  const type = row.question_type ?? '0';
  const level = row.difficulty_level ?? 0;
  const params = new URLSearchParams({
    mode: 'sprint',
    type,
    level: String(level),
    time_limit_sec: String(QUESTION_TYPES[type].recommendedTimeSec),
    content_id: row.content_id,
    sprint_type: '0',
  });
  return {
    ...base,
    title: getSprintTitle(type, level),
    contentName: null,
    href: `/training/sprint/play?${params.toString()}`,
  };
}
