import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ndgbknqkgbgguzbbqgwu.supabase.co', // SupabaseのプロジェクトIDに書き換え
      },
    ],
  },
};

export default nextConfig;