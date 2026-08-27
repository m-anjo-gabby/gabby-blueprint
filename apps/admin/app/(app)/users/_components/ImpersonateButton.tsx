'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LogIn, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { startImpersonation } from '@/actions/adminImpersonationAction';
import { UserRecord, USER_TYPES } from '@gabby/types/user';

interface Props {
  user: UserRecord;
}

/**
 * ユーザー種別（生徒／コーチ）ごとに直近で開いた代理ログインタブの参照。
 * テーブルの行ごとに ImpersonateButton のインスタンスが分かれるため、モジュールスコープで共有する。
 * window.open の name 引数によるブラウザ側の名前解決には頼らない（後述の理由で信頼できないため）。
 */
const impersonationWindows: Partial<Record<string, Window>> = {};

/**
 * 障害対応・問合せ調査のため、対象ユーザーとして生徒／コーチポータルへ代理ログインするボタン。
 * 理由の入力を必須とし、実行内容は監査ログ(com_t_admin_impersonation_log)に記録される。
 */
export function ImpersonateButton({ user }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const portalLabel = user.user_type === USER_TYPES.COACH ? 'コーチポータル' : '生徒ポータル';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setReason('');
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await startImpersonation(user.id, reason);
      if (result.success && result.url) {
        // ユーザー種別（生徒／コーチ）ごとに直近で開いたタブへの参照を保持しておき、
        // 同一種別への連続代理ログインはその参照を直接ナビゲートして再利用する。
        // window.open(url, name) のブラウザ内部の名前解決に頼ると、開いた後に
        // window.opener を切り離した時点で「同じ名前のウィンドウ」として認識されなくなり
        // （タブナビタビング対策の opener 切り離しと、名前による再利用は仕様上両立しない）、
        // 2回目以降のクリックで毎回新しいタブが開いてしまう不具合があったため、
        // 自前でウィンドウ参照を管理する方式に変更している。
        const existingWindow = impersonationWindows[user.user_type];
        if (existingWindow && !existingWindow.closed) {
          existingWindow.location.href = result.url;
          existingWindow.focus();
        } else {
          const impersonationWindow = window.open(result.url, `impersonate-${user.user_type}`);
          if (impersonationWindow) {
            impersonationWindow.opener = null;
            impersonationWindows[user.user_type] = impersonationWindow;
          }
        }
        showToast('代理ログイン用のタブを開きました', 'success');
        handleOpenChange(false);
      } else {
        showToast(result.message || '代理ログインの開始に失敗しました', 'error');
        setLoading(false);
      }
    } catch {
      showToast('通信エラーが発生しました', 'error');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
          <LogIn size={14} /> 代理ログイン
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <LogIn size={18} className="text-indigo-400" /> 代理ログイン
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-white space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-700 font-medium">
              <span className="font-bold">{user.user_name || user.email}</span> さんとして{portalLabel}に実際にログインします。
              画面上の操作は全て本人の操作として実際に反映されるため、障害対応・問合せ調査の範囲に限定して利用してください。
              実行内容は監査ログに記録されます。
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              実行理由（チケット番号・問合せ内容等）
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: サポートチケット #1234 の画面表示不具合の調査のため"
              className="rounded-xl border-slate-200 min-h-[80px]"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 text-slate-400 h-11 rounded-xl"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white shadow-lg h-11 rounded-xl font-bold"
            onClick={handleStart}
            disabled={loading || reason.trim().length === 0}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : `${portalLabel}を開く`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
