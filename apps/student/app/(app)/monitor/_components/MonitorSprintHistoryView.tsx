'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Zap, ArrowRight, ArrowLeft, History, Timer, User } from 'lucide-react';
import { cn } from "@/lib/utils";
import { SPRINT_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorSprintHistoryItem } from '@/actions/monitorAction';

interface MonitorSprintHistoryViewProps {
  initialData: MonitorSprintHistoryItem[];
  targetMonth: string;
  selectedUserIds: string[];
}

export const MonitorSprintHistoryView: React.FC<MonitorSprintHistoryViewProps> = ({ initialData, targetMonth, selectedUserIds }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // 日付ごとにグループ化
  const groupedData = useMemo(() => {
    const groups: Record<string, MonitorSprintHistoryItem[]> = {};
    
    initialData.forEach(session => {
      const date = new Date(session.insert_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    // 各日のセッションを「実施順（昇順）」にソート
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => new Date(a.insert_date).getTime() - new Date(b.insert_date).getTime());
    });

    return groups;
  }, [initialData]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const handleMonthChange = (offset: number) => {
    const [year, month] = targetMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.set('month', nextMonth);
    // Preserve selected user IDs in URL
    if (selectedUserIds.length > 0) {
      currentSearchParams.set('userIds', selectedUserIds.join(','));
    } else {
      currentSearchParams.delete('userIds');
    }
    router.replace(`/monitor?${currentSearchParams.toString()}`);
  };

  const [displayYear, displayMonth] = targetMonth.split('-');
  const sortedDates = Object.keys(groupedData);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">スプリント履歴</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleMonthChange(-1)} 
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-indigo-100/60 rounded-lg transition-all active:scale-90 border border-transparent flex items-center justify-center"
            title="前月"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          <h1 className="text-sm font-bold text-slate-800 font-mono select-none min-w-[90px] text-center">
            {displayYear}年 {parseInt(displayMonth)}月
          </h1>
          <button 
            onClick={() => handleMonthChange(1)} 
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-indigo-100/60 rounded-lg transition-all active:scale-90 border border-transparent flex items-center justify-center"
            title="来月"
          >
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-3">
      {sortedDates.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-8 text-center border border-dashed border-slate-200">
          <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-xs font-bold text-slate-400">この月のスプリント履歴はありません</p>
        </div>
      ) : (
        sortedDates.map((date, index) => {
          const sessions = groupedData[date];
          const isExpanded = expandedDates.includes(date);
          
          // 当月の通算実施日数インデックス
          const dayNo = sortedDates.length - index;

          // その日の総回答数を計算
          const totalAnswersDay = sessions.reduce((acc, s) => acc + s.total_answered, 0);

          return (
            <div key={date} className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-xs">
              {/* 1段目: 親アコーディオンヘッダー */}
              <button 
                onClick={() => toggleDate(date)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 bg-indigo-50/40 border border-indigo-100/50 rounded-lg flex items-center justify-center text-indigo-500/90 font-black text-sm font-mono shrink-0 select-none">
                    {dayNo}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800 tracking-tight mb-1">{date}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                      <span>
                        {sessions.length} {sessions.length === 1 ? 'Sprint' : 'Sprints'}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span className="text-amber-500 flex items-center gap-0.5">
                        {totalAnswersDay} {totalAnswersDay === 1 ? 'Answer' : 'Answers'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={cn("transition-transform duration-300", isExpanded ? "rotate-180" : "")}>
                  <ChevronRight size={14} className="text-slate-300" />
                </div>
              </button>

              {/* 2段目: 詳細リスト (アコーディオン) */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="border-t border-slate-50 bg-slate-50/30"
                  >
                    <div className="p-3 space-y-2">
                      {sessions.map((session, idx) => {
                        const typeInfo = SPRINT_TYPES[session.question_type as keyof typeof SPRINT_TYPES];
                        const isSpeedMode = session.question_type === '0';

                        return (
                          <div 
                            key={`${session.self_sprint_id}-${session.com_m_user?.email || idx}`} // Ensure unique key
                            className={cn(
                              "flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-md transition-all group cursor-pointer"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-indigo-400/80 font-mono w-4">{idx + 1}</span>
                              <div>
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="text-xs font-black text-slate-800 mr-0.5">{typeInfo?.label || 'Sprint'}</span>
                                  
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">
                                    {session.difficulty_level === 0 ? 'Basic' : `Lvl.${session.difficulty_level}`}
                                  </span>

                                  {isSpeedMode && (
                                    <span className={cn(
                                      "text-[9px] font-black px-1.5 py-0.5 rounded-md border tracking-wider",
                                      session.answer_type === '1'
                                        ? "bg-amber-50 border-amber-100 text-amber-600"
                                        : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                    )}>
                                      {session.answer_type === '1' ? 'NO' : 'YES'}
                                    </span>
                                  )}
                                  {session.com_m_user && (
                                    <span className="text-[9px] font-medium text-slate-500 flex items-center gap-1">
                                      <User size={10} /> {session.com_m_user.user_name || session.com_m_user.email}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                                  <span className="flex items-center gap-1"><Timer size={11} /> {session.time_limit_sec}秒</span>
                                  <span className="flex items-center gap-1"><Zap size={11} fill="currentColor" className="text-amber-400" /> {session.total_answered} {session.total_answered === 1 ? 'Answer' : 'Answers'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}
      </div>
    </div>
  );
};