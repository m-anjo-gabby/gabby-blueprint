'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft } from 'lucide-react';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { formatSprintLevelLabel } from '@gabby/lib';
import { useToast } from '@gabby/lib/hooks/useToast';
import { moveSprintQuestionsLevel } from '@/actions/adminSprintAction';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SprintLevelMoveDialogProps {
  contentId: string;
  type: SprintQuestionType;
  currentLevel: number;
  /** 移動する問題（Speedは1問、それ以外はグループ内の全問題） */
  questionIds: string[];
  onSuccess: () => void;
}

/**
 * スプリント問題を別のレベルへ移動するダイアログ。
 * Speed以外はグループ単位で移動する（グループの一部だけを別レベルに分けない）。
 */
export function SprintLevelMoveDialog({ contentId, type, currentLevel, questionIds, onSuccess }: SprintLevelMoveDialogProps) {
  const t = useTranslations('contents.editor.sprint.levelMoveDialog');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [toLevel, setToLevel] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const meta = QUESTION_TYPES[type];
  const levelOptions = Array.from({ length: meta.maxLevel - meta.minLevel + 1 }, (_, i) => meta.minLevel + i)
    .filter((lv) => lv !== currentLevel);
  const isGroup = type !== '0';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setToLevel('');
  };

  const handleSubmit = () => {
    if (toLevel === '') return;
    startTransition(async () => {
      const res = await moveSprintQuestionsLevel(contentId, type, questionIds, Number(toLevel));
      if (!res.success) {
        showToast(res.message || t('toastError'), 'error');
        return;
      }
      showToast(t('toastMoved', { level: formatSprintLevelLabel(type, Number(toLevel)) }), 'success');
      setOpen(false);
      onSuccess();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl text-slate-300 hover:text-brand hover:bg-brand-50"
          title={t('triggerTitle')}
        >
          <ArrowRightLeft size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {isGroup ? t('descriptionGroup', { count: questionIds.length }) : t('descriptionSingle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{t('currentLabel', { level: formatSprintLevelLabel(type, currentLevel) })}</span>
            <span className="text-slate-300">→</span>
            <Select value={toLevel} onValueChange={setToLevel}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t('selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {levelOptions.map((lv) => (
                  <SelectItem key={lv} value={String(lv)}>
                    {formatSprintLevelLabel(type, lv)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {t('bulkImportNote')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {t('cancelButton')}
          </Button>
          <Button onClick={handleSubmit} disabled={toLevel === ''} pending={isPending}>
            {t('submitButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
