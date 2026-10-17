import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { CORPORATE_SITE_URL } from '@gabby/lib/contact';

/**
 * Webトライアルの申込の受付完了（/trial の確認画面で申し込むと、確認画面の履歴をこの画面に置き換えて移る）。
 * 再読み込みしても完了の表示のまま、ブラウザバックでは確認画面に戻らない（二重送信を防ぐ）。直接開いても同じ案内を出す（個人情報は出さない）。
 * 「閉じる」ボタンは置かない（window.close() は開き方・ブラウザによって効かないため）。閉じてよい旨とコーポレートサイトへのリンクを出す。
 */
export default function TrialCompletePage() {
  return (
    <div className="flex flex-col items-center py-4 text-center" role="status">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden />
      </div>
      <h2 className="text-xl font-bold text-ink">お申し込みを受け付けました</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
        ご入力のメールアドレスに、ご案内のメールをお送りしました。メールの内容に沿って、トライアルを開始してください。
        <br />
        メールが届かない場合は、迷惑メールのフォルダもご確認ください。
      </p>
      <p className="mt-6 text-xs text-ink-muted">このページは閉じていただいて構いません。</p>
      <a
        href={CORPORATE_SITE_URL}
        className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand underline underline-offset-2"
      >
        Gabby のサイトへ
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
