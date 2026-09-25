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
              className="group flex items-center gap-3 rounded-control p-2 hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-slate-100 text-ink-soft group-hover:bg-brand-soft group-hover:text-brand-strong transition-colors">
                <item.icon size={18} />
              </div>
              <span className="flex-1 text-sm font-semibold text-ink">{item.label}</span>
              <ChevronRight size={18} className="text-ink-subtle group-hover:text-ink-muted transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
