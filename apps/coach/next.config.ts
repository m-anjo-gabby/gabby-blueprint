import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* モノレポ内の共通パッケージ（packages/*）を導入した際、
     それらをトランスパイル（コンパイル）対象に含める設定です。
  */
  transpilePackages: ["@gabby/ui", "@gabby/types", "@gabby/lib", "@gabby/utils"],

  reactCompiler: true,

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
