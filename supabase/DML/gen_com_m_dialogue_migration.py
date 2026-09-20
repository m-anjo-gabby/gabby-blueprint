import csv
import uuid

SRC_DIR = r"C:\Users\iwata\Documents\社内ワーク\04_App開発\40_Blueprint\20_開発作業\ダイアログプラクティス"
OUT_PATH = r"C:\Users\iwata\AppData\Local\Temp\claude\c--react-gabby-blueprint\c508f046-36bc-4369-9986-ad9b72dfc5cf\scratchpad\dialogue_migration_generated.sql"

# 移行専用の固定名前空間。DIALOGUEID/SESSION_NO等の旧連番から決定論的にUUIDを
# 生成することで、本スクリプトを複数回実行しても同じcontent_id/dialogue_session_idに
# 収束させ（ON CONFLICT DO UPDATE）、再実行可能（resumable）にする。
MIGRATION_NAMESPACE = uuid.UUID("6b3f2a10-8e2d-4c9a-9a1e-7c1a2b3d4e5f")

TENANT_CLIENT_ID = "276a456c-a7e5-4987-be15-c94be9ae89a5"  # システムテナント

LEVEL_TO_CATEGORY = {"1": 1, "2": 2, "3": 3}  # Beginner/Intermediate/Advanced


def content_uuid(kind: str, *parts: str) -> str:
    return str(uuid.uuid5(MIGRATION_NAMESPACE, ":".join([kind, *parts])))


def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def read_tsv(filename):
    path = f"{SRC_DIR}\\{filename}"
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quotechar='"')
        rows = list(reader)
    header = rows[0]
    return [dict(zip(header, row)) for row in rows[1:] if any(c.strip() for c in row)]


def main():
    dialogue_rows = read_tsv("gabby.COM_M_DIALOGUE.tsv")
    dialogue_detail_rows = read_tsv("gabby.COM_M_DIALOGUE_DETAIL.tsv")
    tailor_rows = read_tsv("gabby.COM_M_TAILOR_MADE.tsv")
    tailor_detail_rows = read_tsv("gabby.COM_M_TAILOR_MADE_DETAIL.tsv")

    lines = []
    lines.append("-- =========================================================================")
    lines.append("-- 旧ダイアログプラクティスデータ移行 (COM_M_DIALOGUE(_DETAIL) / COM_M_TAILOR_MADE(_DETAIL))")
    lines.append("-- 生成元: gen_dialogue_migration.py（本ファイルはスクリプトによる自動生成、手動編集しないこと）")
    lines.append("-- 冪等性: content_id/dialogue_session_idは移行元IDから決定論的に生成したUUIDのため、")
    lines.append("--         再実行してもON CONFLICTで同じ行に収束する（resumable）。")
    lines.append("-- =========================================================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # ---- 1. 汎用ダイアログ教材 (COM_M_DIALOGUE -> com_m_contents, content_scope=0) ----
    lines.append("-- 1. 汎用ダイアログ教材セット (COM_M_DIALOGUE -> com_m_contents)")
    content_id_by_dialogue_id = {}
    for row in dialogue_rows:
        dialogue_id = row["DIALOGUEID"]
        level = row["LEVEL"]
        set_name = row["SET_NAME"]
        sortno = row["SORTNO"]
        category_id = LEVEL_TO_CATEGORY[level]
        cid = content_uuid("dialogue-content", dialogue_id)
        content_id_by_dialogue_id[dialogue_id] = cid

        lines.append(
            "INSERT INTO public.com_m_contents "
            "(content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES "
            f"({esc(cid)}, {esc(set_name)}, NULL, 3, 0, {category_id}, {sortno}, {esc(set_name)}, '0')\n"
            "ON CONFLICT (content_id) DO UPDATE SET "
            "content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, "
            "seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, "
            "delete_flg = EXCLUDED.delete_flg, update_date = NOW();"
        )
    lines.append("")

    lines.append("-- 2. 汎用ダイアログ セッション明細 (COM_M_DIALOGUE_DETAIL -> com_m_dialogue_session)")
    for row in dialogue_detail_rows:
        dialogue_id = row["DIALOGUEID"]
        session_no = row["SESSION_NO"]
        cid = content_id_by_dialogue_id[dialogue_id]
        sid = content_uuid("dialogue-session", dialogue_id, session_no)

        lines.append(
            "INSERT INTO public.com_m_dialogue_session "
            "(dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, delete_flg) VALUES "
            f"({esc(sid)}, {esc(cid)}, {session_no}, {esc(row['COACH_SLIDES'])}, {esc(row['COACH_SLIDES_LINK'])}, "
            f"{esc(row['STUDENT_SLIDES'])}, {esc(row['STUDENT_SLIDES_LINK'])}, '0')\n"
            "ON CONFLICT (dialogue_session_id) DO UPDATE SET "
            "coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, "
            "student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, "
            "delete_flg = EXCLUDED.delete_flg, update_date = NOW();"
        )
    lines.append("")

    # ---- 2. コーパス(Blueprint)ダイアログ教材 (COM_M_TAILOR_MADE -> com_m_contents, content_scope=1, category_id=4) ----
    lines.append("-- 3. コーパス(Corpus)ダイアログ教材セット (COM_M_TAILOR_MADE -> com_m_contents, テナント: システムテナント)")
    content_id_by_tailor_key = {}
    for row in tailor_rows:
        tailor_type = row["TAILOR_MADE_TYPE"]
        tailor_id = row["TAILOR_MADE_ID"]
        set_name = row["SET_NAME"]
        sortno = row["SORTNO"]
        key = (tailor_type, tailor_id)
        cid = content_uuid("tailor-content", tailor_type, tailor_id)
        content_id_by_tailor_key[key] = cid

        lines.append(
            "INSERT INTO public.com_m_contents "
            "(content_id, content_name, content_name_en, content_type, content_scope, category_id, seq_no, content_label, delete_flg) VALUES "
            f"({esc(cid)}, {esc(set_name)}, NULL, 3, 1, 4, {sortno}, {esc('システムテナント')}, '0')\n"
            "ON CONFLICT (content_id) DO UPDATE SET "
            "content_name = EXCLUDED.content_name, category_id = EXCLUDED.category_id, "
            "seq_no = EXCLUDED.seq_no, content_label = EXCLUDED.content_label, "
            "delete_flg = EXCLUDED.delete_flg, update_date = NOW();"
        )
    lines.append("")

    lines.append("-- 4. コーパスダイアログ セット -> システムテナントへのアクセス権付与 (com_m_contents_access)")
    for key, cid in content_id_by_tailor_key.items():
        lines.append(
            "INSERT INTO public.com_m_contents_access (client_id, content_id, notes) VALUES "
            f"({esc(TENANT_CLIENT_ID)}, {esc(cid)}, {esc('旧COM_M_TAILOR_MADEからの移行分')})\n"
            "ON CONFLICT (client_id, content_id) DO NOTHING;"
        )
    lines.append("")

    lines.append("-- 5. コーパスダイアログ セッション明細 (COM_M_TAILOR_MADE_DETAIL -> com_m_dialogue_session)")
    for row in tailor_detail_rows:
        tailor_type = row["TAILOR_MADE_TYPE"]
        tailor_id = row["TAILOR_MADE_ID"]
        session_no = row["SESSION_NO"]
        key = (tailor_type, tailor_id)
        cid = content_id_by_tailor_key[key]
        sid = content_uuid("tailor-session", tailor_type, tailor_id, session_no)
        notes = row.get("NOTES") or None

        lines.append(
            "INSERT INTO public.com_m_dialogue_session "
            "(dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link, admin_notes, delete_flg) VALUES "
            f"({esc(sid)}, {esc(cid)}, {session_no}, {esc(row['COACH_SLIDES'])}, {esc(row['COACH_SLIDES_LINK'])}, "
            f"{esc(row['STUDENT_SLIDES'])}, {esc(row['STUDENT_SLIDES_LINK'])}, {esc(notes)}, '0')\n"
            "ON CONFLICT (dialogue_session_id) DO UPDATE SET "
            "coach_slides_title = EXCLUDED.coach_slides_title, coach_slides_link = EXCLUDED.coach_slides_link, "
            "student_slides_title = EXCLUDED.student_slides_title, student_slides_link = EXCLUDED.student_slides_link, "
            "admin_notes = EXCLUDED.admin_notes, delete_flg = EXCLUDED.delete_flg, update_date = NOW();"
        )
    lines.append("")

    lines.append("COMMIT;")
    lines.append("")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Generated: {OUT_PATH}")
    print(f"Dialogue sets: {len(dialogue_rows)}, sessions: {len(dialogue_detail_rows)}")
    print(f"Tailor-made sets: {len(tailor_rows)}, sessions: {len(tailor_detail_rows)}")


if __name__ == "__main__":
    main()
