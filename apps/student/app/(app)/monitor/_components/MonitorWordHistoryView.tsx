'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Calendar, 
  BookOpen, 
  MessageSquareText, 
  ShieldCheck, 
  ChevronDown, 
  User, 
  Search, 
  X, 
  Check,
  SlidersHorizontal 
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';

interface MonitorWordHistoryViewProps {
  initialData: MonitorWordSummaryHistoryItem[];
  users: MonitorUser[];
  startDate: string;
  endDate: string;
  selectedUserIds: string[];
}

interface GroupedWordHistory {
  [date: string]: MonitorWordSummaryHistoryItem[];
}

export const MonitorWordHistoryView: React.FC<MonitorWordHistoryViewProps> = ({ 
  initialData, 
  users, 
  startDate, 
  endDate, 
  selectedUserIds 
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  
  // 受講生検索用のローカル状態
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // フィルター共通更新処理
  const applyFilters = (newStart: string, newEnd: string, newUserIds: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('startDate', newStart);
    params.set('endDate', newEnd);
    
    if (newUserIds.length > 0) {
      params.set('userIds', newUserIds.join(','));
    } else {
      params.delete('userIds');
    }
    router.push(`/monitor?${params.toString()}`);
  };

  const handleDateSearch = () => {
    applyFilters(localStart, localEnd, selectedUserIds);
  };

  const toggleUserFilter = (uid: string) => {
    const newIds = selectedUserIds.includes(uid)
      ? selectedUserIds.filter(id => id !== uid)
      : [...selectedUserIds, uid];
    applyFilters(localStart, localEnd, newIds);
  };

  const clearAllUsers = () => {
    applyFilters(localStart, localEnd, []);
  };

  // 検索クエリで受講生リストをフィルタリング（20人以上でも即座に見つかる）
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return users;
    const q = userSearchQuery.toLowerCase();
    return users.filter(u => 
      (u.user_name?.toLowerCase().includes(q)) || 
      (u.email?.toLowerCase().includes(q))
    );
  }, [users, userSearchQuery]);

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

  const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="space-y-6">
      
      {/* ────────────── 🛠️ 20人規模に対応したインテリジェント・コントロールバー ────────────── */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-start md:items-end">
        
        {/* 1. 期間指定 */}
        <div className="w-full md:w-auto space-y-1.5 shrink-0">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-0.5 block">
            対象期間
          </label>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 rounded-xl p-1.5 shadow-2xs">
            <input 
              type="date" 
              value={localStart} 
              onChange={(e) => setLocalStart(e.target.value)}
              className="border-0 bg-transparent text-xs font-black text-slate-700 outline-none px-2 py-1 select-none" 
            />
            <span className="text-slate-300 font-bold text-xs">~</span>
            <input 
              type="date" 
              value={localEnd} 
              onChange={(e) => setLocalEnd(e.target.value)}
              className="border-0 bg-transparent text-xs font-black text-slate-700 outline-none px-2 py-1 select-none" 
            />
            <button 
              onClick={handleDateSearch}
              className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all flex items-center justify-center shadow-xs"
              title="期間を適用"
            >
              <Search size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 2. 受講生セレクト検索（ドロップダウン/コンボボックス型） */}
        <div className="w-full relative space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-0.5 flex items-center justify-between">
            <span>受講生絞り込み ({selectedUserIds.length > 0 ? `${selectedUserIds.length}名選択中` : '全員表示'})</span>
            {selectedUserIds.length > 0 && (
              <button onClick={clearAllUsers} className="text-indigo-600 hover:text-indigo-800 transition-colors normal-case font-bold text-[9px]">
                クリアする
              </button>
            )}
          </label>
          
          <div className="w-full md:max-w-md">
            {/* トリガー兼インクリメンタル検索入力窓 */}
            <div className="relative bg-white border border-slate-200/80 rounded-xl shadow-2xs flex items-center p-1.5">
              <SlidersHorizontal size={13} className="text-slate-400 ml-2 shrink-0" />
              <input
                type="text"
                placeholder={selectedUserIds.length > 0 ? "受講生を追加・検索..." : "受講生の名前・メールで検索..."}
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  setIsUserDropdownOpen(true);
                }}
                onFocus={() => setIsUserDropdownOpen(true)}
                className="w-full bg-transparent border-0 text-xs font-bold text-slate-700 placeholder-slate-400 focus:ring-0 outline-none px-2 py-1"
              />
              {userSearchQuery && (
                <button onClick={() => setUserSearchQuery('')} className="p-1 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
              <button 
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="p-1 border-l border-slate-100 text-slate-400 hover:text-slate-600 ml-1"
              >
                <ChevronDown size={14} className={cn("transition-transform duration-200", isUserDropdownOpen && "rotate-180")} />
              </button>
            </div>

            {/* ドロップダウンメニュー */}
            <AnimatePresence>
              {isUserDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsUserDropdownOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute left-0 right-0 md:max-w-md mt-1.5 bg-white border border-slate-200 shadow-xl rounded-xl z-20 max-h-60 overflow-y-auto scrollbar-none p-1.5 space-y-0.5"
                  >
                    {filteredUsers.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 text-xs font-bold">
                        該当する受講生が見つかりません
                      </div>
                    ) : (
                      filteredUsers.map(u => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleUserFilter(u.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between transition-colors",
                              isSelected 
                                ? "bg-indigo-50/60 text-indigo-700" 
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="font-extrabold">{u.user_name || '名前未設定'}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">{u.email}</span>
                            </div>
                            {isSelected && <Check size={14} className="text-indigo-600 shrink-0" strokeWidth={2.5} />}
                          </button>
                        );
                      })
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 3. 選択中バッジ表示エリア (ここに常時見せることで状態を見失わない) */}
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">
            絞り込み中:
          </span>
          {users.filter(u => selectedUserIds.includes(u.id)).map(u => (
            <div 
              key={u.id} 
              className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100/80 rounded-lg pl-2 pr-1.5 py-1 text-[10px] font-black text-indigo-600"
            >
              <span>{u.user_name || u.email}</span>
              <button 
                onClick={() => toggleUserFilter(u.id)}
                className="hover:bg-indigo-100 p-0.5 rounded-md transition-colors"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ────────────── 📄 履歴アコーディオンリスト ────────────── */}
      <div className="space-y-3">
        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
            <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">該当する履歴はありません</p>
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
                className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-2xs"
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
                        <span className="flex items-center gap-1 bg-blue-50/50 px-1.5 py-0.5 rounded-md border border-blue-100/40">
                          <BookOpen size={11} className="text-blue-500 shrink-0" />
                          <span className="font-mono text-slate-800 font-black">{totalWordsDay}単語</span>
                        </span>
                        <span className="flex items-center gap-1 bg-emerald-50/50 px-1.5 py-0.5 rounded-md border border-emerald-100/40">
                          <MessageSquareText size={11} className="text-emerald-500 shrink-0" />
                          <span className="font-mono text-slate-800 font-black">{totalPhrasesDay}フレーズ</span>
                        </span>
                        <span className="flex items-center gap-1 bg-amber-50/50 px-1.5 py-0.5 rounded-md border border-amber-100/40">
                          <ShieldCheck size={11} className="text-amber-500 shrink-0" />
                          <span className="font-mono text-slate-800 font-black">{totalAssessmentsDay}発話評価</span>
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
                      transition={{ duration: 0.18, ease: 'easeInOut' }}
                      className="border-t border-slate-100 bg-slate-50/30"
                    >
                      <div className="p-3 space-y-2">
                        {sessions.map((session, idx) => (
                          <div
                            key={`${session.content_id}-${session.com_m_user?.email || idx}`}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white border border-slate-200/60 rounded-lg hover:border-indigo-200 transition-all gap-2 group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-slate-300 font-mono w-4 text-center">{idx + 1}</span>
                              <div>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-black text-slate-800">{session.com_m_contents.content_name || 'Unknown Content'}</span>
                                  {session.com_m_user && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/50 border border-indigo-100/60 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                      <User size={10} strokeWidth={2.5} /> {session.com_m_user.user_name || session.com_m_user.email}
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