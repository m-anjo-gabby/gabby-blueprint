'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  checkVideoFile,
  VIDEO_FILE_MAX_BYTES,
  VIDEO_FILE_TYPES,
  type VideoFileCheckError,
  type VideoFileKind,
} from '@gabby/lib/video/files';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { VIDEO_STATUS, type AdminVideoItem, type AdminVideoSection } from '@gabby/types/video';
import { discardVideoUploads, prepareVideoUpload, saveVideo } from '@/actions/adminVideoAction';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { readVideoDuration, uploadVideoFile } from '@/lib/videoUpload';

export type VideoFormTarget = { mode: 'create'; sectionId: string } | { mode: 'edit'; video: AdminVideoItem };

interface VideoFormDialogProps {
  /** 開く対象（null で閉じる） */
  target: VideoFormTarget | null;
  /** 登録先のセクションの選択肢 */
  sections: AdminVideoSection[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

type FormT = ReturnType<typeof useTranslations<'contents.editor.video.videoForm'>>;

function createVideoSchema(t: FormT) {
  return z.object({
    section_id: z.string(),
    title: z.string().trim().min(1, t('errors.titleRequired')),
    title_en: z.string(),
    description: z.string(),
    published: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof createVideoSchema>>;

interface PickedFile {
  file: File;
  /** サムネイルの表示用（object URL）。動画は null */
  previewUrl: string | null;
}

const toMb = (bytes: number) => Math.floor(bytes / 1024 / 1024);

/** ビデオの登録・編集。ファイルはサーバーで作ったアップロード先へブラウザから直接送ってから、行を保存する */
export function VideoFormDialog({ target, sections, onClose, onSaved }: VideoFormDialogProps) {
  const t = useTranslations('contents.editor.video.videoForm');
  const tErrors = useTranslations('contents.errors');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(createVideoSchema(t)),
    defaultValues: { section_id: '', title: '', title_en: '', description: '', published: false },
  });

  const [videoFile, setVideoFile] = useState<PickedFile | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<PickedFile | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  /** アップロードの進み具合（0〜1。送っていない間は null） */
  const [progress, setProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const editing = target?.mode === 'edit' ? target.video : null;

  // 開いた時だけ初期値を入れ直す（選んだファイルも捨てる）
  const resetToTarget = useEffectEvent((next: VideoFormTarget) => {
    form.reset(
      next.mode === 'edit'
        ? {
            section_id: next.video.section_id,
            title: next.video.title,
            title_en: next.video.title_en ?? '',
            description: next.video.description ?? '',
            published: next.video.status === VIDEO_STATUS.PUBLISHED,
          }
        : { section_id: next.sectionId, title: '', title_en: '', description: '', published: false },
    );
    setVideoFile(null);
    setDurationSec(null);
    setThumbnailFile(null);
    setRemoveThumbnail(false);
    setFileError(null);
    setProgress(null);
  });
  useEffect(() => {
    if (target) resetToTarget(target);
  }, [target]);

  // サムネイルの表示用の URL は、選び直し・閉じた時に解放する
  useEffect(() => {
    const url = thumbnailFile?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumbnailFile]);

  const fileErrorMessage = (error: VideoFileCheckError, kind: VideoFileKind) => {
    if (error === 'unsupported_type') return tErrors('videoUnsupportedType');
    if (error === 'empty_file') return tErrors('videoEmptyFile');
    return tErrors('videoFileTooLarge', { max: toMb(VIDEO_FILE_MAX_BYTES[kind]) });
  };

  const pickFile = async (kind: VideoFileKind, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const checked = checkVideoFile(kind, file);
    if (!checked.ok) {
      setFileError(fileErrorMessage(checked.error, kind));
      return;
    }
    setFileError(null);
    if (kind === 'video') {
      setVideoFile({ file, previewUrl: null });
      setDurationSec(await readVideoDuration(file));
    } else {
      setThumbnailFile({ file, previewUrl: URL.createObjectURL(file) });
      setRemoveThumbnail(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!target) return;
    if (!editing && !videoFile) {
      setFileError(t('errors.videoFileRequired'));
      return;
    }

    setIsSaving(true);
    let videoId = editing?.video_id;
    const uploadedKeys: string[] = [];
    try {
      const files = { video: videoFile?.file, thumbnail: thumbnailFile?.file };
      const keys: Partial<Record<VideoFileKind, string>> = {};

      if (files.video || files.thumbnail) {
        const prepared = await prepareVideoUpload({
          videoId,
          video: files.video && { type: files.video.type, size: files.video.size },
          thumbnail: files.thumbnail && { type: files.thumbnail.type, size: files.thumbnail.size },
        });
        if (!prepared.success) {
          showToast(prepared.message, 'error');
          return;
        }
        videoId = prepared.videoId;

        // 送った量の合計で進み具合を出す
        const totalBytes = (files.video?.size ?? 0) + (files.thumbnail?.size ?? 0);
        let doneBytes = 0;
        setProgress(0);
        try {
          for (const kind of ['video', 'thumbnail'] as const) {
            const file = files[kind];
            const uploadTarget = prepared.targets[kind];
            if (!file || !uploadTarget) continue;
            await uploadVideoFile(uploadTarget, file, (ratio) =>
              setProgress((doneBytes + ratio * file.size) / totalBytes),
            );
            doneBytes += file.size;
            uploadedKeys.push(uploadTarget.key);
            keys[kind] = uploadTarget.key;
          }
        } catch {
          showToast(t('uploadFailed'), 'error');
          if (uploadedKeys.length > 0) await discardVideoUploads(videoId, uploadedKeys);
          return;
        }
      }

      if (!videoId) return;
      const res = await saveVideo({
        video_id: videoId,
        section_id: editing ? undefined : values.section_id,
        title: values.title,
        title_en: values.title_en,
        description: values.description,
        status: values.published ? VIDEO_STATUS.PUBLISHED : VIDEO_STATUS.UNPUBLISHED,
        video_key: keys.video,
        thumbnail_key: keys.thumbnail,
        remove_thumbnail: removeThumbnail && !keys.thumbnail,
        duration_sec: keys.video ? durationSec : undefined,
      });
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      showToast(editing ? t('toastUpdated') : t('toastCreated'), 'success');
      onClose();
      await onSaved();
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  };

  const currentThumbnailUrl = thumbnailFile?.previewUrl ?? (removeThumbnail ? null : editing?.thumbnail_url);
  // 外すのは今のサムネイルだけ（新しく選んだファイルは選び直しで替える）。チェックしても欄は消さない（戻せるように）
  const canRemoveThumbnail = !thumbnailFile && !!editing?.thumbnail_path;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {!editing && (
              <FormField
                control={form.control}
                name="section_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('sectionLabel')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((s) => (
                          <SelectItem key={s.section_id} value={s.section_id}>
                            {s.section_name ?? t('untitledSection')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('titleLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('titleEnLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>{t('titleEnDescription')}</FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('descriptionLabel')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="resize-none min-h-20" />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label htmlFor="video-file">{t('videoFileLabel', { max: toMb(VIDEO_FILE_MAX_BYTES.video) })}</Label>
              <Input
                id="video-file"
                type="file"
                accept={Object.keys(VIDEO_FILE_TYPES.video).join(',')}
                disabled={isSaving}
                onChange={(e) => void pickFile('video', e)}
              />
              <p className="text-xs text-slate-500">
                {videoFile
                  ? t('videoFileSelected', {
                      name: videoFile.file.name,
                      duration: formatVideoDuration(durationSec),
                    })
                  : editing
                    ? t('videoFileReplaceHint', { duration: formatVideoDuration(editing.duration_sec) })
                    : t('videoFileRequiredHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumbnail-file">
                {t('thumbnailLabel', { max: toMb(VIDEO_FILE_MAX_BYTES.thumbnail) })}
              </Label>
              <div className="flex items-start gap-4">
                <div className="w-40 aspect-video shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {currentThumbnailUrl ? (
                    <ExternalImage src={currentThumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-slate-300">
                      <ImageOff size={20} aria-hidden />
                    </span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    id="thumbnail-file"
                    type="file"
                    accept={Object.keys(VIDEO_FILE_TYPES.thumbnail).join(',')}
                    disabled={isSaving}
                    onChange={(e) => void pickFile('thumbnail', e)}
                  />
                  {canRemoveThumbnail && (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <Checkbox
                        checked={removeThumbnail}
                        disabled={isSaving}
                        onCheckedChange={(checked) => setRemoveThumbnail(checked === true)}
                      />
                      {t('removeThumbnail')}
                    </label>
                  )}
                </div>
              </div>
            </div>

            {fileError && <p className="text-sm font-medium text-destructive">{fileError}</p>}

            <FormField
              control={form.control}
              name="published"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-xl border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('publishedLabel')}</FormLabel>
                    <FormDescription>{t('publishedDescription')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {progress !== null && (
              <div className="space-y-1">
                <Progress value={Math.round(progress * 100)} />
                <p className="text-xs text-slate-500">{t('uploading', { percent: Math.round(progress * 100) })}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" disabled={isSaving} onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" pending={isSaving}>
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
