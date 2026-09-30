import { LayoutGrid } from 'lucide-react';
import { LIBRALY_TABS, type ContentItem } from '@gabby/types/content';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import type { PillTabItem } from '@/components/shell/PillTabs';

/**
 * 教材一覧の種別タブ（種別アイコンに分類色を付け、カード側のアイコン色との対応を覚えやすくする）。
 * contents を省略すると件数なしで組み立てる（読み込み中の骨組みで、タブだけ先に本物を出すため）。
 */
export function buildTypeTabs(contents?: ContentItem[]): PillTabItem<string>[] {
  return LIBRALY_TABS.map((tab) => {
    const isAll = tab.id === 'All';
    const config = isAll ? null : getContentTypeConfig(Number(tab.id));
    return {
      value: String(tab.id),
      label: tab.label,
      icon: config?.icon ?? LayoutGrid,
      iconClassName: config?.theme.iconText,
      count: contents?.filter((c) => isAll || String(c.content_type) === String(tab.id)).length,
    };
  });
}
