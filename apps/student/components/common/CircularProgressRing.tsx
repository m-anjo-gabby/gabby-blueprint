'use client';

import React from 'react';
import { motion, type Easing } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CircularProgressRingProps {
  /** 外枠のサイズ（px）。w-{size} h-{size} 相当 */
  size: number;
  /** SVG の viewBox サイズ。省略時は size と同じ */
  viewBoxSize?: number;
  /** 円の半径 */
  radius: number;
  strokeWidth: number;
  /** 0〜1 の進捗率。呼び出し側で timeLeft/maxTime 等から算出して渡す */
  progress: number;
  /** トラック（背景）側circleのクラス名 */
  trackClassName?: string;
  /** 進捗側circleのクラス名 */
  strokeClassName?: string;
  /** トラック側circleのfill（塗りつぶし色）。省略時は透明 */
  trackFill?: string;
  transitionDuration?: number;
  transitionEase?: Easing;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 円形プログレスリング（残り時間・スコア表示等）の共通シェル。
 * QuestionCard（録音カウントダウン）と SprintTimePlayer（発話評価ビジュアライザ）で
 * ほぼ同一のSVG構造・円周計算が個別実装されていたため、幾何情報（size/radius/strokeWidth等）と
 * 進捗率のみを受け取る薄いプレゼンテーション層として集約する。
 * 色分けや中央表示内容など、画面ごとに異なる「状態」のロジックは呼び出し側に残し、
 * ここでは一切持たない（children経由でコンポジションする）。
 */
export const CircularProgressRing: React.FC<CircularProgressRingProps> = ({
  size,
  viewBoxSize,
  radius,
  strokeWidth,
  progress,
  trackClassName = 'stroke-slate-100',
  strokeClassName = 'stroke-indigo-500',
  trackFill = 'transparent',
  transitionDuration = 1,
  transitionEase = 'linear',
  className,
  children,
}) => {
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const strokeDashoffset = circumference * (1 - clampedProgress);
  const vb = viewBoxSize ?? size;
  const center = vb / 2;

  return (
    <div className={cn('relative flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${vb} ${vb}`}>
        <circle cx={center} cy={center} r={radius} className={trackClassName} strokeWidth={strokeWidth} fill={trackFill} />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          className={strokeClassName}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset }}
          transition={{ duration: transitionDuration, ease: transitionEase }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};
