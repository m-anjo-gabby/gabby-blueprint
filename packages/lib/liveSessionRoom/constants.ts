/**
 * 生徒入室（実質的なレッスン開始）を起点とした、残り時間の警告表示と自動終了までの猶予（ミリ秒）。
 * コーチ・生徒双方のライブセッションルームで共通して使用する。
 *
 * デフォルトは本番想定の警告25分・自動終了30分。検証時に短縮したい場合は、このファイル自体は
 * 書き換えず、各アプリの .env.local（Git管理外）で下記の環境変数を分単位で上書きすること。
 *   NEXT_PUBLIC_LIVE_SESSION_WARNING_MINUTES
 *   NEXT_PUBLIC_LIVE_SESSION_END_MINUTES
 *   NEXT_PUBLIC_LIVE_SESSION_EARLY_JOIN_MINUTES
 *
 * 制限時間の起点はクライアント依存のため、将来的にはcom_t_session連動のサーバー時刻で
 * 制御する必要がある（現状は最小実装として据え置き）。
 */
function parseMinutesEnv(raw: string | undefined, defaultMinutes: number): number {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMinutes;
}

const WARNING_MINUTES = parseMinutesEnv(process.env.NEXT_PUBLIC_LIVE_SESSION_WARNING_MINUTES, 25);
const END_MINUTES = parseMinutesEnv(process.env.NEXT_PUBLIC_LIVE_SESSION_END_MINUTES, 30);
const EARLY_JOIN_MINUTES = parseMinutesEnv(process.env.NEXT_PUBLIC_LIVE_SESSION_EARLY_JOIN_MINUTES, 5);

export const LIVE_SESSION_WARNING_AFTER_MS = WARNING_MINUTES * 60 * 1000;
export const LIVE_SESSION_END_AFTER_MS = END_MINUTES * 60 * 1000;

/**
 * セッション開始予定時刻の何ミリ秒前から入室（Zoom Video SDKへの参加）を許可するか。
 * Zoom Video SDKは入室してから従量課金されるため、予定時刻より大幅に早い入室を防ぐ目的で設ける。
 * 実際の強制はサーバー側（getCoachLiveSessionRoomAccessCore/getStudentLiveSessionRoomAccessCore）で
 * 行い、ハブ画面のボタンはこの定数を使って早期案内・クリック時チェックを行うのみ（UXレイヤー）。
 */
export const LIVE_SESSION_EARLY_JOIN_BEFORE_MS = EARLY_JOIN_MINUTES * 60 * 1000;
