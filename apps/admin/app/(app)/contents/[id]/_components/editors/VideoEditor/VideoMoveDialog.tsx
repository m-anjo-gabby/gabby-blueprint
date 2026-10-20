'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { AdminVideoItem, VideoMoveTarget } from '@gabby/types/video';
import { getVideoMoveTargets, moveVideoToSection } from '@/actions/adminVideoAction';
import { boldChunks } from '@/components/list/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VideoMoveDialogProps {
  /** 移すビデオ（null で閉じる） */
  video: AdminVideoItem | null;
  onClose: () => void;
  onMoved: () => Promise<void>;
}

/** ビデオを別のセクション（別の教材のセクションでもよい）の末尾へ移す。移動先の候補は開いた時に取得する */
export function VideoMoveDialog({ video, onClose, onMoved }: VideoMoveDialogProps) {
  const t = useTranslations('contents.editor.video.moveDialog');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const [targets, setTargets] = useState<VideoMoveTarget[] | null>(null);
  const [contentId, setContentId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    void getVideoMoveTargets().then((res) => {
      if (cancelled) return;
      if (!res.success) {
        showToast(tCommon('errors.loadFailed'), 'error');
        return;
      }
      setTargets(res.targets);
      const current = res.targets.find((c) => c.sections.some((s) => s.section_id === video.section_id));
      setContentId(current?.content_id ?? '');
      setSectionId('');
    });
    return () => {
      cancelled = true;
      setTargets(null);
    };
  }, [video, showToast, tCommon]);

  const sections = targets?.find((c) => c.content_id === contentId)?.sections ?? [];

  const handleMove = async () => {
    if (!video || !sectionId) return;
    setIsMoving(true);
    try {
      const res = await moveVideoToSection(video.video_id, sectionId);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      showToast(t('toastMoved'), 'success');
      onClose();
      await onMoved();
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && !isMoving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{video && t.rich('description', { title: video.title, b: boldChunks })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('contentLabel')}</Label>
            <Select
              value={contentId}
              disabled={!targets}
              onValueChange={(value) => {
                setContentId(value);
                setSectionId('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={targets ? t('selectPlaceholder') : tCommon('loading')} />
              </SelectTrigger>
              <SelectContent>
                {(targets ?? []).map((c) => (
                  <SelectItem key={c.content_id} value={c.content_id}>
                    {c.content_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('sectionLabel')}</Label>
            <Select value={sectionId} disabled={sections.length === 0} onValueChange={setSectionId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.section_id} value={s.section_id} disabled={s.section_id === video?.section_id}>
                    {s.section_id === video?.section_id
                      ? t('currentSection', { name: s.section_name ?? t('untitledSection') })
                      : (s.section_name ?? t('untitledSection'))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isMoving} onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" pending={isMoving} disabled={!sectionId} onClick={handleMove}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
