"""Build flights/data/flights.json from the weekly schedule workbooks in flights/source/.

Each workbook is named after the date it takes effect (YYYY-MM-DD.xlsx) and must contain the
sheets 「每日班次明細」(one row per weekly flight) and 「機隊清單」(fleet). A workbook stays in force
until the next one's date. Runs every week in GitHub Actions so the query window always reaches
one year ahead: from the Monday of last week to today + 365 days (Taiwan time).

Output (compact, all times Taiwan local, minutes from midnight of the departure day):
{"generated": ISO, "window": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
 "fleet": [[tail, type, code, base], ...],
 "versions": [{"from": "YYYY-MM-DD", "source": file,
               "flights": [[weekday 0=Mon, base, dest, flightNo, typeCode, dep, ret, tail, note], ...]}]}
"""
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "flights" / "source"
OUT = ROOT / "flights" / "data" / "flights.json"
TPE_TZ = timezone(timedelta(hours=8))
DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]
TIME = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(?:\(\+(\d)\))?$")
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})\.xlsx$")


def fail(msg):
    print(f"錯誤：{msg}", file=sys.stderr)
    sys.exit(1)


def read_workbook(path):
    wb = load_workbook(path, read_only=True, data_only=True)
    for sheet in ("每日班次明細", "機隊清單"):
        if sheet not in wb.sheetnames:
            fail(f"{path.name} 缺少工作表「{sheet}」")

    fleet = {}
    for r in wb["機隊清單"].iter_rows(values_only=True):
        if r and isinstance(r[0], str) and re.fullmatch(r"B\d{4,5}", r[0].strip()):
            fleet[r[0].strip()] = [r[0].strip(), str(r[1] or ""), str(r[2] or ""), str(r[3] or "")]

    head, flights = None, []
    for r in wb["每日班次明細"].iter_rows(values_only=True):
        cells = ["" if v is None else str(v).strip() for v in r]
        if head is None:
            if "班號" in cells and "機尾號" in cells:
                head = {name: i for i, name in enumerate(cells)}
            continue
        day = cells[head["星期"]] if head["星期"] < len(cells) else ""
        if day not in DAYS:
            continue
        m = TIME.match(cells[head["時間"]])
        if not m:
            fail(f"{path.name}：無法解讀時間「{cells[head['時間']]}」（班號 {cells[head['班號']]}）")
        h1, m1, h2, m2, plus = m.groups()
        dep = int(h1) * 60 + int(m1)
        ret = int(h2) * 60 + int(m2) + 1440 * int(plus or 0)
        if ret <= dep:
            fail(f"{path.name}：班號 {cells[head['班號']]} 回程早於出發")
        tail = cells[head["機尾號"]]
        if tail not in fleet:
            fail(f"{path.name}：機尾號 {tail} 不在機隊清單")
        note = cells[head["備註"]] if "備註" in head and head["備註"] < len(cells) else ""
        flights.append([DAYS.index(day), cells[head["基地"]], cells[head["航點"]], cells[head["班號"]],
                        cells[head["機型限制"]], dep, ret, tail, note])
    if head is None:
        fail(f"{path.name}：「每日班次明細」找不到標題列（需有「班號」「機尾號」欄）")
    if not flights:
        fail(f"{path.name}：沒有讀到任何航班")
    flights.sort(key=lambda f: (f[0], f[5], f[3]))
    return list(fleet.values()), flights


def main():
    files = sorted((p for p in SRC.glob("*.xlsx") if NAME.match(p.name)), key=lambda p: p.name)
    others = [p.name for p in SRC.glob("*.xlsx") if not NAME.match(p.name)]
    if others:
        fail("檔名需為生效日期，例如 2026-11-16.xlsx：" + "、".join(others))
    if not files:
        fail("flights/source/ 裡沒有班表")

    today = datetime.now(TPE_TZ).date()
    start = today - timedelta(days=today.weekday() + 7)  # Monday of last week
    end = today + timedelta(days=365)

    # Keep every version that is in force somewhere in the window.
    dated = [(date.fromisoformat(NAME.match(p.name)[1]), p) for p in files]
    keep = [(d, p) for i, (d, p) in enumerate(dated)
            if d <= end and (i + 1 == len(dated) or dated[i + 1][0] > start)]
    if not keep:
        fail("沒有任何班表在查詢範圍內生效")

    fleet_all, versions = {}, []
    for d, p in keep:
        fleet, flights = read_workbook(p)
        for f in fleet:
            fleet_all[f[0]] = f
        versions.append({"from": d.isoformat(), "source": p.name, "flights": flights})
        print(f"{p.name}：{len(flights)} 班／週，{len(fleet)} 架")

    out = {
        "generated": datetime.now(TPE_TZ).isoformat(timespec="seconds"),
        "window": {"start": max(start, date.fromisoformat(versions[0]["from"])).isoformat(), "end": end.isoformat()},
        "fleet": sorted(fleet_all.values()),
        "versions": versions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old = json.loads(OUT.read_text("utf-8")) if OUT.exists() else None
    if old and {k: v for k, v in old.items() if k != "generated"} == {k: v for k, v in out.items() if k != "generated"}:
        print("航班資料沒有變動")
        return
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"已寫入 {OUT.relative_to(ROOT)}：{out['window']['start']} ～ {out['window']['end']}")


if __name__ == "__main__":
    main()
