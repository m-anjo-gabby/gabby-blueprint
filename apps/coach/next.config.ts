import type { NextConfig } from 'next';
import { FRAME_DENY_HEADERS } from '../../packages/lib/security/frameHeaders';

const nextConfig: NextConfig = {
  /* モノレポ内の共通パッケージ（packages/*）を導入した際、
     それらをトランスパイル（コンパイル）対象に含める設定です。
  */
  transpilePackages: ['@gabby/ui', '@gabby/types', '@gabby/lib', '@gabby/utils'],

  reactCompiler: true,

  // 他のサイトの iframe への埋め込みを禁止する（全アプリ共通。packages/lib/security/frameHeaders.ts）
  async headers() {
    return [{ source: '/:path*', headers: FRAME_DENY_HEADERS }];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  experimental: {
    serverActions: {
      // 紹介ビデオアップロード（最大100MB）に対応するため拡張（デフォルト1MB）
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
