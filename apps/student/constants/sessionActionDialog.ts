import type { SessionActionDialogLabels } from '@gabby/lib/components/common/SessionActionDialog';

/**
 * セッションキャンセルダイアログ（共通コンポーネント）の日本語文言（生徒アプリ用）。
 * コーチはネイティブスピーカーのため、コーチが読む一言・理由欄のプレースホルダーのみ
 * 簡単な英文にしてある（ラベル自体は操作のハードルを下げるため日本語のまま）。
 */
export const STUDENT_SESSION_ACTION_LABELS: SessionActionDialogLabels = {
  cancel: {
    title: 'セッションをキャンセル',
    description: (counterpartName) => `${counterpartName}コーチとのセッションをキャンセルします。`,
    policyNote: (isWithin12Hours) =>
      isWithin12Hours
        ? { text: '開始12時間を切っているため、この回の予約枠は返還されません（再予約できません）。', tone: 'warning' }
        : { text: 'この回の予約枠が返還され、担当コーチへ改めて予約をリクエストできるようになります。', tone: 'success' },
    reasonLabel: '理由（任意）',
    reasonPlaceholder: 'e.g. I’m not feeling well.',
    proposedSlotsLabel: '振替候補を提案する（任意、最大3件）',
    addSlotButton: '候補を追加',
    noSlotsHint: '候補を提案しなくてもキャンセルできます。提案する場合、コーチの対応可能時間に関わらず、ご希望の時間を自由に選べます。',
    timePlaceholder: '時刻',
    removeSlotLabel: '削除',
    checkingText: '確認中…',
    conflictMessages: {
      coach: 'コーチが同じ時間帯に別のセッションの予定があります。',
      student: 'ご自身が同じ時間帯に別のセッションの予定があります。',
    },
    backButton: '戻る',
    submitButton: 'キャンセルする',
    successToast: (hasProposals) =>
      hasProposals ? 'セッションをキャンセルしました。提案した候補をコーチへ送信しました。' : 'セッションをキャンセルしました',
    counterpartTimeLabel: 'コーチの現地時間',
    counterpartTimeCaution: 'コーチにとって深夜早朝の時間帯です',
  },
};
