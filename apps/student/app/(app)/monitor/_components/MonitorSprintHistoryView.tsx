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
  Download,
  Mic,
  CheckCircle2
} from 'lucide-react';
import { cn } from "@/lib/utils";

import { QUESTION_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorUser, MonitorSprintHistoryItem, MonitorSprintDrillHistoryItem, MonitorSprintHistoryResponse } from '@/actions/monitorAction';

export interface DisplayHistoryItem {
  id: string;
  key: string;
  mode: 'sprint' | 'drill';
  dateStr: string;
  user_id: string;
  user_name: string;
  isMonitor: boolean;
  content_id: string;
  content_name: string;
  sprint_count: number | string;
  answered_count: number;
  assessment_count: number | string;
}

interface MonitorSprintHistoryViewProps {
  initialData: MonitorSprintHistoryResponse;
  users: MonitorUser[];
  startDate: string;
  endDate: string;
  selectedUserIds: string[];
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

  // 💡 URLから includeMonitor の現在地を検知 (文字列の 'true' かどうか)
  const isIncludeMonitorActive = searchParams.get('includeMonitor') === 'true';

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

  // 💡 モニターユーザーであるかを判定するヘルパー関数
  const isMonitorUser = (u: any): boolean => {
    if (!u) return false;
    return u.is_monitor === true || !!u.email?.toLowerCase().includes('monitor');
  };

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

    // 💡 既存 of includeMonitor フラグを確実にURLクエリへマージして維持する
    if (isIncludeMonitorActive) {
      params.set('includeMonitor', 'true');
    } else {
      params.delete('includeMonitor');
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
    let result = users;

    // 💡 モニター非表示（includeMonitor=false）なら、ドロップダウンからもモニターを除外
    if (!isIncludeMonitorActive) {
      result = result.filter(u => !isMonitorUser(u));
    }

    if (!userSearchQuery) return result;
    const q = userSearchQuery.toLowerCase();
    return result.filter(u => 
      (u.user_name?.toLowerCase().includes(q)) || 
      (u.email?.toLowerCase().includes(q))
    );
  }, [users, userSearchQuery, isIncludeMonitorActive]);

  // 日付文字列のパースヘルパー (JSTなどのローカルタイム日付)
  const getLocalDateStr = (isoString: string): string => {
    const d = new Date(isoString);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  };

  // 💡 上位の設定（URLパラメータ）を適用した表示用ベースデータを作成（受講生・教材・モード単位で集約）
  const displayFilteredData = useMemo<DisplayHistoryItem[]>(() => {
    const sessions = initialData.sessions || [];
    const drills = initialData.drills || [];

    const filteredSessions = isIncludeMonitorActive 
      ? sessions 
      : sessions.filter(s => !isMonitorUser(s.com_m_user));

    const filteredDrills = isIncludeMonitorActive 
      ? drills 
      : drills.filter(d => !isMonitorUser(d.com_m_user));

    const map = new Map<string, DisplayHistoryItem>();

    // 1. スプリントセッションの集計
    filteredSessions.forEach(s => {
      const dateStr = getLocalDateStr(s.insert_date);
      const userIdKey = s.user_id || 'unknown';
      const contentIdKey = s.content_id || 'unknown';
      const key = `${dateStr}-${userIdKey}-sprint-${contentIdKey}`;

      if (map.has(key)) {
        const existing = map.get(key)!;
        if (typeof existing.sprint_count === 'number') {
          existing.sprint_count += 1;
        }
        existing.answered_count += s.total_answered;
      } else {
        map.set(key, {
          id: s.self_sprint_id,
          key,
          dateStr,
          user_id: userIdKey,
          user_name: s.com_m_user?.user_name || '未設定',
          isMonitor: isMonitorUser(s.com_m_user),
          mode: 'sprint',
          content_id: contentIdKey,
          content_name: s.com_m_contents?.content_name || 'Sprint',
          sprint_count: 1,
          answered_count: s.total_answered,
          assessment_count: '-'
        });
      }
    });

    // 2. ドリルサマリーの集計
    filteredDrills.forEach(d => {
      const dateStr = d.training_date;
      const userIdKey = d.user_id || 'unknown';
      const contentIdKey = d.content_id || 'unknown';
      const key = `${dateStr}-${userIdKey}-drill-${contentIdKey}`;

      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.answered_count += d.question_count;
        if (typeof existing.assessment_count === 'number') {
          existing.assessment_count += d.assessment_count;
        }
      } else {
        map.set(key, {
          id: d.summary_id,
          key,
          dateStr,
          user_id: userIdKey,
          user_name: d.com_m_user?.user_name || '未設定',
          isMonitor: isMonitorUser(d.com_m_user),
          mode: 'drill',
          content_id: contentIdKey,
          content_name: d.com_m_contents?.content_name || 'Drill',
          sprint_count: '-',
          answered_count: d.question_count,
          assessment_count: d.assessment_count
        });
      }
    });

    return Array.from(map.values());
  }, [initialData, isIncludeMonitorActive]);

  // 日付ごとにグループ化し、日付内でユーザーごと、さらにドリル→スプリントの順でソート
  const groupedData = useMemo<{ [dateStr: string]: DisplayHistoryItem[] }>(() => {
    const groups: { [dateStr: string]: DisplayHistoryItem[] } = {};
    
    displayFilteredData.forEach(item => {
      if (!groups[item.dateStr]) {
        groups[item.dateStr] = [];
      }
      groups[item.dateStr].push(item);
    });
    
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => {
        // 1. 受講生名でソートしてグループ化
        if (a.user_name !== b.user_name) {
          return a.user_name.localeCompare(b.user_name, 'ja');
        }
        // 2. 同じ受講生内では、ドリルモードが先、スプリントモードが後の順にする
        if (a.mode !== b.mode) {
          return a.mode === 'drill' ? -1 : 1;
        }
        // 3. 同じモード内では教材名順
        return a.content_name.localeCompare(b.content_name, 'ja');
      });
    });

    return groups;
  }, [displayFilteredData]);

  const sortedDates = useMemo<string[]>(() => {
    return Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [groupedData]);

  const daysPerPage = 7;
  const totalPages = Math.ceil(sortedDates.length / daysPerPage);
  const pagedDates = sortedDates.slice((page - 1) * daysPerPage, page * daysPerPage);

  // CSVエクスポート処理 (エクスポート対象も表示フィルターと連動)
  const handleExportCSV = (): void => {
    if (displayFilteredData.length === 0) return;

    const headers = ['日付', '受講生名', 'モード', '教材名', 'スプリント本数', '回答数', '発話数'];
    
    // 画面と同じソート順（日付降順 -> 受講生名 -> モード（ドリル→スプリント） -> 教材名）でフラットに展開
    const sortedItems: DisplayHistoryItem[] = [];
    sortedDates.forEach(date => {
      const items = groupedData[date] || [];
      sortedItems.push(...items);
    });

    const rows = sortedItems.map(item => {
      const date = item.dateStr;
      const modeStr = item.mode === 'sprint' ? 'スプリント' : 'ドリル';
      
      return [
        `"${date}"`,
        `"${item.user_name}"`,
        `"${modeStr}"`,
        `"${item.content_name}"`,
        item.sprint_count,
        item.answered_count,
        item.assessment_count
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileSuffix = isIncludeMonitorActive ? '_with_monitor' : '';
    link.setAttribute('download', `blueprint_sprint_drill_history_${startDate}_to_${endDate}${fileSuffix}.csv`);
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
                          const isMonitor = isMonitorUser(u);
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
                                <span className="font-extrabold">
                                  {u.user_name || '名前未設定'}
                                  {isMonitor && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-normal">Monitor</span>}
                                </span>
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
            disabled={displayFilteredData.length === 0}
            className={cn(
              "inline-flex items-center gap-2 justify-center text-xs font-bold h-9 px-4 rounded-xl shadow-2xs border transition-all bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
              displayFilteredData.length === 0 && "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            )}
          >
            <Download size={14} strokeWidth={2.5} className="text-slate-500" />
            <span className="hidden sm:inline">CSVエクスポート</span>
          </button>

          {/* 右上コンパクトページングコントロール */}
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
      <div className="max-h-[calc(100vh-290px)] overflow-y-auto pr-1.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {pagedDates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
            <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">該当する履歴はありません</p>
          </div>
        ) : (
          pagedDates.map((date, index) => {
            const items = groupedData[date];
            const dayNo = sortedDates.length - ((page - 1) * daysPerPage + index);
            
            const sprintCount = items.filter(i => i.mode === 'sprint').length;
            const drillCount = items.filter(i => i.mode === 'drill').length;
            const totalAnswersDay = items.reduce((acc, i) => acc + i.answered_count, 0);
            const totalAssessmentsDay = items.reduce((acc, i) => {
              const val = typeof i.assessment_count === 'number' ? i.assessment_count : 0;
              return acc + val;
            }, 0);

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
                        {sprintCount > 0 && (
                          <span className="flex items-center gap-1 bg-indigo-50 border border-indigo-100/30 px-1.5 py-0.5 rounded-md text-indigo-700 font-extrabold">
                            <span>スプリント <span className="font-mono text-xs">{sprintCount}</span></span>
                          </span>
                        )}
                        {drillCount > 0 && (
                          <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100/30 px-1.5 py-0.5 rounded-md text-emerald-700 font-extrabold">
                            <span>ドリル <span className="font-mono text-xs">{drillCount}</span></span>
                          </span>
                        )}
                        <span className="flex items-center gap-1 bg-emerald-50/50 px-1.5 py-0.5 rounded-md border border-emerald-100/40 text-slate-700">
                          <CheckCircle2 size={11} className="text-emerald-500 fill-emerald-500/10 shrink-0" />
                          <span>回答数 <span className="font-mono text-slate-900 font-black text-xs">{totalAnswersDay}</span></span>
                        </span>
                        {totalAssessmentsDay > 0 && (
                          <span className="flex items-center gap-1 bg-rose-50/50 px-1.5 py-0.5 rounded-md border border-rose-100/40 text-slate-700">
                            <Mic size={11} className="text-rose-500 shrink-0" />
                            <span>発話評価数 <span className="font-mono text-xs">{totalAssessmentsDay}</span></span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 明細リスト */}
                <div className="bg-white">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 border-b border-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono bg-slate-50/30">
                    <div className="col-span-2">受講生</div>
                    <div className="col-span-3">トレーニング教材</div>
                    <div className="col-span-5 text-left pl-1">トレーニング実績 (本数/回答/発話)</div>
                    <div className="col-span-2" />
                  </div>
                  <div className="divide-y divide-slate-50">
                    {items.map((item, idx) => {
                      const isMonitor = item.isMonitor;
                      const isSprint = item.mode === 'sprint';

                      return (
                        <div 
                          key={`${item.key}-${idx}`}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 py-3 hover:bg-indigo-50/20 transition-colors items-center group"
                        >
                          {/* 1. 受講生 */}
                          <div className="col-span-1 md:col-span-2 flex items-center gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 border border-indigo-100/50">
                                <User size={11} strokeWidth={2.5} />
                              </div>
                              <span className="text-xs font-black text-slate-700 truncate flex items-center gap-1">
                                {item.user_name}
                                {isMonitor && (
                                  <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-black font-mono scale-90 origin-left shrink-0">
                                    MONITOR
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* 2. トレーニング教材 */}
                          <div className="col-span-1 md:col-span-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* モードバッジ */}
                              <span className={cn(
                                "text-[9px] font-black px-1.5 py-0.5 rounded-md border tracking-wider shrink-0",
                                isSprint
                                  ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                  : "bg-emerald-50 border-emerald-100 text-emerald-600"
                              )}>
                                {isSprint ? 'スプリント' : 'ドリル'}
                              </span>
                              
                              {/* 教材名称 */}
                              <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors truncate" title={item.content_name}>
                                {item.content_name}
                              </span>
                            </div>
                          </div>

                          {/* 3. トレーニング実績（スプリント本数・回答数・発話数） */}
                          <div className="col-span-1 md:col-span-5 flex items-center justify-start gap-3 text-[10px]">
                            <div className="flex items-center gap-2 text-slate-500 font-bold font-mono">
                              {/* スプリント本数 */}
                              <span className="inline-flex items-center min-w-[56px]" title="スプリント本数">
                                <Zap size={11} className="text-amber-500/80 fill-amber-500/10 mr-1 shrink-0" />
                                <span className="font-mono text-slate-700 font-extrabold">{item.sprint_count}</span>
                              </span>
                              
                              {/* 回答数 */}
                              <span className="inline-flex items-center min-w-[56px]" title="回答数">
                                <CheckCircle2 size={11} className="text-emerald-500/80 mr-1 shrink-0" />
                                <span className="font-mono text-slate-700 font-extrabold">{item.answered_count}</span>
                              </span>
                              
                              {/* 発話数 */}
                              <span className="inline-flex items-center min-w-[56px]" title="発話数">
                                <Mic size={11} className="text-rose-500 mr-1 shrink-0" />
                                <span className="font-mono text-slate-700 font-extrabold">{item.assessment_count}</span>
                              </span>
                            </div>
                          </div>

                          {/* 4. 余白 */}
                          <div className="hidden md:block col-span-2" />
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