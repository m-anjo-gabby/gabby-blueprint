// packages/lib/content/ui.ts
import { TAG_TYPES, TagType } from "@gabby/types/content";
import { FileText, HelpCircle, LucideIcon, MessagesSquare, Video, Zap } from "lucide-react";

export const getTagStyle = (tagType: string) => {
  const config = TAG_TYPES[tagType as TagType] || TAG_TYPES.other;
  return {
    label: config.label,
    className: `border-${config.color}-100 bg-${config.color}-50/50 text-${config.color}-600`,
    dotClassName: `bg-${config.color}-400`
  };
};

/**
 * 教材種別の分類色（全アプリ共通の唯一の定義元）。
 * ブランド色（青）・状態色（emerald/amber/rose）と重ならない色相を選び、
 * 面積の小さい部位（アイコンのマス・種別チップ）に限定して使う。
 */
export type ContentTheme = {
  /** アイコンのマス（薄い背景＋色付きアイコン） */
  iconTile: string;
  /** 背景なしでアイコン単体に色を付ける場合 */
  iconText: string;
  /** 種別チップ・バッジ（背景・文字・枠線） */
  chip: string;
  /** チップをリンク・ボタンとして使う場合のホバー */
  chipHover: string;
};

type ContentTypeConfig = { label: string; icon: LucideIcon; theme: ContentTheme };

const CONTENT_TYPE_CONFIG: Record<number, ContentTypeConfig> = {
  // 単語帳: ブランド色（#0e3196）より明るいスカイで区別する
  0: {
    label: "単語帳",
    icon: FileText,
    theme: {
      iconTile: "bg-sky-50 text-sky-600",
      iconText: "text-sky-600",
      chip: "bg-sky-50 text-sky-700 border-sky-200",
      chipHover: "hover:bg-sky-100 hover:border-sky-300",
    },
  },
  // ビデオ
  1: {
    label: "ビデオ",
    icon: Video,
    theme: {
      iconTile: "bg-violet-50 text-violet-600",
      iconText: "text-violet-600",
      chip: "bg-violet-50 text-violet-700 border-violet-200",
      chipHover: "hover:bg-violet-100 hover:border-violet-300",
    },
  },
  // スプリント
  2: {
    label: "スプリント",
    icon: Zap,
    theme: {
      iconTile: "bg-orange-50 text-orange-600",
      iconText: "text-orange-600",
      chip: "bg-orange-50 text-orange-700 border-orange-200",
      chipHover: "hover:bg-orange-100 hover:border-orange-300",
    },
  },
  // ダイアログ
  3: {
    label: "ダイアログ",
    icon: MessagesSquare,
    theme: {
      iconTile: "bg-teal-50 text-teal-600",
      iconText: "text-teal-600",
      chip: "bg-teal-50 text-teal-700 border-teal-200",
      chipHover: "hover:bg-teal-100 hover:border-teal-300",
    },
  },
};

const FALLBACK_CONTENT_TYPE_CONFIG: ContentTypeConfig = {
  label: "その他",
  icon: HelpCircle,
  theme: {
    iconTile: "bg-slate-100 text-slate-600",
    iconText: "text-slate-500",
    chip: "bg-slate-50 text-slate-700 border-slate-200",
    chipHover: "hover:bg-slate-100 hover:border-slate-300",
  },
};

export const getContentTypeConfig = (type: number): ContentTypeConfig =>
  CONTENT_TYPE_CONFIG[type] ?? FALLBACK_CONTENT_TYPE_CONFIG;

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