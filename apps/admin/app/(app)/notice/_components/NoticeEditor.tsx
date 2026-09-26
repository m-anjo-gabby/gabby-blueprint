// apps/admin/app/(app)/notice/_components/NoticeEditor.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { 
  Save, 
  Eye, 
  FileEdit, 
  Loader2, 
  ChevronLeft, 
  Paperclip, 
  Trash2, 
  Upload, 
  CheckCircle2, 
  Clock, 
  Globe, 
  Building2,
  FileText,
  X,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TermViewer } from '@gabby/lib/components/term/TermViewer';
import { NOTICE_TYPES, NoticeAttachment, NoticeType, NoticeTargetType } from '@gabby/types/notice';
import { ClientOption } from '@gabby/types/client';
import { 
  createNotice, 
  updateNotice, 
  uploadNoticeFile, 
  deleteNoticeFile, 
  utcToJstInputStr,
  NoticeFormData 
} from '@/actions/adminNoticeAction';
import { getClientsFilter } from '@/actions/adminClientAction';

interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  path?: string;
  file?: File;
}

interface NoticeEditorProps {
  initialData?: {
    notice_id?: string;
    target_type?: NoticeTargetType;
    client_id?: string | null;
    notice_type?: NoticeType;
    is_important?: boolean;
    show_dialog?: boolean;
    title?: string;
    content?: string;
    attachments?: NoticeAttachment[];
    published_at?: string; // UTC ISO文字列
    expired_at?: string | null; // UTC ISO文字列
    is_published?: boolean;
  };
  mode: 'create' | 'edit';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NoticeEditor({ initialData, mode }: NoticeEditorProps) {
  const t = useTranslations('notice.editor');
  const router = useRouter();
  const { showToast } = useToast();

  const isEdit = mode === 'edit';
  const [noticeId] = React.useState(() => initialData?.notice_id || crypto.randomUUID());

  // ─── フォーム状態 ──────────────────────────────────────────
  const [title, setTitle] = React.useState(initialData?.title || '');
  const [noticeType, setNoticeType] = React.useState<NoticeType>(initialData?.notice_type || 'INFO');
  const [targetType, setTargetType] = React.useState<NoticeTargetType>(initialData?.target_type || 'ALL');
  const [clientId, setClientId] = React.useState<string>(initialData?.client_id || '');
  const [isImportant, setIsImportant] = React.useState(initialData?.is_important || false);
  const [showDialog, setShowDialog] = React.useState(initialData?.show_dialog || false);
  const [isPublished, setIsPublished] = React.useState(initialData?.is_published ?? true);

  // JST日付入力用文字列 (YYYY-MM-DD)
  const [publishedAtJst, setPublishedAtJst] = React.useState<string>('');
  const [expiredAtJst, setExpiredAtJst] = React.useState<string>('');

  const [content, setContent] = React.useState(initialData?.content || '');
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>(() => {
    return (initialData?.attachments || []).map(a => ({
      id: a.id,
      name: a.name,
      size: a.size,
      mime_type: a.mime_type,
      path: a.path,
    }));
  });
  const [deletedPaths, setDeletedPaths] = React.useState<string[]>([]);

  const [clientOptions, setClientOptions] = React.useState<ClientOption[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'edit' | 'preview'>('edit');

  // 初期日時のセット (UTC → JST <input type="date"> 形式へ変換)
  React.useEffect(() => {
    const initDates = async () => {
      if (initialData?.published_at) {
        const jst = await utcToJstInputStr(initialData.published_at);
        setPublishedAtJst(jst);
      } else {
        // 新規作成時は当日の JST 日付 (YYYY-MM-DD)
        const nowJstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        setPublishedAtJst(nowJstDate);
      }

      if (initialData?.expired_at) {
        const jstExp = await utcToJstInputStr(initialData.expired_at);
        setExpiredAtJst(jstExp);
      }
    };
    initDates();
  }, [initialData]);

  // 顧客選択肢の取得
  React.useEffect(() => {
    const fetchClients = async () => {
      const clients = await getClientsFilter();
      setClientOptions(clients);
    };
    fetchClients();
  }, []);

  // 添付ファイルのローカル追加 (まだStorageへはアップロードしない)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: PendingAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newItems.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mime_type: file.type || 'application/octet-stream',
        file,
      });
    }

    setAttachments(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  // 添付ファイルのローカル削除 (既存ファイルの場合は削除予約)
  const handleRemoveAttachment = (att: PendingAttachment) => {
    if (att.path) {
      setDeletedPaths(prev => [...prev, att.path!]);
    }
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  // 保存処理
  const handleSave = async () => {
    if (!title.trim()) {
      showToast(t('errorTitleRequired'), 'error');
      return;
    }

    if (!publishedAtJst) {
      showToast(t('errorPublishDateRequired'), 'error');
      return;
    }

    if (targetType === 'CLIENT' && !clientId) {
      showToast(t('errorClientRequired'), 'error');
      return;
    }

    try {
      setIsSaving(true);

      // 1. 新規追加添付ファイルの Storage アップロード
      const finalAttachments: NoticeAttachment[] = [];
      for (const att of attachments) {
        if (att.file) {
          const fileFormData = new FormData();
          fileFormData.append('file', att.file);
          const res = await uploadNoticeFile(noticeId, fileFormData);
          if (!res.success || !res.attachment) {
            showToast(res.message || t('errorUploadFailed', { name: att.name }), 'error');
            setIsSaving(false);
            return;
          }
          finalAttachments.push(res.attachment);
        } else if (att.path) {
          finalAttachments.push({
            id: att.id,
            name: att.name,
            size: att.size,
            mime_type: att.mime_type,
            path: att.path,
          });
        }
      }

      // 2. 削除マークされた既存ファイルの Storage からの削除
      for (const path of deletedPaths) {
        await deleteNoticeFile(path);
      }

      // 3. DBへ送信
      const formData: NoticeFormData = {
        notice_id: noticeId,
        target_type: targetType,
        client_id: targetType === 'CLIENT' ? clientId : null,
        notice_type: noticeType,
        is_important: isImportant,
        show_dialog: showDialog,
        title,
        content,
        published_at: publishedAtJst,
        expired_at: expiredAtJst || null,
        is_published: isPublished,
        attachments: finalAttachments,
      };

      let res;
      if (isEdit && initialData?.notice_id) {
        res = await updateNotice(initialData.notice_id, formData);
      } else {
        res = await createNotice(formData);
      }

      if (res.success) {
        showToast(isEdit ? t('toastUpdated') : t('toastCreated'), 'success');
        router.push('/notice');
      } else {
        showToast(res.message || t('toastSaveFailed'), 'error');
      }
    } catch (error) {
      showToast(t('toastSaveError'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] space-y-4">
      {/* ─── トップナビゲーション・保存バー ───────────────────── */}
      <div className="flex items-center justify-between bg-white px-6 py-3.5 rounded-2xl border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/notice"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
          >
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-base font-black text-slate-900 tracking-tight">
              {isEdit ? t('editTitle') : t('createTitle')}
            </h1>
            <p className="text-[11px] font-bold text-slate-400">
              {isEdit ? t('editIdLabel', { id: initialData?.notice_id ?? '' }) : t('createHint')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 保存ボタン */}
          <Button
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="h-10 px-6 bg-brand hover:bg-brand-strong text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-brand/20 active:scale-95 transition-all"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isEdit ? t('saveUpdate') : t('saveCreate')}
          </Button>
        </div>
      </div>

      {/* ─── メインフォーム＆エディタエリア ───────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        
        {/* 左側: メタ情報＆添付ファイル設定 (lg:col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 overflow-y-auto space-y-6">
          
          {/* タイトル */}
          <div className="space-y-2">
            <Label className="text-xs font-black text-slate-700">{t('titleLabel')} <span className="text-rose-500">*</span></Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
            />
          </div>

          {/* 種別 & 配信対象 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-black text-slate-700">{t('typeLabel')}</Label>
              <select
                value={noticeType}
                onChange={(e) => setNoticeType(e.target.value as NoticeType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
              >
                {Object.entries(NOTICE_TYPES).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black text-slate-700">{t('targetLabel')}</Label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as NoticeTargetType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
              >
                <option value="ALL">{t('targetAllOption')}</option>
                <option value="CLIENT">{t('targetClientOption')}</option>
                <option value="COACH">{t('targetCoachOption')}</option>
              </select>
            </div>
          </div>

          {/* 顧客指定時のドロップダウン */}
          {targetType === 'CLIENT' && (
            <div className="space-y-2 bg-brand-50/50 p-3.5 rounded-xl border border-brand-100">
              <Label className="text-xs font-black text-brand-900 flex items-center gap-1.5">
                <Building2 size={14} className="text-brand" /> {t('selectClientLabel')} <span className="text-rose-500">*</span>
              </Label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-brand-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-500 transition-all"
              >
                <option value="">{t('selectClientPlaceholder')}</option>
                {clientOptions.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 公開期間 (JST) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('publishPeriodTitle')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-600">{t('publishStartLabel')} <span className="text-rose-500">*</span></Label>
                <input
                  type="date"
                  value={publishedAtJst}
                  onChange={(e) => setPublishedAtJst(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-slate-600">{t('publishEndLabel')}</Label>
                  {expiredAtJst && (
                    <button
                      type="button"
                      onClick={() => setExpiredAtJst('')}
                      className="text-[10px] font-bold text-brand hover:text-brand-800 transition-colors flex items-center gap-0.5"
                    >
                      <RotateCcw size={10} /> {t('clearLabel')}
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={expiredAtJst}
                    onChange={(e) => setExpiredAtJst(e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white transition-all ${
                      expiredAtJst ? 'pr-8' : ''
                    }`}
                  />
                  {expiredAtJst && (
                    <button
                      type="button"
                      onClick={() => setExpiredAtJst('')}
                      className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors"
                      title={t('clearTitle')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">{t('noExpiryHint')}</p>
              </div>
            </div>
          </div>

          {/* 各種コントロールフラグ */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('flagsTitle')}</h3>
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              {/* 公開フラグ */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">{t('publishedFlagLabel')}</Label>
                  <p className="text-[10px] text-slate-500">{t('publishedFlagHint')}</p>
                </div>
                <Switch
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
              </div>

              {/* 重要フラグ */}
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">{t('importantFlagLabel')}</Label>
                  <p className="text-[10px] text-slate-500">{t('importantFlagHint')}</p>
                </div>
                <Switch
                  checked={isImportant}
                  onCheckedChange={setIsImportant}
                />
              </div>

              {/* ポップアップ表示フラグ */}
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">{t('dialogFlagLabel')}</Label>
                  <p className="text-[10px] text-slate-500">{t('dialogFlagHint')}</p>
                </div>
                <Switch
                  checked={showDialog}
                  onCheckedChange={setShowDialog}
                />
              </div>
            </div>
          </div>

          {/* 添付ファイル管理 */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Paperclip size={14} /> {t('attachmentsTitle')}
              </h3>
              <label className="cursor-pointer h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1">
                {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {t('addButton')}
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length === 0 ? (
              <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 font-bold">
                {t('noAttachments')}
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Paperclip size={14} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-700 truncate">{att.name}</p>
                          {att.file && (
                            <span className="text-[9px] bg-brand-50 text-brand border border-brand-100 font-bold px-1.5 py-0.2 rounded-md shrink-0">
                              {t('newBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">{formatBytes(att.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title={t('removeTooltip')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右側: Markdown エディタ＆プレビュー (lg:col-span-7) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          {/* エディタヘッダー・モード切り替え */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-800">{t('contentTitle')}</span>
            </div>

            <div className="flex items-center gap-1 bg-white border rounded-xl p-1 shadow-sm">
              <Button
                variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('edit')}
                className="h-7 gap-1.5 text-[11px] font-bold rounded-lg"
              >
                <FileEdit size={13} /> {t('editTab')}
              </Button>
              <Button
                variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('preview')}
                className="h-7 gap-1.5 text-[11px] font-bold rounded-lg"
              >
                <Eye size={13} /> {t('previewTab')}
              </Button>
            </div>
          </div>

          {/* 本文エリア */}
          <div className="flex-1 overflow-hidden flex flex-col w-full min-w-0">
            {viewMode === 'edit' ? (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full p-6 font-mono text-xs sm:text-sm border-none focus-visible:ring-0 resize-none leading-relaxed text-slate-800"
                placeholder={t('contentPlaceholder')}
              />
            ) : (
              <TermViewer
                content={content}
                containerClassName="bg-slate-50/50 p-6 sm:p-8"
                contentClassName="max-w-2xl mx-auto bg-white border rounded-2xl shadow-sm sm:px-10 py-8"
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
