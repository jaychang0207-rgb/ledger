"""Fetch Taiwan listed (TWSE) and OTC (TPEx) closing prices into data/prices.json.

Runs in GitHub Actions after the market closes. Uses only the standard library.
Output: {"updatedAt": ISO time, "prices": {code: [name, close, "YYYY-MM-DD", "twse"|"tpex"]}}
"""
import csv
import io
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "prices.json"
TWSE = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=csv"
TPEX = "https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&o=json"
# Common stocks (4 digits) and ETFs (00xx, 00xxx, 00xxxA/B…); skips warrants and other derivatives.
CODE = re.compile(r"^(\d{4}|00\d{2,4}[A-Z]?)$")


def get(url, tries=3):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (personal ledger price sync)"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8-sig")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def price(s):
    try:
        v = float(str(s).replace(",", "").strip())
        return v if v > 0 else None
    except ValueError:
        return None


def roc_date(s):
    s = str(s).strip().replace("/", "")
    if len(s) == 8 and s.startswith("20"):
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return f"{int(s[:-4]) + 1911}-{s[-4:-2]}-{s[-2:]}"


def twse():
    out = {}
    rows = csv.reader(io.StringIO(get(TWSE)))
    next(rows, None)
    for r in rows:
        if len(r) < 9:
            continue
        code, name, close = r[1].strip(), r[2].strip(), price(r[8])
        if CODE.match(code) and close:
            out[code] = [name, close, roc_date(r[0]), "twse"]
    return out


def tpex():
    out = {}
    d = json.loads(get(TPEX))
    date = roc_date(d["date"])
    for r in d["tables"][0]["data"]:
        code, name, close = r[0].strip(), r[1].strip(), price(r[2])
        if CODE.match(code) and close:
            out[code] = [name, close, date, "tpex"]
    return out


def main():
    try:
        old = json.loads(OUT.read_text("utf-8")).get("prices", {})
    except (OSError, ValueError):
        old = {}
    prices = dict(old)
    ok = 0
    for name, fn in (("TWSE", twse), ("TPEx", tpex)):
        try:
            got = fn()
            print(f"{name}: {len(got)} prices")
            if got:
                ok += 1
            for code, v in got.items():
                if code not in prices or v[2] >= prices[code][2]:
                    prices[code] = v
        except Exception as e:  # keep the other market's data if one source fails
            print(f"{name} failed: {e}", file=sys.stderr)
    if not ok:
        sys.exit("no source returned data")
    if prices == old:
        print("no change")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "prices": dict(sorted(prices.items()))}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"wrote {len(prices)} prices")


if __name__ == "__main__":
    main()
