'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinisherFigure, RunnerFigure } from './TrainingFigures';

interface MenuProgressTrackProps {
  doneCount: number;
  total: number;
}

/** 丸の大きさ。スマホでは丸の間が狭く、間を走る人が隣の丸に重ならないよう一回り小さくする */
const NODE_CLASS = 'flex size-6 shrink-0 items-center justify-center rounded-full sm:size-9';
/** 線の両端（スタートとゴールの丸の中心。丸の幅の半分だけ内側） */
const TRACK_INSET_CLASS = 'inset-x-3 sm:inset-x-4.5';
const PENDING_NODE_CLASS = cn(NODE_CLASS, 'border border-dashed border-white/45 bg-brand-600');
const RUN_DELAY_SEC = 0.4;
/** 1区間（丸と丸の間）を走る時間。走る距離が長いほど時間を延ばし、上限で抑える */
const RUN_SEC_PER_SECTION = 0.45;
const RUN_MIN_SEC = 0.8;
const RUN_MAX_SEC = 2;
const BOB_SEC = 0.35;
const STILL = { duration: 0 } as const;

/** 位置（スタート=0、やること=1〜total、ゴール=total+1）を、スタートからゴールまでの線の長さに対する割合にする */
const positionOf = (k: number, total: number) => `${(k / (total + 1)) * 100}%`;

/**
 * 今日のメニューの進み具合。スタート・やることの数の丸・ゴールを線でつなぎ、走る人が線の上を進む。
 * やることは順不同で終えられるため、丸はどのやることかではなく「いくつ終えたか」だけを表し、左から埋める。
 * 走る人は最後に埋まった丸と次の丸の中間にいて、開いた時にスタートから走ってくる（白い線も一緒に伸びる）。
 * すべて終えると、線がゴールまで伸びてテープを切る絵に変わる。読み上げでは「4つ中2つ完了」と1つの絵として読ませる。
 */
export function MenuProgressTrack({ doneCount, total }: MenuProgressTrackProps) {
  // 初回の描画はサーバーと同じ形にするため、動きを減らす設定の時も始点は変えず、動きの時間だけを 0 にする
  const reduceMotion = useReducedMotion();
  const isCompleted = doneCount >= total;
  const runnerAt = doneCount + 0.5;
  const fillTo = isCompleted ? '100%' : positionOf(runnerAt, total);
  const runSec = Math.min(
    RUN_MAX_SEC,
    Math.max(RUN_MIN_SEC, (isCompleted ? total + 1 : runnerAt) * RUN_SEC_PER_SECTION),
  );
  const runTransition = reduceMotion
    ? STILL
    : ({ duration: runSec, ease: [0.3, 0.7, 0.3, 1], delay: RUN_DELAY_SEC } as const);
  const bobTransition = {
    duration: BOB_SEC,
    ease: 'easeInOut',
    delay: RUN_DELAY_SEC,
    repeat: Math.max(0, Math.round(runSec / BOB_SEC) - 1),
  } as const;

  return (
    <div role="img" aria-label={`${total}つ中${doneCount}つ完了`} className="relative h-11">
      <div className={cn('absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25', TRACK_INSET_CLASS)}>
        <motion.div
          className="h-full rounded-full bg-white"
          initial={{ width: '0%' }}
          animate={{ width: fillTo }}
          transition={runTransition}
        />
      </div>

      <div className="relative flex h-full items-center justify-between">
        <span className={NODE_CLASS}>
          <span className="size-2.5 rounded-full bg-white sm:size-3" />
        </span>
        {Array.from({ length: total }, (_, i) =>
          i < doneCount ? (
            <span key={i} className={cn(NODE_CLASS, 'bg-white text-brand')}>
              <Check strokeWidth={3} className="size-3.5 sm:size-4.5" />
            </span>
          ) : (
            <span
              key={i}
              className={i === doneCount ? cn(NODE_CLASS, 'border-2 border-white bg-brand-500') : PENDING_NODE_CLASS}
            />
          ),
        )}
        {isCompleted ? (
          <span className={NODE_CLASS}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-brand ring-4 ring-gold/25 sm:size-11">
              <FinisherFigure className="size-6 sm:size-8" />
            </span>
          </span>
        ) : (
          <span className={cn(PENDING_NODE_CLASS, 'text-white')}>
            <Flag className="size-3.5 sm:size-4" />
          </span>
        )}
      </div>

      {!isCompleted && (
        <div className={cn('pointer-events-none absolute top-1/2', TRACK_INSET_CLASS)}>
          <motion.span
            className="absolute top-0 -translate-x-1/2 -translate-y-1/2"
            initial={{ left: '0%' }}
            animate={{ left: positionOf(runnerAt, total) }}
            transition={runTransition}
          >
            <motion.span
              className="flex size-7 items-center justify-center rounded-full bg-white text-brand shadow-md sm:size-9"
              animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
              transition={bobTransition}
            >
              <RunnerFigure className="size-5 sm:size-6" />
            </motion.span>
          </motion.span>
        </div>
      )}
    </div>
  );
}
