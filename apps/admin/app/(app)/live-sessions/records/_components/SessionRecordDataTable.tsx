'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AdminCoachSummary, AdminOutcomeTarget, AdminSessionRecord } from '@gabby/types/adminLiveSession';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { SESSION_RECORD_LIST_FILTERS, SESSION_RECORD_RESULT_VALUES, SESSION_RECORD_VIA_VALUES } from '../_lib/list';
import { CorrectOutcomeDialog } from '../../_components/dialogs/CorrectOutcomeDialog';
import { createColumns } from './columns';

interface SessionRecordDataTableProps {
  data: AdminSessionRecord[];
  totalCount: number;
  pageCount: number;
  coaches: AdminCoachSummary[];
  /** 月の絞り込みの選択肢（YYYY-MM、新しい順） */
  months: string[];
}

export function SessionRecordDataTable({ data, totalCount, pageCount, coaches, months }: SessionRecordDataTableProps) {
  const t = useTranslations('liveSessions.records');
  const tStatus = useTranslations('liveSessions.status');
  const query = useListQuery(SESSION_RECORD_LIST_FILTERS);
  const [target, setTarget] = useState<AdminOutcomeTarget | null>(null);

  const openCorrect = (record: AdminSessionRecord) =>
    setTarget({
      session_id: record.session_id,
      student_name: record.student_name,
      coach_name: record.coach_name,
      start_datetime: record.start_datetime,
      status: record.status,
      completion_result: record.completion_result,
      cancel_category: record.cancel_category,
      conducted_via: record.conducted_via,
    });

  return (
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      >
        <ListSelectFilter
          label={t('reviewFilter')}
          allLabel={t('reviewAll')}
          options={[{ value: '1', label: t('reviewOnly') }]}
          value={query.filters.review}
          onChange={(value) => query.setFilter('review', value)}
          className="w-36"
        />
        <ListSelectFilter
          label={t('monthFilter')}
          allLabel={t('allMonths')}
          options={months.map((month) => ({ value: month, label: month.replace('-', '/') }))}
          value={query.filters.month}
          onChange={(value) => query.setFilter('month', value)}
          className="w-32"
        />
        <ListSelectFilter
          label={t('coachFilter')}
          allLabel={t('allCoaches')}
          options={coaches.map((coach) => ({ value: coach.id, label: coach.user_name }))}
          value={query.filters.coach}
          onChange={(value) => query.setFilter('coach', value)}
        />
        <ListSelectFilter
          label={t('resultFilter')}
          allLabel={t('allResults')}
          options={SESSION_RECORD_RESULT_VALUES.map((value) => ({ value, label: t(`results.${value}`) }))}
          value={query.filters.result}
          onChange={(value) => query.setFilter('result', value)}
        />
        <ListSelectFilter
          label={t('viaFilter')}
          allLabel={t('allVias')}
          options={SESSION_RECORD_VIA_VALUES.map((value) => ({ value, label: t(`vias.${value}`) }))}
          value={query.filters.via}
          onChange={(value) => query.setFilter('via', value)}
          className="w-36"
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t, { tStatus, onCorrect: openCorrect })}
        data={data}
        getRowId={(row) => row.session_id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />

      {/* 修正後の一覧の取り直しは、サーバーアクションの revalidatePath で行われる */}
      <CorrectOutcomeDialog target={target} onClose={() => setTarget(null)} onCorrected={() => undefined} />
    </div>
  );
}
