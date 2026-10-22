'use client';

import { ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { SectionLoadError } from '@gabby/lib/components/common/SectionLoadError';
import { getContentTypeConfig, getTrainingMetricConfig, SPRINT_MODE_LABEL } from '@gabby/lib/content/ui';
import { TRAINING_MENU_ITEM_TYPE } from '@gabby/types/trainingMenu';
import { LOAD_ERROR_MESSAGE, RELOAD_LABEL } from '@/constants/network';
import type { TodayTrainingMenu, TodayTrainingMenuItem } from '@/lib/trainingMenu';
import { cn } from '@/lib/utils';
import { HeroBackdrop, ProgressBar } from './HomeCard';

/** 今日のメニューの取得結果（取得に失敗した場合は 'error'。メニューを出さない環境・組めるやることが無い生徒は null） */
export type TodayMenuState = TodayTrainingMenu | null | 'error';

interface TodayMenuCardProps {
  menu: TodayMenuState;
}

const SPRINT = getTrainingMetricConfig('sprint');
const VIDEO = getContentTypeConfig(1);

const primaryLinkClass =
  'group inline-flex h-12 items-center gap-2 rounded-control bg-white px-6 text-sm font-bold text-brand shadow-sm hover:bg-brand-soft active:scale-[0.98] transition-all';
const secondaryLinkClass =
  'inline-flex h-12 items-center rounded-control border border-white/30 px-5 text-sm font-semibold text-white hover:bg-white/10 active:scale-[0.98] transition-all';

function HeroFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-card bg-brand-hero p-6 sm:p-8 text-white shadow-md shadow-brand/15">
      <HeroBackdrop />
      {children}
    </section>
  );
}

/** やること1件の行（白い面。終えたものはチェックを付けて控えめにする） */
function MenuItemRow({ item }: { item: TodayTrainingMenuItem }) {
  const isSprint = item.itemType === TRAINING_MENU_ITEM_TYPE.SPRINT;
  const { icon: Icon, theme } = isSprint ? SPRINT : VIDEO;
  const detail = isSprint
    ? `${SPRINT_MODE_LABEL.sprint} ${item.doneCount} / ${item.targetCount}回`
    : `${VIDEO.label}${item.contentName ? `・${item.contentName}` : ''}`;

  return (
    <li>
      <Link
        href={item.href}
        className="group flex items-center gap-3 rounded-control bg-white px-3 py-2.5 text-ink shadow-xs hover:bg-brand-soft transition-colors"
      >
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', theme.iconTile)}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-bold', item.isCompleted && 'text-ink-muted')}>{item.title}</p>
          <p className="truncate text-xs text-ink-muted">{detail}</p>
        </div>
        {item.isCompleted ? (
          <CheckCircle2 size={20} className="shrink-0 text-emerald-500" aria-label="完了" />
        ) : (
          <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
        )}
      </Link>
    </li>
  );
}

/**
 * ホームの主役カード「今日のトレーニングメニュー」。その日のやることを並べ、次にやることへ案内する。
 * メニューを出さない環境（TRAINING_MENU_ENABLED）と、メニューを組めない生徒（見える教材が無い等）には、教材・お気に入りへの案内を出す。
 */
export function TodayMenuCard({ menu }: TodayMenuCardProps) {
  if (menu === 'error') {
    return (
      <HeroFrame>
        <p className="relative text-xs font-semibold tracking-wide text-brand-100">今日のトレーニングメニュー</p>
        <SectionLoadError
          message={LOAD_ERROR_MESSAGE}
          retryLabel={RELOAD_LABEL}
          className="relative mt-4 border-solid border-transparent bg-surface"
        />
      </HeroFrame>
    );
  }

  if (!menu) {
    return (
      <HeroFrame>
        <p className="relative text-xs font-semibold tracking-wide text-brand-100">今日のトレーニング</p>
        <h2 className="relative mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight">
          今日も少しだけ、英語に触れましょう
        </h2>
        <p className="relative mt-2 text-sm text-white/85">
          教材を選んでトレーニングを始めましょう。お気に入りからの復習もおすすめです。
        </p>
        <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6">
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

  return (
    <HeroFrame>
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-brand-100">今日のトレーニングメニュー</p>
        <span className="shrink-0 text-xs font-semibold text-brand-100">
          {doneItems} / {menu.items.length} 完了
        </span>
      </div>
      <h2 className="relative mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight">
        {menu.isCompleted ? '今日のメニューを達成しました' : `あと${remaining}つで今日のメニューを達成`}
      </h2>
      <div className="relative mt-4">
        <ProgressBar percent={(doneItems / menu.items.length) * 100} tone="light" />
      </div>

      <ul className="relative mt-5 space-y-2">
        {menu.items.map((item) => (
          <MenuItemRow key={item.itemId} item={item} />
        ))}
      </ul>

      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6">
        {nextItem ? (
          <Link href={nextItem.href} className={primaryLinkClass}>
            {doneItems === 0 ? 'メニューを始める' : '続きを始める'}
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
    </HeroFrame>
  );
}
