import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  /** 見出しの視認性向上用。子カード側に既にアイコンがある場合（Trainingセクション等）は
   *  重複してノイズになるため付けない方が良い。全体のバランスを見て個別に判断すること。 */
  icon?: LucideIcon;
  children: ReactNode;
}

/**
 * ハブ・レッスン結果・ダッシュボードで共通利用する、大文字＋レタースペーシングのセクション見出し。
 * 3画面で同一定義がそれぞれ重複していたためここへ集約した。
 */
export function Section({ label, icon: Icon, children }: Props) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
        {Icon && <Icon size={13} />}
        {label}
      </h2>
      {children}
    </section>
  );
}
