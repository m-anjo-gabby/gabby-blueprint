import Link from 'next/link';
import { BarChart3, BookOpen, ChevronRight, Star } from 'lucide-react';
import { HomeCard } from './HomeCard';

const MENU_ITEMS = [
  { href: '/library', label: '教材を探す', icon: BookOpen },
  { href: '/favorites', label: 'お気に入りを復習', icon: Star },
  { href: '/training/performance', label: '学習記録を見る', icon: BarChart3 },
];

/** 自主トレーニングの入り口 */
export function LearningMenuCard() {
  return (
    <HomeCard title="学習メニュー">
      <ul className="-mx-2 space-y-1">
        {MENU_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 rounded-2xl p-2 hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-700 transition-colors">
                <item.icon size={18} />
              </div>
              <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
