'use client';

import { useRef, useState } from 'react';
import { Film, Trash2, Loader2, Upload } from 'lucide-react';

export interface VideoUploaderLabels {
  /** 動画が未設定の場合のプレースホルダー文言 */
  emptyLabel: string;
  /** アップロード（選択）ボタンのラベル */
  uploadLabel: string;
  /** アップロード中の表示ラベル */
  uploadingLabel: string;
  /** 動画削除ボタンのラベル（onRemove未指定時は表示しない） */
  removeLabel?: string;
  /** アップロード失敗時のトースト等に使う汎用エラーラベル（サイズ超過・形式不正） */
  invalidFileLabel: string;
}

export interface VideoUploaderProps {
  /** 現在の動画URL（未設定時はnull） */
  currentVideoUrl: string | null;
  /** ファイル選択後に呼び出される保存処理（Fileを受け取りアップロードAPIを呼ぶのは呼び出し側の責務） */
  onUpload: (file: File) => Promise<void>;
  /** 動画削除処理（未指定の場合は削除ボタンを表示しない） */
  onRemove?: () => Promise<void>;
  /** UI表示文言（言語はポータル側で決定するため、ここでは受け取るだけ） */
  labels: VideoUploaderLabels;
  /** 許可するMIMEタイプ（accept属性・クライアント側の簡易検証に使用） */
  acceptMimeTypes?: readonly string[];
  /** 許可する最大サイズ(byte) */
  maxFileSize?: number;
}

const DEFAULT_ACCEPT = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;

/**
 * 紹介ビデオの選択・アップロードを行う共通UIコンポーネント
 * 実際のアップロード/削除処理（サーバーアクション呼び出し）は onUpload / onRemove として
 * 呼び出し側から注入する（本コンポーネントはStorageやDBの詳細を一切知らない）。
 */
export function VideoUploader({
  currentVideoUrl,
  onUpload,
  onRemove,
  labels,
  acceptMimeTypes = DEFAULT_ACCEPT,
  maxFileSize = DEFAULT_MAX_SIZE,
}: VideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!acceptMimeTypes.includes(file.type) || file.size > maxFileSize) {
      setValidationError(labels.invalidFileLabel);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setValidationError(null);
    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setIsRemoving(true);
    try {
      await onRemove();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
        {currentVideoUrl ? (
          <video src={currentVideoUrl} controls className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Film size={28} />
            <p className="text-xs font-bold">{labels.emptyLabel}</p>
          </div>
        )}
      </div>

      {validationError && (
        <p className="text-xs font-bold text-rose-500">{validationError}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
        >
          {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {isUploading ? labels.uploadingLabel : labels.uploadLabel}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptMimeTypes.join(',')}
          className="hidden"
          onChange={handleFileChange}
        />

        {onRemove && currentVideoUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
          >
            {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {labels.removeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
