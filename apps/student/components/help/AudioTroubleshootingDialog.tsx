import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, RefreshCw, XSquare, Smartphone, PowerOff } from 'lucide-react';

interface AudioTroubleshootingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AudioTroubleshootingDialog: React.FC<AudioTroubleshootingDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-md rounded-panel p-6 bg-white border border-line/60 shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-ink flex items-center gap-2 select-none">
            <HelpCircle className="w-5 h-5 text-brand-500" />
            音声・マイクのトラブル対処法
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2 text-sm text-ink-soft">
          <p className="text-xs text-rose-500 font-bold select-none">
            下記の手順を上から順にお試しください。多くの場合、まず「1. ページの更新（リロード）」だけで解決します。
          </p>
          <div className="space-y-3">
            <div className="flex gap-3 items-start p-3.5 bg-canvas rounded-control">
              <RefreshCw className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-ink text-xs select-none">1. ページを更新（リロード）する</h4>
                <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
                  ブラウザの再読み込みボタンでこのページを更新してください。一時的な不具合の多くはこれで解決します。
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-3.5 bg-canvas rounded-control">
              <XSquare className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-ink text-xs select-none">2. ブラウザのタブを完全に閉じて開き直す</h4>
                <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
                  現在開いているこのタブを一度「×」で完全に消去し、新しくタブを立ち上げてサービスを開き直してください。マイクのOSロックが解放されます。
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-3.5 bg-canvas rounded-control">
              <PowerOff className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-ink text-xs select-none">3. ブラウザアプリを「強制終了」して再起動</h4>
                <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
                  Safari や Chrome アプリ自体を、端末の下から上へスワイプして強制終了（タスクキル）し、ブラウザアプリを起動し直してください。
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-3.5 bg-canvas rounded-control">
              <Smartphone className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-ink text-xs select-none">4. 本体（端末）の再起動</h4>
                <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
                  上記で改善しない場合、OS全体の音声システムがフリーズしている可能性があります。本体の電源を一度切り、再起動をお試しください。
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
