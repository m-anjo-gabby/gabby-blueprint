'use client';
import { useUserStore } from '@/stores/userStore';
import { signOut } from '@/actions/authAction';
import { LogOut, UserIcon } from 'lucide-react';
import Image from 'next/image';

export default function Header() {
  const user = useUserStore((state) => state.user);

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-5 flex items-center justify-between sticky top-0 z-100 shrink-0">
      {/* ロゴエリア */}
      <div className="flex items-center">
        <Image 
          src="/logo-01.png" 
          alt="Gabby Logo" 
          width={120} 
          height={32} 
          className="h-8 w-auto object-contain" // 高さを固定して横幅は自動調整
          priority
        />
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
          {/* アイコン：背景色をつけて少しアクセントに */}
          <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500">
            <UserIcon size={14} />
          </div>
          
          {/* ユーザー名：余計なラベルを消してシンプルに */}
          <span className="text-xs font-bold text-slate-600 truncate max-w-20 sm:max-w-30">
            {user?.email?.split('@')[0]}
          </span>
        </div>
        <button 
          onClick={() => signOut()}
          className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-full transition-all active:scale-90"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}