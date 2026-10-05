'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DialogueSession } from '@gabby/types/dialogue';
import { getDialogueSessions } from '@/actions/adminDialogueAction';
import { DialogueSessionList } from './DialogueSessionList';
import { DialogueSessionFormDialog } from './DialogueSessionFormDialog';

interface DialogueEditorProps {
  contentId: string;
}

export function DialogueEditor({ contentId }: DialogueEditorProps) {
  const t = useTranslations('contents.editor.dialogue.index');
  const [sessions, setSessions] = useState<DialogueSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getDialogueSessions(contentId);
      setSessions(data);
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const nextSessionNo = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.session_no)) + 1
    : 1;

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
        {isLoading ? (
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
