import path from 'node:path';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

// コーチ名・会社住所等に日本語が含まれる場合の文字化け対策。Helvetica等の標準14フォントは
// 日本語グリフを持たないため、Noto Sans JP(静的ウェイト、Latin/日本語の両方をカバー)を
// 明示的に登録して全体のfontFamilyとする。
// 【2026-09-13追記1】当初は可変フォント(1ファイル)を使用していたが、fontWeight指定による
// Bold表現が効かず、全体的に薄いグレーに見える問題が発生したため、Regular/Boldの
// 静的ウェイトを別ファイルとして登録する方式に変更した。
// 【2026-09-13追記2】Regular(400)ウェイトはHelvetica等のUIフォントに比べてストローク幅が
// 細く、色をどれだけ濃くしても「薄い」と感じられたため、通常テキスト側もMedium(500)へ
// 差し替えた（fontWeight: 400としてMediumの字形を登録し、通常/太字の見た目のギャップは
// Medium対Boldの太さの差で表現する）。
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Medium.otf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Bold.otf'), fontWeight: 700 },
  ],
});

export interface PayNoticeData {
  companyName: string;
  companyAddress: string;
  logoSrc: string | null; // ローカルファイルパス、またはURL（Supabase Storageの公開URL等）
  contractorName: string;
  periodLabel: string; // e.g. "September 2026"
  issueDateLabel: string; // e.g. "2026-09-13"（アドミンの承認日）
  currencyCode: string;
  totalSessions: number;
  completedCount: number;
  lateCancelCount: number;
  noShowCount: number;
  totalEarnings: number;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'NotoSansJP', color: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo: { width: 120 },
  companyBlock: { textAlign: 'right' },
  companyName: { fontSize: 12, fontWeight: 700, marginBottom: 2, color: '#000000' },
  companyAddress: { fontSize: 9, color: '#666666', lineHeight: 1.4 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 20, textAlign: 'center', color: '#000000' },
  fieldRow: { flexDirection: 'row', marginBottom: 8 },
  fieldLabel: { width: 180, color: '#666666' },
  fieldValue: { flex: 1, fontWeight: 700, color: '#000000' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#666666', marginVertical: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8, color: '#000000' },
  table: { marginBottom: 16 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cccccc', paddingVertical: 6 },
  tableRowLast: { flexDirection: 'row', paddingVertical: 6 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#666666', paddingBottom: 6, marginBottom: 2 },
  tableHeaderCellLabel: { flex: 2, color: '#000000' },
  tableCellLabel: { flex: 2, color: '#666666' },
  tableCellValue: { flex: 1, textAlign: 'right', color: '#000000' },
  totalRow: { flexDirection: 'row', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#666666' },
  totalLabel: { flex: 2, fontSize: 12, fontWeight: 700, color: '#000000' },
  totalValue: { flex: 1, fontSize: 12, fontWeight: 700, textAlign: 'right', color: '#000000' },
  footer: { marginTop: 30, fontSize: 8, color: '#666666' },
  footerLine: { marginTop: 4, fontSize: 8, color: '#666666' },
});

function formatCurrency(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toFixed(2)}`;
}

export function PayNoticeDocument(data: PayNoticeData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image (PDF primitive), not an HTML/next/image element; alt has no meaning here */}
          {data.logoSrc ? <Image src={data.logoSrc} style={styles.logo} /> : <View />}
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.companyAddress}>{data.companyAddress}</Text>
          </View>
        </View>

        <Text style={styles.title}>Monthly Coaching Pay Notice</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Name of Contractor</Text>
          <Text style={styles.fieldValue}>{data.contractorName}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Period</Text>
          <Text style={styles.fieldValue}>{data.periodLabel}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Issue Date</Text>
          <Text style={styles.fieldValue}>{data.issueDateLabel}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Session Breakdown</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableHeaderCellLabel}>Category</Text>
            <Text style={styles.tableCellValue}>Sessions</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLabel}>Completed</Text>
            <Text style={styles.tableCellValue}>{data.completedCount}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLabel}>Late Cancel (within 12h)</Text>
            <Text style={styles.tableCellValue}>{data.lateCancelCount}</Text>
          </View>
          <View style={styles.tableRowLast}>
            <Text style={styles.tableCellLabel}>No Show</Text>
            <Text style={styles.tableCellValue}>{data.noShowCount}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Sessions</Text>
            <Text style={styles.totalValue}>{data.totalSessions}</Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Monthly Earnings</Text>
          <Text style={styles.totalValue}>{formatCurrency(data.totalEarnings, data.currencyCode)}</Text>
        </View>

        <Text style={styles.footer}>
          This notice reflects the session record approved by {data.companyName} for the period stated above.
        </Text>
        <Text style={styles.footerLine}>
          This document contains confidential payment information intended solely for the named contractor.
        </Text>
      </Page>
    </Document>
  );
}
