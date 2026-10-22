'use client';

import { ArrowRight, CheckCircle2, ChevronRight, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { SectionLoadError } from '@gabby/lib/components/common/SectionLoadError';
import { getContentTypeConfig, getTrainingMetricConfig, SPRINT_MODE_LABEL } from '@gabby/lib/content/ui';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { TRAINING_MENU_ITEM_TYPE } from '@gabby/types/trainingMenu';
import { VideoPlayerDialog } from '@/components/video/VideoPlayerDialog';
import { LOAD_ERROR_MESSAGE, RELOAD_LABEL } from '@/constants/network';
import type { TodayTrainingMenu, TodayTrainingMenuItem } from '@/lib/trainingMenu';
import { cn } from '@/lib/utils';
import { HeroBackdrop } from './HomeCard';
import { MenuProgressTrack } from './MenuProgressTrack';
import { WeekStrip, type WeekSummary } from './WeekStrip';

/** 今日のメニューの取得結果（取得に失敗した場合は 'error'。メニューを出さない環境・組めるやることが無い生徒は null） */
export type TodayMenuState = TodayTrainingMenu | null | 'error';

interface TodayMenuCardProps {
  menu: TodayMenuState;
  /** 今週の実績（現在時刻の確定前は null で骨組みにする） */
  week: WeekSummary | null;
}

const SPRINT = getTrainingMetricConfig('sprint');
const VIDEO = getContentTypeConfig(1);
const SPRINT_GROUP_LABEL = getContentTypeConfig(2).label;

const primaryLinkClass =
  'group inline-flex h-12 items-center gap-2 rounded-control bg-white px-6 text-sm font-bold text-brand shadow-sm hover:bg-brand-soft active:scale-[0.98] transition-all';
const secondaryLinkClass =
  'inline-flex h-12 items-center rounded-control border border-white/30 px-5 text-sm font-semibold text-white hover:bg-white/10 active:scale-[0.98] transition-all';
/** やること1件の面。スプリントの行もサムネイルのあるビデオ（サムネイル＋上下の余白）と同じ高さにそろえる */
const itemLinkClass =
  'group flex min-h-17.5 items-center gap-3 rounded-control bg-white text-ink shadow-xs hover:bg-brand-soft transition-colors';

/**
 * 主役カードの外形（本番と骨組みで共有する）。見出しの右（lg未満は下）に今週の帯を置き、その下にやること・ボタンを並べる。
 * ホームの1行を占め、やることの数で高さが変わっても隣のカードを引き伸ばさない
 */
export const TODAY_MENU_LAYOUT = {
  frame: 'relative overflow-hidden rounded-card bg-brand-hero p-6 sm:p-8 text-white shadow-md shadow-brand/15',
  header: 'relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between',
  heading: 'min-w-0 flex-1',
  /** スプリントとビデオの区画（両方ある時は md 以上で2列。片方だけの時は区画の中のやることを2列にする） */
  groups: (groupCount: number) =>
    cn('relative mt-6 grid grid-cols-1 gap-x-4 gap-y-5', groupCount > 1 && 'md:grid-cols-2'),
  items: (groupCount: number) => cn('grid grid-cols-1 gap-2', groupCount === 1 && 'md:grid-cols-2'),
  actions: 'relative mt-6 flex flex-wrap items-center gap-3',
} as const;

function HeroFrame({
  week,
  heading,
  children,
}: {
  week: WeekSummary | null;
  heading: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={TODAY_MENU_LAYOUT.frame}>
      <HeroBackdrop />
      <div className={TODAY_MENU_LAYOUT.header}>
        <div className={TODAY_MENU_LAYOUT.heading}>{heading}</div>
        <WeekStrip week={week} />
      </div>
      {children}
    </section>
  );
}

function ItemStatus({ isCompleted }: { isCompleted: boolean }) {
  return isCompleted ? (
    <CheckCircle2 size={20} className="shrink-0 text-emerald-500" aria-label="完了" />
  ) : (
    <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
  );
}

interface MenuItemProps {
  item: TodayTrainingMenuItem;
  /** ビデオをその場で再生する */
  onPlay: (item: TodayTrainingMenuItem) => void;
}

/** スプリントのやること1件の行（白い面。終えたものはチェックを付けて控えめにする） */
function SprintItemRow({ item }: MenuItemProps) {
  const { icon: Icon, theme } = SPRINT;
  return (
    <li>
      <Link href={item.href} className={cn(itemLinkClass, 'px-3 py-2')}>
        <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-control', theme.iconTile)}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-bold', item.isCompleted && 'text-ink-muted')}>{item.title}</p>
          <p className="truncate text-xs text-ink-muted">
            {`${SPRINT_MODE_LABEL.sprint} ${item.doneCount} / ${item.targetCount}回`}
          </p>
        </div>
        <ItemStatus isCompleted={item.isCompleted} />
      </Link>
    </li>
  );
}

/** ビデオのやること1件（サムネイルで中身が分かるようにし、タイトルは2行まで出す）。押すとその場で再生する */
function VideoItemCard({ item, onPlay }: MenuItemProps) {
  const detail = [item.contentName ?? VIDEO.label, item.durationSec !== null && formatVideoDuration(item.durationSec)]
    .filter(Boolean)
    .join('・');
  return (
    <li>
      <button type="button" onClick={() => onPlay(item)} className={cn(itemLinkClass, 'w-full p-2 pr-3 text-left')}>
        <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-control bg-canvas">
          {item.thumbnailUrl ? (
            <ExternalImage src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className={cn('flex h-full w-full items-center justify-center', VIDEO.theme.iconTile)}>
              <VIDEO.icon size={18} aria-hidden />
            </span>
          )}
          {!item.isCompleted && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/20 text-white">
              <Play size={18} fill="currentColor" aria-hidden />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'line-clamp-2 text-sm font-bold leading-snug wrap-anywhere',
              item.isCompleted && 'text-ink-muted',
            )}
          >
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{detail}</p>
        </div>
        <ItemStatus isCompleted={item.isCompleted} />
      </button>
    </li>
  );
}

/**
 * ホームの主役カード「今日のトレーニングメニュー」。その日のやることをスプリント・ビデオに分けて並べ、次にやることへ案内する。
 * 見出しには今週のトレーニングの帯を添える。ビデオは画面を移らずにその場で再生し、初めて見終えたら閉じた後にメニューを取り直す。
 * メニューを出さない環境（TRAINING_MENU_ENABLED）と、メニューを組めない生徒（見える教材が無い等）には、教材・お気に入りへの案内を出す。
 */
export function TodayMenuCard({ menu, week }: TodayMenuCardProps) {
  const router = useRouter();
  const [playing, setPlaying] = useState<TodayTrainingMenuItem | null>(null);
  /** その場の再生で見終えた時の保存（閉じた後、保存を待ってからメニューを取り直して完了を反映する） */
  const completedSave = useRef<Promise<unknown> | null>(null);

  if (menu === 'error') {
    return (
      <HeroFrame
        week={week}
        heading={
          <>
            <p className="text-xs font-semibold tracking-wide text-brand-100">今日のトレーニングメニュー</p>
            <SectionLoadError
              message={LOAD_ERROR_MESSAGE}
              retryLabel={RELOAD_LABEL}
              className="mt-4 border-solid border-transparent bg-surface"
            />
          </>
        }
      />
    );
  }

  if (!menu) {
    return (
      <HeroFrame
        week={week}
        heading={
          <>
            <p className="text-xs font-semibold tracking-wide text-brand-100">今日のトレーニング</p>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight">
              今日も少しだけ、英語に触れましょう
            </h2>
            <p className="mt-2 text-sm text-white/85">
              教材を選んでトレーニングを始めましょう。お気に入りからの復習もおすすめです。
            </p>
          </>
        }
      >
        <div className={TODAY_MENU_LAYOUT.actions}>
          <Link href="/library" className={primaryLinkClass}>
            教材を選ぶ
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/favorites" className={secondaryLinkClass}>
            お気に入りを復習
          </Link>
        </div>
      </HeroFrame>
    );
  }

  const doneItems = menu.items.filter((i) => i.isCompleted).length;
  const nextItem = menu.items.find((i) => !i.isCompleted);
  const remaining = menu.items.length - doneItems;
  const startLabel = doneItems === 0 ? 'メニューを始める' : '続きを始める';
  const groups = [
    {
      label: SPRINT_GROUP_LABEL,
      items: menu.items.filter((i) => i.itemType === TRAINING_MENU_ITEM_TYPE.SPRINT),
      Item: SprintItemRow,
    },
    {
      label: VIDEO.label,
      items: menu.items.filter((i) => i.itemType === TRAINING_MENU_ITEM_TYPE.VIDEO),
      Item: VideoItemCard,
    },
  ].filter((g) => g.items.length > 0);

  return (
    <HeroFrame
      week={week}
      heading={
        <>
          <p className="text-xs font-semibold tracking-wide text-brand-100">今日のトレーニングメニュー</p>
          <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight">
            {menu.isCompleted ? '今日のメニューを達成しました' : `あと${remaining}つで今日のメニューを達成`}
          </h2>
          <div className="mt-4">
            <MenuProgressTrack doneCount={doneItems} total={menu.items.length} />
          </div>
        </>
      }
    >
      <div className={TODAY_MENU_LAYOUT.groups(groups.length)}>
        {groups.map(({ label, items, Item }) => (
          <div key={label} className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-brand-100">{label}</p>
            <ul className={TODAY_MENU_LAYOUT.items(groups.length)}>
              {items.map((item) => (
                <Item key={item.itemId} item={item} onPlay={setPlaying} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={TODAY_MENU_LAYOUT.actions}>
        {nextItem?.videoId ? (
          <button type="button" onClick={() => setPlaying(nextItem)} className={primaryLinkClass}>
            {startLabel}
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : nextItem ? (
          <Link href={nextItem.href} className={primaryLinkClass}>
            {startLabel}
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ) : (
          <p className="text-sm text-white/85">
            おつかれさまでした。続けたい場合は、教材から選んでトレーニングできます。
          </p>
        )}
        <Link href="/library" className={secondaryLinkClass}>
          教材を選ぶ
        </Link>
      </div>

      <VideoPlayerDialog
        target={
          playing?.videoId
            ? { videoId: playing.videoId, title: playing.title, subtitle: playing.contentName, href: playing.href }
            : null
        }
        onClose={() => {
          setPlaying(null);
          const saved = completedSave.current;
          completedSave.current = null;
          if (saved) void saved.then(() => router.refresh());
        }}
        onCompleted={(saved) => {
          completedSave.current = saved;
        }}
      />
    </HeroFrame>
  );
}
