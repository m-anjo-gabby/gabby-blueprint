import type { Config } from "tailwindcss";

const config: Config = {
  // ダークモードを 'class' 戦略で有効化（htmlタグに .dark が付くと発動）
  darkMode: "class",
  
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/actions/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 必要に応じて企業カラーなどを追加
        brand: {
          light: "#4f46e5", // indigo-600
          dark: "#818cf8",  // indigo-400
        },
      },
    },
  },
  plugins: [],
};

export default config;