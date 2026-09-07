import jwt from 'jsonwebtoken';
import type { LiveSessionRoomRole } from '@gabby/types/liveSessionRoom';

// セッション参加者の入退室・再接続を許容するための有効期限（分）
const SIGNATURE_EXPIRY_MINUTES = 90;

/**
 * サーバーサイド専用: Zoom Video SDKのセッション参加に必要なJWT署名を生成する
 * （Zoom公式のVideo SDK JWT仕様に準拠。ペイロード構造はZoom公式サンプルと同一）
 */
export function generateVideoSdkSignature(params: {
  sessionName: string;
  role: LiveSessionRoomRole;
  userIdentity: string;
}): string {
  const sdkKey = process.env.ZOOM_VIDEO_SDK_KEY;
  const sdkSecret = process.env.ZOOM_VIDEO_SDK_SECRET;

  if (!sdkKey || !sdkSecret) {
    throw new Error('Zoom Video SDK configuration (KEY or SECRET) is missing.');
  }

  const iat = Math.floor(Date.now() / 1000) - 30; // クロックスキュー対策で少し過去にする
  const exp = iat + SIGNATURE_EXPIRY_MINUTES * 60;

  return jwt.sign(
    {
      app_key: sdkKey,
      tpc: params.sessionName,
      role_type: params.role,
      user_identity: params.userIdentity,
      version: 1,
      iat,
      exp,
    },
    sdkSecret,
    { algorithm: 'HS256' }
  );
}
