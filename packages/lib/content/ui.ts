// packages/lib/content/ui.ts
import { TAG_TYPES, TagType } from "@gabby/types/content";
import { FileText, HelpCircle, LucideIcon, Video, Zap } from "lucide-react";

export const getTagStyle = (tagType: string) => {
  const config = TAG_TYPES[tagType as TagType] || TAG_TYPES.other;
  return {
    label: config.label,
    className: `border-${config.color}-100 bg-${config.color}-50/50 text-${config.color}-600`,
    dotClassName: `bg-${config.color}-400`
  };
};

export type ContentTheme = {
  bg: string;
  text: string;
  border: string;
  hoverBorder: string;
  badge: string;
  dotActive: string;
  dotInactive: string;
  button: string;
};

export const getContentTypeConfig = (type: number): { label: string; icon: LucideIcon; theme: ContentTheme } => {
  // 💡 アプリ全体の主力ブランドカラー（Indigo）をボタンのベースに完全統一
  const SHARED_BRAND_BUTTON = "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10 text-white border-none";

  switch (type) {
    case 0: // 単語帳: 誠実で知的なライトブルー（主力教材）
      return {
        label: "単語帳",
        icon: FileText,
        theme: {
          bg: "bg-blue-50/60",
          text: "text-blue-700",
          border: "border-blue-100",
          hoverBorder: "hover:border-blue-300",
          badge: "bg-blue-100 text-blue-800",
          dotActive: "bg-blue-500",
          dotInactive: "bg-blue-200",
          button: SHARED_BRAND_BUTTON,
        }
      };

    case 1: // ビデオ: 没入感とエンタメ性を両立する洗練されたパープル
      // 💡 今後教材が追加された際、コーラルやブルーと並んでも浮かないよう、
      // 派手すぎない少し落ち着いたディープパープルトーンに調整しています。
      return {
        label: "ビデオ",
        icon: Video,
        theme: {
          bg: "bg-purple-50/60",
          text: "text-purple-700",
          border: "border-purple-100",
          hoverBorder: "hover:border-purple-300",
          badge: "bg-purple-100 text-purple-800",
          dotActive: "bg-purple-500",
          dotInactive: "bg-purple-200",
          button: SHARED_BRAND_BUTTON,
        }
      };

    case 2: // スプリント: 脳への負荷・即応性を表現する洗練されたコーラルオレンジ
      // 💡 ボタン共通化により、上部パーツのみに適用されるため
      // 鮮やかなコーラルが「知的な躍動感」として美しく映えます。
      return {
        label: "スプリント",
        icon: Zap,
        theme: {
          bg: "bg-orange-50/60",
          text: "text-orange-600",
          border: "border-orange-100",
          hoverBorder: "hover:border-orange-300", // 🎨 ホバー枠線もコーラル系に同期
          badge: "bg-orange-100 text-orange-800", // 🎨 種別バッジもコーラルに統一して一体感を強化
          dotActive: "bg-orange-500",             // 🎨 アクティブドットをコーラルに修正
          dotInactive: "bg-orange-200",           // 🎨 インアクティブドットをコーラルに修正
          button: SHARED_BRAND_BUTTON,
        }
      };

    default:
      return {
        label: "その他",
        icon: HelpCircle,
        theme: {
          bg: "bg-slate-50",
          text: "text-slate-700",
          border: "border-slate-200",
          hoverBorder: "hover:border-slate-400",
          badge: "bg-slate-100 text-slate-800",
          dotActive: "bg-slate-500",
          dotInactive: "bg-slate-200",
          button: "bg-slate-600 hover:bg-slate-700",
        }
      };
  }
};

/**
 * CEFRレベルのスタイルを取得 (グラデーションのステップアップ表現)
 */
export const getCefrStyle = (cefrId: string) => {
  const level = cefrId.toUpperCase();
  
  switch (level) {
    case 'A1': return "bg-blue-600 text-white border-transparent shadow-sm";
    case 'A2': return "bg-cyan-600 text-white border-transparent shadow-sm";
    case 'B1': return "bg-emerald-600 text-white border-transparent shadow-sm";
    case 'B2': return "bg-lime-600 text-white border-transparent shadow-sm";
    case 'C1': return "bg-orange-600 text-white border-transparent shadow-sm";
    case 'C2': return "bg-rose-600 text-white border-transparent shadow-sm";
    default: return "bg-slate-600 text-white border-transparent";
  }
};