import { z } from 'zod';
import type { useTranslations } from 'next-intl';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import type { SeriesSessionCommon, SeriesSessionRow } from '@/actions/adminCalendarEventSeriesAction';
import { addDaysToDateStr, todayJstDateStr, utcToJstParts } from '../../_lib/jst';

/**
 * シリーズの回の入力（すべての回に共通する設定＋回ごとの日時・内容・担当コーチ）のスキーマ・初期値・送信値の変換。
 * シリーズの作成画面（新規・このシリーズを元に作成。初期値はサーバーで作る）と、シリーズ詳細の「回をまとめて追加」で共有する。
 * 入力欄は _components/SeriesSessionsFields.tsx。
 */

type SeriesT = ReturnType<typeof useTranslations<'calendarEvents.series'>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 回の入力のスキーマの項目（作成画面ではシリーズ名・説明を足して使う）。参加URLの形式・顧客の必須は refineSeriesSessions で見る */
export function createSeriesSessionsShape(t: SeriesT) {
  return {
    target_type: z.enum(['ALL', 'CLIENT']),
    client_id: z.string(),
    per_session_url: z.boolean(),
    location_url: z.string(),
    is_published: z.boolean(),
    sessions: z
      .array(
        z.object({
          date: z.string().min(1, t('errors.dateRequired')),
          start_time: z.string().min(1, t('errors.timeRequired')),
          end_time: z.string(),
          title: z.string().trim().min(1, t('errors.sessionTitleRequired')),
          description: z.string(),
          location_url: z.string(),
          coach_ids: z.array(z.string()),
        })
      )
      .min(1),
  };
}

const isUrlOrEmpty = (value: string) => value === '' || z.url().safeParse(value).success;

/**
 * スキーマの superRefine に渡す検査。配信対象が顧客指定なら顧客を必須にし、参加URLは使う側（共通／回ごと）だけ形式を見る
 * （切り替えで隠れた欄の入力では止めない）。
 */
export function refineSeriesSessions(t: SeriesT) {
  return (v: SeriesSessionsValues, ctx: z.RefinementCtx) => {
    if (v.target_type === 'CLIENT' && !v.client_id) {
      ctx.addIssue({ code: 'custom', message: t('errors.clientRequired'), path: ['client_id'] });
    }
    if (!v.per_session_url && !isUrlOrEmpty(v.location_url)) {
      ctx.addIssue({ code: 'custom', message: t('errors.urlInvalid'), path: ['location_url'] });
    }
    if (v.per_session_url) {
      v.sessions.forEach((session, index) => {
        if (!isUrlOrEmpty(session.location_url)) {
          ctx.addIssue({ code: 'custom', message: t('errors.urlInvalid'), path: ['sessions', index, 'location_url'] });
        }
      });
    }
  };
}

export interface SessionValues {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string;
  /** 回ごとの参加URL（per_session_url のときだけ使う） */
  location_url: string;
  coach_ids: string[];
}

export interface SeriesSessionsValues {
  target_type: 'ALL' | 'CLIENT';
  client_id: string;
  /** 参加URLを回ごとに設定する（false はすべての回に location_url を設定する） */
  per_session_url: boolean;
  location_url: string;
  is_published: boolean;
  sessions: SessionValues[];
}

/**
 * 直近の回（無ければ既定値）から、次の回の初期値を作る（1週間後・同じ時刻・同じ担当コーチ。内容は空）。
 * 回ごとの参加URLは引き継がない（会議のURLは回ごとに発行されることが多く、写すと直し忘れの原因になる）。
 */
export function nextSessionFrom(previous: SessionValues | null): SessionValues {
  if (!previous) {
    return { date: todayJstDateStr(), start_time: '21:00', end_time: '21:30', title: '', description: '', location_url: '', coach_ids: [] };
  }
  return { ...previous, date: addDaysToDateStr(previous.date, 7), title: '', description: '', location_url: '' };
}

function sessionFromEvent(event: CalendarEventItem): SessionValues {
  const start = utcToJstParts(event.start_datetime);
  const end = utcToJstParts(event.end_datetime);
  return {
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    title: event.title,
    description: event.description ?? '',
    location_url: '',
    coach_ids: (event.coaches ?? []).map((c) => c.coach_id),
  };
}

/**
 * 既存の回から共通設定の初期値を作る。配信対象・公開は最後の回を引き継ぐ。
 * 参加URLは、すべての回で同じなら「すべての回で同じ」でそのURLを、回ごとに違えば「回ごとに設定」（各回は空欄）にする。
 */
function commonFromEvents(events: CalendarEventItem[]): Omit<SeriesSessionsValues, 'sessions'> {
  const last = events[events.length - 1] ?? null;
  const perSessionUrl = new Set(events.map((e) => e.location_url ?? '')).size > 1;
  return {
    target_type: last?.target_type === 'CLIENT' ? 'CLIENT' : 'ALL',
    client_id: last?.client_id ?? '',
    per_session_url: perSessionUrl,
    location_url: perSessionUrl ? '' : (last?.location_url ?? ''),
    is_published: last?.is_published ?? false,
  };
}

/** 「回をまとめて追加」の初期値。シリーズの回（開始日時の順）から共通設定を作り、最後の回の1週間後の1行を用意する */
export function sessionsAfter(existingSessions: CalendarEventItem[]): SeriesSessionsValues {
  const last = existingSessions[existingSessions.length - 1];
  return {
    ...commonFromEvents(existingSessions),
    sessions: [nextSessionFrom(last ? sessionFromEvent(last) : null)],
  };
}

/**
 * 「このシリーズを元に作成」の初期値。元のシリーズの回（開始日時の順）の時刻・担当コーチと共通設定（commonFromEvents）を引き継ぎ、
 * 最初の回が元の最後の回の1週間後になるよう日付をずらす（回同士の間隔は元のまま。内容・説明は空）。
 */
export function sessionsCopiedFrom(sourceSessions: CalendarEventItem[]): SeriesSessionsValues {
  if (sourceSessions.length === 0) return sessionsAfter([]);
  const rows = sourceSessions.map(sessionFromEvent);
  const spanDays = Math.round((Date.parse(rows[rows.length - 1].date) - Date.parse(rows[0].date)) / DAY_MS);
  return {
    ...commonFromEvents(sourceSessions),
    sessions: rows.map((row) => ({ ...row, date: addDaysToDateStr(row.date, spanDays + 7), title: '', description: '' })),
  };
}

/** 入力値をサーバーアクションに渡す形にする（参加URLは、回ごとの設定なら各回の値、そうでなければ共通の値を使う） */
export function toSeriesSessionsPayload(values: SeriesSessionsValues): { common: SeriesSessionCommon; rows: SeriesSessionRow[] } {
  return {
    common: {
      location_url: values.per_session_url ? null : values.location_url || null,
      target_type: values.target_type,
      client_id: values.target_type === 'CLIENT' ? values.client_id : null,
      is_published: values.is_published,
    },
    rows: values.sessions.map((s) => ({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time || null,
      title: s.title,
      description: s.description || null,
      ...(values.per_session_url ? { location_url: s.location_url || null } : {}),
      coach_ids: s.coach_ids,
    })),
  };
}

