"""
発話の評価の文言（packages/lib/assessment/feedbackMessages.json）を、運営の確認用の一覧の行に並べる。
review_xlsx.py（一覧を作る）と apply_xlsx.py（回答を取り込む）が同じ行の定義（ID と JSON の場所）を使う。

ID は JSON の場所をドットでつないだもの。候補の配列は 1 始まりの番号（例: summary.encouragement.missingArticle.good.1）。
"""
import json
import os
import re

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CATALOG = os.path.join(REPO, "packages", "lib", "assessment", "feedbackMessages.json")

# packages/lib/assessment/feedbackConfig.ts の SCORE_TIERS と同じ区切り
TIER_LABELS = {
    "excellent": "Excellent（90点以上）",
    "great": "Great（80〜89点）",
    "good": "Good（60〜79点）",
    "fair": "Fair（30〜59点）",
    "poor": "Poor（29点以下）",
}
DIAGNOSIS_TIERS = ["good", "fair", "poor"]

PLACE_SUMMARY = "スコアの横の一言"
PLACE_ADVICE = "改善のヒント"

PLACEHOLDER = re.compile(r"\{(\w+)\}")


def load_catalog():
    with open(CATALOG, encoding="utf-8") as f:
        return json.load(f)


def save_catalog(data):
    with open(CATALOG, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def fill(template, values):
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def placeholders(text):
    return sorted(PLACEHOLDER.findall(text))


def get_at(data, row_id):
    node = data
    for key in row_id.split("."):
        node = node[int(key) - 1] if isinstance(node, list) else node[key]
    return node


def set_at(data, row_id, value):
    keys = row_id.split(".")
    parent = get_at(data, ".".join(keys[:-1]))
    last = keys[-1]
    if isinstance(parent, list):
        parent[int(last) - 1] = value
    else:
        parent[last] = value


def build_rows(data):
    """一覧の行（id / place / group / scene / text / example）を、画面での見え方の順に返す。"""
    rows = []
    summary = data["summary"]
    kinds = data["kinds"]

    def add(row_id, place, group, scene, example=None):
        text = get_at(data, row_id)
        rows.append(
            {"id": row_id, "place": place, "group": group, "scene": scene, "text": text, "example": example or text}
        )

    for i, _ in enumerate(summary["perfect"], 1):
        add(f"summary.perfect.{i}", PLACE_SUMMARY, "指摘なし", f"{TIER_LABELS['excellent']}で、すべての単語が聞き取れた")
    for tier in ("excellent", "great"):
        for i, _ in enumerate(summary["highWithNote"][tier], 1):
            add(
                f"summary.highWithNote.{tier}.{i}",
                PLACE_SUMMARY,
                "指摘が少し残る",
                f"{TIER_LABELS[tier]}で、聞き取れなかった単語などが残る（指摘は書かず「改善のヒント」へ案内する）",
            )

    for kind, meta in kinds.items():
        example = meta["example"]
        diagnosis = fill(summary["diagnosis"][kind], example)
        add(
            f"summary.diagnosis.{kind}",
            PLACE_SUMMARY,
            meta["name"],
            f"1文目（診断）。Good・Fair・Poor で、この指摘を最優先で取り上げるとき。{meta['when']}",
            diagnosis,
        )
        for tier in DIAGNOSIS_TIERS:
            for i, text in enumerate(summary["encouragement"][kind][tier], 1):
                add(
                    f"summary.encouragement.{kind}.{tier}.{i}",
                    PLACE_SUMMARY,
                    meta["name"],
                    f"2文目（励まし）。{TIER_LABELS[tier]}",
                    f"{diagnosis} {text}",
                )
    add(
        "summary.confusionNote",
        PLACE_SUMMARY,
        "よく混同される音",
        "聞き違いが「L」と「R」などのよく混同される音の組に当たるとき、1文目の末尾に添える",
        fill(summary["confusionNote"], {"label": "「L」と「R」"}),
    )

    for kind, meta in kinds.items():
        add(f"advice.{kind}", PLACE_ADVICE, meta["name"], meta["when"], fill(data["advice"][kind], meta["example"]))
    for kind in data["defaultTip"]:
        add(
            f"defaultTip.{kind}",
            PLACE_ADVICE,
            kinds[kind]["name"],
            "練習のこつ（{tip}）。聞き違いがよく混同される音の組に当たらないとき",
        )
    for rule_id in data["confusions"]:
        add(f"confusions.{rule_id}.label", PLACE_ADVICE, "よく混同される音", "音の組の表示名（{label}）")
        add(f"confusions.{rule_id}.tip", PLACE_ADVICE, "よく混同される音", "その音の組の練習のこつ（{tip}）")

    return rows
