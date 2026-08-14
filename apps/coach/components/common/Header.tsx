'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Menu, X, LogOut, User as UserIcon, Lock, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useSidebarStore } from '@gabby/lib/stores/useSidebarStore';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { signOut } from '@/actions/coachAuthAction';
import { NoticeDropdown } from './NoticeDropdown';

export default function Header() {
  const user = useUserStore((state) => state.user);
  const profileIconUrl = getProfileIconUrl(user?.icon_path);
  const isMobileSidebarOpen = useSidebarStore((state) => state.isOpen);
  const toggleMobileSidebar = useSidebarStore((state) => state.toggle);
  const { showConfirm } = useConfirm();

  const handleSignOut = async () => {
    const ok = await showConfirm(
      'Confirm Logout',
      'This will end your session and log you out. Are you sure?',
      { variant: 'danger', isModal: true }
    );
    if (ok) await signOut();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
      {/* Left: hamburger (mobile only) + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobileSidebar}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Open menu"
        >
          {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href="/dashboard" className="flex items-center hover:opacity-80 transition-opacity select-none">
          <Image
            src="/logo-01.png"
            alt="Gabby Blueprint Logo"
            width={120}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </div>

      {/* Right: notice bell + account dropdown */}
      <div className="flex items-center gap-2">
      <NoticeDropdown />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100 hover:bg-slate-100 transition-all outline-none active:scale-95">
            <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500 overflow-hidden shrink-0">
              {profileIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={14} />
              )}
            </div>
            <span className="text-xs font-bold text-slate-600 hidden sm:inline max-w-32 truncate">
              {user?.email?.split('@')[0] || 'Guest'}
            </span>
            <ChevronDown size={12} className="text-slate-400" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56 p-2 rounded-2xl shadow-xl border-slate-100" align="end">
          {/* Profile summary */}
          <div className="flex items-center gap-3 px-2 py-2.5 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-400 overflow-hidden shrink-0">
              {profileIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={18} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-800 truncate">
                {user?.email?.split('@')[0] || 'Guest'}
              </p>
              {user?.email && (
                <p className="text-[10px] font-medium text-slate-400 truncate">{user.email}</p>
              )}
            </div>
          </div>

          <DropdownMenuSeparator className="mb-1 border-slate-100" />

          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50">
              <UserIcon size={14} /> Profile
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/profile/password" className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50">
              <Lock size={14} /> Change Password
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 border-slate-100" />

          <DropdownMenuItem
            onClick={handleSignOut}
            className="flex items-center gap-2 text-xs font-bold text-rose-500 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-600"
          >
            <LogOut size={14} /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
