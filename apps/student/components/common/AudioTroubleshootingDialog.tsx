import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, RefreshCw, XSquare, Smartphone } from 'lucide-react';

interface AudioTroubleshootingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AudioTroubleshootingDialog: React.FC<AudioTroubleshootingDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[32px] p-6 bg-white border border-slate-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2 select-none">
            <HelpCircle className="w-5 h-5 text-indigo-500" />
            音声・マイクのトラブル対処法
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2 text-sm text-slate-600">
          <p className="text-xs text-rose-500 font-bold select-none">
            ※ブラウザの「ページ更新（リロード）」だけでは復旧しない場合があります。
          </p>
          <div className="space-y-3">
            <div className="flex gap-3 items-start p-3.5 bg-slate-50 rounded-2xl">
              <XSquare className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs select-none">1. ブラウザのタブを完全に閉じて開き直す</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  現在開いているこのタブを一度「×」で完全に消去し、新しくタブを立ち上げてサービスを開き直してください。マイクのOSロックが解放されます。
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-3.5 bg-slate-50 rounded-2xl">
              <RefreshCw className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs select-none">2. ブラウザアプリを「強制終了」して再起動</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Safari や Chrome アプリ自体を、端末の下から上へスワイプして強制終了（タスクキル）し、ブラウザアプリを起動し直してください。
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-3.5 bg-slate-50 rounded-2xl">
              <Smartphone className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs select-none">3. iPhone本体の再起動</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  上記で改善しない場合、OS全体の音声システムがフリーズしています。本体の電源を一度切り、再起動すると確実に直ります。
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
