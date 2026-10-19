'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpenText } from 'lucide-react';
import { type CVDictionaryEntry } from '@/actions/adminCVDictionaryAction';
import { CVEntryList } from './CVEntryList';

interface CVEntryPaneProps {
  /** 開いた時に選ばれていた単語と、そのエントリの一覧（ページでサーバー取得する） */
  initial: { wordEn: string; entries: CVDictionaryEntry[] | null } | null;
}

/**
 * 右ペイン（選択中の単語の品詞別エントリ）。単語の選び直しは履歴だけを変える（CVWordList）ため、
 * 選択中の単語は URL から読む。
 */
export function CVEntryPane({ initial }: CVEntryPaneProps) {
  const t = useTranslations('tools.cvDictionary.page');
  const wordEn = useSearchParams().get('word');

  if (!wordEn) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <div className="p-6 bg-white rounded-full shadow-sm">
          <BookOpenText size={32} className="text-slate-200" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-bold">{t('selectWordTitle')}</p>
          <p className="text-xs text-slate-300">{t('selectWordHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <CVEntryList
      key={wordEn}
      wordEn={wordEn}
      initialEntries={initial?.wordEn === wordEn ? initial.entries : undefined}
    />
  );
}
