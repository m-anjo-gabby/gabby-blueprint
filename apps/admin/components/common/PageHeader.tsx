import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface PageBackLink {
  href: string;
  label: ReactNode;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 右側に置く操作（新規登録・関連画面へのリンク等） */
  actions?: ReactNode;
  /** タイトルの上に置く戻り先（親画面が決まっている詳細画面等） */
  back?: PageBackLink;
}

/** 画面の見出し（戻り先・タイトル・説明・右側の操作） */
export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div>
      {back && <BackLink {...back} className="mb-2" />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/** 戻り先のリンク（見出しの上。対象が見つからない場合の表示等でも単独で使う） */
export function BackLink({ href, label, className }: PageBackLink & { className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition-colors hover:text-brand ${className ?? ''}`}
    >
      <ArrowLeft size={14} /> {label}
    </Link>
  );
}
