'use client';

import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** 承認済み月のみ請求書(INVOICE)PDFをダウンロードできるボタン（未承認月は非表示） */
export function InvoiceDownloadButton({ coachId, reportMonth }: { coachId: string; reportMonth: string }) {
  const t = useTranslations('monthlyReports.invoiceButton');
  const yearMonth = reportMonth.slice(0, 7);
  const href = `/api/monthly-reports/invoice?coachId=${encodeURIComponent(coachId)}&month=${encodeURIComponent(yearMonth)}`;

  return (
    <Button variant="outline" asChild>
      <a href={href}>
        <FileText size={14} className="mr-1.5" />
        {t('button')}
      </a>
    </Button>
  );
}
