'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Calendar, BookOpen, MessageSquareText, ShieldCheck, ArrowLeft, ArrowRight, ChevronDown, Library, User } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';

interface MonitorWordHistoryViewProps {
  initialData: MonitorWordSummaryHistoryItem[];
  targetMonth: string;
  selectedUserIds: string[];
}

interface GroupedWordHistory {
  [date: string]: MonitorWordSummaryHistoryItem[];
}

export const MonitorWordHistoryView: React.FC<MonitorWordHistoryViewProps> = ({ initialData, targetMonth, selectedUserIds }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // 日付ごとにグループ化
  const groupedData = useMemo(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      const date = new Date(session.training_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => a.com_m_contents.content_name.localeCompare(b.com_m_contents.content_name));
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
    router.replace(`/monitor?${currentSearchParams.toString()}`, { scroll: false });
  };

  const [displayYear, displayMonth] = useMemo(() => {
    return targetMonth.split('-');
  }, [targetMonth]);
  
  const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">単語ドリル履歴</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleMonthChange(-1)} 
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-indigo-100/60 rounded-lg transition-all active:scale-90 border border-transparent flex items-center justify-center"
            title="前月"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          <span className="text-sm font-bold text-slate-800 font-mono select-none min-w-[90px] text-center">
            {displayYear}年 {parseInt(displayMonth)}月
          </span>
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
          <p className="text-xs font-bold text-slate-400">この月の単語ドリル履歴はありません</p>
        </div>
      ) : (
        sortedDates.map((date, index) => {
          const sessions = groupedData[date];
          const isExpanded = expandedDates.includes(date);

          const totalWordsDay = sessions.reduce((acc, s) => acc + s.word_count, 0);
          const totalPhrasesDay = sessions.reduce((acc, s) => acc + s.phrase_count, 0);
          const totalAssessmentsDay = sessions.reduce((acc, s) => acc + s.assessment_count, 0);

          return (
            <motion.div 
              key={date} 
              layout="position"
              className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-xs"
            >
              {/* 親アコーディオンヘッダー */}
              <button
                onClick={() => toggleDate(date)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-400 font-black text-sm font-mono shrink-0 select-none">
                    {sortedDates.length - index}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800 tracking-tight mb-1">{date}</div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <BookOpen size={11} className="text-blue-500 shrink-0" />
                        <span className="font-mono text-slate-800 font-black">{totalWordsDay}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquareText size={11} className="text-emerald-500 shrink-0" />
                        <span className="font-mono text-slate-800 font-black">{totalPhrasesDay}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck size={11} className="text-amber-500 shrink-0" />
                        <span className="font-mono text-slate-800 font-black">{totalAssessmentsDay}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                  <ChevronDown size={14} className="text-slate-400" />
                </div>
              </button>

              {/* 詳細リスト (アコーディオン) */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="border-t border-slate-100 bg-slate-50/30"
                  >
                    <div className="p-3 space-y-2">
                      {sessions.map((session, idx) => (
                        <div
                          key={`${session.content_id}-${session.com_m_user?.email || idx}`} // Ensure unique key
                          className="flex items-center justify-between p-3 bg-white border border-slate-200/60 rounded-lg hover:border-indigo-200 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-300 font-mono w-4 text-center">{idx + 1}</span>
                            <div>
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span className="text-xs font-bold text-slate-800">{session.com_m_contents.content_name || 'Unknown Content'}</span>
                                {session.com_m_user && (
                                  <span className="text-[9px] font-medium text-slate-500 flex items-center gap-1">
                                    <User size={10} /> {session.com_m_user.user_name || session.com_m_user.email}
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                                <span className="flex items-center gap-1">
                                  <BookOpen size={11} className="text-blue-500/80" /> 
                                  <span className="font-mono text-slate-700 font-extrabold">{session.word_count}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageSquareText size={11} className="text-emerald-500/80" /> 
                                  <span className="font-mono text-slate-700 font-extrabold">{session.phrase_count}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <ShieldCheck size={11} className="text-amber-500/80" /> 
                                  <span className="font-mono text-slate-700 font-extrabold">{session.assessment_count}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })
      )}
      </div>
    </div>
  );
};