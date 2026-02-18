// src\components\student\Header.tsx
'use client';
import { useUserStore } from '@/stores/userStore';
import { signOut } from '@/actions/authAction';
import { LogOut, UserIcon, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export default function Header() {
  const user = useUserStore((state) => state.user);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-5 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center">
          <Image 
            src="/logo-01.png" 
            alt="Gabby Logo" 
            width={120} 
            height={32} 
            className="h-8 w-auto object-contain"
            priority
          />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
            <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500">
              <UserIcon size={14} />
            </div>
            <span className="text-xs font-bold text-slate-600 truncate max-w-[80px] sm:max-w-[120px]">
              {user?.email?.split('@')[0]}
            </span>
          </div>
          
          <button 
            onClick={() => setShowConfirm(true)} // 直接ログアウトせずダイアログを表示
            className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-full transition-all active:scale-90"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ログアウト確認モーダル */}
      {showConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          {/* 背景オーバーレイ */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowConfirm(false)}
          />
          
          {/* ダイアログ本体 */}
          <div className="relative bg-white w-full max-w-70 rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
            </div>
            
            <h3 className="text-sm font-black text-slate-800 mb-2 uppercase tracking-wider">Logout</h3>
            <p className="text-[11px] text-slate-500 mb-6 leading-relaxed">
              ログアウトしますか？<br />終了してログイン画面に戻ります。
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => signOut()}
                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-rose-100"
              >
                ログアウト
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}