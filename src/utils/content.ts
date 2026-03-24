// src/utils/content.ts
import { TAG_TYPES, TagType } from "@/types/content";
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
  switch (type) {
    case 0: // 単語帳: 知的なBlue
      return {
        label: "単語帳",
        icon: FileText,
        theme: {
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
          hoverBorder: "hover:border-blue-400",
          badge: "bg-blue-100 text-blue-800",
          dotActive: "bg-blue-500",
          dotInactive: "bg-blue-200",
          button: "bg-blue-600 hover:bg-blue-700",
        }
      };
    case 1: // ビデオ: 没入感のPurple
      return {
        label: "ビデオ",
        icon: Video,
        theme: {
          bg: "bg-purple-50",
          text: "text-purple-700",
          border: "border-purple-200",
          hoverBorder: "hover:border-purple-400",
          badge: "bg-purple-100 text-purple-800",
          dotActive: "bg-purple-500",
          dotInactive: "bg-purple-200",
          button: "bg-purple-600 hover:bg-purple-700",
        }
      };
    case 2: // スプリント: 活発なRose
      return {
        label: "スプリント",
        icon: Zap,
        theme: {
          bg: "bg-rose-50",
          text: "text-rose-700",
          border: "border-rose-200",
          hoverBorder: "hover:border-rose-400",
          badge: "bg-rose-100 text-rose-800",
          dotActive: "bg-rose-500",
          dotInactive: "bg-rose-200",
          button: "bg-rose-600 hover:bg-rose-700",
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