'use client';

import React from 'react';
import { MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';
import { cn } from '@/lib/utils';
import { 
  User, 
  Mail, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Hourglass, 
  Ban, 
  BookOpen, 
  MessageSquareText, 
  ShieldCheck, 
  CalendarDays,
  ArrowLeft,
  ArrowRight
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
  
  const currentMonthStr = React.useMemo(() => {
    if (qStart && qStart.length >= 7) {
      return qStart.substring(0, 7);
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [qStart]);

  const handleMonthChange = (offset: number) => {
    const [year, month] = currentMonthStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1 + offset, 1);
    
    const nextYear = targetDate.getFullYear();
    const nextMonth = targetDate.getMonth();
    const startStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
    const endDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getDate();
    const endStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    
    const params = new URLSearchParams();
    params.set('view', currentView);
    params.set('startDate', startStr);
    params.set('endDate', endStr);
    if (userIds) params.set('userIds', userIds);
    
    router.push(`/monitor?${params.toString()}`);
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

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-[28px] border border-dashed border-slate-200/80 p-16 text-center max-w-xl mx-auto">
        <User size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">受講生が登録されていません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      
      {/* 🎯 改善：左側にコンパクトに寄せた年月ナビゲーション */}
      <div className="flex items-center gap-4 bg-white border border-slate-200/60 px-4 py-2.5 rounded-[20px] shadow-2xs w-fit">
        <span className="text-[11px] font-black text-slate-400 tracking-tight flex items-center gap-1.5 border-r border-slate-200 pr-3 font-mono uppercase">
          <CalendarDays size={13} className="text-indigo-500" />
          Period
        </span>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleMonthChange(-1)} 
            className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all active:scale-90 flex items-center justify-center border border-slate-100 bg-white shadow-3xs"
            title="前月"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          
          <span className="text-xs font-black tracking-tight text-slate-700 font-mono select-none min-w-[80px] text-center">
            {displayYear}年 {parseInt(displayMonth)}月
          </span>

          <button 
            onClick={() => handleMonthChange(1)} 
            className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all active:scale-90 flex items-center justify-center border border-slate-100 bg-white shadow-3xs"
            title="来月"
          >
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ─── 受講生テーブルコンテナ ─── */}
      <div className="bg-white border border-slate-200/60 rounded-[28px] shadow-sm overflow-hidden">
        
        {/* PC用：一覧テーブルヘッダー（1列目を広めの基本情報、2列目をアカウント状況に変更） */}
        <div className="hidden md:flex items-center px-6 py-4 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
          <div className="w-full grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4 pl-12">受講生基本情報</div>
            <div className="col-span-2">アカウント状況</div>
            <div className="col-span-3">当月学習状況 (Days / Words)</div>
            <div className="col-span-3">詳細スタッツ / アクティビティ</div>
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
                  
                  {/* ─── 1列目 (PC: 幅4コ分) ─── 基本情報エリア */}
                  <div className="col-span-1 md:col-span-4 flex items-center gap-3.5">
                    {/* アバター */}
                    <div className="w-10 h-10 bg-indigo-50/60 text-indigo-500 border border-indigo-100/50 rounded-2xl flex items-center justify-center shrink-0 font-black font-mono text-xs select-none shadow-2xs">
                      {user.user_name?.[0] || <User size={15} strokeWidth={2.5} />}
                    </div>
                    {/* 名前 & メール */}
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-black text-slate-800 tracking-tight truncate group-hover:text-indigo-600 transition-colors">
                        {user.user_name || '未設定ユーザー'}
                      </p>
                      <p className="text-[11px] font-bold text-slate-400 font-mono truncate flex items-center gap-1 max-w-[240px] sm:max-w-xs md:max-w-[180px]">
                        <Mail size={11} className="text-slate-300 shrink-0" /> {user.email}
                      </p>
                    </div>
                  </div>

                  {/* ─── 2列目 (PC: 幅2コ分) ─── アカウント状況（綺麗に横並びで追従） */}
                  <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-start border-t md:border-none border-slate-100/60 pt-2.5 md:pt-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider">ステータス</span>
                    <div>
                      {getLicenseStateBadge(user.license_state)}
                    </div>
                  </div>

                  {/* ─── 3列目 (PC: 幅3コ分) ─── 学習状況主要スタッツ */}
                  <div className="col-span-1 md:col-span-3 flex items-center gap-3 border-t border-dashed border-slate-100 md:border-none pt-3 md:pt-0 mt-0.5 md:mt-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase font-mono tracking-wider w-16 shrink-0">学習状況</span>
                    
                    <div className="flex items-center gap-2">
                      {/* 実施日数バッジ */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100/80 font-mono">
                        <CalendarDays size={13} className="text-indigo-400 shrink-0" />
                        <span className="text-xs font-black text-slate-800">{stats.days.size}</span>
                        <span className="text-[9px] font-bold text-slate-400">日</span>
                      </div>

                      {/* 単語数バッジ */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100/80 font-mono">
                        <BookOpen size={13} className="text-blue-400 shrink-0" />
                        <span className="text-xs font-black text-slate-800">{stats.words}</span>
                        <span className="text-[9px] font-bold text-slate-400">単語</span>
                      </div>
                    </div>
                  </div>

                  {/* ─── 4列目 (PC: 幅3コ分) ─── 詳細サブスタッツ ＆ アクティビティ */}
                  <div className="col-span-1 md:col-span-3 flex flex-col sm:flex-row md:flex-col sm:items-center md:items-start justify-between md:justify-center gap-2 sm:gap-4 md:gap-1 text-[11px]">
                    
                    {/* サブスタッツ */}
                    <div className="flex items-center gap-4 text-slate-500 font-bold font-mono pl-0.5">
                      <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-wider w-16 shrink-0">詳細ログ</span>
                      <div className="flex items-center gap-3.5">
                        <span className="flex items-center gap-1" title="フレーズ数">
                          <MessageSquareText size={12} className="text-emerald-500/80" /> 
                          <span className="text-slate-700 font-black">{stats.phrases}</span>
                          <span className="text-[9px] text-slate-400 font-normal">フレーズ</span>
                        </span>
                        <span className="flex items-center gap-1" title="発話評価数">
                          <ShieldCheck size={12} className="text-amber-500/80" /> 
                          <span className="text-slate-700 font-black">{stats.assessments}</span>
                          <span className="text-[9px] text-slate-400 font-normal">発話評価</span>
                        </span>
                      </div>
                    </div>

                    {/* 最終ログイン日時 */}
                    {user.last_sign_in_at && (
                      <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5 pl-0.5">
                        <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-wider w-16 shrink-0">最終接続</span>
                        <div className="flex items-center gap-1 font-mono">
                          <Clock size={11} className="text-slate-300" />
                          <span>{new Date(user.last_sign_in_at).toLocaleDateString('ja-JP')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
};