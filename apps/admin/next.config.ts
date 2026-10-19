import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { FRAME_DENY_HEADERS } from '../../packages/lib/security/frameHeaders';

const nextConfig: NextConfig = {
  /* モノレポ内の共通パッケージ（packages/*）を導入した際、
     それらをトランスパイル（コンパイル）対象に含める設定です。
  */
  transpilePackages: ['@gabby/ui', '@gabby/types', '@gabby/lib', '@gabby/utils'],

  // experimental の中から外に出します
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
    // 空にするか、他の設定があれば残す
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
