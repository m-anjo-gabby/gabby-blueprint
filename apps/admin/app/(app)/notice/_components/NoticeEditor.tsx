// apps/admin/app/(app)/notice/_components/NoticeEditor.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
  FileText
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

  // JST日時入力用文字列 (YYYY-MM-DDTHH:mm)
  const [publishedAtJst, setPublishedAtJst] = React.useState<string>('');
  const [expiredAtJst, setExpiredAtJst] = React.useState<string>('');

  const [content, setContent] = React.useState(initialData?.content || '');
  const [attachments, setAttachments] = React.useState<NoticeAttachment[]>(initialData?.attachments || []);

  const [clientOptions, setClientOptions] = React.useState<ClientOption[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'edit' | 'preview'>('edit');

  // 初期日時のセット (UTC → JST <input type="datetime-local"> 形式へ変換)
  React.useEffect(() => {
    const initDates = async () => {
      if (initialData?.published_at) {
        const jst = await utcToJstInputStr(initialData.published_at);
        setPublishedAtJst(jst);
      } else {
        // 新規作成時は現在時刻の JST
        const nowJst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
        setPublishedAtJst(nowJst);
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

  // 添付ファイルの追加
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const newAttachments = [...attachments];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await uploadNoticeFile(noticeId, formData);
        if (res.success && res.attachment) {
          newAttachments.push(res.attachment);
        } else {
          showToast(res.message || `${file.name} のアップロードに失敗しました`, 'error');
        }
      }

      setAttachments(newAttachments);
      showToast('ファイルをアップロードしました', 'success');
    } catch (error) {
      showToast('ファイルアップロード中にエラーが発生しました', 'error');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // 添付ファイルの削除
  const handleRemoveAttachment = async (att: NoticeAttachment) => {
    try {
      await deleteNoticeFile(att.path);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      showToast('添付ファイルを削除しました', 'info');
    } catch (error) {
      showToast('ファイル削除に失敗しました', 'error');
    }
  };

  // 保存処理
  const handleSave = async () => {
    if (!title.trim()) {
      showToast('タイトルを入力してください', 'error');
      return;
    }

    if (!publishedAtJst) {
      showToast('公開開始日時を入力してください', 'error');
      return;
    }

    if (targetType === 'CLIENT' && !clientId) {
      showToast('対象顧客を選択してください', 'error');
      return;
    }

    const formData: NoticeFormData = {
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
      attachments,
    };

    try {
      setIsSaving(true);
      let res;
      if (isEdit && initialData?.notice_id) {
        res = await updateNotice(initialData.notice_id, formData);
      } else {
        res = await createNotice(formData);
      }

      if (res.success) {
        showToast(isEdit ? 'お知らせを更新しました' : 'お知らせを作成しました', 'success');
        router.push('/notice');
      } else {
        showToast(res.message || '保存に失敗しました', 'error');
      }
    } catch (error) {
      showToast('保存中にエラーが発生しました', 'error');
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
              {isEdit ? 'お知らせの編集' : '新規お知らせ作成'}
            </h1>
            <p className="text-[11px] font-bold text-slate-400">
              {isEdit ? `ID: ${initialData?.notice_id}` : 'メタ情報とMarkdown本文を入力して保存します'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 保存ボタン */}
          <Button
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isEdit ? '更新を保存する' : '登録する'}
          </Button>
        </div>
      </div>

      {/* ─── メインフォーム＆エディタエリア ───────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        
        {/* 左側: メタ情報＆添付ファイル設定 (lg:col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 overflow-y-auto space-y-6">
          
          {/* タイトル */}
          <div className="space-y-2">
            <Label className="text-xs font-black text-slate-700">タイトル <span className="text-rose-500">*</span></Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 【重要】システムメンテナンスのお知らせ"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* 種別 & 配信対象 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-black text-slate-700">お知らせ種別</Label>
              <select
                value={noticeType}
                onChange={(e) => setNoticeType(e.target.value as NoticeType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              >
                {Object.entries(NOTICE_TYPES).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black text-slate-700">配信対象</Label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as NoticeTargetType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              >
                <option value="ALL">全体配信 (ALL)</option>
                <option value="CLIENT">顧客指定 (CLIENT)</option>
              </select>
            </div>
          </div>

          {/* 顧客指定時のドロップダウン */}
          {targetType === 'CLIENT' && (
            <div className="space-y-2 bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100">
              <Label className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                <Building2 size={14} className="text-indigo-600" /> 対象顧客を選択 <span className="text-rose-500">*</span>
              </Label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
              >
                <option value="">-- 顧客を選択してください --</option>
                {clientOptions.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 公開期間 (JST) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">公開期間設定 (JST)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-600">公開開始日時 (JST) <span className="text-rose-500">*</span></Label>
                <input
                  type="datetime-local"
                  value={publishedAtJst}
                  onChange={(e) => setPublishedAtJst(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-600">公開終了日時 (JST)</Label>
                <input
                  type="datetime-local"
                  value={expiredAtJst}
                  onChange={(e) => setExpiredAtJst(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
                <p className="text-[10px] text-slate-400">※未入力で無期限表示</p>
              </div>
            </div>
          </div>

          {/* 各種コントロールフラグ */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">フラグ・表示制御</h3>
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              {/* 公開フラグ */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">公開ステータス (is_published)</Label>
                  <p className="text-[10px] text-slate-500">ONで公開状態、OFFで下書き保存となります</p>
                </div>
                <Switch
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
              </div>

              {/* 重要フラグ */}
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">重要お知らせ (is_important)</Label>
                  <p className="text-[10px] text-slate-500">「重要」バッジを赤色で強調表示します</p>
                </div>
                <Switch
                  checked={isImportant}
                  onCheckedChange={setIsImportant}
                />
              </div>

              {/* ポップアップ表示フラグ */}
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                <div>
                  <Label className="text-xs font-black text-slate-800 cursor-pointer">ポップアップ表示 (show_dialog)</Label>
                  <p className="text-[10px] text-slate-500">ユーザーログイン時にダイアログで全画面自動ポップアップします</p>
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
                <Paperclip size={14} /> 添付ファイル
              </h3>
              <label className="cursor-pointer h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1">
                {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                追加
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
                添付ファイルはありません
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
                        <p className="font-bold text-slate-700 truncate">{att.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{formatBytes(att.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="削除"
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
              <span className="text-xs font-black text-slate-800">お知らせ本文 (Markdown対応)</span>
            </div>

            <div className="flex items-center gap-1 bg-white border rounded-xl p-1 shadow-sm">
              <Button
                variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('edit')}
                className="h-7 gap-1.5 text-[11px] font-bold rounded-lg"
              >
                <FileEdit size={13} /> 編集
              </Button>
              <Button
                variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('preview')}
                className="h-7 gap-1.5 text-[11px] font-bold rounded-lg"
              >
                <Eye size={13} /> プレビュー
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
                placeholder="お知らせの本文をMarkdown形式で入力してください...&#10;&#10;## 見出し&#10;本文テキストです。"
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
