import { CircleCheck } from 'lucide-react';
import { WEB_TRIAL_PERIOD_LABEL } from '@gabby/types/trialApplication';

/**
 * 無料体験の内容の要約（入力画面の先頭）。コーポレートサイトから来た人が、同じ内容だと確かめられるようにする。
 * アプリで実際に提供している内容だけを書く（サイトの「AIスピーキング診断」等、未提供の特典は載せない）。
 */
const ITEMS = [
  `${WEB_TRIAL_PERIOD_LABEL}、アプリのトレーニングを自由にお使いいただけます`,
  'コーチとのマンツーマンのライブセッションを1回受講いただけます',
  '料金はかかりません（お支払い情報の入力は不要です）',
];

export function TrialSummary() {
  return (
    <section className="mb-8 rounded-card bg-brand-soft p-4 sm:p-5" aria-label="無料体験の内容">
      <ul className="space-y-2">
        {ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">{`${WEB_TRIAL_PERIOD_LABEL}は、お申し込み後にパスワードを設定した日から数えます。`}</p>
    </section>
  );
}
