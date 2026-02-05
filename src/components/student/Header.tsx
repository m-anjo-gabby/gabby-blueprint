'use client';
import { useUserStore } from '@/stores/userStore';
import { signOut } from '@/actions/authAction';
import { LogOut, User, UserIcon } from 'lucide-react';

export default function Header() {
  const user = useUserStore((state) => state.user);

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-5 flex items-center justify-between sticky top-0 z-[100] shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">G</div>
        <span className="font-bold text-slate-900 tracking-tight hidden xs:block">Gabby Mobile</span>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
          {/* アイコン：背景色をつけて少しアクセントに */}
          <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500">
            <UserIcon size={14} />
          </div>
          
          {/* ユーザー名：余計なラベルを消してシンプルに */}
          <span className="text-xs font-bold text-slate-600 truncate max-w-[80px] sm:max-w-[120px]">
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