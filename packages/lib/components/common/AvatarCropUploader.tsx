'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { User, Camera, Trash2, Loader2, X } from 'lucide-react';
import { getCroppedImageBlob } from '../../profile/cropImage';

export interface AvatarCropUploaderLabels {
  /** モーダルのタイトル */
  modalTitle: string;
  /** キャンセルボタンのラベル */
  cancelLabel: string;
  /** 適用（保存）ボタンのラベル */
  applyLabel: string;
  /** アップロード中の表示ラベル */
  uploadingLabel: string;
  /** 画像削除ボタンのラベル（onRemove未指定時は表示しない） */
  removeLabel?: string;
  /** アップロード失敗時のトースト等に使う汎用エラーラベル（サイズ超過・形式不正） */
  invalidFileLabel: string;
}

export interface AvatarCropUploaderProps {
  /** 現在のアイコン画像URL（未設定時はnull） */
  currentImageUrl: string | null;
  /** クロップ確定後に呼び出される保存処理（Blobを受け取りアップロードAPIを呼ぶのは呼び出し側の責務） */
  onUpload: (blob: Blob) => Promise<void>;
  /** アイコン削除処理（未指定の場合は削除ボタンを表示しない） */
  onRemove?: () => Promise<void>;
  /** UI表示文言（言語はポータル側で決定するため、ここでは受け取るだけ） */
  labels: AvatarCropUploaderLabels;
  /** アバターの表示サイズ(px)。デフォルト96 */
  size?: number;
  /** クロップ後に生成する正方形画像の出力サイズ(px)。デフォルト256 */
  outputSize?: number;
  /** 許可するMIMEタイプ（accept属性・クライアント側の簡易検証に使用） */
  acceptMimeTypes?: readonly string[];
  /** 許可する最大サイズ(byte) */
  maxFileSize?: number;
}

const DEFAULT_ACCEPT = ['image/png', 'image/jpeg', 'image/webp'] as const;
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

/**
 * プロフィールアイコンの選択・クロップ・アップロードを行う共通UIコンポーネント
 * 実際のアップロード/削除処理（サーバーアクション呼び出し）は onUpload / onRemove として
 * 呼び出し側から注入する（本コンポーネントはStorageやDBの詳細を一切知らない）。
 */
export function AvatarCropUploader({
  currentImageUrl,
  onUpload,
  onRemove,
  labels,
  size = 96,
  outputSize = 256,
  acceptMimeTypes = DEFAULT_ACCEPT,
  maxFileSize = DEFAULT_MAX_SIZE,
}: AvatarCropUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
    setSelectedImageUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedImageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!acceptMimeTypes.includes(file.type) || file.size > maxFileSize) {
      setValidationError(labels.invalidFileLabel);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setValidationError(null);
    setSelectedImageUrl(URL.createObjectURL(file));
  };

  const handleCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = async () => {
    if (!selectedImageUrl || !croppedAreaPixels) return;
    setIsSaving(true);
    try {
      const blob = await getCroppedImageBlob(selectedImageUrl, croppedAreaPixels, outputSize);
      await onUpload(blob);
      closeModal();
    } finally {
      setIsSaving(false);
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
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {currentImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={size * 0.5} className="text-slate-400" />
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg transition-colors"
        >
          <Camera size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptMimeTypes.join(',')}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {validationError && (
        <p className="text-xs font-bold text-rose-500">{validationError}</p>
      )}

      {onRemove && currentImageUrl && (
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

      <AnimatePresence>
        {selectedImageUrl && (
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !isSaving && closeModal()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <p className="font-black text-slate-800 text-sm">{labels.modalTitle}</p>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="relative w-full h-72 bg-slate-900">
                <Cropper
                  image={selectedImageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                />
              </div>

              <div className="px-5 py-4 space-y-4">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    className="flex-1 h-11 text-[13px] font-black text-slate-500 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {labels.cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isSaving || !croppedAreaPixels}
                    className="flex-1 h-11 text-[13px] font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {labels.uploadingLabel}
                      </>
                    ) : (
                      labels.applyLabel
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
