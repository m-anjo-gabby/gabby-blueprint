import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    // 1. 各アプリ内のファイル（srcがある場合とない場合の両方をカバー）
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./actions/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}", // 移行期のために残しておく

    // 2. プロジェクトルートにある共通パッケージ（packages/libなど）のファイルをスキャン
    "../../packages/lib/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx}", // 将来用
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#4f46e5",
          dark: "#818cf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;