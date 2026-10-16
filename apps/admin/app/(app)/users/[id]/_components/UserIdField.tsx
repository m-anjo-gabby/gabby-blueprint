'use client';

import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';

/** ユーザーID（UUID）の表示とコピー（問い合わせ・調査で使う） */
export function UserIdField({ userId }: { userId: string }) {
  const t = useTranslations('users.form');
  const tDetail = useTranslations('users.detail.basic');
  const { showToast } = useToast();

  return (
    <div className="flex items-center gap-1">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">
        {userId}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-slate-400 hover:text-brand"
        aria-label={tDetail('copyId')}
        onClick={() => {
          void navigator.clipboard.writeText(userId);
          showToast(t('idCopied'), 'success');
        }}
      >
        <Copy size={14} />
      </Button>
    </div>
  );
}
