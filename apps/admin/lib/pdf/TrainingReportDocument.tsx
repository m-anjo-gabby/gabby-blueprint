import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { CompanyProfile } from '@gabby/types/companyProfile';
import type { TrainingReportData } from '@gabby/types/trainingReport';
import {
  SPRINT_TYPE_ORDER,
  computeSnapshotStage,
  daysInMonth,
  formatLevel,
  formatMonthLabel,
  formatPeriodLength,
  formatReportDate,
} from '@/lib/trainingReport/format';
import { PDF_FONT_FAMILY } from './registerFonts';

export interface TrainingReportDocumentProps {
  data: TrainingReportData;
  issuer: CompanyProfile | null;
  logoSrc: string | null;
  issuedAt: Date;
}

// ブランド色（packages/lib/styles/brand-theme.css のコーポレートカラー #0e3196 基準）
const COLOR = {
  brand: '#0e3196',
  brandSoft: '#e8edf9',
  gold: '#ffd700',
  text: '#1f2937',
  muted: '#6b7280',
  line: '#d9dee8',
  panel: '#f4f6fa',
  draft: '#b45309',
};

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 50, paddingHorizontal: 36, fontSize: 9, fontFamily: PDF_FONT_FAMILY, color: COLOR.text },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logo: { width: 100 },
  issuerBlock: { alignItems: 'flex-end' },
  issuerNameJa: { fontSize: 10, fontWeight: 700 },
  issuerName: { fontSize: 8, color: COLOR.muted, marginTop: 1 },
  issuerAddress: { fontSize: 8, color: COLOR.muted, lineHeight: 1.4 },
  titleBand: {
    backgroundColor: COLOR.brand,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: 700, color: '#ffffff' },
  titleSub: { fontSize: 9, color: '#c9d4f2', marginTop: 2 },
  titleAccent: { height: 3, backgroundColor: COLOR.gold, width: 56, marginTop: 5, marginBottom: 10 },
  section: { marginBottom: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', borderLeftWidth: 3, borderLeftColor: COLOR.brand, paddingLeft: 6, marginBottom: 6 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: COLOR.brand },
  sectionTitleEn: { fontSize: 8, color: COLOR.muted, marginLeft: 6 },
  infoGrid: { borderWidth: 1, borderColor: COLOR.line, borderRadius: 3 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLOR.line },
  infoRowLast: { flexDirection: 'row' },
  infoLabel: { width: 90, backgroundColor: COLOR.panel, paddingVertical: 4, paddingHorizontal: 8, color: COLOR.muted },
  infoValue: { flex: 1, paddingVertical: 4, paddingHorizontal: 8, fontWeight: 700 },
  table: { borderWidth: 1, borderColor: COLOR.line, borderRadius: 3 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLOR.brandSoft, borderBottomWidth: 1, borderBottomColor: COLOR.line },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLOR.line },
  tableRowLast: { flexDirection: 'row' },
  rowHead: { width: 110, paddingVertical: 4, paddingHorizontal: 8, color: COLOR.muted },
  rowHeadStrong: { width: 110, paddingVertical: 4, paddingHorizontal: 8, fontWeight: 700 },
  headCell: { flex: 1, paddingVertical: 4, textAlign: 'center', fontWeight: 700, color: COLOR.brand },
  cell: { flex: 1, paddingVertical: 4, textAlign: 'center' },
  cellStrong: { flex: 1, paddingVertical: 4, textAlign: 'center', fontWeight: 700 },
  note: { fontSize: 7.5, color: COLOR.muted, marginTop: 4, lineHeight: 1.4 },
  tiles: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  tile: { flex: 1, backgroundColor: COLOR.panel, borderRadius: 3, paddingVertical: 5, alignItems: 'center' },
  tileValue: { fontSize: 14, fontWeight: 700, color: COLOR.brand },
  tileUnit: { fontSize: 8, color: COLOR.muted },
  tileLabel: { fontSize: 8, color: COLOR.muted, marginTop: 1 },
  monthCellLabel: { width: 70, paddingVertical: 4, paddingHorizontal: 8 },
  barCell: { flex: 2, paddingVertical: 4, paddingRight: 8, flexDirection: 'row', alignItems: 'center' },
  barTrack: { flex: 1, height: 6, backgroundColor: COLOR.panel, borderRadius: 3 },
  barFill: { height: 6, backgroundColor: COLOR.brand, borderRadius: 3 },
  barValue: { width: 34, textAlign: 'right', fontSize: 8 },
  monthCell: { flex: 1, paddingVertical: 4, textAlign: 'right', paddingRight: 8 },
  monthHeadLabel: { width: 70, paddingVertical: 4, paddingHorizontal: 8, fontWeight: 700, color: COLOR.brand },
  monthHeadBar: { flex: 2, paddingVertical: 4, fontWeight: 700, color: COLOR.brand },
  monthHeadCell: { flex: 1, paddingVertical: 4, textAlign: 'right', paddingRight: 8, fontWeight: 700, color: COLOR.brand },
  placeholder: { backgroundColor: COLOR.panel, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 10, color: COLOR.muted },
  commentBlock: { marginBottom: 8 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  commentCoach: { fontWeight: 700 },
  commentDraft: { marginLeft: 6, fontSize: 7.5, color: COLOR.draft, borderWidth: 1, borderColor: COLOR.draft, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1 },
  commentBody: { backgroundColor: COLOR.panel, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 10, lineHeight: 1.25 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
    paddingTop: 6,
    fontSize: 7.5,
    color: COLOR.muted,
  },
});

function SectionHeader({ title, titleEn }: { title: string; titleEn: string }) {
  return (
    // 見出しだけがページ末尾に取り残されないよう、後ろに本文が入る余白が無ければ次のページへ送る
    <View style={styles.sectionHeader} minPresenceAhead={48}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionTitleEn}>{titleEn}</Text>
    </View>
  );
}

function StatTile({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text>
        <Text style={styles.tileValue}>{value.toLocaleString('ja-JP')}</Text>
        <Text style={styles.tileUnit}> {unit}</Text>
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * 生徒向けトレーニングレポート(PDF)。ライセンス（＝生徒の契約期間）1件分を作る。
 * 運営とデザインを協議するためのドラフト版（協議の妨げにならないよう、透かし等のドラフト表示は入れない）。
 * スピーキングテストは未実装のため、評価結果の欄は「準備中」の枠だけを置く。
 */
export function TrainingReportDocument({ data, issuer, logoSrc, issuedAt }: TrainingReportDocumentProps) {
  const isBeforeEnd = new Date(data.end_date).getTime() > issuedAt.getTime();
  const stageStart = computeSnapshotStage(data.levels_start);
  const stageEnd = computeSnapshotStage(data.levels_end);
  const hasMissingStartLevel = SPRINT_TYPE_ORDER.some((type) => data.levels_start[type] === null);
  const issuerName = issuer?.company_name_ja || issuer?.company_name || '';

  return (
    <Document title={`Gabbyトレーニングレポート ${data.student_name ?? ''}`} author={issuerName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image (PDF primitive), not an HTML/next/image element; alt has no meaning here */}
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : <View />}
          {issuer && (
            <View style={styles.issuerBlock}>
              {issuer.company_name_ja && <Text style={styles.issuerNameJa}>{issuer.company_name_ja}</Text>}
              <Text style={issuer.company_name_ja ? styles.issuerName : styles.issuerNameJa}>{issuer.company_name}</Text>
              {/* 行ごとに独立したTextにして右端を揃える（InvoiceDocument.tsxの同じ処理のコメント参照） */}
              {issuer.address.split('\n').map((line, index) => (
                <Text key={index} style={styles.issuerAddress}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.titleBand}>
          <View>
            <Text style={styles.title}>Gabby トレーニングレポート</Text>
            <Text style={styles.titleSub}>Training Report</Text>
          </View>
        </View>
        <View style={styles.titleAccent} />

        {/* 基本情報 */}
        <View style={styles.section} wrap={false}>
          <SectionHeader title="基本情報" titleEn="Basic Information" />
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>氏名</Text>
              <Text style={styles.infoValue}>{data.student_name ?? ''} 様</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>プラン</Text>
              <Text style={styles.infoValue}>{data.plan_name}</Text>
            </View>
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>期間</Text>
              <Text style={styles.infoValue}>
                {formatReportDate(data.start_date)} 〜 {formatReportDate(data.end_date)}（{formatPeriodLength(data.start_date, data.end_date)}）
              </Text>
            </View>
          </View>
        </View>

        {/* スプリントの到達レベル */}
        <View style={styles.section} wrap={false}>
          <SectionHeader title="スプリントの到達レベル" titleEn="Sprint Level" />
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.rowHead} />
              {SPRINT_TYPE_ORDER.map((type) => (
                <Text key={type} style={styles.headCell}>
                  {QUESTION_TYPES[type].label}
                </Text>
              ))}
              <Text style={styles.headCell}>ステージ</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.rowHead}>開始時（{formatReportDate(data.start_date)}）</Text>
              {SPRINT_TYPE_ORDER.map((type) => (
                <Text key={type} style={styles.cell}>
                  {formatLevel(type, data.levels_start[type])}
                </Text>
              ))}
              <Text style={styles.cell}>{stageStart === null ? '—' : `Stage ${stageStart}`}</Text>
            </View>
            <View style={styles.tableRowLast}>
              <Text style={styles.rowHeadStrong}>
                {isBeforeEnd ? `現在（${formatReportDate(issuedAt.toISOString())}）` : `終了時（${formatReportDate(data.end_date)}）`}
              </Text>
              {SPRINT_TYPE_ORDER.map((type) => (
                <Text key={type} style={styles.cellStrong}>
                  {formatLevel(type, data.levels_end[type])}
                </Text>
              ))}
              <Text style={styles.cellStrong}>{stageEnd === null ? '—' : `Stage ${stageEnd}`}</Text>
            </View>
          </View>
          {hasMissingStartLevel && (
            <Text style={styles.note}>※「—」はレベルの記録を開始する前の時点のため表示していません。</Text>
          )}
        </View>

        {/* 学習の記録 */}
        <View style={styles.section} wrap={false}>
          <SectionHeader title="学習の記録" titleEn="Training Activity" />
          <View style={styles.tiles}>
            <StatTile value={data.activity.active_days} unit="日" label="学習日数" />
            <StatTile value={data.activity.words} unit="語" label="単語" />
            <StatTile value={data.activity.phrases} unit="件" label="フレーズ" />
            <StatTile value={data.activity.sprint_questions} unit="問" label="スプリント" />
            <StatTile value={data.activity.assessments} unit="回" label="発話評価" />
          </View>
          {data.monthly.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={styles.monthHeadLabel}>月</Text>
                <Text style={styles.monthHeadBar}>学習日数</Text>
                <Text style={styles.monthHeadCell}>単語・フレーズ</Text>
                <Text style={styles.monthHeadCell}>スプリント</Text>
              </View>
              {data.monthly.map((row, index) => {
                const ratio = Math.min(1, row.active_days / daysInMonth(row.month));
                return (
                  <View key={row.month} style={index === data.monthly.length - 1 ? styles.tableRowLast : styles.tableRow}>
                    <Text style={styles.monthCellLabel}>{formatMonthLabel(row.month)}</Text>
                    <View style={styles.barCell}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }]} />
                      </View>
                      <Text style={styles.barValue}>{row.active_days}日</Text>
                    </View>
                    <Text style={styles.monthCell}>{(row.words + row.phrases).toLocaleString('ja-JP')}</Text>
                    <Text style={styles.monthCell}>{row.sprint_questions.toLocaleString('ja-JP')}問</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ライブセッション（ライブセッション付き契約のみ） */}
        {data.live && (
          <View style={styles.section} wrap={false}>
            <SectionHeader title="ライブセッション" titleEn="Live Sessions" />
            <View style={styles.tiles}>
              <StatTile value={data.live.completed} unit={`/ ${data.live.total_sessions} 回`} label="受講回数" />
              <StatTile value={data.live.no_show} unit="回" label="欠席" />
              <StatTile value={data.live.late_cancel} unit="回" label="直前のキャンセル" />
            </View>
          </View>
        )}

        {/* 評価結果（スピーキングテストは準備中） */}
        <View style={styles.section} wrap={false}>
          <SectionHeader title="評価結果" titleEn="Assessment Results" />
          <Text style={styles.placeholder}>スピーキングテストは現在準備中です。実施後、本欄に結果を掲載します。</Text>
        </View>

        {/* コーチからのコメント（ライブセッション付き契約のみ） */}
        {data.live && (
          <View style={styles.section}>
            <SectionHeader title="コーチからのコメント" titleEn="Comments from Coach" />
            {data.comments.length === 0 ? (
              <Text style={styles.placeholder}>コメントはまだ登録されていません。</Text>
            ) : (
              data.comments.map((comment, index) => (
                <View key={index} style={styles.commentBlock}>
                  {/* 長いコメントはページをまたいで続ける。コーチ名だけが前のページに残らないようにする */}
                  <View style={styles.commentHeader} minPresenceAhead={40}>
                    <Text style={styles.commentCoach}>Coach: {comment.coach_name ?? ''}</Text>
                    {comment.status === 1 && <Text style={styles.commentDraft}>下書き</Text>}
                  </View>
                  <Text style={styles.commentBody}>{comment.comment_text || '（未記入）'}</Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            発行: {issuerName}　発行日: {formatReportDate(issuedAt.toISOString())}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
