'use client';

import React from 'react';

interface SprintTimerProps {
  currentSeconds: number;
  totalSeconds: number;
  size?: number;
}

export const SprintTimer: React.FC<SprintTimerProps> = ({
  currentSeconds,
  totalSeconds,
  size = 120,
}) => {
  // 安全弁: ゼロ除算防止
  const percentage = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;
  
  // SVG の円周計算
  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* 背景の円線 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* 動的に減少するタイマーの円線 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`transition-all duration-1000 ease-linear ${
            percentage < 30 ? 'stroke-destructive' : 'stroke-primary'
          }`}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      {/* 中央の残り秒数テキスト */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold tracking-tighter">
          {Math.max(0, currentSeconds)}
        </span>
      </div>
    </div>
  );
};