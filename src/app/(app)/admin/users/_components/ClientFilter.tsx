'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export default function ClientFilter({ clients }: { clients: { client_id: string; client_name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClientId = searchParams.get('clientId') || '';

  const handleFilter = (clientId: string) => {
    const params = new URLSearchParams(searchParams);
    if (clientId) {
      params.set('clientId', clientId);
    } else {
      params.delete('clientId');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <select
      value={currentClientId}
      onChange={(e) => handleFilter(e.target.value)}
      className="px-4 py-2 border rounded-md text-sm text-slate-700 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
    >
      <option value="">すべての顧客</option>
      {clients.map((c) => (
        <option key={c.client_id} value={c.client_id}>
          {c.client_name}
        </option>
      ))}
    </select>
  );
}