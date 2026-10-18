'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAcquiredSprintLevelLabel, isSprintLevelNotReached } from '@gabby/lib';
import {
  SPRINT_LEVEL_NOT_REACHED,
  SPRINT_LEVEL_NOT_REACHED_HINT,
  SPRINT_LEVEL_NOT_REACHED_SHORT,
} from './sprintLevelLabels';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  type BaseTickContentProps,
} from 'recharts';
import { StageLevelDialog } from './StageLevelDialog';

interface SprintProgressRadarProps {
  studentId: string;
  progress: StudentSprintProgress;
}

const TYPE_ORDER = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

interface RadarDatum {
  type: string;
  axisLabel: string;
  levelLabel: string;
  /** Lv.1から始まる種別で、まだ Lv.1 を習得していない */
  notReached: boolean;
  maxLevel: number;
  percent: number;
}

function buildRadarData(progress: StudentSprintProgress): RadarDatum[] {
  return TYPE_ORDER.map((type) => {
    const level = (progress[type.dbKey as keyof StudentSprintProgress] as number) ?? type.minLevel;
    const percent = ((level - type.minLevel) / (type.maxLevel - type.minLevel)) * 100;
    return {
      type: type.label,
      axisLabel: type.label.replace(/^UG\s+/, ''),
      levelLabel: formatAcquiredSprintLevelLabel(type.value, level, SPRINT_LEVEL_NOT_REACHED),
      notReached: isSprintLevelNotReached(type.value, level),
      maxLevel: type.maxLevel,
      percent: Math.max(0, Math.min(100, percent)),
    };
  });
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: { payload: RadarDatum }[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">
      {datum.type}: {datum.levelLabel} <span className="text-slate-400">/ Lv.{datum.maxLevel}</span>
    </div>
  );
}

function AngleTick({ x, y, textAnchor, payload }: BaseTickContentProps) {
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={11} fontWeight={700} fill="#334155">
      {payload.value}
    </text>
  );
}

export function SprintProgressRadar({ studentId, progress: initialProgress }: SprintProgressRadarProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const data = buildRadarData(progress);

  return (
    <div className="w-full">
      <div className="flex items-start gap-4">
        <div className="shrink-0 h-56 flex flex-col">
          <span className="self-start text-[11px] font-bold text-slate-400 tracking-wide">Sprint Progress</span>
          <div className="flex-1 flex flex-col justify-center space-y-1.5">
            <span className="inline-flex self-center text-[11px] font-black text-brand bg-brand-50 border border-brand-100 rounded-full px-2.5 py-0.5">
              Stage {progress.stage}
            </span>
            {!progress.level_managed && (
              <span
                className="self-center text-[11px] font-semibold text-slate-500"
                title="Level management is off for this student. They can select any level in self-training."
              >
                All levels unlocked
              </span>
            )}
            <div className="space-y-1">
              {data.map((datum) => (
                <div key={datum.type} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-500">{datum.type}</span>
                  {/* 未到達はレーダーの幅を狭めないよう短い表記にし、レベルの数字より控えめに表示する */}
                  <span
                    title={datum.notReached ? SPRINT_LEVEL_NOT_REACHED_HINT : undefined}
                    className={
                      datum.notReached
                        ? 'whitespace-nowrap text-[11px] font-semibold text-slate-400'
                        : 'font-bold text-slate-800 tabular-nums'
                    }
                  >
                    {datum.notReached ? SPRINT_LEVEL_NOT_REACHED_SHORT : datum.levelLabel}
                  </span>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-center mt-1 h-7 text-[11px]"
              onClick={() => setIsDialogOpen(true)}
            >
              <SlidersHorizontal size={12} />
              Manage Levels
            </Button>
          </div>
        </div>
        <div className="h-56 w-full max-w-xs min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="72%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="axisLabel" tick={AngleTick} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
              <Radar
                dataKey="percent"
                stroke="var(--color-brand-500)"
                fill="var(--color-brand-500)"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Tooltip content={<RadarTooltip />} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <StageLevelDialog
        studentId={studentId}
        progress={progress}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onUpdated={setProgress}
      />
    </div>
  );
}
