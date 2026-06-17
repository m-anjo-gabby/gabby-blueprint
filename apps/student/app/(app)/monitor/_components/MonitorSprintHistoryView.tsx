'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  User, 
  Search, 
  X, 
  Check, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Timer,
  SlidersHorizontal, 
  Calendar,
  Zap,
  Download
} from 'lucide-react';
import { cn } from "@/lib/utils";

import { SPRINT_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorUser, MonitorSprintHistoryItem } from '@/actions/monitorAction';

interface MonitorSprintHistoryViewProps {
  initialData: MonitorSprintHistoryItem[];
  users: MonitorUser[];
  startDate: string;
  endDate: string;
  selectedUserIds: string[];
}

interface GroupedSprintHistory {
  [date: string]: MonitorSprintHistoryItem[];
}

export const MonitorSprintHistoryView: React.FC<MonitorSprintHistoryViewProps> = ({ 
  initialData, 
  users, 
  startDate, 
  endDate, 
  selectedUserIds 
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localStart, setLocalStart] = useState<string>(startDate);
  const [localEnd, setLocalEnd] = useState<string>(endDate);
  const [page, setPage] = useState<number>(1);

  // 期間のインテリジェントバリデーション
  const dateRangeValidationError = useMemo<'reverse' | 'exceeded' | null>(() => {
    const start = new Date(localStart);
    const end = new Date(localEnd);
    
    if (start > end) {
      return 'reverse';
    }
    
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 186) {
      return 'exceeded';
    }
    
    return null;
  }, [localStart, localEnd]);

  const isInvalidRange = dateRangeValidationError !== null;

  // 受講生検索用のローカル状態
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState<boolean>(false);

  // フィルター共通更新処理
  const applyFilters = (newStart: string, newEnd: string, newUserIds: string[]): void => {
    if (isInvalidRange) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('startDate', newStart);
    params.set('endDate', newEnd);
    
    if (newUserIds.length > 0) {
      params.set('userIds', newUserIds.join(','));
    } else {
      params.delete('userIds');
    }
    setPage(1);
    router.push(`/monitor?${params.toString()}`);
  };

  const handleDateSearch = (): void => {
    applyFilters(localStart, localEnd, selectedUserIds);
  };

  const toggleUserFilter = (uid: string): void => {
    const newIds = selectedUserIds.includes(uid)
      ? selectedUserIds.filter(id => id !== uid)
      : [...selectedUserIds, uid];
    applyFilters(localStart, localEnd, newIds);
  };

  const clearAllUsers = (): void => {
    applyFilters(localStart, localEnd, []);
  };

  // 検索クエリで受講生リストをフィルタリング
  const filteredUsers = useMemo<MonitorUser[]>(() => {
    if (!userSearchQuery) return users;
    const q = userSearchQuery.toLowerCase();
    return users.filter(u => 
      (u.user_name?.toLowerCase().includes(q)) || 
      (u.email?.toLowerCase().includes(q))
    );
  }, [users, userSearchQuery]);

  // 日付ごとにグループ化
  const groupedData = useMemo<GroupedSprintHistory>(() => {
    const groups: GroupedSprintHistory = {};
    
    initialData.forEach(session => {
      const date = new Date(session.insert_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });
    
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => {
        const nameA = a.com_m_user?.user_name || '';
        const nameB = b.com_m_user?.user_name || '';
        const nameComp = nameA.localeCompare(nameB, 'ja');
        if (nameComp !== 0) return nameComp;
        return a.question_type.localeCompare(b.question_type);
      });
    });

    return groups;
  }, [initialData]);

  const sortedDates = useMemo<string[]>(() => {
    return Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [groupedData]);

  const daysPerPage = 7;
  const totalPages = Math.ceil(sortedDates.length / daysPerPage);
  const pagedDates = sortedDates.slice((page - 1) * daysPerPage, page * daysPerPage);

  // CSVエクスポート処理
  const handleExportCSV = (): void => {
    if (initialData.length === 0) return;

    const headers = ['日付', '受講生名', 'スプリント種別', '難易度レベル', '回答モード', '制限時間(秒)', '回答数'];
    
    const rows = initialData.map(session => {
      const date = new Date(session.insert_date).toLocaleDateString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
      const typeInfo = SPRINT_TYPES[session.question_type as keyof typeof SPRINT_TYPES];
      const levelStr = session.difficulty_level === 0 ? 'Basic' : `Lvl.${session.difficulty_level}`;
      const modeStr = session.question_type === '0' ? (session.answer_type === '1' ? 'NO' : 'YES') : '-';
      
      return [
        `"${date}"`,
        `"${session.com_m_user?.user_name || '未設定'}"`,
        `"${typeInfo?.label || 'Sprint'}"`,
        `"${levelStr}"`,
        `"${modeStr}"`,
        session.time_limit_sec,
        session.total_answered
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `blueprint_sprint_history_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      
      {/* ────────────── 🛠️ コントロールバー（固定レイアウトエリア） ────────────── */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row gap-5 items-start xl:items-center justify-between">
        
        <div className="flex flex-col md:flex-row gap-5 items-start md:items-center w-full xl:w-auto flex-1">
          {/* 1. 期間指定 */}
          <div className="w-full md:w-auto space-y-1.5 shrink-0">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-0.5 flex items-center gap-2">
              対象期間
              <span className={cn(
                "text-[9px] font-bold normal-case transition-colors",
                isInvalidRange ? "text-rose-500 animate-pulse" : "text-slate-400"
              )}>
                {dateRangeValidationError === 'reverse' && "(※開始日には終了日より前の日付を指定してください)"}
                {dateRangeValidationError === 'exceeded' && "(※最大半年まで指定可能)"}
                {!dateRangeValidationError && "(最大半年まで指定可能)"}
              </span>
            </label>
            <div className={cn(
              "flex items-center gap-1.5 bg-white border rounded-xl p-1.5 shadow-2xs transition-colors",
              isInvalidRange ? "border-rose-300 bg-rose-50/10" : "border-slate-200/80"
            )}>
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
                disabled={isInvalidRange}
                className={cn(
                  "h-7 px-2.5 rounded-lg transition-all flex items-center justify-center shadow-xs",
                  isInvalidRange ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
              >
                <Search size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* 2. 受講生セレクト検索 */}
          <div className="w-full relative space-y-1.5 max-w-md">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-0.5 flex items-center justify-between">
              <span>受講生絞り込み ({selectedUserIds.length > 0 ? `${selectedUserIds.length}名選択中` : '全員表示'})</span>
              {selectedUserIds.length > 0 && (
                <button onClick={clearAllUsers} className="text-indigo-600 hover:text-indigo-800 transition-colors normal-case font-bold text-[9px]">
                  クリアする
                </button>
              )}
            </label>
            
            <div className="w-full">
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

              <AnimatePresence>
                {isUserDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsUserDropdownOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 shadow-xl rounded-xl z-20 max-h-60 overflow-y-auto scrollbar-none p-1.5 space-y-0.5"
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
                                isSelected ? "bg-indigo-50/60 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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

        {/* 3. CSV ＆ 固定配置された右上ページングエリア */}
        <div className="w-full xl:w-auto flex flex-row sm:items-center justify-between xl:justify-end gap-4 self-end xl:self-center shrink-0 pt-1">
          {/* CSVボタン */}
          <button
            onClick={handleExportCSV}
            disabled={initialData.length === 0}
            className={cn(
              "inline-flex items-center gap-2 justify-center text-xs font-bold h-9 px-4 rounded-xl shadow-2xs border transition-all bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
              initialData.length === 0 && "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            )}
          >
            <Download size={14} strokeWidth={2.5} className="text-slate-500" />
            <span className="hidden sm:inline">CSVエクスポート</span>
          </button>

          {/* 💡 右上コンパクトページングコントロール */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl p-1 shadow-2xs">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={15} strokeWidth={3} />
              </button>
              
              <div className="flex items-center gap-1 text-[11px] select-none px-0.5">
                <span className="font-black text-slate-800 font-mono">{page}</span>
                <span className="text-slate-300 font-bold">/</span>
                <span className="text-slate-400 font-bold font-mono">{totalPages}</span>
              </div>
              
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={15} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. 選択中バッジ表示エリア */}
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">絞り込み中:</span>
          {users.filter(u => selectedUserIds.includes(u.id)).map(u => (
            <div key={u.id} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100/80 rounded-lg pl-2 pr-1.5 py-1 text-[10px] font-black text-indigo-600">
              <span>{u.user_name || u.email}</span>
              <button onClick={() => toggleUserFilter(u.id)} className="hover:bg-indigo-100 p-0.5 rounded-md transition-colors">
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ────────────── 📄 独立スクロール一覧表示エリア ────────────── */}
      {/* max-h-[calc(100vh-290px)] によってブラウザの高さに追従した内側スクロールを実現 */}
      <div className="max-h-[calc(100vh-290px)] overflow-y-auto pr-1.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {pagedDates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
            <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">該当する履歴はありません</p>
          </div>
        ) : (
          pagedDates.map((date, index) => {
            const sessions = groupedData[date];
            const dayNo = sortedDates.length - ((page - 1) * daysPerPage + index);
            const totalAnswersDay = sessions.reduce((acc, s) => acc + s.total_answered, 0);

            return (
              <motion.div 
                key={date} 
                layout="position"
                className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-2xs"
              >
                {/* 日付ヘッダー */}
                <div className="w-full p-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 bg-white border border-slate-200/60 rounded-lg flex items-center justify-center text-slate-400 font-black text-sm font-mono shrink-0 select-none shadow-3xs">
                      {dayNo}
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-800 tracking-tight mb-1">{date}</div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1 bg-slate-100/80 px-1.5 py-0.5 rounded-md border border-slate-200/40 text-slate-700">
                          <span>スプリント実施数 <span className="font-mono text-slate-900 font-black text-xs">{sessions.length}</span></span>
                        </span>
                        <span className="flex items-center gap-1 bg-amber-50/50 px-1.5 py-0.5 rounded-md border border-amber-100/40 text-slate-700">
                          <Zap size={11} className="text-amber-500 fill-amber-500" />
                          <span>総回答数 <span className="font-mono text-slate-900 font-black text-xs">{totalAnswersDay}</span></span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 明細リスト */}
                <div className="bg-white">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 border-b border-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono bg-slate-50/30">
                    <div className="col-span-3">受講生</div>
                    <div className="col-span-5">スプリント種別・設定</div>
                    <div className="col-span-4 text-left pl-1">実績</div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {sessions.map((session, idx) => {
                      const typeInfo = SPRINT_TYPES[session.question_type as keyof typeof SPRINT_TYPES];
                      const isSpeedMode = session.question_type === '0';

                      return (
                        <div 
                          key={`${session.self_sprint_id}-${session.com_m_user?.email || idx}`}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 py-3 hover:bg-indigo-50/20 transition-colors items-center group"
                        >
                          {/* だれが */}
                          <div className="col-span-1 md:col-span-3 flex items-center gap-3">
                            <span className="hidden md:block text-[9px] font-black text-slate-300 font-mono w-3">{idx + 1}</span>
                            {session.com_m_user && (
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 border border-indigo-100/50">
                                  <User size={11} strokeWidth={2.5} />
                                </div>
                                <span className="text-xs font-black text-slate-700 truncate">
                                  {session.com_m_user.user_name || '未設定'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* 何を */}
                          <div className="col-span-1 md:col-span-5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">{typeInfo?.label || 'Sprint'}</span>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100/40">
                                {session.difficulty_level === 0 ? 'Basic' : `Lvl.${session.difficulty_level}`}
                              </span>
                              {isSpeedMode && (
                                <span className={cn(
                                  "text-[9px] font-black px-1.5 py-0.5 rounded-md border tracking-wider",
                                  session.answer_type === '1' ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                )}>
                                  {session.answer_type === '1' ? 'NO' : 'YES'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* どれくらい */}
                          <div className="col-span-1 md:col-span-4 flex items-center justify-start gap-4 text-[10px]">
                            <div className="flex items-center gap-4 text-slate-500 font-bold font-mono">
                              <span className="flex items-center gap-0.5" title="制限時間">
                                <Timer size={11} className="text-slate-400 mr-1" /> 
                                <span className="font-mono text-slate-700 font-extrabold">{session.time_limit_sec}</span>
                              </span>
                              <span className="flex items-center gap-0.5" title="回答数">
                                <Zap size={11} className="text-amber-500/80 fill-amber-500/10 mr-1" /> 
                                <span className="font-mono text-slate-700 font-extrabold">{session.total_answered}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};