import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* モノレポ内の共通パッケージ（packages/*）を導入した際、
     それらをトランスパイル（コンパイル）対象に含める設定です。
  */
  transpilePackages: ["@gabby/ui", "@gabby/types", "@gabby/lib", "@gabby/utils"],
  
  // experimental の中から外に出します
  reactCompiler: true, 
  
  experimental: {
    // 空にするか、他の設定があれば残す
  },
};

export default nextConfig;