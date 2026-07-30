'use client';

import { useEffect } from 'react';
import { LayoutDashboard, ServerCrash, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { logClientError } from '@gabby/lib/logger/actions';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error }: ErrorProps) {
  useEffect(() => {
    logClientError({
      service: 'coach',
      digest: error.digest,
      message: error.message || 'Coach Portal client-side runtime crash',
      stack: error.stack,
    }).catch((err) => {
      console.error('Failed to send coach crash log to Vercel:', err);
    });
  }, [error]);

  const handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans text-slate-900">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl shadow-slate-200/50 min-h-[460px] flex flex-col justify-center items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-500 to-red-600" />

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mb-8 relative shadow-lg shadow-slate-900/10">
            <ServerCrash className="w-10 h-10 text-rose-400 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-rose-600 rounded-lg flex items-center justify-center border-2 border-white">
              <ShieldAlert className="w-3 h-3 text-white" />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-slate-200">
                Coach Portal
              </span>
              <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-rose-100">
                Console Exception
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              An Exception Was Detected
            </h1>
            <p className="text-sm text-slate-500 mt-2.5 leading-relaxed max-w-md font-medium">
              An unexpected handling exception occurred while rendering the page or communicating data. This event has been logged as structured data in the core system log.
            </p>
          </div>

          {error.digest && (
            <div className="w-full mb-8 rounded-2xl bg-slate-900 border border-slate-800 p-4 text-left font-mono text-[11px] text-slate-400 relative">
              <span className="absolute top-2.5 right-3 text-[9px] font-black text-slate-600 tracking-widest uppercase">
                Vercel Log Token
              </span>
              <span className="text-slate-500 font-bold">DIGEST_HASH:</span>
              <div className="mt-1 select-all font-semibold text-rose-300 tracking-tight break-all bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                {error.digest}
              </div>
            </div>
          )}

          <div className="w-full space-y-3">
            <button
              onClick={handleBackToDashboard}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 min-h-[52px] shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20"
            >
              <LayoutDashboard size={18} className="text-indigo-400" />
              Back to Dashboard
            </button>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
