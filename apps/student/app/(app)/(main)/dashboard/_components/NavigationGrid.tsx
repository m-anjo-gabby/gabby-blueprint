import { useRouter } from 'next/navigation';
import { BookOpen, Star, Users, CalendarClock, MessageCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavigationGridProps {
  /** ライブセッション付き契約の有効なチケットを保持している場合のみ true（専属コーチマッチング導線の表示可否） */
  showCoachMatching?: boolean;
}

export const NavigationGrid = ({ showCoachMatching = false }: NavigationGridProps) => {
  const router = useRouter();

  const navItems = [
    {
      label: 'Library',
      title: '教材を選択する',
      path: '/library',
      icon: BookOpen,
      labelClass: 'text-indigo-600',
      bgClass: 'bg-indigo-300 hover:bg-linear-to-br hover:from-blue-600 hover:via-slate-100 hover:to-indigo-700',
      iconClass: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white',
      shadow: 'shadow-indigo-100/50'
    },
    {
      label: 'Favorites',
      title: 'お気に入りを復習する',
      path: '/favorites',
      icon: Star,
      labelClass: 'text-amber-600',
      bgClass: 'bg-amber-300 hover:bg-linear-to-br hover:from-amber-400 hover:via-slate-100 hover:to-orange-500',
      iconClass: 'bg-amber-50 text-amber-500 group-hover:bg-amber-500 group-hover:text-white',
      shadow: 'shadow-amber-100/50'
    },
    ...(showCoachMatching
      ? [
          {
            label: 'Calendar',
            title: 'カレンダー',
            path: '/calendar',
            icon: CalendarClock,
            labelClass: 'text-sky-600',
            bgClass: 'bg-sky-300 hover:bg-linear-to-br hover:from-sky-400 hover:via-slate-100 hover:to-blue-600',
            iconClass: 'bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white',
            shadow: 'shadow-sky-100/50'
          },
          {
            label: 'Coaching',
            title: '専属コーチを探す',
            path: '/coach-matching',
            icon: Users,
            labelClass: 'text-emerald-600',
            bgClass: 'bg-emerald-300 hover:bg-linear-to-br hover:from-emerald-400 hover:via-slate-100 hover:to-teal-600',
            iconClass: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white',
            shadow: 'shadow-emerald-100/50'
          },
          {
            label: 'Chat',
            title: 'チャットを確認する',
            path: '/chat',
            icon: MessageCircle,
            labelClass: 'text-violet-600',
            bgClass: 'bg-violet-300 hover:bg-linear-to-br hover:from-violet-400 hover:via-slate-100 hover:to-purple-600',
            iconClass: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white',
            shadow: 'shadow-violet-100/50'
          }
        ]
      : [])
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2 max-w-3xl mx-auto">
      {navItems.map((item) => (
        <button
          key={item.label}
          onClick={() => router.push(item.path)}
          className={cn(
            "group relative flex-1 p-0.5 rounded-[28px] transition-all duration-500 active:scale-[0.98] shadow-sm",
            item.bgClass
          )}
        >
          <div className="flex items-center gap-4 bg-white rounded-[27px] px-5 py-4 h-full transition-all duration-500 group-hover:bg-white/40">
            <div className={cn("shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner group-hover:shadow-none", item.iconClass)}>
              <item.icon size={20} strokeWidth={2.5} fill={item.label === 'Favorites' ? "currentColor" : "none"} />
            </div>

            <div className="flex-1 text-left">
              <p className={cn("text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 transition-colors", item.labelClass)}>{item.label}</p>
              <p className="text-sm font-black text-slate-700 tracking-tight group-hover:text-slate-900">{item.title}</p>
            </div>

            <div className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-1 transition-all duration-300">
              <ArrowRight size={18} strokeWidth={3} />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};