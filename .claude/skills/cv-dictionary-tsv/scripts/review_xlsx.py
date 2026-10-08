"""
コンテンツチーム向けの確認依頼Excel（登録データ一覧＋要確認＋未決の方針）を作る。

使い方（リポジトリルートで実行。Python 3 + openpyxl が必要）:
  python .claude/skills/cv-dictionary-tsv/scripts/review_xlsx.py --dict <辞書TSV> [--out <出力xlsx>] [--title <表題>] [--all-pending]

  --dict         生成済みの辞書TSV（CV辞書 一括登録用）
  --out          出力先（既定: 辞書TSVと同じフォルダの <辞書TSV名>_確認依頼.xlsx）
  --title        「はじめに」シートの表題に添える名前（既定: 辞書TSVのファイル名）
  --all-pending  台帳の pending 行をすべて載せる（既定: 辞書TSVに含まれる語だけ）

元データ:
  - 要確認: docs/cv-dictionary/review-ledger.tsv の pending 行
  - 未決の方針: docs/cv-dictionary/open-policies.json（対象語が1つもない方針は載せない）
見本: docs/cv-dictionary/sample/（サンプルデータで出力した確認依頼Excel）
"""
import argparse
import csv
import json
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
LEDGER = os.path.join(REPO, "docs", "cv-dictionary", "review-ledger.tsv")
POLICIES = os.path.join(REPO, "docs", "cv-dictionary", "open-policies.json")

# reference.md「7. cv_id」と同じ対応（表示名・IPA・例）
CV = [
    ("green_tea", "GREEN TEA", "/iː/ /i/", "meet, see, team"),
    ("silver_pin", "SILVER PIN", "/ɪ/", "sit, pink, build"),
    ("gray_day", "GRAY DAY", "/eɪ/", "day, name, tailor"),
    ("red_pepper", "RED PEPPER", "/ɛ/ /e/", "bed, send, professional"),
    ("black_cat", "BLACK CAT", "/æ/", "cat, happy, family"),
    ("purple_shirt", "PURPLE SHIRT", "/ɜːr/ /ɜr/ /ɝ/", "bird, her, turn"),
    ("cup_of_mustard", "MUSTARD", "/ʌ/ /ə/（強勢のあるもの）", "up, mother, love"),
    ("olive_sock", "OLIVE SOCK", "/ɑː/ /ɑ/ /ɒ/ /ɑr/", "job, stop, father, car"),
    ("auburn_dog", "AUBURN DOG", "/ɔː/ /ɔ/", "dog, law, water"),
    ("turquoise_toy", "TURQUOISE TOY", "/ɔɪ/", "boy, oil, choice"),
    ("orange_door", "ORANGE DOOR", "/ɔːr/ /ɔr/", "door, for, born, course"),
    ("rose_boat", "ROSE BOAT", "/oʊ/ /əʊ/", "no, home, road"),
    ("wooden_hook", "WOODEN HOOK", "/ʊ/", "good, look, should"),
    ("blue_moon", "BLUE MOON", "/uː/ /u/", "you, room, truth"),
    ("brown_cow", "BROWN COW", "/aʊ/", "cow, house, now"),
    ("white_tie", "WHITE TIE", "/aɪ/", "by, night, like"),
]
CV_NAME = {c[0]: c[1] for c in CV}
POS_JA = {
    "NOUN": "名詞", "VERB": "動詞", "ADJ": "形容詞", "ADV": "副詞", "PREP": "前置詞",
    "PRON": "代名詞", "CONJ": "接続詞", "ART": "冠詞", "INT": "間投詞",
}

FONT = "Meiryo UI"
f_base = Font(name=FONT, size=10)
f_bold = Font(name=FONT, size=10, bold=True)
f_head = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_title = Font(name=FONT, size=14, bold=True, color="0E3196")
f_sub = Font(name=FONT, size=11, bold=True, color="0E3196")
f_note = Font(name=FONT, size=9, color="666666")
fill_head = PatternFill("solid", fgColor="0E3196")
fill_input = PatternFill("solid", fgColor="FFF2CC")
fill_group = PatternFill("solid", fgColor="E8EDF8")
thin = Side(style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")
center = Alignment(horizontal="center", vertical="top", wrap_text=True)

SHEET_POLICY = "①確認事項（方針）"
SHEET_WORDS = "②確認事項（語別）"
SHEET_DICT = "③登録データ一覧"
SHEET_CV = "Color Vowel 一覧"


def read_tsv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def cv_label(cv_id):
    return f"{CV_NAME.get(cv_id, cv_id)}（{cv_id}）"


def ledger_matches(row, m):
    if row["category"] != m.get("category", row["category"]):
        return False
    if "cvIds" in m and row["cv_id"] not in m["cvIds"]:
        return False
    q = row["question"]
    if not all(s in q for s in m.get("questionIncludes", [])):
        return False
    anys = m.get("questionIncludesAny")
    return not anys or any(s in q for s in anys)


def dict_matches(row, m):
    if "pos" in m and row["part_of_speech"] not in m["pos"]:
        return False
    return not ("wordPattern" in m and not re.fullmatch(m["wordPattern"], row["word_en"]))


def resolve_policies(policies, ledger, dict_rows):
    """方針ごとに対象語を集め、対象が1つもない方針は除く。台帳の行には方針ID（P-01…）を付ける。"""
    resolved = []
    for p in policies:
        m = p["match"]
        if m["source"] == "ledger":
            rows = [r for r in ledger if not r.get("policy") and ledger_matches(r, m)]
            if not rows:
                continue
            pid = f"P-{len(resolved) + 1:02d}"
            for r in rows:
                r["policy"] = pid
            counts = {}
            for r in rows:
                counts.setdefault(r["cv_id"], []).append(r["word_en"])
            main = max(counts, key=lambda k: len(counts[k]))
            current = cv_label(main) + "".join(
                f"\n※ {', '.join(sorted(set(ws)))} は {CV_NAME.get(cv, cv)}"
                for cv, ws in counts.items() if cv != main
            )
            words = sorted({r["word_en"] for r in rows})
            count = f"{len(rows)}件"
        else:
            words = sorted({r["word_en"] for r in dict_rows if dict_matches(r, m)})
            if not words:
                continue
            pid = f"P-{len(resolved) + 1:02d}"
            current = p["current"]
            count = f"{len(words)}{m.get('countLabel', '語')}"
        resolved.append({**p, "id": pid, "words": ", ".join(words), "count": count, "current": current})
    return resolved


def header(ws, row, cols, widths):
    for i, (name, w) in enumerate(zip(cols, widths), start=1):
        c = ws.cell(row=row, column=i, value=name)
        c.font, c.fill, c.alignment, c.border = f_head, fill_head, center, border
        ws.column_dimensions[c.column_letter].width = w


def body_cell(ws, row, col, value, align=wrap, input_cell=False, bold=False):
    c = ws.cell(row=row, column=col, value=value)
    c.font = f_bold if bold else f_base
    c.alignment, c.border = align, border
    if input_cell:
        c.fill = fill_input
    return c


def label_cell(ws, row, value):
    body_cell(ws, row, 2, value, bold=True).fill = fill_group


def build_intro(ws, title, dict_name, dict_count, policy_count, word_count):
    ws.title = "はじめに"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 26
    ws.column_dimensions["C"].width = 90
    ws.cell(row=2, column=2, value=f"ColorVowel辞書データ 確認のお願い（{title}）").font = f_title
    r = 4
    info = [
        ("対象データ", dict_name, False),
        ("登録件数", f"{dict_count}語（英単語＋品詞の組み合わせ単位）", False),
        ("確認していただきたいこと",
         f"① 方針の確認 {policy_count}件　② 語ごとの確認 {word_count}件　③ 登録データ全体の確認（気づいた点があれば）", False),
        ("ご回答期限", None, True),
        ("ご回答者", None, True),
    ]
    for k, v, is_input in info:
        label_cell(ws, r, k)
        body_cell(ws, r, 3, v, input_cell=is_input)
        r += 1
    r += 1
    ws.cell(row=r, column=2, value="シートの構成と確認の進め方").font = f_sub
    r += 1
    steps = [
        (SHEET_POLICY,
         "複数の語にまとめて効く判断です。ここを先に決めていただくと、②の多くの語が自動的に決まります。"
         "「回答」列のプルダウンから選び、補足があれば「コメント」列に記入してください。"),
        (SHEET_WORDS,
         "発音や Color Vowel の判断が分かれる語の一覧です。「方針」列に P-01 などがある語は①の回答に従うため、"
         "例外にしたい場合だけ記入してください。方針が空欄の語は、1語ずつ「回答」列を選んでください。"
         "変更する場合は「修正後」の列に正しい値を記入してください。"),
        (SHEET_DICT,
         "登録済みの全データです。フィルターで絞り込めます。誤り・違和感があれば「指摘・コメント」列に記入してください"
         "（日本語訳の表現なども歓迎です）。「要確認ID」がある行は②に載っている語です。"),
        (SHEET_CV, "Color Vowel と発音記号（IPA）の対応表です。判断の参考にしてください。"),
    ]
    for k, v in steps:
        label_cell(ws, r, k)
        body_cell(ws, r, 3, v)
        ws.row_dimensions[r].height = 48
        r += 1
    r += 1
    ws.cell(row=r, column=2, value="記入のルール").font = f_sub
    r += 1
    c = ws.cell(row=r, column=2, value="記入欄")
    c.font, c.fill, c.border = f_bold, fill_input, border
    body_cell(ws, r, 3, "黄色のセルが記入欄です。それ以外のセルは変更しないでください（回答の取り込みに使います）。")
    r += 1
    label_cell(ws, r, "記入例")
    body_cell(ws, r, 3, "②で year を SILVER PIN に変えたい場合 → 回答「候補に変更」、修正後 Color Vowel「silver_pin」、"
              "修正後 発音記号は変更がなければ空欄のままで構いません。")
    ws.row_dimensions[r].height = 32
    r += 2
    ws.cell(row=r, column=2, value="用語").font = f_sub
    r += 1
    terms = [
        ("音節", "ハイフンで区切った音のまとまり（例: ac-cel-er-ate）"),
        ("第一アクセント音節", "一番強く読む音節が何番目か（例: ac-cel-er-ate → 2）"),
        ("アクセント母音の綴り", "第一アクセント音節の中で母音を表している文字（例: cel → e）"),
        ("Color Vowel", "第一アクセント母音の Color Vowel（アプリで色として表示される）"),
        ("発音記号", "米国英語の発音記号（IPA）。ˈ の直後が第一アクセント"),
        ("原形", "語形変化した語の元の形（例: accelerated → accelerate）。原形そのものの語は空欄"),
    ]
    for k, v in terms:
        label_cell(ws, r, k)
        body_cell(ws, r, 3, v)
        r += 1


def build_policies(ws, policies):
    cols = ["ID", "論点", "確認したいこと", "対象の語", "件数", "現在の設定", "候補", "回答", "コメント"]
    header(ws, 1, cols, [7, 24, 48, 40, 14, 28, 22, 26, 36])
    for i, p in enumerate(policies, start=2):
        vals = [p["id"], p["title"], p["question"], p["words"], p["count"], p["current"], p["candidates"]]
        for j, v in enumerate(vals, start=1):
            body_cell(ws, i, j, v, align=center if j in (1, 5) else wrap, bold=j == 2)
        body_cell(ws, i, 8, None, input_cell=True)
        body_cell(ws, i, 9, None, input_cell=True)
        dv = DataValidation(type="list", formula1='"' + ",".join(p["options"]) + '"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add(ws.cell(row=i, column=8))
        # 対象の語が多い方針（機能語など）は行を高くする
        ws.row_dimensions[i].height = max(75, min(160, 15 * (len(p["words"]) // 35 + 1)))
    ws.freeze_panes = "C2"
    ws.cell(row=len(policies) + 3, column=1,
            value="※ 対象の語は今回のデータに含まれるもの。決まった方針は今後作成する辞書データにも適用します。").font = f_note


def build_words(ws, ledger):
    cols = ["要確認ID", "分類", "方針", "英単語", "品詞", "音節", "第一アクセント音節", "アクセント母音の綴り",
            "Color Vowel", "発音記号", "確認したいこと", "回答", "修正後 Color Vowel", "修正後 発音記号",
            "修正後 音節・アクセント位置", "コメント"]
    header(ws, 1, cols, [11, 14, 7, 13, 9, 15, 10, 10, 16, 18, 46, 22, 18, 18, 18, 30])
    ws.row_dimensions[1].height = 32
    ans_policy = DataValidation(
        type="list", allow_blank=True,
        formula1='"方針の回答に従う,この語は現状のままでよい,候補に変更,その他（コメント欄に記入）"')
    ans_word = DataValidation(
        type="list", allow_blank=True, formula1='"現状のままでよい,候補に変更,その他（コメント欄に記入）"')
    cv_dv = DataValidation(type="list", allow_blank=True, formula1=f"='{SHEET_CV}'!$A$2:$A${len(CV) + 1}")
    for dv in (ans_policy, ans_word, cv_dv):
        ws.add_data_validation(dv)
    ordered = sorted(ledger, key=lambda r: (r.get("policy") or "P-99", r["category"], r["word_en"]))
    for i, r in enumerate(ordered, start=2):
        vals = [r["id"], r["category"], r.get("policy"), r["word_en"],
                POS_JA.get(r["part_of_speech"], r["part_of_speech"]), r["syllables"],
                int(r["primary_stress_syllable"]), r["stress_vowel_spelling"],
                f'{CV_NAME.get(r["cv_id"], r["cv_id"])}\n({r["cv_id"]})', r["phonetic_spelling"], r["question"]]
        for j, v in enumerate(vals, start=1):
            body_cell(ws, i, j, v, align=center if j in (1, 3, 5, 7, 8) else wrap, bold=j == 4)
        for j in range(12, 17):
            body_cell(ws, i, j, None, input_cell=True)
        (ans_policy if r.get("policy") else ans_word).add(ws.cell(row=i, column=12))
        cv_dv.add(ws.cell(row=i, column=13))
        if r.get("policy"):
            ws.cell(row=i, column=12).value = "方針の回答に従う"
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = f"A1:P{len(ordered) + 1}"


def build_dict(ws, dict_rows, ledger_ids):
    cols = ["No", "英単語", "品詞", "日本語訳", "音節", "第一アクセント音節", "アクセント母音の綴り",
            "Color Vowel", "cv_id", "発音記号", "原形", "要確認ID", "指摘・コメント"]
    header(ws, 1, cols, [6, 16, 9, 40, 18, 10, 10, 15, 15, 22, 13, 11, 36])
    ws.row_dimensions[1].height = 32
    rows = sorted(dict_rows, key=lambda r: (r["word_en"].lower(), r["part_of_speech"]))
    for i, r in enumerate(rows, start=2):
        vals = [i - 1, r["word_en"], POS_JA.get(r["part_of_speech"], r["part_of_speech"]), r["word_ja"],
                r["syllables"], int(r["primary_stress_syllable"]), r["stress_vowel_spelling"],
                CV_NAME.get(r["cv_id"], r["cv_id"]), r["cv_id"], r["phonetic_spelling"], r.get("lemma") or None,
                ledger_ids.get((r["word_en"], r["part_of_speech"]))]
        for j, v in enumerate(vals, start=1):
            body_cell(ws, i, j, v, align=center if j in (1, 3, 6, 7, 12) else wrap, bold=j == 2)
        body_cell(ws, i, 13, None, input_cell=True)
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:M{len(rows) + 1}"


def build_cv(ws):
    header(ws, 1, ["cv_id", "Color Vowel", "発音記号（IPA）", "例", "今回のデータの件数"], [18, 18, 26, 30, 12])
    for i, (cid, name, ipa, ex) in enumerate(CV, start=2):
        for j, v in enumerate([cid, name, ipa, ex, f"=COUNTIF('{SHEET_DICT}'!$I:$I,A{i})"], start=1):
            body_cell(ws, i, j, v, align=center if j == 5 else wrap, bold=j == 2)
    total = len(CV) + 2
    body_cell(ws, total, 4, "合計", bold=True)
    body_cell(ws, total, 5, f"=SUM(E2:E{total - 1})", align=center, bold=True)
    ws.freeze_panes = "A2"


def main():
    # Windows のコンソール（cp932）では IPA 記号を出力できないため UTF-8 に固定する
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dict", required=True)
    ap.add_argument("--out")
    ap.add_argument("--title")
    ap.add_argument("--all-pending", action="store_true")
    args = ap.parse_args()

    dict_rows = read_tsv(args.dict)
    dict_keys = {(r["word_en"], r["part_of_speech"]) for r in dict_rows}
    ledger = [r for r in read_tsv(LEDGER) if r["status"] == "pending"
              and (args.all_pending or (r["word_en"], r["part_of_speech"]) in dict_keys)]
    with open(POLICIES, encoding="utf-8") as f:
        policies = resolve_policies(json.load(f)["policies"], ledger, dict_rows)

    stem = os.path.splitext(os.path.basename(args.dict))[0]
    out = args.out or os.path.join(os.path.dirname(os.path.abspath(args.dict)), f"{stem}_確認依頼.xlsx")

    wb = Workbook()
    build_intro(wb.active, args.title or stem, os.path.basename(args.dict), len(dict_rows), len(policies), len(ledger))
    build_policies(wb.create_sheet(SHEET_POLICY), policies)
    build_words(wb.create_sheet(SHEET_WORDS), ledger)
    build_dict(wb.create_sheet(SHEET_DICT), dict_rows, {(r["word_en"], r["part_of_speech"]): r["id"] for r in ledger})
    build_cv(wb.create_sheet(SHEET_CV))
    for ws in wb.worksheets:
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToHeight = 0
    # 件数の数式（COUNTIF）を Excel で開いたときに計算させる
    wb.calculation.fullCalcOnLoad = True
    wb.save(out)

    print(f"出力: {out}")
    print(f"登録データ {len(dict_rows)}行 / 方針 {len(policies)}件 / 語別 {len(ledger)}件"
          f"（うち方針に従う {sum(1 for r in ledger if r.get('policy'))}件）")
    for p in policies:
        print(f"  {p['id']} {p['title']}: {p['count']}")


if __name__ == "__main__":
    main()
