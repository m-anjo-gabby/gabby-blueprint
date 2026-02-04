'use client';

import { useUserStore } from '@/stores/userStore';
import { signOut } from '@/actions/authAction';
import { LogOut, User } from 'lucide-react';

export default function Header() {
  const user = useUserStore((state) => state.user);

  const handleSignOut = async () => {
    await signOut();
    // 戻り値があってもここで握りつぶすので、型エラーにならない
  };

  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-8 shrink-0">
      {/* モバイルではハンバーガーボタン用の余白を確保 */}
      <h2 className="text-sm font-medium text-slate-600 ml-12 lg:ml-0">
        <span className="hidden md:inline">Overview</span>
      </h2>
      
      <div className="flex items-center gap-3 md:gap-6">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-100 rounded-full md:hidden">
            <User size={16} className="text-slate-500" />
          </div>
          <span className="text-xs md:text-sm font-semibold text-slate-700 max-w-[120px] md:max-w-none truncate">
            {user?.email || '---'}
          </span>
        </div>
        
        <form action={handleSignOut}>
          <button type="submit" className="flex items-center gap-2 text-[10px] md:text-xs font-bold py-2 px-3 md:px-4 border rounded-md hover:bg-red-50 text-slate-600 hover:text-red-600 transition-colors">
            <LogOut size={14} />
            <span className="hidden md:inline">ログアウト</span>
          </button>
        </form>
      </div>
    </header>
  );
}