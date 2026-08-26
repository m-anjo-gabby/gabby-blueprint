'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { USER_TYPE_MAP } from '@gabby/types/user';

export default function UserTypeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUserType = searchParams.get('userType') || '';

  const handleFilter = (userType: string) => {
    const params = new URLSearchParams(searchParams);
    if (userType) {
      params.set('userType', userType);
    } else {
      params.delete('userType');
    }

    // 検索条件（区分）が変わったので、強制的に1ページ目に戻す
    params.delete('page');

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <select
      value={currentUserType}
      onChange={(e) => handleFilter(e.target.value)}
      className="h-9 shrink-0 px-3 border border-slate-200 rounded-md text-sm text-slate-700 bg-white shadow-sm focus:ring-1 focus:ring-indigo-500 outline-none"
    >
      <option value="">すべての区分</option>
      {Object.entries(USER_TYPE_MAP).map(([type, label]) => (
        <option key={type} value={type}>
          {label}
        </option>
      ))}
    </select>
  );
}
