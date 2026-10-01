import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_OPTION,
  getDownstreamFilterIds,
  resolveFavoriteFilters,
  type FavoriteFilterDef,
} from "../../apps/student/app/(app)/(shell)/favorites/_components/favoriteFilters.ts";

/**
 * お気に入りの絞り込み（連動する 教材 → 問題種別 → レベル）の計算
 * 画面: docs/screens/student/favorites.md
 */

interface Q {
  id: string;
  content: string;
  type: string;
  level: number;
  hasLevel: boolean;
}

const TYPE_ORDER: Record<string, number> = { "0": 1, "5": 2, "4": 3, "6": 4 };

const DEFS: FavoriteFilterDef<Q>[] = [
  { id: "content", label: "教材", allLabel: "すべての教材", getOption: (q) => ({ id: q.content, label: q.content, order: 0 }) },
  { id: "type", label: "問題種別", allLabel: "すべての問題種別", getOption: (q) => ({ id: q.type, label: `T${q.type}`, order: TYPE_ORDER[q.type] ?? 99 }) },
  {
    id: "level",
    label: "レベル",
    allLabel: "すべてのレベル",
    requires: "type",
    getOption: (q) => (q.hasLevel ? { id: String(q.level), label: `Lv.${q.level}`, order: q.level } : null),
  },
];

// 汎用（レベルあり）とコーパス（レベル固定）の混在
const ITEMS: Q[] = [
  { id: "g1", content: "NLT", type: "0", level: 2, hasLevel: true },
  { id: "g2", content: "NLT", type: "0", level: 10, hasLevel: true },
  { id: "g3", content: "NLT", type: "6", level: 1, hasLevel: true },
  { id: "c1", content: "Corpus", type: "0", level: 1, hasLevel: false },
  { id: "c2", content: "Corpus", type: "4", level: 1, hasLevel: false },
];

const ids = (items: Q[]) => items.map((q) => q.id);

test("未選択: 教材・問題種別だけを出し、レベルは問題種別を選ぶまで出さない", () => {
  const { filters, items } = resolveFavoriteFilters(ITEMS, DEFS, {});
  assert.deepEqual(filters.map((f) => f.id), ["content", "type"]);
  // 問題種別は定義順（Speed → Structure → Mastery）で、件数付き
  assert.deepEqual(filters[1].options.map((o) => [o.id, o.count]), [["0", 3], ["4", 1], ["6", 1]]);
  assert.equal(items.length, 5);
});

test("汎用の問題種別を選ぶと、レベルが数値順で出る（Lv.10 が Lv.2 より後）", () => {
  const { filters, items } = resolveFavoriteFilters(ITEMS, DEFS, { content: "NLT", type: "0" });
  const level = filters.find((f) => f.id === "level");
  assert.ok(level);
  assert.deepEqual(level.options.map((o) => o.id), ["2", "10"]);
  assert.deepEqual(ids(items), ["g1", "g2"]);
});

test("コーパス（レベル固定）の教材では、問題種別を選んでもレベルは出ない", () => {
  const { filters, items } = resolveFavoriteFilters(ITEMS, DEFS, { content: "Corpus", type: "0" });
  assert.deepEqual(filters.map((f) => f.id), ["content", "type"]);
  assert.deepEqual(ids(items), ["c1"]);
});

test("レベルを選ぶと、レベルの無い問題（コーパス）は除外される", () => {
  const { items } = resolveFavoriteFilters(ITEMS, DEFS, { type: "0", level: "10" });
  assert.deepEqual(ids(items), ["g2"]);
});

test("選択肢に無い値（URLの手入力・削除で無くなった値）は「すべて」として扱う", () => {
  const { filters, items } = resolveFavoriteFilters(ITEMS, DEFS, { content: "Unknown", type: "5" });
  assert.equal(filters[0].value, ALL_OPTION);
  assert.equal(filters[1].value, ALL_OPTION);
  assert.equal(items.length, 5);
});

test("選択肢が1つしか無い絞り込みは出さない", () => {
  const { filters } = resolveFavoriteFilters(ITEMS.filter((q) => q.content === "NLT"), DEFS, {});
  assert.deepEqual(filters.map((f) => f.id), ["type"]);
});

test("連動して外す後ろの絞り込み", () => {
  assert.deepEqual(getDownstreamFilterIds(DEFS, "content"), ["type", "level"]);
  assert.deepEqual(getDownstreamFilterIds(DEFS, "level"), []);
});
