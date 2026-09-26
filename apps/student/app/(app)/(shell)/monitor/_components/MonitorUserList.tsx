'use client';

import React, { useMemo } from 'react';
import { MonitorUser, MonitorWordSummaryHistoryItem, MonitorSprintHistoryResponse } from '@/actions/monitorAction';
import { cn } from '@/lib/utils';
import { 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Hourglass, 
  Ban, 
  Mail, 
  MessageSquareText, 
  Mic, 
  CalendarDays,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { toIsoMonthInZone, formatZonedDate } from '@gabby/lib/date/date';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { MonitorMonthPickerPopover } from './MonitorMonthPickerPopover';

interface MonitorUserListProps {
  users: MonitorUser[];
  wordHistory: MonitorWordSummaryHistoryItem[];
  sprintHistory: MonitorSprintHistoryResponse;
}

export const MonitorUserList: React.FC<MonitorUserListProps> = ({ users, wordHistory, sprintHistory }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timezone = useTimezone();
  
  const currentView = searchParams.get('view') || 'overview';
  const userIds = searchParams.get('userIds');
  const qStart = searchParams.get('startDate');
  
  // 💡 URLのクエリパラメータからincludeMonitorの状態を取得
  const includeMonitor = searchParams.get('includeMonitor') === 'true';
  
  const currentMonthStr = useMemo(() => {
    if (qStart && qStart.length >= 7) {
      return qStart.substring(0, 7);
    }
    return toIsoMonthInZone(new Date(), timezone);
  }, [qStart, timezone]);

  // 💡 対象年月（"YYYY-MM"）を指定して遷移する共通処理（replace & scroll: false による遷移最適化）
  const navigateToMonth = (yearMonthStr: string) => {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const params = new URLSearchParams(searchParams.toString());

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDay = new Date(Date.UTC(year, month, 0)).getDate();
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    params.set('startDate', startStr);
    params.set('endDate', endStr);
    params.set('view', currentView);
    if (userIds) params.set('userIds', userIds);

    // 💡 pushではなくreplaceにすることで、ブラウザバックの履歴スタック詰まりを防止
    router.replace(`/monitor?${params.toString()}`, { scroll: false });
  };

  const handleMonthChange = (offset: number) => {
    const [year, month] = currentMonthStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1 + offset, 1);
    navigateToMonth(`${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const [displayYear, displayMonth] = currentMonthStr.split('-');

  // 💡 ループによる統計マップ生成のメモ化（タイムゾーンを依存配列に追加して安全性を担保）
  const userStats = useMemo(() => {
    const statsMap: Record<
      string, 
      { 
        days: Set<string>; 
        phrases: number; 
        sprintSessions: number; 
        sprintAnswers: number; 
        assessments: number; 
        latestDate: string | null;
      }
    > = {};
    
    // 1. 単語ドリル履歴の集計
    wordHistory.forEach(h => {
      const uid = h.user_id;
      if (!statsMap[uid]) {
        statsMap[uid] = { days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0, latestDate: null };
      }
      statsMap[uid].days.add(h.training_date);
      statsMap[uid].phrases += h.phrase_count;
      statsMap[uid].assessments += h.assessment_count; // 単語ドリルの発話数

      const dateStr = h.training_date;
      if (!statsMap[uid].latestDate || dateStr > statsMap[uid].latestDate) {
        statsMap[uid].latestDate = dateStr;
      }
    });

    // 2. スプリントセッション履歴の集計 (本数と回答数)
    (sprintHistory?.sessions || []).forEach(s => {
      const uid = s.user_id;
      if (!statsMap[uid]) {
        statsMap[uid] = { days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0, latestDate: null };
      }
      if (s.insert_date) {
        const dateStr = s.insert_date.split('T')[0];
        statsMap[uid].days.add(dateStr);
        if (!statsMap[uid].latestDate || dateStr > statsMap[uid].latestDate) {
          statsMap[uid].latestDate = dateStr;
        }
      }
      statsMap[uid].sprintSessions += 1; // スプリント本数
      statsMap[uid].sprintAnswers += s.total_answered; // スプリント回答数
      statsMap[uid].assessments += s.total_assessments || 0; // スプリント発話数
    });

    // 3. スプリントドリルサマリー履歴の集計 (発話数)
    (sprintHistory?.drills || []).forEach(d => {
      const uid = d.user_id;
      if (!statsMap[uid]) {
        statsMap[uid] = { days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0, latestDate: null };
      }
      statsMap[uid].days.add(d.training_date);
      statsMap[uid].assessments += d.assessment_count; // スプリントドリルサマリーの発話数

      const dateStr = d.training_date;
      if (!statsMap[uid].latestDate || dateStr > statsMap[uid].latestDate) {
        statsMap[uid].latestDate = dateStr;
      }
    });

    return statsMap;
  }, [wordHistory, sprintHistory]);

  const handleExportCSV = () => {
    if (users.length === 0) return;

    logClientEvent({
      service: 'student',
      event: 'monitor:user_summary_csv_exported',
      level: 'info',
      message: `User summary CSV exported: ${currentMonthStr}`,
      payload: { month: currentMonthStr, targetUserIds: users.map(u => u.id), rowCount: users.length }
    }).catch(() => {});

    const headers = [
      '受講生', 
      'ステータス', 
      'ライセンス開始日', 
      'ライセンス終了日', 
      'トレーニング日数', 
      'フレーズ数', 
      'スプリント本数',
      'スプリント回答数',
      '発話数', 
      'アクティビティ'
    ];
    
    const rows = users.map(user => {
      const stats = userStats[user.id] || { days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0, latestDate: null };
      
      const statusLabel = (Object({
        active: '利用中', 
        expired: '期限切れ', 
        future: '開始前',
        inviting: '招待中', 
        expired_invite: '期限切れ(招待)', 
        mail_failed: '送信失敗'
      }) as Record<string, string>)[user.license_state] || '不明';
      
      return [
        user.user_name || '未設定',
        statusLabel,
        user.license_start_date ? formatZonedDate(user.license_start_date, timezone) : '—',
        user.license_end_date ? formatZonedDate(user.license_end_date, timezone) : '—',
        `${stats.days.size}日`,
        stats.phrases,
        stats.sprintSessions,
        stats.sprintAnswers,
        stats.assessments,
        stats.latestDate || 'なし'
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows]
      .map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileSuffix = includeMonitor ? '_with_monitor' : '';
    link.setAttribute("download", `blueprint_user_summary_${currentMonthStr}${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLicenseStateBadge = (state: MonitorUser['license_state']) => {
    const baseClass = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 border shadow-2xs font-sans w-[105px] select-none";
    switch (state) {
      case 'active':
        return <span className={cn(baseClass, "bg-emerald-50/60 border-emerald-100 text-emerald-600")}><CheckCircle2 size={12} strokeWidth={2.5} /> 利用中</span>;
      case 'expired':
        return <span className={cn(baseClass, "bg-rose-50/60 border-rose-100 text-rose-600")}><XCircle size={12} strokeWidth={2.5} /> 期限切れ</span>;
      case 'future':
        return <span className={cn(baseClass, "bg-blue-50/60 border-blue-100 text-blue-600")}><Hourglass size={12} strokeWidth={2.5} /> 開始前</span>;
      case 'inviting':
        return <span className={cn(baseClass, "bg-amber-50/60 border-amber-100 text-amber-700")}><Mail size={12} strokeWidth={2.5} /> 招待中</span>;
      case 'expired_invite':
        return <span className={cn(baseClass, "bg-slate-50/80 border-line/60 text-ink-subtle")}><Ban size={12} strokeWidth={2.5} /> 期限切れ</span>;
      case 'mail_failed':
        return <span className={cn(baseClass, "bg-orange-50/60 border-orange-100 text-orange-600")}><XCircle size={12} strokeWidth={2.5} /> 送信失敗</span>;
      default:
        return <span className={cn(baseClass, "bg-slate-50 border-line text-ink-muted")}>不明</span>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      
      {/* コントロールバー */}
      <div className="bg-slate-50/50 border border-line/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center w-full sm:w-auto">
          <div className="space-y-1.5 w-full sm:w-auto">
            <label className="text-[11px] font-bold text-ink-subtle uppercase px-0.5 flex items-center gap-1.5 tabular-nums">
              <CalendarDays size={12} className="text-brand-500" />
              対象年月
            </label>
            <div className="flex items-center gap-2 bg-white border border-line/80 rounded-xl p-1.5 shadow-2xs w-fit">
              <button 
                onClick={() => handleMonthChange(-1)} 
                className="p-1.5 text-ink-subtle hover:text-ink hover:bg-slate-50 rounded-lg transition-all active:scale-95"
                title="前月"
              >
                <ArrowLeft size={13} strokeWidth={3} />
              </button>
              
              <MonitorMonthPickerPopover currentMonth={currentMonthStr} onSelect={navigateToMonth}>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 text-xs font-bold tracking-tight text-ink-soft tabular-nums min-w-[84px] text-center rounded-lg px-1.5 py-0.5 hover:bg-slate-50 hover:text-brand transition-colors"
                  title="年月を選択"
                >
                  {displayYear}年 {parseInt(displayMonth)}月
                  <ChevronDown size={11} strokeWidth={3} className="text-ink-subtle" />
                </button>
              </MonitorMonthPickerPopover>

              <button 
                onClick={() => handleMonthChange(1)} 
                className="p-1.5 text-ink-subtle hover:text-ink hover:bg-slate-50 rounded-lg transition-all active:scale-95"
                title="来月"
              >
                <ArrowRight size={13} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={users.length === 0}
            className={cn(
              "inline-flex items-center gap-2 justify-center text-xs font-bold h-9 px-4 rounded-xl shadow-2xs border transition-all bg-white hover:bg-slate-50 text-ink-soft border-line",
              users.length === 0 && "bg-slate-100 text-ink-subtle border-line cursor-not-allowed"
            )}
          >
            <Download size={14} strokeWidth={2.5} className="text-ink-muted" />
            <span>CSVエクスポート</span>
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="bg-white rounded-card border border-dashed border-line/80 p-16 text-center">
          <User size={36} className="mx-auto text-ink-subtle mb-3" />
          <p className="text-sm font-bold text-ink-subtle">
            {includeMonitor
              ? 'この年月に該当する受講生が見つかりません'
              : 'この年月に該当する受講生が見つかりません（モニター用アカウントのみ登録されている場合は「モニターを含める」をONにしてください）'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-line/60 rounded-card shadow-sm overflow-hidden">
          
          {/* PC用ヘッダー */}
          <div className="hidden md:flex items-center px-6 py-4 bg-slate-50 border-b border-line/70 text-[11px] font-bold text-ink-subtle uppercase tabular-nums">
            <div className="w-full grid grid-cols-12 gap-4 items-center">
              <div className="col-span-3 pl-12">受講生</div>
              <div className="col-span-2 text-center">ステータス</div>
              <div className="col-span-2 text-center">ライセンス期間</div>
              <div className="col-span-1 flex flex-col items-center justify-center text-center leading-tight">
                <span>トレーニング</span>
                <span>日数</span>
              </div>
              <div className="col-span-2 text-left pl-1">主要実績 (フレーズ/本数/回答/発話)</div>
              <div className="col-span-2 text-right pr-4">アクティビティ</div>
            </div>
          </div>

          {/* 受講生リスト本体 */}
          <div className="divide-y divide-slate-100/70">
            {users.map((user, idx) => {
              const stats = userStats[user.id] || { days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0 };

              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02, ease: 'easeOut' }}
                  className="p-5 md:px-6 md:py-4 flex flex-col md:flex-row items-stretch md:items-center hover:bg-slate-50/40 transition-colors group relative"
                >
                  <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-3.5 md:gap-4 items-center">
                    
                    {/* 1. 受講生（名前・メール）エリア */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-3.5">
                      <div className="w-10 h-10 bg-brand-soft/60 text-brand-500 border border-brand-100/50 rounded-2xl flex items-center justify-center shrink-0 font-bold tabular-nums text-xs select-none shadow-2xs">
                        {user.user_name?.[0] || <User size={15} strokeWidth={2.5} />}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-bold text-ink tracking-tight truncate group-hover:text-brand transition-colors">
                          {user.user_name || '未設定ユーザー'}
                        </p>
                        {user.email && (
                          <p className="text-xs text-ink-subtle font-normal truncate font-sans">
                            {user.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 2. ステータス */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-center border-t md:border-none border-line/70/60 pt-2.5 md:pt-0">
                      <span className="md:hidden text-[11px] font-bold text-ink-subtle uppercase tabular-nums">ステータス</span>
                      <div>
                        {getLicenseStateBadge(user.license_state)}
                      </div>
                    </div>

                    {/* 3. ライセンス期間（💡 formatDate を廃止し、インライン化してCompiler準拠に） */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-center border-t border-dashed border-line/70 md:border-none pt-2.5 md:pt-0">
                      <span className="md:hidden text-[11px] font-bold text-ink-subtle uppercase tabular-nums">ライセンス期間</span>
                      <div className="flex flex-col md:items-center tabular-nums text-[11px] text-ink-muted font-bold leading-relaxed">
                        {user.license_start_date || user.license_end_date ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold px-1 py-0.5 rounded-sm bg-slate-100 text-ink-subtle scale-90 origin-right md:origin-center">自</span>
                              <span className="text-ink-soft tracking-tight">
                                {formatZonedDate(user.license_start_date, timezone) || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold px-1 py-0.5 rounded-sm bg-slate-100 text-ink-subtle scale-90 origin-right md:origin-center">至</span>
                              <span className="text-ink-soft tracking-tight">
                                {formatZonedDate(user.license_end_date, timezone) || '—'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-subtle font-normal md:pl-2">—</span>
                        )}
                      </div>
                    </div>

                    {/* 4. トレーニング日数 */}
                    <div className="col-span-1 md:col-span-1 flex items-center justify-between md:justify-center border-t border-dashed border-line/70 md:border-none pt-2.5 md:pt-0">
                      <span className="md:hidden text-[11px] font-bold text-ink-subtle uppercase tabular-nums">トレーニング日数</span>
                      <div className="flex items-center gap-1 tabular-nums text-xs text-ink-muted font-bold justify-center">
                        <span className="text-ink-soft font-bold tabular-nums text-center">{stats.days.size}</span>
                        <span className="text-[11px] font-bold text-ink-subtle font-sans">日</span>
                      </div>
                    </div>

                    {/* 5. 主要実績スタッツ */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-start border-t border-dashed border-line/70 md:border-none pt-2.5 md:pt-0 md:pl-1">
                      <span className="md:hidden text-[11px] font-bold text-ink-subtle uppercase tabular-nums">主要実績</span>
                      <div className="flex items-center gap-2.5 text-ink-muted font-bold tabular-nums text-[11px] md:w-full md:justify-start">
                        <span className="inline-flex items-center min-w-[48px]" title="フレーズ数">
                          <MessageSquareText size={11} className="text-emerald-500/80 mr-1 shrink-0" /> 
                          <span className="text-ink-soft font-bold tabular-nums">{stats.phrases}</span>
                        </span>
                        <span className="inline-flex items-center min-w-[48px]" title="スプリント本数">
                          <Zap size={11} className="text-amber-500/80 fill-amber-500/10 mr-1 shrink-0" /> 
                          <span className="text-ink-soft font-bold tabular-nums">{stats.sprintSessions}</span>
                        </span>
                        <span className="inline-flex items-center min-w-[48px]" title="回答数">
                          <CheckCircle2 size={11} className="text-emerald-500 mr-1 shrink-0" /> 
                          <span className="text-ink-soft font-bold tabular-nums">{stats.sprintAnswers}</span>
                        </span>
                        <span className="inline-flex items-center min-w-[48px]" title="発話数">
                          <Mic size={11} className="text-rose-500 mr-1 shrink-0" /> 
                          <span className="text-ink-soft font-bold tabular-nums">{stats.assessments}</span>
                        </span>
                      </div>
                    </div>

                    {/* 6. アクティビティ */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-end border-t border-dashed border-line/70 md:border-none pt-2.5 md:pt-0 pr-0 md:pr-4">
                      <span className="md:hidden text-[11px] font-bold text-ink-subtle uppercase">アクティビティ</span>
                      {stats.latestDate ? (
                        <div className="text-[11px] text-ink-soft font-bold flex items-center gap-1.5 tabular-nums">
                          <Clock size={12} className="text-ink-subtle" />
                          <span>
                            {stats.latestDate}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-ink-subtle font-sans">活動なし</span>
                      )}
                    </div>

                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
};