'use client';

import { GraduationCap, Award, Clock, Briefcase, MessageSquare } from 'lucide-react';
import { CoachProfileCardData, CoachProfileCardLabels } from '@gabby/types/coachProfile';

export interface CoachProfileCardProps {
  data: CoachProfileCardData;
  labels: CoachProfileCardLabels;
  /** カード内側の余白・行間。モーダル(CoachProfileDialog)とサイドパネル埋め込みで密度を変えたい場合に上書きする */
  className?: string;
}

interface ProfileSection {
  icon: typeof GraduationCap;
  label: string;
  value: string | null;
}

export interface CoachProfileCardHeaderProps {
  data: CoachProfileCardData;
  className?: string;
}

/**
 * プロフィールカードのヘッダー部（アバター・氏名・国籍）。
 * CoachProfileDialogでは、この部分だけをスクロール領域の外に固定表示するために単独で利用する。
 */
export function CoachProfileCardHeader({ data, className = 'flex items-center gap-4' }: CoachProfileCardHeaderProps) {
  return (
    <div className={className}>
      <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-slate-400 text-xl font-bold">
        {data.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.iconUrl} alt={data.userName} className="w-full h-full object-cover" />
        ) : (
          data.userName.charAt(0).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-800 truncate">{data.userName}</p>
        {data.countryName && (
          <div className="flex items-center gap-1.5 mt-1">
            {data.countryFlagUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.countryFlagUrl} alt={data.countryName} className="w-4 h-4 rounded-full object-cover" />
            )}
            <span className="text-xs text-slate-500">{data.countryName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export interface CoachProfileCardBodyProps {
  data: CoachProfileCardData;
  labels: CoachProfileCardLabels;
  className?: string;
}

/**
 * プロフィールカードの本文部（紹介動画・各項目）。
 * CoachProfileDialogでは、ヘッダーを固定したままこの部分だけをスクロールさせるために単独で利用する。
 */
export function CoachProfileCardBody({ data, labels, className = 'space-y-6' }: CoachProfileCardBodyProps) {
  const sections: ProfileSection[] = [
    { icon: Clock, label: labels.coachSince, value: data.coachSinceLabel },
    { icon: GraduationCap, label: labels.education, value: data.education },
    { icon: Award, label: labels.qualifications, value: data.qualifications },
    { icon: Clock, label: labels.englishTeaching, value: data.teachingYearsLabel },
    { icon: Briefcase, label: labels.jobExperience, value: data.jobExperience },
    { icon: MessageSquare, label: labels.personalIntroduction, value: data.introduction },
  ].filter((section) => !!section.value);

  return (
    <div className={className}>
      {data.introVideoUrl && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <MessageSquare size={13} />
            {labels.introVideo}
          </div>
          <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video">
            <video src={data.introVideoUrl} controls className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      <div className="space-y-5">
        {sections.map(({ icon: Icon, label, value }, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Icon size={13} />
              {label}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * コーチ公開プロフィールの中身（アバター・国籍・紹介動画・各項目）を描画する共通コンポーネント。
 * CoachProfileDialog（モーダル表示）と、コーチ自身のプロフィール編集画面のライブプレビュー（サイドパネル埋め込み）の
 * 両方から利用し、表示内容のロジックを一箇所に集約する。本コンポーネント自体は言語・DBの詳細を一切知らない。
 * ヘッダーだけを固定してスクロールさせたい場合はCoachProfileCardHeader/CoachProfileCardBodyを個別に使う。
 */
export function CoachProfileCard({ data, labels, className = 'p-8 space-y-6' }: CoachProfileCardProps) {
  return (
    <div className={className}>
      <CoachProfileCardHeader data={data} />
      <CoachProfileCardBody data={data} labels={labels} />
    </div>
  );
}
