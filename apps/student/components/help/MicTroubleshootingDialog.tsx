'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, Smartphone, Monitor, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';

interface MicTroubleshootingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DeviceTab = 'ios' | 'android' | 'pc';

export const MicTroubleshootingDialog: React.FC<MicTroubleshootingDialogProps> = ({ open, onOpenChange }) => {
  const [activeTab, setActiveTab] = useState<DeviceTab>('ios');

  const steps = {
    ios: [
      { text: "ブラウザのURL左側にある「ああ」または「設定アイコン」をタップします。" },
      { text: "「ウェブサイトの設定」を選択します。" },
      { text: "マイクの権限を「確認」または「許可」に変更します。" },
      { text: "改善しない場合: 端末の「設定」アプリ ＞ 「Safari」 ＞ 「マイク」から「許可」にチェックが入っているか確認してください。" }
    ],
    android: [
      { text: "ブラウザのアドレスバー左側にある「設定・鍵アイコン」をタップします。" },
      { text: "「権限」または「サイトの設定」をタップします。" },
      { text: "「マイク」のスイッチを「ON（許可）」に切り替えます。" },
      { text: "改善しない場合: 端末の「設定」アプリ ＞ 「アプリ」 ＞ 「Chrome」 ＞ 「権限」 ＞ 「マイク」でアプリ自体の権限が許可されているか確認してください。" }
    ],
    pc: [
      { text: "ブラウザのアドレスバーの左端にある「鍵マーク（または設定アイコン）」をクリックします。" },
      { text: "マイクの項目を探し、プルダウンから「許可」を選択します。" },
      { text: "ページ上部に「再読み込み」の案内が表示されたら、ボタンを押してページを更新します。" }
    ]
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-md rounded-[32px] p-6 bg-white border border-slate-100 shadow-2xl text-slate-900"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2 select-none">
            <HelpCircle className="w-5 h-5 text-indigo-500" />
            マイク権限のリセット手順
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="bg-amber-50/80 border border-amber-100 p-3 rounded-2xl flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
              マイクがブロックされている（権限拒否）場合、以下の手順でブラウザの権限を「許可」に戻してから、ページを再読み込みしてください。
            </p>
          </div>

          {/* 🌟 滑らかにスライド移動（バウンドなし）するタブエリア */}
          <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1 relative overflow-hidden isolate">
            {(['ios', 'android', 'pc'] as DeviceTab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative py-2 text-xs font-black rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 z-10 outline-none select-none",
                    isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {/* layoutId を復活させ、transitionをイージングに変更 */}
                  {isActive && (
                    <motion.div 
                      layoutId="activeDeviceTab" 
                      className="absolute inset-0 bg-white rounded-lg shadow-2xs border border-slate-200/40 -z-10" 
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} 
                    />
                  )}
                  {tab === 'pc' ? <Monitor size={12} /> : <Smartphone size={12} />}
                  <span>{tab === 'ios' ? 'iPhone / iPad' : tab === 'android' ? 'Android' : 'PC'}</span>
                </button>
              );
            })}
          </div>

          {/* 🌟 高さを完全固定し、絶対配置でフェードさせることで全体の揺れを完全に排除したコンテンツエリア */}
          <div className="bg-slate-50/60 border border-slate-100/80 rounded-2xl p-4 h-[220px] relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "linear" }}
                className="space-y-3.5 absolute inset-0 p-4 w-full h-full"
              >
                {steps[activeTab].map((step, index) => (
                  <div key={index} className="flex gap-2.5 items-start">
                    <div className="h-5 w-5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 font-mono">
                      {index + 1}
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed pt-0.5">
                      {step.text}
                    </p>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-1.5 pt-1 text-slate-400 select-none">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span className="text-[10px] font-bold">設定完了後、ページをリロードしてください。</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};