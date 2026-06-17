'use client';

import React from 'react';
import { MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';
import { cn } from '@/lib/utils';
import { 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Hourglass, 
  Ban, 
  Mail, 
  BookOpen, 
  MessageSquareText, 
  ShieldCheck, 
  CalendarDays,
  ArrowLeft,
  ArrowRight,
  Download
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';

interface MonitorUserListProps {
  users: MonitorUser[];
  wordHistory: MonitorWordSummaryHistoryItem[];
}

export const MonitorUserList: React.FC<MonitorUserListProps> = ({ users, wordHistory }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const currentView = searchParams.get('view') || 'overview';
  const userIds = searchParams.get('userIds');
  const qStart = searchParams.get('startDate');
  
  // 💡 URLのクエリパラメータからincludeMonitorの状態を取得（内部のフォールバック判定用に残します）
  const includeMonitor = searchParams.get('includeMonitor') === 'true';
  
  const currentMonthStr = React.useMemo(() => {
    if (qStart && qStart.length >= 7) {
      return qStart.substring(0, 7);
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [qStart]);

  // 💡 パラメータ変更の共通処理（トグル制御を削除し、月移動のみに最適化）
  const updateQueryParams = (newMonthOffset: number) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // 月の計算
    if (newMonthOffset !== 0) {
      const [year, month] = currentMonthStr.split('-').map(Number);
      const targetDate = new Date(year, month - 1 + newMonthOffset, 1);
      
      const nextYear = targetDate.getFullYear();
      const nextMonth = targetDate.getMonth();
      const startStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
      const endDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getDate();
      const endStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      
      params.set('startDate', startStr);
      params.set('endDate', endStr);
    }

    params.set('view', currentView);
    if (userIds) params.set('userIds', userIds);
    
    router.push(`/monitor?${params.toString()}`);
  };

  const handleMonthChange = (offset: number) => {
    updateQueryParams(offset);
  };

  const [displayYear, displayMonth] = currentMonthStr.split('-');

  const userStats = React.useMemo(() => {
    const statsMap: Record<string, { days: Set<string>, words: number, phrases: number, assessments: number }> = {};
    
    wordHistory.forEach(h => {
      const uid = h.user_id;
      if (!statsMap[uid]) {
        statsMap[uid] = { days: new Set(), words: 0, phrases: 0, assessments: 0 };
      }
      statsMap[uid].days.add(h.training_date);
      statsMap[uid].words += h.word_count;
      statsMap[uid].phrases += h.phrase_count;
      statsMap[uid].assessments += h.assessment_count;
    });
    return statsMap;
  }, [wordHistory]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  const handleExportCSV = () => {
    if (users.length === 0) return;

    const headers = [
      '受講生', 
      'ステータス', 
      'ライセンス開始日', 
      'ライセンス終了日', 
      'トレーニング日数', 
      '学習単語数', 
      '学習フレーズ数', 
      '発話評価数', 
      '最終接続日'
    ];
    
    const rows = users.map(user => {
      const stats = userStats[user.id] || { days: new Set(), words: 0, phrases: 0, assessments: 0 };
      
      const statusLabel = (Object({
        active: '利用中', 
        expired: '期限切れ', 
        future: '開始前',
        inviting: '招待中', 
        expired_invite: '期限切れ(招待)', 
        mail_failed: '送信失敗'
      }) as Record<string, string>)[user.license_state] || '不明';
      
      const lastSignIn = user.last_sign_in_at 
        ? new Date(user.last_sign_in_at).toLocaleDateString('ja-JP') 
        : 'なし';

      return [
        user.user_name || '未設定',
        statusLabel,
        user.license_start_date ? new Date(user.license_start_date).toLocaleDateString('ja-JP') : '—',
        user.license_end_date ? new Date(user.license_end_date).toLocaleDateString('ja-JP') : '—',
        `${stats.days.size}日`,
        stats.words,
        stats.phrases,
        stats.assessments,
        lastSignIn
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
    const baseClass = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black tracking-wider shrink-0 border shadow-2xs font-sans w-[105px] select-none";
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
        return <span className={cn(baseClass, "bg-slate-50/80 border-slate-200/60 text-slate-400")}><Ban size={12} strokeWidth={2.5} /> 期限切れ</span>;
      case 'mail_failed':
        return <span className={cn(baseClass, "bg-orange-50/60 border-orange-100 text-orange-600")}><XCircle size={12} strokeWidth={2.5} /> 送信失敗</span>;
      default:
        return <span className={cn(baseClass, "bg-slate-50 border-slate-200 text-slate-500")}>不明</span>;
    }
  };

  // 受講生リストが0名の場合の表示（初期状態、または親側でトグルがOFFであり誰も居ない時）
  if (users.length === 0 && !includeMonitor) {
    return (
      <div className="bg-white rounded-[28px] border border-dashed border-slate-200/80 p-16 text-center max-w-xl mx-auto">
        <User size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">受講生が登録されていません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      
      {/* コントロールバー */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center w-full sm:w-auto">
          {/* 左側：対象年月ナビゲーション */}
          <div className="space-y-1.5 w-full sm:w-auto">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5 font-mono">
              <CalendarDays size={12} className="text-indigo-500" />
              対象年月
            </label>
            <div className="flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl p-1.5 shadow-2xs w-fit">
              <button 
                onClick={() => handleMonthChange(-1)} 
                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all active:scale-95"
                title="前月"
              >
                <ArrowLeft size={13} strokeWidth={3} />
              </button>
              
              <span className="text-xs font-black tracking-tight text-slate-700 font-mono select-none min-w-[84px] text-center">
                {displayYear}年 {parseInt(displayMonth)}月
              </span>

              <button 
                onClick={() => handleMonthChange(1)} 
                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all active:scale-95"
                title="来月"
              >
                <ArrowRight size={13} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {/* 右側：CSVダウンロードボタン */}
        <div className="self-end sm:self-auto shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={users.length === 0}
            className={cn(
              "inline-flex items-center gap-2 justify-center text-xs font-bold h-9 px-4 rounded-xl shadow-2xs border transition-all bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
              users.length === 0 && "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            )}
          >
            <Download size={14} strokeWidth={2.5} className="text-slate-500" />
            <span>CSVエクスポート</span>
          </button>
        </div>

      </div>

      {/* 受講生が空（親のトグル切り替えの結果、誰もいなくなった場合など）のフォールバック */}
      {users.length === 0 ? (
        <div className="bg-white rounded-[28px] border border-dashed border-slate-200/80 p-16 text-center">
          <User size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-400">該当するユーザーが見つかりません（モニターのみ登録されている可能性があります）</p>
        </div>
      ) : (
        /* ─── 受講生テーブルコンテナ ─── */
        <div className="bg-white border border-slate-200/60 rounded-[28px] shadow-sm overflow-hidden">
          
          {/* PC用：一覧テーブルヘッダー */}
          <div className="hidden md:flex items-center px-6 py-4 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
            <div className="w-full grid grid-cols-12 gap-4 items-center">
              <div className="col-span-3 pl-12">受講生</div>
              <div className="col-span-2 text-center">ステータス</div>
              <div className="col-span-2 text-center">ライセンス期間</div>
              
              <div className="col-span-1 flex flex-col items-center justify-center text-center leading-tight">
                <span>トレーニング</span>
                <span>日数</span>
              </div>

              <div className="col-span-2 text-left pl-1">主要実績 (単語/フレーズ/発話)</div>
              <div className="col-span-2 text-right pr-4">最終接続</div>
            </div>
          </div>

          {/* 受講生リスト本体 */}
          <div className="divide-y divide-slate-100/70">
            {users.map((user, idx) => {
              const stats = userStats[user.id] || { days: new Set(), words: 0, phrases: 0, assessments: 0 };

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
                      <div className="w-10 h-10 bg-indigo-50/60 text-indigo-500 border border-indigo-100/50 rounded-2xl flex items-center justify-center shrink-0 font-black font-mono text-xs select-none shadow-2xs">
                        {user.user_name?.[0] || <User size={15} strokeWidth={2.5} />}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-black text-slate-800 tracking-tight truncate group-hover:text-indigo-600 transition-colors">
                          {user.user_name || '未設定ユーザー'}
                        </p>
                        {user.email && (
                          <p className="text-xs text-slate-400 font-normal truncate font-sans">
                            {user.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 2. ステータス */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-center border-t md:border-none border-slate-100/60 pt-2.5 md:pt-0">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider">ステータス</span>
                      <div>
                        {getLicenseStateBadge(user.license_state)}
                      </div>
                    </div>

                    {/* 3. ライセンス期間の上下段表示 */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-center border-t border-dashed border-slate-100 md:border-none pt-2.5 md:pt-0">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider">ライセンス期間</span>
                      <div className="flex flex-col md:items-center font-mono text-[11px] text-slate-500 font-bold leading-relaxed">
                        {user.license_start_date || user.license_end_date ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black px-1 py-0.5 rounded-sm bg-slate-100 text-slate-400 scale-90 origin-right md:origin-center">自</span>
                              <span className="text-slate-700 tracking-tight">{formatDate(user.license_start_date)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black px-1 py-0.5 rounded-sm bg-slate-100 text-slate-400 scale-90 origin-right md:origin-center">至</span>
                              <span className="text-slate-600 tracking-tight">{formatDate(user.license_end_date)}</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300 font-normal tracking-widest md:pl-2">—</span>
                        )}
                      </div>
                    </div>

                    {/* 4. トレーニング日数 */}
                    <div className="col-span-1 md:col-span-1 flex items-center justify-between md:justify-center border-t border-dashed border-slate-100 md:border-none pt-2.5 md:pt-0">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider">トレーニング日数</span>
                      <div className="flex items-center gap-1 font-mono text-xs text-slate-500 font-bold justify-center">
                        <span className="text-slate-700 font-extrabold font-mono text-center">{stats.days.size}</span>
                        <span className="text-[10px] font-bold text-slate-400 font-sans">日</span>
                      </div>
                    </div>

                    {/* 5. 主要実績スタッツ */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-start border-t border-dashed border-slate-100 md:border-none pt-2.5 md:pt-0 md:pl-1">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider">主要実績</span>
                      <div className="flex items-center gap-2.5 text-slate-500 font-bold font-mono text-[10px] md:w-full md:justify-start">
                        
                        <span className="inline-flex items-center min-w-[48px]" title="単語数">
                          <BookOpen size={11} className="text-blue-500/80 mr-1 shrink-0" /> 
                          <span className="text-slate-700 font-extrabold font-mono">{stats.words}</span>
                        </span>
                        
                        <span className="inline-flex items-center min-w-[48px]" title="フレーズ数">
                          <MessageSquareText size={11} className="text-emerald-500/80 mr-1 shrink-0" /> 
                          <span className="text-slate-700 font-extrabold font-mono">{stats.phrases}</span>
                        </span>
                        
                        <span className="inline-flex items-center min-w-[48px]" title="発話評価数">
                          <ShieldCheck size={11} className="text-amber-500/80 mr-1 shrink-0" /> 
                          <span className="text-slate-700 font-extrabold font-mono">{stats.assessments}</span>
                        </span>

                      </div>
                    </div>

                    {/* 6. 最終接続 */}
                    <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-end border-t border-dashed border-slate-100 md:border-none pt-2.5 md:pt-0 pr-0 md:pr-4">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-wider">最終接続</span>
                      {user.last_sign_in_at ? (
                        <div className="text-[11px] text-slate-600 font-black flex items-center gap-1.5 font-mono">
                          <Clock size={12} className="text-slate-400" />
                          <span>{new Date(user.last_sign_in_at).toLocaleDateString('ja-JP')}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-300 font-sans">未接続</span>
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