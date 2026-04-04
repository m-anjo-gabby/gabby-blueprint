'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  LogOut, 
  UserIcon, 
  AlertCircle, 
  Lock, 
  ChevronDown, 
  Loader2
} from 'lucide-react';

// Shadcn UI Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { signOut } from '@/actions/authAction';

export default function Header() {
  const user = useUserStore((state) => state.user);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true); // オーバーレイを表示
    await signOut();
    // サインアウト後はログイン画面に自動遷移
  };

  return (
    <>
      <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-5 flex items-center justify-between sticky top-0 z-50 shrink-0">
        {/* ロゴエリア */}
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
        
        {/* ユーザー操作エリア */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            {/* ドロップダウンのトリガーボタン */}
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100 hover:bg-slate-100 transition-all outline-none active:scale-95">
                <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500">
                  <UserIcon size={14} />
                </div>
                <span className="text-xs font-bold text-slate-600 hidden sm:inline">
                  {user?.email?.split('@')[0]}
                </span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            
            {/* ドロップダウンメニュー内容 */}
            <DropdownMenuContent className="w-48 p-2 rounded-2xl shadow-xl border-slate-100" align="end">
              <DropdownMenuItem asChild>
                <Link href="/student/profile/password" className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Lock size={14} /> パスワード変更
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="my-1 border-slate-100" />
              
              <DropdownMenuItem 
                onClick={() => setShowLogoutConfirm(true)} 
                className="flex items-center gap-2 text-xs font-bold text-rose-500 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-600"
              >
                <LogOut size={14} /> ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ログアウト確認ダイアログ */}
      {showLogoutConfirm && !isSigningOut && (
        <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowLogoutConfirm(false)}
          />
          
          <div className="relative bg-white w-full max-w-70 rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
            </div>
            
            <h3 className="text-sm font-black text-slate-800 mb-2 uppercase tracking-wider">Logout</h3>
            <p className="text-[11px] text-slate-500 mb-6">ログアウトしてログイン画面に戻りますか？</p>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-rose-100"
              >
                ログアウト
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ローディングオーバーレイ */}
      {isSigningOut && (
        <div className="fixed inset-0 z-200 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
          <p className="text-sm font-bold text-slate-800 animate-pulse">ログアウト中...</p>
        </div>
      )}

    </>
  );
}