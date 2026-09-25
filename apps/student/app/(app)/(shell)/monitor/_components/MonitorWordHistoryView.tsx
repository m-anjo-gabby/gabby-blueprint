'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Calendar, 
  BookOpen, 
  MessageSquareText, 
  Mic, 
  ChevronDown, 
  User, 
  Search, 
  X, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  SlidersHorizontal,
  Download 
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDate } from '@gabby/lib/date/date';
import { logClientEvent } from '@gabby/lib/logger/actions';

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
  
  // 💡 管理者の設定タイムゾーンを取得（デフォルトは Asia/Tokyo）
  const timezone = useTimezone();

  const [localStart, setLocalStart] = useState<string>(startDate);
  const [localEnd, setLocalEnd] = useState<string>(endDate);
  const [page, setPage] = useState<number>(1);

  // URLから includeMonitor の現在地を検知
  const isIncludeMonitorActive = searchParams.get('includeMonitor') === 'true';

  // 期間のインテリジェントバリデーション
  const dateRangeValidationError = useMemo<'reverse' | 'exceeded' | null>(() => {
    // 💡 localStart/End は "YYYY-MM-DD" 形式のため、文字列比較と単純なタイムスタンプ差分で安全に検証可能
    if (localStart > localEnd) {
      return 'reverse';
    }
    
    const start = new Date(localStart);
    const end = new Date(localEnd);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 186) {
      return 'exceeded';
    }
    
    return null;
  }, [localStart, localEnd]);

  const isInvalidRange = dateRangeValidationError !== null;
  
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

    if (isIncludeMonitorActive) {
      params.set('includeMonitor', 'true');
    } else {
      params.delete('includeMonitor');
    }

    setPage(1);
    // 💡 router.push から router.replace に変更し、履歴の多重登録とスクロール位置のブレを防止
    router.replace(`/monitor?${params.toString()}`, { scroll: false });
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

  // インクリメンタル検索フィルタリング
  const filteredUsers = useMemo<MonitorUser[]>(() => {
    if (!userSearchQuery) return users;
    const q = userSearchQuery.toLowerCase();
    return users.filter(u => 
      (u.user_name?.toLowerCase().includes(q)) || 
      (u.email?.toLowerCase().includes(q))
    );
  }, [users, userSearchQuery]);

  // 日付・受講生名・教材名でグループ化及びソート
  const groupedData = useMemo<GroupedWordHistory>(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      // 💡 システム依存を廃止し、date.ts の formatZonedDate を使用して管理者の指定タイムゾーンで安全にグループ化
      const date = formatZonedDate(session.training_date, timezone);
      if (!date) return; // 万が一の不正値ガード

      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => {
        const nameA = a.com_m_user?.user_name || '';
        const nameB = b.com_m_user?.user_name || '';
        const nameComp = nameA.localeCompare(nameB, 'ja');
        if (nameComp !== 0) return nameComp;
        return a.com_m_contents.content_name.localeCompare(b.com_m_contents.content_name, 'ja');
      });
    });

    return groups;
  }, [initialData, timezone]);

  // グループ化した日付のソート（最新順）
  const sortedDates = useMemo<string[]>(() => {
    return Object.keys(groupedData).sort((a, b) => {
      // 💡 日付文字列(YYYY/MM/DD)をタイムスタンプにして降順ソート
      return new Date(b).getTime() - new Date(a).getTime();
    });
  }, [groupedData]);

  // ページネーション設定
  const daysPerPage = 7;
  const totalPages = Math.ceil(sortedDates.length / daysPerPage);
  const pagedDates = sortedDates.slice((page - 1) * daysPerPage, page * daysPerPage);

  // CSVエクスポート処理
  const handleExportCSV = (): void => {
    if (initialData.length === 0) return;

    logClientEvent({
      service: 'student',
      event: 'monitor:word_history_csv_exported',
      level: 'info',
      message: `Word history CSV exported: ${startDate}~${endDate}`,
      payload: { startDate, endDate, targetUserIds: selectedUserIds, rowCount: initialData.length }
    }).catch(() => {});

    const headers = ['日付', '受講生名', 'トレーニング教材', '単語数', 'フレーズ数', '発話評価数'];
    
    const rows = initialData.map(session => {
      // 💡 画面表示と完全に一致するタイムゾーン基準の日付を出力
      const date = formatZonedDate(session.training_date, timezone);
      return [
        `"${date}"`,
        `"${session.com_m_user?.user_name || '未設定'}"`,
        `"${session.com_m_contents?.content_name || 'Unknown'}"`,
        session.word_count,
        session.phrase_count,
        session.assessment_count
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileSuffix = isIncludeMonitorActive ? '_with_monitor' : '';
    link.setAttribute('download', `blueprint_word_drill_history_${startDate}_to_${endDate}${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      
      {/* ────────────── 🛠️ コントロールバー ────────────── */}
      <div className="bg-slate-50/50 border border-line/60 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row gap-5 items-start xl:items-center justify-between">
        
        <div className="flex flex-col md:flex-row gap-5 items-start md:items-center w-full xl:w-auto flex-1">
          {/* 1. 期間指定 */}
          <div className="w-full md:w-auto space-y-1.5 shrink-0">
            <label className="text-[11px] font-bold text-ink-subtle uppercase px-0.5 flex items-center gap-2">
              対象期間
              <span className={cn(
                "text-[11px] font-bold normal-case transition-colors",
                isInvalidRange ? "text-rose-500 animate-pulse" : "text-ink-subtle"
              )}>
                {dateRangeValidationError === 'reverse' && "(※開始日には終了日より前の日付を指定してください)"}
                {dateRangeValidationError === 'exceeded' && "(※最大半年まで指定可能)"}
                {!dateRangeValidationError && "(最大半年まで指定可能)"}
              </span>
            </label>
            <div className={cn(
              "flex items-center gap-1.5 bg-white border rounded-xl p-1.5 shadow-2xs transition-colors",
              isInvalidRange ? "border-rose-300 bg-rose-50/10" : "border-line/80"
            )}>
              <input 
                type="date" 
                value={localStart} 
                onChange={(e) => setLocalStart(e.target.value)}
                className="border-0 bg-transparent text-xs font-bold text-ink-soft outline-none px-2 py-1 select-none" 
              />
              <span className="text-ink-subtle font-bold text-xs">~</span>
              <input 
                type="date" 
                value={localEnd} 
                onChange={(e) => setLocalEnd(e.target.value)}
                className="border-0 bg-transparent text-xs font-bold text-ink-soft outline-none px-2 py-1 select-none" 
              />
              <button 
                onClick={handleDateSearch}
                disabled={isInvalidRange}
                className={cn(
                  "h-7 px-2.5 rounded-lg transition-all flex items-center justify-center shadow-xs",
                  isInvalidRange ? "bg-slate-200 text-ink-subtle cursor-not-allowed" : "bg-brand hover:bg-brand-strong text-white"
                )}
                title="期間を適用"
              >
                <Search size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* 2. 受講生セレクト検索 */}
          <div className="w-full relative space-y-1.5 max-w-md">
            <label className="text-[11px] font-bold text-ink-subtle uppercase px-0.5 flex items-center justify-between">
              <span>受講生絞り込み ({selectedUserIds.length > 0 ? `${selectedUserIds.length}名選択中` : '全員表示'})</span>
              {selectedUserIds.length > 0 && (
                <button onClick={clearAllUsers} className="text-brand hover:text-brand-800 transition-colors normal-case font-bold text-[11px]">
                  クリアする
                </button>
              )}
            </label>
            
            <div className="w-full">
              <div className="relative bg-white border border-line/80 rounded-xl shadow-2xs flex items-center p-1.5">
                <SlidersHorizontal size={13} className="text-ink-subtle ml-2 shrink-0" />
                <input
                  type="text"
                  placeholder={selectedUserIds.length > 0 ? "受講生を追加・検索..." : "受講生の名前・メールで検索..."}
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setIsUserDropdownOpen(true);
                  }}
                  onFocus={() => setIsUserDropdownOpen(true)}
                  className="w-full bg-transparent border-0 text-xs font-bold text-ink-soft placeholder-slate-400 focus:ring-0 outline-none px-2 py-1"
                />
                {userSearchQuery && (
                  <button onClick={() => setUserSearchQuery('')} className="p-1 text-ink-subtle hover:text-ink-soft">
                    <X size={12} />
                  </button>
                )}
                <button 
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="p-1 border-l border-line/70 text-ink-subtle hover:text-ink-soft ml-1"
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
                      className="absolute left-0 right-0 mt-1.5 bg-white border border-line shadow-xl rounded-xl z-20 max-h-60 overflow-y-auto p-1.5 space-y-0.5"
                    >
                      {filteredUsers.length === 0 ? (
                        <div className="p-3 text-center text-ink-subtle text-xs font-bold">
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
                                isSelected ? "bg-brand-soft/60 text-brand-strong" : "text-ink-soft hover:bg-slate-50 hover:text-ink"
                              )}
                            >
                              <div className="flex flex-col">
                                <span className="font-bold">{u.user_name || '名前未設定'}</span>
                                <span className="text-[11px] text-ink-subtle tabular-nums font-medium">{u.email}</span>
                              </div>
                              {isSelected && <Check size={14} className="text-brand shrink-0" strokeWidth={2.5} />}
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
          <button
            onClick={handleExportCSV}
            disabled={initialData.length === 0}
            className={cn(
              "inline-flex items-center gap-2 justify-center text-xs font-bold h-9 px-4 rounded-xl shadow-2xs border transition-all bg-white hover:bg-slate-50 text-ink-soft border-line",
              initialData.length === 0 && "bg-slate-100 text-ink-subtle border-line cursor-not-allowed"
            )}
          >
            <Download size={14} strokeWidth={2.5} className="text-ink-muted" />
            <span>CSVエクスポート</span>
          </button>

          {/* 右上コンパクトページングコントロール */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3 bg-white border border-line/80 rounded-xl p-1 shadow-2xs">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1} 
                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-slate-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={15} strokeWidth={3} />
              </button>
              
              <div className="flex items-center gap-1 text-[11px] select-none px-0.5">
                <span className="font-bold text-ink tabular-nums">{page}</span>
                <span className="text-ink-subtle font-bold">/</span>
                <span className="text-ink-subtle font-bold tabular-nums">{totalPages}</span>
              </div>
              
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages} 
                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-slate-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
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
          <span className="text-[11px] font-bold text-ink-subtle uppercase mr-1">
            絞り込み中:
          </span>
          {users.filter(u => selectedUserIds.includes(u.id)).map(u => (
            <div 
              key={u.id} 
              className="inline-flex items-center gap-1 bg-brand-soft border border-brand-100/80 rounded-lg pl-2 pr-1.5 py-1 text-[11px] font-bold text-brand"
            >
              <span>{u.user_name || u.email}</span>
              <button 
                onClick={() => toggleUserFilter(u.id)}
                className="hover:bg-brand-100 p-0.5 rounded-md transition-colors"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ────────────── 📄 独立スクロール一覧表示エリア ────────────── */}
      <div className="max-h-[calc(100vh-290px)] overflow-y-auto pr-1.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {pagedDates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-line">
            <Calendar size={32} className="mx-auto text-ink-subtle mb-3" />
            <p className="text-sm font-bold text-ink-subtle">該当する履歴はありません</p>
          </div>
        ) : (
          pagedDates.map((date, index) => {
            const sessions = groupedData[date] || [];
            const totalWordsDay = sessions.reduce((acc, s) => acc + s.word_count, 0);
            const totalPhrasesDay = sessions.reduce((acc, s) => acc + s.phrase_count, 0);
            const totalAssessmentsDay = sessions.reduce((acc, s) => acc + s.assessment_count, 0);
            const dayNo = sortedDates.length - ((page - 1) * daysPerPage + index);

            return (
              <motion.div 
                key={date} 
                layout="position"
                className="bg-white rounded-xl border border-line/60 overflow-hidden shadow-2xs"
              >
                {/* 日付ヘッダー */}
                <div className="w-full p-4 flex items-center justify-between bg-slate-50/50 border-b border-line/70">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 bg-white border border-line/60 rounded-lg flex items-center justify-center text-ink-subtle font-bold text-sm tabular-nums shrink-0 select-none shadow-3xs">
                      {dayNo}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink tracking-tight mb-1">{date}</div>
                      <div className="flex items-center gap-3 text-[11px] font-bold text-ink-soft flex-wrap">
                        <span className="flex items-center gap-1 bg-blue-50/50 px-1.5 py-0.5 rounded-md border border-blue-100/40 text-ink-soft">
                          <BookOpen size={11} className="text-blue-500 shrink-0" />
                          <span>単語数 <span className="tabular-nums font-bold text-ink text-xs">{totalWordsDay}</span></span>
                        </span>
                        <span className="flex items-center gap-1 bg-emerald-50/50 px-1.5 py-0.5 rounded-md border border-emerald-100/40 text-ink-soft">
                          <MessageSquareText size={11} className="text-emerald-500 shrink-0" />
                          <span>フレーズ数 <span className="tabular-nums font-bold text-ink text-xs">{totalPhrasesDay}</span></span>
                        </span>
                        <span className="flex items-center gap-1 bg-rose-50/50 px-1.5 py-0.5 rounded-md border border-rose-100/40 text-ink-soft">
                          <Mic size={11} className="text-rose-500 shrink-0" />
                          <span>発話評価数 <span className="tabular-nums font-bold text-ink text-xs">{totalAssessmentsDay}</span></span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 明細リスト */}
                <div className="bg-white">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 border-b border-line/50 text-[11px] font-bold text-ink-subtle uppercase tabular-nums bg-slate-50/30">
                    <div className="col-span-2">受講生</div>
                    <div className="col-span-3">トレーニング教材</div>
                    <div className="col-span-5 text-left pl-1">トレーニング実績 (単語/フレーズ/発話)</div>
                    <div className="col-span-2" />
                  </div>
                  <div className="divide-y divide-slate-50">
                    {sessions.map((session, idx) => (
                      <div
                        key={`${session.content_id}-${session.com_m_user?.email || idx}`}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 py-3 hover:bg-brand-soft/20 transition-colors items-center group"
                      >
                        {/* 1. だれが */}
                        <div className="col-span-1 md:col-span-2 flex items-center gap-2">
                          {session.com_m_user && (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-5 h-5 rounded-md bg-brand-soft flex items-center justify-center text-brand-500 shrink-0 border border-brand-100/50">
                                <User size={11} strokeWidth={2.5} />
                              </div>
                              <span className="text-xs font-bold text-ink-soft truncate">
                                {session.com_m_user.user_name || '未設定'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 2. 何を */}
                        <div className="col-span-1 md:col-span-3">
                          <span className="text-xs font-bold text-ink-soft group-hover:text-brand transition-colors">
                            {session.com_m_contents?.content_name || 'Unknown Content'}
                          </span>
                        </div>

                        {/* 3. どれくらい */}
                        <div className="col-span-1 md:col-span-5 flex items-center justify-start gap-3 text-[11px]">
                          <div className="flex items-center gap-2 text-ink-muted font-bold tabular-nums">
                            
                            {/* 単語数 */}
                            <span className="inline-flex items-center min-w-[56px]" title="単語数">
                              <BookOpen size={11} className="text-blue-500/80 mr-1 shrink-0" /> 
                              <span className="tabular-nums text-ink-soft font-bold">{session.word_count}</span>
                            </span>
                            
                            {/* フレーズ数 */}
                            <span className="inline-flex items-center min-w-[56px]" title="フレーズ数">
                              <MessageSquareText size={11} className="text-emerald-500/80 mr-1 shrink-0" /> 
                              <span className="tabular-nums text-ink-soft font-bold">{session.phrase_count}</span>
                            </span>
                            
                            {/* 発話評価数 */}
                            <span className="inline-flex items-center min-w-[56px]" title="発話評価数">
                              <Mic size={11} className="text-rose-500 shrink-0" />
                              <span className="tabular-nums text-ink-soft font-bold">{session.assessment_count}</span>
                            </span>

                          </div>
                        </div>

                        <div className="hidden md:block col-span-2" />
                      </div>
                    ))}
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