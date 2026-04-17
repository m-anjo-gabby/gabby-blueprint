"use client";

import React from 'react';
import { 
  Users, Landmark, UserCheck, BookOpen, 
  Settings, Activity, ChevronRight, HardDrive, 
  ShieldCheck, RefreshCw, ArrowUpRight
} from "lucide-react";
import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * ユーティリティ: Tailwind クラスの結合
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type StatItem = {
  title: string;
  count: string;
  desc: string;
  color: "blue" | "emerald" | "orange" | "purple";
};

type Props = {
  env: string;
  commitSha: string;
  apiUrl: string;
  statsData: StatItem[];
};

/**
 * アイコンのマッピング定義
 */
const iconMap: Record<string, any> = {
  "顧客管理": Landmark,
  "契約管理": UserCheck,
  "ユーザ管理": Users,
  "教材管理": BookOpen,
};

/**
 * カラーテーマのマッピング
 */
const colorStyles = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  orange: "bg-orange-50 text-orange-600 border-orange-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100",
};

export default function AdminDashboardClient({ env, commitSha, apiUrl, statsData }: Props) {
  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-900">
      
      {/* Header Section */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-md tracking-wider">
              Management Portal
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">
            Admin<span className="text-indigo-600 italic">Console</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">プラットフォーム全体の統合管理・監視リソース</p>
        </motion.div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm text-sm font-bold flex items-center gap-2 text-slate-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            System Live
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* Left Content: Business Modules */}
        <div className="xl:col-span-3 space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {statsData.map((module, idx) => {
              const Icon = iconMap[module.title] || Settings;
              return (
                <motion.div
                  key={module.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1, ease: "easeOut" }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                  className="group relative bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer overflow-hidden"
                >
                  {/* Decorative Background Element */}
                  <div className={cn(
                    "absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-150 transition-transform duration-500",
                    module.color === 'blue' ? 'bg-blue-600' : 
                    module.color === 'emerald' ? 'bg-emerald-600' :
                    module.color === 'orange' ? 'bg-orange-600' : 'bg-purple-600'
                  )} />

                  <div className="flex justify-between items-start relative z-10">
                    <div className={cn("p-4 rounded-2xl border transition-transform group-hover:scale-110 duration-300", colorStyles[module.color])}>
                      <Icon size={28} />
                    </div>
                    <div className="flex items-center gap-1 text-slate-300 group-hover:text-indigo-500 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">Open Module</span>
                      <ArrowUpRight size={20} />
                    </div>
                  </div>

                  <div className="mt-8 relative z-10">
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">{module.title}</h3>
                    <p className="text-slate-400 text-sm mt-1 font-medium leading-relaxed">{module.desc}</p>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-50 flex items-end justify-between relative z-10">
                    <div className="flex flex-col">
                      <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">{module.count}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active Entries</span>
                    </div>
                    <div className="h-10 w-24 bg-slate-50 rounded-lg flex items-center justify-center">
                       {/* モックのグラフ線のようなもの */}
                       <div className="flex items-end gap-1 h-4">
                          {[30, 60, 45, 90, 55].map((h, i) => (
                            <div key={i} className="w-1.5 bg-slate-200 rounded-full group-hover:bg-indigo-200 transition-colors" style={{ height: `${h}%` }} />
                          ))}
                       </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </section>

          {/* Activity Logs Section */}
          <motion.section 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Activity size={20} className="text-indigo-500" />
                </div>
                システムアクティビティ
              </h2>
              <button className="text-xs font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl transition-colors">
                VIEW ALL LOGS
              </button>
            </div>
            
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
                  <div className="w-2 h-10 bg-slate-100 rounded-full overflow-hidden">
                    <div className="w-full bg-indigo-400 h-1/2 mt-1 rounded-full group-hover:h-full transition-all duration-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">
                      <span className="text-indigo-600">@system_bot</span> 同期完了
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">教材データセット <code className="text-indigo-500 font-mono">v1.2.{i}</code> のアップデートを正常に反映しました。</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 font-mono">14:2{i} PM</span>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* Right Content: Infrastructure Panel */}
        <aside className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-900 rounded-[2.5rem] p-9 text-white shadow-2xl shadow-indigo-200/50 relative overflow-hidden"
          >
            {/* Glossy Overlay */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-10">
                <div className="p-2 bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/30">
                  <Settings size={20} className="text-white" />
                </div>
                <h2 className="text-lg font-bold tracking-tight uppercase">Infrastructure</h2>
              </div>

              <div className="space-y-9">
                <div className="relative pl-6 border-l-2 border-slate-800">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Node Environment</label>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-2xl font-black capitalize tracking-tight">{env}</p>
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter",
                      env === 'production' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    )}>
                      {env === 'production' ? 'Stable' : 'Unstable'}
                    </span>
                  </div>
                </div>

                <div className="relative pl-6 border-l-2 border-slate-800">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-indigo-400" /> Deployment Hash
                  </label>
                  <div className="mt-3 flex items-center gap-2 group cursor-pointer">
                    <code className="text-[11px] bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 block w-full font-mono text-indigo-200 group-hover:border-indigo-500/50 transition-colors truncate">
                      {commitSha}
                    </code>
                  </div>
                </div>

                <div className="relative pl-6 border-l-2 border-slate-800">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-1.5">
                    <HardDrive size={12} className="text-indigo-400" /> Supabase Endpoint
                  </label>
                  <p className="mt-3 font-mono text-[10px] text-slate-500 break-all leading-relaxed bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 italic">
                    {apiUrl}
                  </p>
                </div>
              </div>

              <div className="mt-14 pt-8 border-t border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Network Status</span>
                  <span className="text-emerald-400 text-sm font-bold flex items-center gap-1.5 mt-1">
                    <RefreshCw size={14} className="animate-spin" style={{ animationDuration: '3s' }} /> 
                    Operational
                  </span>
                </div>
                <div className="h-10 w-10 bg-slate-800 rounded-2xl flex items-center justify-center hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700">
                   <Settings size={18} className="text-slate-400" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Notice Card */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-[2rem] p-7 border border-slate-200 shadow-sm overflow-hidden relative"
          >
             <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
             <h4 className="text-slate-900 font-bold text-sm">運用のお知らせ</h4>
             <p className="text-slate-500 text-xs mt-3 leading-relaxed font-medium">
               デプロイメントの整合性を保つため、<span className="text-indigo-600 font-bold">Production</span> 環境への昇格は必ず 
               <span className="underline decoration-indigo-200 underline-offset-2">Preview での動作確認</span> を経てから実施してください。
             </p>
          </motion.div>
        </aside>

      </div>
    </div>
  );
}