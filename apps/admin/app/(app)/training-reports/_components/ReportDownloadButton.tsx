'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';

/** Content-Disposition の filename*（UTF-8）を優先してファイル名を取り出す */
function fileNameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) return decodeURIComponent(encoded[1]);
  const plain = disposition.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : fallback;
}

/**
 * PDF・ZIPをサーバーで作ってダウンロードするボタン。作成に時間がかかる（特にZIP）ため、
 * リンクで直接開かずに取得して保存し、作成中はボタンに処理中の表示を出す。
 */
export function ReportDownloadButton({
  href,
  fallbackFileName,
  icon,
  children,
  variant = 'outline',
  size = 'sm',
}: {
  href: string;
  fallbackFileName: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const t = useTranslations('trainingReports');
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const response = await fetch(href, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileNameFromDisposition(response.headers.get('Content-Disposition'), fallbackFileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        showToast(t('downloadFailed'), 'error');
      }
    });
  };

  return (
    <Button type="button" variant={variant} size={size} pending={isPending} icon={icon} onClick={handleClick}>
      {children}
    </Button>
  );
}
