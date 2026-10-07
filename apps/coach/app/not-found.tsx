'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Terminal, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { clientLogger } from '@gabby/lib/logger/client';

export default function NotFound() {
  useEffect(() => {
    // 存在しない画面へのアクセスを記録する（表示中のパスは clientLogger が付ける。流入元はクエリを除く）
    clientLogger.warn('system:not_found', 'Page not found', {
      payload: { referrer: document.referrer.split('?')[0] || undefined },
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans text-slate-900">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl shadow-slate-200/50 min-h-[420px] flex flex-col justify-center items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 to-orange-500" />

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mb-8 relative shadow-lg shadow-slate-900/10">
            <Terminal className="w-10 h-10 text-amber-400" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 rounded-lg flex items-center justify-center border-2 border-white">
              <AlertTriangle className="w-3 h-3 text-white" />
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-slate-200">
                Coach Portal
              </span>
              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-amber-100">
                404 Resource
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Page Not Found
            </h1>
            <p className="text-sm text-slate-500 mt-2.5 leading-relaxed max-w-sm font-medium">
              The page you tried to access, or the path to the requested data, does not exist or has been changed.
            </p>
          </div>

          <div className="w-full space-y-4">
            <Link
              href="/dashboard"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 min-h-[52px] shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20"
            >
              <LayoutDashboard size={18} className="text-amber-400" />
              Back to Dashboard
            </Link>

            <p className="text-[11px] font-medium text-slate-400 leading-normal bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
              Status Code: 404 / Route Object Not Found
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
