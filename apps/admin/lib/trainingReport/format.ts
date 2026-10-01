import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { computeStage } from '@gabby/lib/sprint/stageProgression';
import type { SprintLevelSnapshot, TrainingReportData } from '@gabby/types/trainingReport';

// 顧客との契約主体が日本法人のため、レポートの日付は日本時間で表示する
const REPORT_TIME_ZONE = 'Asia/Tokyo';

/** 表の列順（UG Speed → Builders → Structure → Mastery。QUESTION_TYPES の seq_no 順） */
export const SPRINT_TYPE_ORDER: SprintQuestionType[] = (Object.keys(QUESTION_TYPES) as SprintQuestionType[]).sort(
  (a, b) => QUESTION_TYPES[a].seq_no - QUESTION_TYPES[b].seq_no
);

function jstParts(iso: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** "2026/04/01" */
export function formatReportDate(iso: string): string {
  const { year, month, day } = jstParts(iso);
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

/** "YYYYMM"（ファイル名用。期間の終了月） */
export function formatReportYearMonth(iso: string): string {
  const { year, month } = jstParts(iso);
  return `${year}${String(month).padStart(2, '0')}`;
}

/** "2026-04" → "2026年4月" */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}年${month}月`;
}

/**
 * 期間の長さの表示。暦の月でちょうど割り切れる期間（4/1〜6/30 等）は「3ヶ月」、
 * それ以外は日数で「45日間」と表示する。
 */
export function formatPeriodLength(startIso: string, endIso: string): string {
  const start = jstParts(startIso);
  const end = jstParts(endIso);
  // 終了日の翌日を求め、開始日と同じ「日」になっていれば暦の月で割り切れる期間
  const nextOfEnd = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));
  const months =
    (nextOfEnd.getUTCFullYear() - start.year) * 12 + (nextOfEnd.getUTCMonth() + 1 - start.month);
  if (nextOfEnd.getUTCDate() === start.day && months > 0) {
    return `${months}ヶ月`;
  }
  const days = Math.round((nextOfEnd.getTime() - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000);
  return `${days}日間`;
}

/**
 * レベルの表示。記録が無い時点は "—"、Basic（レベル0）がある種別の0は "Basic"、
 * 最小レベル未満（Lv.1から始まる種別で、まだLv.1に達していない状態）は "未到達"
 */
export function formatLevel(type: SprintQuestionType, level: number | null): string {
  if (level === null) return '—';
  const meta = QUESTION_TYPES[type];
  if (level === 0 && meta.hasBasic) return 'Basic';
  if (level < meta.minLevel) return '未到達';
  return `Lv. ${level}`;
}

/** 4種別すべての記録がある時点のみステージを算出する */
export function computeSnapshotStage(levels: SprintLevelSnapshot): number | null {
  if (SPRINT_TYPE_ORDER.some((type) => levels[type] === null)) return null;
  return computeStage({
    '0': levels['0'] ?? 0,
    '4': levels['4'] ?? 0,
    '5': levels['5'] ?? 0,
    '6': levels['6'] ?? 0,
  });
}

/** 期間中に含まれる各月の日数（月ごとの学習日数の棒の長さの基準） */
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/** "{氏名}様_Gabbyトレーニングレポート_{YYYYMM}"（拡張子なし。現行の手作業のファイル名に合わせる） */
export function buildTrainingReportFileBase(data: Pick<TrainingReportData, 'student_name' | 'end_date'>): string {
  return sanitizeFileName(`${data.student_name ?? '生徒'}様_Gabbyトレーニングレポート_${formatReportYearMonth(data.end_date)}`);
}

/** ZIPのファイル名（拡張子なし） */
export function buildTrainingReportZipBase(contractName: string, issuedAt: Date): string {
  return sanitizeFileName(`Gabbyトレーニングレポート_${contractName}_${formatReportDate(issuedAt.toISOString()).replace(/\//g, '')}`);
}

/** Content-Disposition（日本語のファイル名はfilename*で渡し、非対応ブラウザ向けにASCIIの代替名も付ける） */
export function buildContentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
