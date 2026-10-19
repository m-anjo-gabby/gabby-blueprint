'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { type DialogueSession } from '@gabby/types/dialogue';
import { getDialogueSessions } from '@/actions/adminDialogueAction';
import { LoadErrorSection } from '@/components/common/LoadErrorSection';
import { Badge } from '@/components/ui/badge';
import { DialogueSessionFormDialog } from './DialogueSessionFormDialog';
import { DialogueSessionList } from './DialogueSessionList';

interface DialogueEditorProps {
  contentId: string;
  /** ページでサーバー取得したセッションの一覧（null は取得の失敗）。編集の後だけブラウザから取り直す */
  initialSessions: DialogueSession[] | null;
}

export function DialogueEditor({ contentId, initialSessions }: DialogueEditorProps) {
  const t = useTranslations('contents.editor.dialogue.index');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<DialogueSession[]>(initialSessions ?? []);
  const [isLoadFailed, setIsLoadFailed] = useState(initialSessions === null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getDialogueSessions(contentId);
      if (res.success) {
        setSessions(res.data);
        setIsLoadFailed(false);
      } else {
        showToast(tCommon('errors.loadFailed'), 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [contentId, showToast, tCommon]);

  const nextSessionNo = sessions.length > 0 ? Math.max(...sessions.map((s) => s.session_no)) + 1 : 1;

  return (
    <div className="flex flex-col h-full bg-slate-50/30 overflow-hidden">
      {/* ツールバー */}
      <div className="shrink-0 p-4 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-sm">
        <Badge variant="outline" className="bg-brand-50 text-brand border-brand-100 font-black">
          {t('sessionCount', { count: sessions.length })}
        </Badge>

        <DialogueSessionFormDialog
          mode="create"
          contentId={contentId}
          nextSessionNo={nextSessionNo}
          onSuccess={fetchSessions}
        />
      </div>

      {/* リストエリア */}
      <div className="flex-1 overflow-hidden">
        {isLoadFailed ? (
          <LoadErrorSection className="m-6" />
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm font-medium italic">{t('loading')}</span>
          </div>
        ) : (
          <DialogueSessionList sessions={sessions} contentId={contentId} onUpdate={fetchSessions} />
        )}
      </div>
    </div>
  );
}
