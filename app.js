(() => {
  "use strict";

  /* =====================================================================
     Constants
     ===================================================================== */
  const CATS = {
    out: ["餐飲", "交通", "購物", "日用品", "居住", "娛樂", "醫療", "學習", "社交", "旅遊", "其他"],
    in: ["薪資", "零用錢", "獎金", "投資", "副業", "其他"],
  };
  const ACCOUNT_KINDS = { cash: "現金", bank: "銀行", epay: "電子支付", other: "其他" };
  const DEFAULT_ACCOUNTS = [
    { id: "acc-cash", name: "現金", kind: "cash", opening: 0, order: 0 },
    { id: "acc-ctbc", name: "中信金融卡", kind: "bank", opening: 0, order: 1 },
    { id: "acc-post", name: "郵局帳戶", kind: "bank", opening: 0, order: 2 },
  ];
  const TRADE_KINDS = { buy: "買進", sell: "賣出", div: "現金股利", sdiv: "股票股利" };
  const TRIP_CATS = ["餐飲", "交通", "住宿", "購物", "伴手禮", "門票娛樂", "藥妝", "其他"];
  const TRIP_PAY = ["現金", "信用卡", "交通卡", "行動支付"];
  const CURRENCIES = {
    JPY: { name: "日圓", sym: "¥", dp: 0 },
    TWD: { name: "新台幣", sym: "NT$", dp: 0 },
    KRW: { name: "韓元", sym: "₩", dp: 0 },
    USD: { name: "美元", sym: "US$", dp: 2 },
    EUR: { name: "歐元", sym: "€", dp: 2 },
    THB: { name: "泰銖", sym: "฿", dp: 2 },
    HKD: { name: "港幣", sym: "HK$", dp: 2 },
    CNY: { name: "人民幣", sym: "CN¥", dp: 2 },
    SGD: { name: "新加坡幣", sym: "S$", dp: 2 },
    VND: { name: "越南盾", sym: "₫", dp: 0 },
    GBP: { name: "英鎊", sym: "£", dp: 2 },
    AUD: { name: "澳幣", sym: "A$", dp: 2 },
  };
  const FEE_RATE = 0.001425;
  const WD = ["日", "一", "二", "三", "四", "五", "六"];
  const BACKUP_REMIND_DAYS = 30;
  const VIEW_TITLES = { ledger: "記帳", income: "收入", assets: "資產", stocks: "股票", trips: "旅遊" };

  /* =====================================================================
     Helpers
     ===================================================================== */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };
  const round2 = (n) => Math.round(n * 100) / 100;
  const sortByDate = (a, b) => (a.date + (a.createdAt || "")).localeCompare(b.date + (b.createdAt || ""));

  const group = (n, dp = 0) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmt = (n) => (n < -0.5 ? "−" : "") + "NT$" + group(Math.round(n));
  const fmtSigned = (n) => (Math.round(n) > 0 ? "+" : Math.round(n) < 0 ? "−" : "") + "NT$" + group(Math.round(n));
  const fmtPct = (r) => (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r * 100).toFixed(2) + "%";
  const fmtPrice = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const fmtShares = (n) => Number(n).toLocaleString("en-US");
  const cur = (code) => CURRENCIES[code] || { name: code, sym: code + " ", dp: 2 };
  const fmtCur = (n, code) => { const c = cur(code); return (n < 0 ? "−" : "") + c.sym + group(n, c.dp); };
  const plClass = (n) => (Math.round(n) > 0 ? "up" : Math.round(n) < 0 ? "down" : "");
  const shortDate = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const dayLabel = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

  /** Tiny DOM builder: h("div", {class: "x", onclick}, child, "text") */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.style.cssText = v;
      else if (k === "value") el.value = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const field = (label, control, help) => h("label", { class: "field" }, h("span", { text: label }), control, help ? h("span", { class: "help", text: help }) : null);
  const options = (pairs, selected) => pairs.map(([v, t]) => { const o = h("option", { value: v, text: t }); if (v === selected) o.selected = true; return o; });

  let toastTimer;
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /** Two-tap delete: first tap arms the button, second tap within 3s confirms. */
  function armDelete(btn, label, onConfirm) {
    let armed = false, timer;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true; btn.textContent = "確定" + label + "？"; btn.classList.add("danger");
        timer = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove("danger"); }, 3000);
        return;
      }
      clearTimeout(timer); await onConfirm();
    });
    return btn;
  }

  /* =====================================================================
     Storage: IndexedDB on this device
     ===================================================================== */
  const STORES = ["tx", "accounts", "trades", "trips", "tripx", "snaps"];
  const store = (() => {
    let dbp;
    function open() {
      dbp ||= new Promise((res, rej) => {
        const r = indexedDB.open("ledger", 3);
        r.onupgradeneeded = () => {
          const db = r.result;
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
          if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    async function run(name, mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(name, mode);
        const s = t.objectStore(name);
        let out;
        const req = fn(s);
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    }
    return {
      all: (name) => run(name, "readonly", (s) => s.getAll()),
      put: (name, r) => run(name, "readwrite", (s) => s.put(r)),
      del: (name, id) => run(name, "readwrite", (s) => s.delete(id)),
      putMany: (name, rows) => run(name, "readwrite", (s) => { rows.forEach((r) => s.put(r)); }),
      delMany: (name, ids) => run(name, "readwrite", (s) => { ids.forEach((id) => s.delete(id)); }),
      getSetting: async (key) => { const v = await run("settings", "readonly", (s) => s.get(key)); return v ? v.value : undefined; },
      setSetting: (key, value) => run("settings", "readwrite", (s) => s.put({ key, value })),
    };
  })();

  /* =====================================================================
     State
     ===================================================================== */
  const S = {
    tx: [], accounts: [], trades: [], trips: [], tripx: [], snaps: [],
    budget: 0, lastBackup: null, incomeSources: [], quotes: {}, feeCfg: { discount: 1, minFee: 20 },
    market: {}, marketAt: null, priceSync: { busy: false, error: false, lastTry: 0 },
    tab: "ledger", openTrip: null,
  };
  try { const t = localStorage.getItem("tab"); if (VIEW_TITLES[t]) S.tab = t; } catch {}

  async function save(name, rec) {
    await store.put(name, rec);
    const list = S[name], i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
  }
  async function remove(name, id) {
    await store.del(name, id);
    S[name] = S[name].filter((r) => r.id !== id);
  }

  const accountsSorted = () => S.accounts.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const accName = (id) => (S.accounts.find((a) => a.id === id) || {}).name || "未指定帳戶";

  /* =====================================================================
     Calculations
     ===================================================================== */
  function tradeCash(t) {
    if (t.kind === "buy") return -(t.shares * t.price + (t.fee || 0));
    if (t.kind === "sell") return t.shares * t.price - (t.fee || 0) - (t.tax || 0);
    if (t.kind === "div") return t.amount || 0;
    return 0;
  }

  function accountBalances() {
    const b = {};
    S.accounts.forEach((a) => { b[a.id] = Number(a.opening) || 0; });
    for (const r of S.tx) {
      if (r.type === "in") { if (r.account in b) b[r.account] += r.amount; }
      else if (r.type === "out") { if (r.account in b) b[r.account] -= r.amount; }
      else if (r.type === "transfer") {
        if (r.account in b) b[r.account] -= r.amount;
        if (r.toAccount in b) b[r.toAccount] += r.amount;
      }
    }
    for (const t of S.trades) if (t.account && t.account in b) b[t.account] += tradeCash(t);
    for (const k in b) b[k] = Math.round(b[k]);
    return b;
  }

  const taxRate = (symbol) => (/^00/.test(symbol) ? 0.001 : 0.003);
  const calcFee = (amount) => (amount > 0 ? Math.max(S.feeCfg.minFee, Math.floor(amount * FEE_RATE * S.feeCfg.discount)) : 0);

  /** Average-cost portfolio. Pass excludeId to compute holdings without one trade (used when editing it). */
  function portfolio(excludeId, until) {
    const m = {};
    const ts = S.trades.filter((t) => t.id !== excludeId && (!until || t.date <= until)).slice().sort(sortByDate);
    for (const t of ts) {
      const p = (m[t.symbol] ||= { symbol: t.symbol, name: t.name || t.symbol, shares: 0, cost: 0, realized: 0, dividends: 0, trades: [] });
      if (t.name) p.name = t.name;
      p.trades.push(t);
      if (t.kind === "buy") { p.shares += t.shares; p.cost += t.shares * t.price + (t.fee || 0); }
      else if (t.kind === "sell") {
        const n = Math.min(t.shares, p.shares);
        const avg = p.shares ? p.cost / p.shares : 0;
        const costOut = avg * n;
        p.realized += t.shares * t.price - (t.fee || 0) - (t.tax || 0) - costOut;
        p.shares -= n; p.cost -= costOut;
        if (p.shares <= 0) { p.shares = 0; p.cost = 0; }
      } else if (t.kind === "sdiv") p.shares += t.shares;
      else if (t.kind === "div") p.dividends += t.amount || 0;
    }
    const list = Object.values(m);
    for (const p of list) {
      if (p.name === p.symbol && S.market[p.symbol]) p.name = S.market[p.symbol][0] || p.name;
      const q = S.quotes[p.symbol];
      p.price = q ? q.price : null;
      p.quoteAt = q ? q.at : null;
      p.quoteDate = q ? q.date || (q.at || "").slice(0, 10) : null;
      p.quoteAuto = !!(q && q.auto);
      p.avg = p.shares ? p.cost / p.shares : 0;
      if (p.shares > 0 && p.price != null) {
        p.mv = p.shares * p.price;
        p.sellCost = calcFee(p.mv) + Math.floor(p.mv * taxRate(p.symbol));
        p.unreal = p.mv - p.sellCost - p.cost;
        p.ret = p.cost ? p.unreal / p.cost : 0;
      } else { p.mv = null; p.unreal = null; p.ret = null; }
    }
    return list;
  }

  function portfolioSummary(list) {
    const held = list.filter((p) => p.shares > 0);
    const s = { invested: 0, mv: 0, unreal: 0, realized: 0, dividends: 0, missing: 0, held };
    for (const p of list) { s.realized += p.realized; s.dividends += p.dividends; }
    for (const p of held) {
      s.invested += p.cost;
      if (p.mv == null) { s.mv += p.cost; s.missing++; } else { s.mv += p.mv; s.unreal += p.unreal; }
    }
    s.ret = s.invested ? s.unreal / s.invested : 0;
    return s;
  }

  /* =====================================================================
     Tabs
     ===================================================================== */
  function setTab(tab) {
    S.tab = tab;
    try { localStorage.setItem("tab", tab); } catch {}
    for (const t of Object.keys(VIEW_TITLES)) $("view-" + t).hidden = t !== tab;
    document.querySelectorAll(".tabbar button").forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("viewTitle").textContent = VIEW_TITLES[tab];
    if (tab === "stocks") setTimeout(() => syncPrices(false), 0);
    render();
    window.scrollTo(0, 0);
  }
  document.querySelector(".tabbar").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    if (b.dataset.tab === "trips" && S.tab === "trips" && S.openTrip) { S.openTrip = null; }
    setTab(b.dataset.tab);
  });

  /* =====================================================================
     Bottom sheet
     ===================================================================== */
  let sheetOnClose = null;
  function openSheet(title, body, onClose) {
    $("sheetTitle").textContent = title;
    const b = $("sheetBody"); b.innerHTML = ""; b.append(...[].concat(body));
    $("sheet").hidden = false;
    document.body.style.overflow = "hidden";
    sheetOnClose = onClose || null;
    $("sheet").querySelector(".sheet-panel").scrollTop = 0;
  }
  function closeSheet() {
    $("sheet").hidden = true;
    document.body.style.overflow = "";
    $("sheetBody").innerHTML = "";
    const f = sheetOnClose; sheetOnClose = null; if (f) f();
  }
  $("sheetClose").onclick = closeSheet;
  $("sheetBg").onclick = closeSheet;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });

  /* =====================================================================
     記帳 (ledger)
     ===================================================================== */
  const L = {
    type: "out", editingId: null, openId: null, pendingDel: null,
    month: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })(),
  };
  const monthKey = () => `${L.month.y}-${pad(L.month.m)}`;
  $("fDate").value = today();

  function fillAccountSelects(keepFrom, keepTo) {
    const accs = accountsSorted().map((a) => [a.id, a.name]);
    const from = $("fAcc"), to = $("fTo");
    const pf = keepFrom ?? from.value, pt = keepTo ?? to.value;
    from.innerHTML = ""; from.append(...options(accs, pf));
    to.innerHTML = ""; to.append(...options(accs, pt));
    if (!from.value && accs[0]) from.value = accs[0][0];
    if ((!to.value || to.value === from.value) && accs.length > 1) to.value = (accs.find(([id]) => id !== from.value) || accs[0])[0];
  }

  function setLedgerType(t, keepCat) {
    L.type = t;
    document.querySelectorAll("#ledgerSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    const isX = t === "transfer";
    $("catField").hidden = isX; $("chips").hidden = isX; $("toField").hidden = !isX;
    $("accLabel").textContent = isX ? "轉出" : t === "in" ? "存入帳戶" : "付款帳戶";
    $("fNote").placeholder = isX ? "例如：ATM 提款、轉帳到郵局" : t === "in" ? "例如：十一月薪水" : "例如：午餐便當、捷運儲值";
    if (!isX) {
      const sel = $("fCat"), prev = sel.value;
      sel.innerHTML = ""; sel.append(...options(CATS[t].map((c) => [c, c])));
      if (keepCat && CATS[t].includes(keepCat)) sel.value = keepCat;
      else if (CATS[t].includes(prev)) sel.value = prev;
      renderChips();
    }
  }
  function renderChips() {
    const v = $("fCat").value, box = $("chips");
    box.innerHTML = "";
    CATS[L.type]?.forEach((c) => box.append(h("button", { type: "button", class: "chip", "aria-pressed": String(c === v), dataset: { c }, text: c })));
  }
  $("ledgerSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLedgerType(b.dataset.t); });
  $("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { $("fCat").value = b.dataset.c; renderChips(); } });
  $("fCat").addEventListener("change", renderChips);

  let msgTimer;
  function msg(text, err) {
    const m = $("msg"); m.textContent = text; m.classList.toggle("err", !!err);
    clearTimeout(msgTimer);
    if (!err && text) msgTimer = setTimeout(() => { m.textContent = ""; }, 4000);
  }
  function resetLedgerForm() {
    L.editingId = null;
    $("fAmount").value = ""; $("fNote").value = "";
    $("editHint").hidden = true; $("submit").textContent = "記一筆";
    render();
  }
  $("cancelEdit").onclick = resetLedgerForm;

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Math.round(num($("fAmount").value));
    if (!(amount > 0)) { msg("請輸入大於 0 的金額。", true); $("fAmount").focus(); return; }
    const date = $("fDate").value;
    if (!isDate(date)) { msg("請選擇日期。", true); return; }
    const account = $("fAcc").value;
    if (!account) { msg("請先到「資產」新增一個帳戶。", true); return; }
    const base = { type: L.type, amount, date, account, note: $("fNote").value.trim() };
    if (L.type === "transfer") {
      base.toAccount = $("fTo").value;
      if (!base.toAccount || base.toAccount === account) { msg("轉出和轉入要選不同的帳戶。", true); return; }
      base.category = "轉帳";
    } else base.category = $("fCat").value;
    $("submit").disabled = true;
    try {
      if (L.editingId) {
        const old = S.tx.find((r) => r.id === L.editingId) || {};
        const rec = { ...old, ...base, id: L.editingId, updatedAt: new Date().toISOString() };
        if (rec.type !== "transfer") delete rec.toAccount;
        await save("tx", rec);
        msg("已更新。");
      } else {
        await save("tx", { ...base, id: newId(), createdAt: new Date().toISOString() });
        msg(L.type === "transfer" ? `已記下 ${accName(account)} → ${accName(base.toAccount)} ${fmt(amount)}。` : `已記下 ${base.category} ${fmt(amount)}。`);
      }
      const [y, m] = date.split("-").map(Number); L.month = { y, m };
      resetLedgerForm();
      $("fAmount").blur();
    } catch {
      msg("沒有存成功，手機空間可能不足。請再試一次。", true);
    } finally { $("submit").disabled = false; }
  });

  function renderLedger() {
    $("monthLabel").textContent = `${L.month.y} 年 ${L.month.m} 月`;
    const mk = monthKey();
    const rows = S.tx.filter((r) => (r.date || "").startsWith(mk));
    let tin = 0, tout = 0;
    const byCat = {};
    for (const r of rows) {
      if (r.type === "in") tin += r.amount;
      else if (r.type === "out") { tout += r.amount; byCat[r.category] = (byCat[r.category] || 0) + r.amount; }
    }
    $("tOut").textContent = fmt(tout);
    $("tIn").textContent = fmt(tin);
    const bal = tin - tout;
    $("tBal").textContent = fmt(bal);
    $("tBal").style.color = bal < 0 ? "var(--out)" : "var(--ink)";

    // list
    const list = $("list");
    list.innerHTML = "";
    if (!rows.length) {
      list.append(h("div", { class: "empty-state" },
        h("strong", { text: `${L.month.y} 年 ${L.month.m} 月還沒有紀錄` }),
        h("span", { text: "在上方輸入金額，按「記一筆」就會出現在這裡。點一筆紀錄可以編輯或刪除。" })));
    } else {
      const groups = {};
      rows.slice().sort((a, b) => sortByDate(b, a)).forEach((r) => (groups[r.date] ||= []).push(r));
      for (const d of Object.keys(groups).sort().reverse()) {
        const items = groups[d];
        const dayOut = items.filter((r) => r.type === "out").reduce((s, r) => s + r.amount, 0);
        const box = h("div", { class: "day" }, h("div", { class: "day-h" }, h("span", { text: dayLabel(d) }), h("span", { class: "num", text: dayOut ? "支出 " + fmt(dayOut) : "" })));
        for (const r of items) {
          const isX = r.type === "transfer";
          const it = h("div", { class: "item" + (r.id === L.openId ? " open" : "") + (r.id === L.editingId ? " editing" : ""), dataset: { id: r.id } },
            h("span", { class: "tag" + (isX ? " xfer" : ""), text: isX ? "轉帳" : r.category }),
            h("span", { class: "note" + (r.note ? "" : " empty") },
              h("span", { class: "main", text: r.note || (isX ? `${accName(r.account)} → ${accName(r.toAccount)}` : "—") }),
              h("span", { class: "meta", text: isX ? (r.note ? `${accName(r.account)} → ${accName(r.toAccount)}` : "") : accName(r.account) })),
            h("span", { class: "amount num " + (isX ? "xfer" : r.type), text: (isX ? "" : r.type === "in" ? "+" : "−") + "NT$" + group(r.amount) }),
            h("span", { class: "acts" },
              h("button", { type: "button", dataset: { act: "edit" }, text: "編輯" }),
              h("button", { type: "button", class: L.pendingDel === r.id ? "danger" : "", dataset: { act: "del" }, text: L.pendingDel === r.id ? "確定刪除？" : "刪除" })));
          box.append(it);
        }
        list.append(box);
      }
    }

    // categories
    const cats = $("cats"); cats.innerHTML = "";
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (!entries.length) cats.append(h("p", { class: "small muted", text: "這個月還沒有支出。" }));
    else cats.append(...entries.map(([c, v]) => barRow(c, fmt(v), tout ? v / tout : 0)));

    // budget
    $("bSpent").textContent = fmt(tout);
    const meter = $("bMeter"), left = $("bLeft");
    if (S.budget > 0) {
      const p = tout / S.budget;
      meter.style.width = Math.min(p * 100, 100) + "%";
      meter.className = p > 1 ? "over" : p > 0.8 ? "warn" : "";
      const rest = S.budget - tout;
      left.textContent = rest >= 0 ? `剩 ${fmt(rest)} / ${fmt(S.budget)}` : `超支 ${fmt(-rest)}`;
      left.style.color = rest < 0 ? "var(--out)" : "";
    } else {
      meter.style.width = "0%"; meter.className = "";
      left.textContent = "尚未設定預算"; left.style.color = "";
    }
    if (document.activeElement !== $("bInput")) $("bInput").value = S.budget || "";
    renderBackupInfo();
  }

  function barRow(label, value, ratio) {
    return h("div", { class: "bar-row" },
      h("div", { class: "bar-top" }, h("span", { text: label }), h("span", {}, h("span", { class: "num", text: value }), " ", h("span", { class: "pct num", text: Math.round(ratio * 100) + "%" }))),
      h("div", { class: "bar" }, h("i", { style: `width:${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%` })));
  }

  $("list").addEventListener("click", async (e) => {
    const it = e.target.closest(".item"); if (!it) return;
    const id = it.dataset.id, r = S.tx.find((x) => x.id === id); if (!r) return;
    const btn = e.target.closest("button[data-act]");
    if (!btn) { L.openId = L.openId === id ? null : id; L.pendingDel = null; render(); return; }
    if (btn.dataset.act === "edit") {
      L.editingId = id; L.openId = null;
      setLedgerType(r.type, r.category);
      fillAccountSelects(r.account, r.toAccount);
      $("fAmount").value = r.amount; $("fDate").value = r.date; $("fNote").value = r.note || "";
      $("editHint").hidden = false; $("submit").textContent = "儲存修改"; msg("");
      render();
      $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (btn.dataset.act === "del") {
      if (L.pendingDel !== id) {
        L.pendingDel = id; render();
        setTimeout(() => { if (L.pendingDel === id) { L.pendingDel = null; render(); } }, 3000);
        return;
      }
      L.pendingDel = null;
      try {
        await remove("tx", id);
        if (L.editingId === id) resetLedgerForm();
        L.openId = null; render(); msg("已刪除一筆。");
      } catch { msg("刪除失敗，請再試一次。", true); }
    }
  });

  $("prev").onclick = () => { L.month.m--; if (L.month.m < 1) { L.month.m = 12; L.month.y--; } L.openId = null; render(); };
  $("next").onclick = () => { L.month.m++; if (L.month.m > 12) { L.month.m = 1; L.month.y++; } L.openId = null; render(); };
  $("monthLabel").onclick = () => { const d = new Date(); L.month = { y: d.getFullYear(), m: d.getMonth() + 1 }; render(); };

  $("bSave").onclick = async () => {
    const v = Math.max(0, Math.round(num($("bInput").value) || 0));
    try {
      await store.setSetting("budget", v);
      S.budget = v; $("bInput").blur(); render();
      msg(v ? `預算設為每月 ${fmt(v)}。` : "已清除預算。");
    } catch { msg("預算沒有存成功。", true); }
  };

  /* =====================================================================
     資產 (assets)
     ===================================================================== */
  function renderAssets() {
    const v = $("view-assets"); v.innerHTML = "";
    const bal = accountBalances();
    const accs = accountsSorted();
    const cash = accs.reduce((s, a) => s + (bal[a.id] || 0), 0);
    const ps = portfolioSummary(portfolio());
    const stock = Math.round(ps.mv);
    const total = cash + stock;

    v.append(h("section", { class: "hero" },
      h("span", { class: "label", text: "總資產" }),
      h("span", { class: "big num", text: fmt(total) }),
      h("div", { class: "split" },
        h("span", {}, "現金與存款 ", h("b", { class: "num", text: fmt(cash) })),
        h("span", {}, "股票市值 ", h("b", { class: "num", text: fmt(stock) }))),
      ps.missing ? h("span", { class: "muted", text: `有 ${ps.missing} 檔股票還沒輸入現價，暫時以成本計算市值。` }) : null));

    if (accs.length && accs.every((a) => !a.opening) && !S.tx.length && !S.trades.length) {
      v.append(h("div", { class: "banner" }, h("span", { text: "第一次使用：點下面每個帳戶，輸入它現在的餘額，總資產就會正確。" })));
    }

    // accounts
    const rows = h("div", { class: "rows" });
    for (const a of accs) {
      const b = bal[a.id] || 0;
      rows.append(h("button", { type: "button", class: "rowbtn", onclick: () => accountSheet(a) },
        h("span", {}, h("span", { class: "name", text: a.name }), h("span", { class: "pill", text: ACCOUNT_KINDS[a.kind] || "其他" })),
        h("span", { class: "right" }, h("span", { class: "num", style: b < 0 ? "color:var(--out)" : "", text: fmt(b) }))));
    }
    rows.append(h("button", { type: "button", class: "rowbtn", onclick: () => setTab("stocks") },
      h("span", {}, h("span", { class: "name", text: "股票" }), h("span", { class: "pill", text: `${ps.held.length} 檔` })),
      h("span", { class: "right" }, h("span", { class: "num", text: fmt(stock) }),
        ps.held.length ? h("span", { class: "meta num " + plClass(ps.unreal), text: "未實現 " + fmtSigned(ps.unreal) }) : null)));
    v.append(h("div", { class: "section-head" }, h("h2", { text: "帳戶" }),
      h("button", { type: "button", class: "ghost", text: "＋ 新增帳戶", onclick: () => accountSheet(null) })), rows);

    // composition
    const parts = accs.map((a) => [a.name, Math.max(0, bal[a.id] || 0)]).concat([["股票", Math.max(0, stock)]]).filter(([, x]) => x > 0);
    const pos = parts.reduce((s, [, x]) => s + x, 0);
    if (pos > 0) {
      v.append(h("section", { class: "card" }, h("h2", { text: "資產組成" }),
        h("div", { class: "bars accent" }, parts.sort((a, b) => b[1] - a[1]).map(([n, x]) => barRow(n, fmt(x), x / pos)))));
    }

    renderHistory(v);
    v.append(h("p", { class: "small muted", text: "帳戶餘額 = 你輸入的起始餘額 + 收入 − 支出 ± 轉帳 ± 股票交割與股利。如果跟銀行 App 對不上，點那個帳戶，輸入目前實際餘額就會校正。" }));
  }

  /* ---------- 資產變化: month-end / year-end total assets ---------- */
  const HIST = { mode: "month", sel: null };
  try { if (localStorage.getItem("histMode") === "year") HIST.mode = "year"; } catch {}

  /** Cash + stock value as of the end of `date`. Stocks are valued at cost because past prices are unknown. */
  function estimateAt(date) {
    let cash = S.accounts.reduce((s, a) => s + (Number(a.opening) || 0), 0);
    const ids = new Set(S.accounts.map((a) => a.id));
    for (const r of S.tx) {
      if (r.date > date) continue;
      if (r.type === "in" && ids.has(r.account)) cash += r.amount;
      else if (r.type === "out" && ids.has(r.account)) cash -= r.amount;
      else if (r.type === "transfer") { if (ids.has(r.account)) cash -= r.amount; if (ids.has(r.toAccount)) cash += r.amount; }
    }
    for (const t of S.trades) if (t.date <= date && t.account && ids.has(t.account)) cash += tradeCash(t);
    const stock = portfolio(null, date).reduce((s, p) => s + (p.shares > 0 ? p.cost : 0), 0);
    return { cash: Math.round(cash), stock: Math.round(stock), total: Math.round(cash + stock) };
  }

  function liveTotals() {
    const bal = accountBalances();
    const cash = S.accounts.reduce((s, a) => s + (bal[a.id] || 0), 0);
    const stock = Math.round(portfolioSummary(portfolio()).mv);
    return { cash, stock, total: cash + stock };
  }

  /** Save today's total assets once a day (overwritten while the day goes on). */
  let snapTimer;
  function scheduleSnapshot() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(async () => {
      if (!S.tx.length && !S.trades.length && S.accounts.every((a) => !a.opening)) return;
      const t = liveTotals(), id = today();
      const old = S.snaps.find((x) => x.id === id);
      if (old && old.total === t.total && old.cash === t.cash && old.stock === t.stock) return;
      await save("snaps", { id, ...t, at: new Date().toISOString() }).catch(() => {});
    }, 1500);
  }

  function lastDay(y, m) { return dateStr(new Date(y, m, 0)); }

  /** Periods from the first record to now, each with its closing value and flows. */
  function assetHistory(mode) {
    const dates = [...S.tx.map((r) => r.date), ...S.trades.map((t) => t.date), ...S.snaps.map((x) => x.id)].filter(isDate).sort();
    const now = today();
    const first = dates[0] || now;
    const periods = [];
    let y = +first.slice(0, 4), m = mode === "month" ? +first.slice(5, 7) : 1;
    const endY = +now.slice(0, 4), endM = +now.slice(5, 7);
    while (y < endY || (y === endY && (mode === "year" || m <= endM))) {
      const start = mode === "month" ? `${y}-${pad(m)}-01` : `${y}-01-01`;
      const end = mode === "month" ? lastDay(y, m) : `${y}-12-31`;
      periods.push({ key: mode === "month" ? `${y}-${pad(m)}` : String(y), y, m, start, end: end > now ? now : end, current: end >= now });
      if (mode === "month") { m++; if (m > 12) { m = 1; y++; } } else y++;
    }
    const snaps = S.snaps.slice().sort((a, b) => a.id.localeCompare(b.id));
    let prev = null;
    for (const p of periods) {
      const snap = [...snaps].reverse().find((x) => x.id >= p.start && x.id <= p.end);
      if (p.current) { Object.assign(p, liveTotals()); p.kind = "live"; }
      else if (snap) { Object.assign(p, { cash: snap.cash, stock: snap.stock, total: snap.total }); p.kind = "snap"; p.asOf = snap.id; }
      else { Object.assign(p, estimateAt(p.end)); p.kind = "est"; }
      p.income = 0; p.expense = 0;
      for (const r of S.tx) if (r.date >= p.start && r.date <= p.end) { if (r.type === "in") p.income += r.amount; else if (r.type === "out") p.expense += r.amount; }
      const before = prev ? prev.total : (() => { const d = new Date(p.start + "T00:00:00"); d.setDate(d.getDate() - 1); return estimateAt(dateStr(d)).total; })();
      p.change = p.total - before;
      p.pct = before > 0 ? p.change / before : null;
      p.other = p.change - (p.income - p.expense);
      prev = p;
    }
    return periods;
  }

  function compactTwd(n) {
    const a = Math.abs(n), sign = n < 0 ? "−" : "";
    if (a >= 1e8) return sign + +(a / 1e8).toFixed(a >= 1e9 ? 0 : 1) + "億";
    if (a >= 1e4) return sign + +(a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + "萬";
    return sign + Math.round(a).toLocaleString("en-US");
  }
  function niceStep(span, count) {
    const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  /** Single-series column chart. items: [{key, label, value, faded}] */
  function columnChart(items, selKey, onPick, aria) {
    const NS = "http://www.w3.org/2000/svg";
    const s = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
    const W = 360, H = 200, L = 44, R = 8, T = 22, B = 24;
    const vals = items.map((p) => p.value);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo, 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const yOf = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "hist-chart", role: "img", "aria-label": aria });
    for (let v = lo; v <= hi + step / 2; v += step) {
      const y = yOf(v);
      svg.append(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: v === 0 ? "axis" : "grid" }));
      const t = s("text", { x: L - 6, y: y + 3.5, "text-anchor": "end", class: "tick" }); t.textContent = compactTwd(v); svg.append(t);
    }
    const n = items.length, slot = (W - L - R) / Math.max(n, 1), bw = Math.max(4, Math.min(28, slot - 4));
    const labelEvery = n > 12 ? Math.ceil(n / 12) : 1;
    items.forEach((p, i) => {
      const cx = L + slot * (i + 0.5), y0 = yOf(0), y1 = yOf(p.value);
      const top = Math.min(y0, y1), hgt = Math.abs(y1 - y0), up = p.value >= 0;
      const sel = p.key === selKey;
      if (hgt >= 0.5) {
        const r = Math.min(4, bw / 2, hgt), x = cx - bw / 2;
        // rounded on the data end, square on the baseline
        const d = up
          ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
          : `M${x},${y0} V${top + hgt - r} Q${x},${top + hgt} ${x + r},${top + hgt} H${x + bw - r} Q${x + bw},${top + hgt} ${x + bw},${top + hgt - r} V${y0} Z`;
        svg.append(s("path", { d, class: "bar-mark" + (p.faded ? " est" : "") + (sel ? " sel" : "") }));
      }
      if (sel) { const t = s("text", { x: cx, y: up ? top - 6 : top + hgt + 13, "text-anchor": "middle", class: "val" }); t.textContent = compactTwd(p.value); svg.append(t); }
      if (i % labelEvery === 0 || sel) {
        const t = s("text", { x: cx, y: H - 7, "text-anchor": "middle", class: "tick" + (sel ? " on" : "") });
        t.textContent = p.label; svg.append(t);
      }
      const hit = s("rect", { x: L + slot * i, y: 0, width: slot, height: H, class: "hit", tabindex: "0", role: "button", "aria-label": `${p.label} ${fmt(p.value)}` });
      hit.addEventListener("click", () => onPick(p.key));
      hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(p.key); } });
      svg.append(hit);
    });
    return svg;
  }

  function historyChart(periods, selKey, onPick) {
    return columnChart(periods.map((p) => ({
      key: p.key, value: p.total, faded: p.kind === "est",
      label: HIST.mode === "month" ? (p.m === 1 ? `${String(p.y).slice(2)}年` : `${p.m}月`) : String(p.y),
    })), selKey, onPick, "總資產變化長條圖");
  }

  function renderHistory(container) {
    const all = assetHistory(HIST.mode);
    const shown = HIST.mode === "month" ? all.slice(-12) : all;
    if (!shown.some((p) => p.key === HIST.sel)) HIST.sel = shown[shown.length - 1]?.key;
    const p = all.find((x) => x.key === HIST.sel);
    const label = (q) => (HIST.mode === "month" ? `${q.y} 年 ${q.m} 月` : `${q.y} 年`);
    const seg = h("div", { class: "seg", role: "group", "aria-label": "期間" },
      [["month", "按月"], ["year", "按年"]].map(([k, t]) => h("button", { type: "button", "aria-pressed": String(HIST.mode === k), text: t,
        onclick: () => { HIST.mode = k; HIST.sel = null; try { localStorage.setItem("histMode", k); } catch {} render(); } })));
    const pick = (key) => { HIST.sel = key; render(); };
    const detail = !p ? null : h("div", { class: "hist-detail" },
      h("div", { class: "hist-head" },
        h("div", {}, h("div", { class: "muted", text: label(p) + (p.kind === "live" ? "（到今天）" : p.kind === "est" ? "（估算）" : "") }),
          h("div", { class: "num", style: "font-size:24px;font-weight:600", text: fmt(p.total) })),
        h("div", { class: "num " + plClass(p.change), style: "text-align:right;font-weight:600" }, fmtSigned(p.change),
          h("div", { class: "small", text: p.pct == null ? "" : fmtPct(p.pct) }))),
      h("div", { class: "kv" },
        h("div", {}, h("span", { text: "收入" }), h("b", { text: fmt(p.income) })),
        h("div", {}, h("span", { text: "支出" }), h("b", { text: p.expense ? "−" + fmt(p.expense) : fmt(0) })),
        h("div", {}, h("span", { text: "收支結餘" }), h("b", { class: plClass(p.income - p.expense), text: fmtSigned(p.income - p.expense) })),
        h("div", {}, h("span", { text: "投資與其他" }), h("b", { class: plClass(p.other), text: fmtSigned(p.other) }))),
      h("div", { class: "kv" },
        h("div", {}, h("span", { text: "期末現金與存款" }), h("b", { text: fmt(p.cash) })),
        h("div", {}, h("span", { text: p.kind === "est" ? "期末股票（成本）" : "期末股票市值" }), h("b", { text: fmt(p.stock) }))),
      p.kind === "snap" && p.asOf !== p.end ? h("p", { class: "small muted", text: `這期的數字是 ${shortDate(p.asOf)} 記錄的。` }) : null);

    const table = h("div", { class: "rows" }, all.slice().reverse().slice(0, HIST.mode === "month" ? 12 : 50).map((q) =>
      h("button", { type: "button", class: "rowbtn" + (q.key === HIST.sel ? " picked" : ""), onclick: () => pick(q.key) },
        h("span", {}, h("span", { class: "name", text: label(q) }), q.kind === "est" ? h("span", { class: "pill", text: "估算" }) : q.kind === "live" ? h("span", { class: "pill soon", text: "本期" }) : null),
        h("span", { class: "right" }, h("span", { class: "num", text: fmt(q.total) }), h("span", { class: "meta num " + plClass(q.change), text: fmtSigned(q.change) })))));

    container.append(
      h("div", { class: "section-head" }, h("h2", { text: "資產變化" }), seg),
      h("section", { class: "card" },
        all.length < 2 && all[0]?.kind === "live"
          ? h("p", { class: "small muted", text: "這是第一個月。App 每天會自動記錄一次總資產，下個月起就能比較每月變化。" })
          : null,
        h("div", { class: "hist-wrap" }, historyChart(shown, HIST.sel, pick)),
        shown.some((q) => q.kind === "est") ? h("p", { class: "small muted", text: "淺色長條是估算：那時還沒有每日紀錄，現金依記帳倒推，股票以成本計算。" }) : null,
        detail),
      table,
      h("p", { class: "small muted", text: "「投資與其他」= 總資產變化 − 收支結餘，主要是股價漲跌、股利，以及你手動校正帳戶餘額的差額。" }));
  }

  function accountSheet(a) {
    const bal = accountBalances();
    const current = a ? bal[a.id] || 0 : 0;
    const name = h("input", { id: "aName", type: "text", maxlength: "20", value: a ? a.name : "", placeholder: "例如：台新 Richart、LINE Pay" });
    const kind = h("select", { id: "aKind" }, options(Object.entries(ACCOUNT_KINDS), a ? a.kind : "bank"));
    const balance = h("input", { id: "aBal", type: "number", inputmode: "decimal", step: "1", value: a ? current : "", placeholder: "0" });
    const m = h("div", { class: "msg" });
    const saveBtn = h("button", { type: "button", class: "primary block", text: a ? "儲存" : "新增帳戶" });
    saveBtn.onclick = async () => {
      const n = name.value.trim();
      if (!n) { m.textContent = "請輸入帳戶名稱。"; m.classList.add("err"); return; }
      const target = Math.round(num(balance.value) || 0);
      try {
        if (a) {
          const opening = (Number(a.opening) || 0) + (target - current);
          await save("accounts", { ...a, name: n, kind: kind.value, opening });
          toast(target !== current ? `已把 ${n} 校正為 ${fmt(target)}` : "已儲存");
        } else {
          const order = Math.max(-1, ...S.accounts.map((x) => x.order ?? 0)) + 1;
          await save("accounts", { id: newId(), name: n, kind: kind.value, opening: target, order, createdAt: new Date().toISOString() });
          toast(`已新增 ${n}`);
        }
        closeSheet(); fillAccountSelects(); render();
      } catch { m.textContent = "沒有存成功，請再試一次。"; m.classList.add("err"); }
    };
    const body = [
      field("帳戶名稱", name),
      field("類型", kind),
      field(a ? "目前實際餘額 (NT$)" : "目前餘額 (NT$)", balance, a ? "改這個數字，會自動調整起始餘額，讓帳戶跟實際金額一致。" : "這個帳戶現在有多少錢。"),
      saveBtn, m,
    ];
    if (a) {
      const used = S.tx.filter((r) => r.account === a.id || r.toAccount === a.id).length + S.trades.filter((t) => t.account === a.id).length;
      body.push(h("hr"));
      if (used) body.push(h("p", { class: "small muted", text: `這個帳戶有 ${used} 筆紀錄，所以不能刪除。要刪除的話，請先把那些紀錄改到別的帳戶。` }));
      else if (S.accounts.length <= 1) body.push(h("p", { class: "small muted", text: "至少要保留一個帳戶。" }));
      else body.push(armDelete(h("button", { type: "button", class: "ghost", text: "刪除帳戶" }), "刪除帳戶", async () => {
        await remove("accounts", a.id); closeSheet(); fillAccountSelects(); render(); toast(`已刪除 ${a.name}`);
      }));
    }
    openSheet(a ? a.name : "新增帳戶", body);
  }

  /* =====================================================================
     股票 (stocks)
     ===================================================================== */
  /* =====================================================================
     收入 (income): fixed monthly income checklist + yearly analysis
     ===================================================================== */
  const INC = { year: new Date().getFullYear(), sel: null };

  const monthOf = (d) => d.slice(0, 7);
  const sourceDate = (src, mk) => {
    const [y, m] = mk.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${mk}-${pad(Math.min(src.day || 1, last))}`;
  };

  /** Income records in month mk that belong to a fixed source. Manual records without a link count when the category is unique to that source. */
  function receivedFor(src, mk) {
    const sameCat = S.incomeSources.filter((x) => x.category === src.category).length === 1;
    return S.tx.filter((r) => r.type === "in" && r.date.startsWith(mk) && (r.sourceId === src.id || (!r.sourceId && sameCat && r.category === src.category)));
  }

  function incomeByMonth(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const mk = `${year}-${pad(m)}`;
      const rows = S.tx.filter((r) => r.date.startsWith(mk));
      const income = rows.filter((r) => r.type === "in").reduce((s, r) => s + r.amount, 0);
      const expense = rows.filter((r) => r.type === "out").reduce((s, r) => s + r.amount, 0);
      const byCat = {};
      rows.filter((r) => r.type === "in").forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
      months.push({ key: mk, m, income, expense, saved: income - expense, rate: income > 0 ? (income - expense) / income : null, byCat });
    }
    return months;
  }

  function renderIncome() {
    const v = $("view-income"); v.innerHTML = "";
    const nowMk = monthOf(today()), curY = +nowMk.slice(0, 4);
    const months = incomeByMonth(INC.year);
    const lastM = INC.year === curY ? +nowMk.slice(5, 7) : INC.year < curY ? 12 : 0;
    const shown = months.slice(0, Math.max(lastM, 1));
    if (!shown.some((x) => x.key === INC.sel)) INC.sel = INC.year === curY ? nowMk : shown[shown.length - 1].key;
    const sel = months.find((x) => x.key === INC.sel);

    // year nav
    v.append(h("div", { class: "month" },
      h("button", { type: "button", class: "icon-btn", "aria-label": "上一年", text: "‹", onclick: () => { INC.year--; INC.sel = null; render(); } }),
      h("button", { type: "button", class: "month-label num", text: `${INC.year} 年`, onclick: () => { INC.year = curY; INC.sel = null; render(); } }),
      h("button", { type: "button", class: "icon-btn", "aria-label": "下一年", text: "›", disabled: INC.year >= curY, onclick: () => { if (INC.year < curY) { INC.year++; INC.sel = null; render(); } } })));

    // headline
    const total = months.reduce((s, x) => s + x.income, 0);
    const spent = months.reduce((s, x) => s + x.expense, 0);
    // Average over months since the first record (a ledger started in September shouldn't divide by 12).
    const firstMk = S.tx.map((r) => r.date).filter(isDate).sort()[0]?.slice(0, 7);
    const startM = firstMk && firstMk.startsWith(String(INC.year)) ? +firstMk.slice(5, 7) : 1;
    const avgMonths = Math.max(1, lastM - startM + 1);
    const avg = lastM ? total / avgMonths : 0;
    const prevSame = incomeByMonth(INC.year - 1).slice(0, lastM).reduce((s, x) => s + x.income, 0);
    v.append(h("section", { class: "hero" },
      h("span", { class: "label", text: INC.year === curY ? `${INC.year} 年至今收入` : `${INC.year} 年總收入` }),
      h("span", { class: "big num", style: "color:var(--in)", text: fmt(total) }),
      h("div", { class: "split" },
        h("span", {}, "月平均 ", h("b", { class: "num", text: fmt(avg) })),
        h("span", {}, "存下 ", h("b", { class: "num", text: fmtSigned(total - spent) })),
        total > 0 ? h("span", {}, "儲蓄率 ", h("b", { class: "num", text: Math.round(((total - spent) / total) * 100) + "%" })) : null),
      prevSame > 0 ? h("span", { class: "muted", text: `比去年同期 ${fmtSigned(total - prevSame)}（${fmtPct((total - prevSame) / prevSame)}）` }) : null));

    // fixed income checklist for the selected month
    const [sy, sm] = INC.sel.split("-").map(Number);
    const checklist = h("section", { class: "card" },
      h("div", { class: "section-head" }, h("h2", { text: `${sm} 月固定收入` }),
        h("button", { type: "button", class: "ghost", text: "＋ 新增", onclick: () => sourceSheet(null) })));
    if (!S.incomeSources.length) {
      checklist.append(h("p", { class: "small muted", text: "把每個月固定會有的收入設定好，App 會提醒你哪些已入帳、哪些還沒，點一下就能記帳。" }),
        h("div", { class: "btns" },
          h("button", { type: "button", class: "ghost", text: "設定薪水", onclick: () => sourceSheet(null, { name: "薪水", category: "薪資", day: 5 }) }),
          h("button", { type: "button", class: "ghost", text: "設定零用錢", onclick: () => sourceSheet(null, { name: "零用錢", category: "零用錢", day: 1 }) })));
    } else {
      const rows = h("div", { class: "rows" });
      for (const src of S.incomeSources) {
        const got = receivedFor(src, INC.sel);
        const sum = got.reduce((s, r) => s + r.amount, 0);
        const due = sourceDate(src, INC.sel);
        const overdue = !got.length && today() > due;
        const future = INC.sel > nowMk;
        rows.append(h("div", { class: "rowbtn src-row" },
          h("button", { type: "button", class: "src-name", onclick: () => sourceSheet(src) },
            h("span", { class: "name" }, got.length ? h("span", { class: "check on", text: "✓" }) : h("span", { class: "check", text: "" }), src.name),
            h("span", { class: "meta", text: got.length
              ? `${got.map((r) => shortDate(r.date)).join("、")} 入帳 · ${accName(got[0].account)}`
              : `每月 ${src.day} 日 · ${src.amount ? fmt(src.amount) : "金額不固定"} · ${accName(src.account)}` })),
          got.length
            ? h("span", { class: "right" }, h("span", { class: "num", style: "color:var(--in)", text: "+" + fmt(sum) }),
                src.amount && sum !== src.amount ? h("span", { class: "meta num", text: `設定 ${fmt(src.amount)}` }) : null)
            : future ? h("span", { class: "meta", text: "還沒到" })
            : h("span", { class: "right" },
                h("button", { type: "button", class: "primary small-btn", text: "記入帳", onclick: () => receiveSheet(src, INC.sel) }),
                overdue ? h("span", { class: "meta", style: "color:var(--warn)", text: `已過 ${src.day} 日` }) : null)));
      }
      checklist.append(rows);
    }
    v.append(checklist);

    // monthly chart
    v.append(h("section", { class: "card" },
      h("h2", { text: "每月收入" }),
      h("div", { class: "hist-wrap" }, columnChart(shown.map((x) => ({ key: x.key, label: `${x.m}月`, value: x.income })), INC.sel, (k) => { INC.sel = k; render(); }, "每月收入長條圖")),
      sel ? h("div", { class: "hist-detail" },
        h("div", { class: "hist-head" },
          h("div", {}, h("div", { class: "muted", text: `${sy} 年 ${sm} 月收入` }), h("div", { class: "num", style: "font-size:24px;font-weight:600;color:var(--in)", text: fmt(sel.income) })),
          h("div", { style: "text-align:right" }, h("div", { class: "muted", text: "存下" }),
            h("div", { class: "num " + plClass(sel.saved), style: "font-weight:600", text: fmtSigned(sel.saved) }),
            h("div", { class: "small muted", text: sel.rate == null ? "" : `儲蓄率 ${Math.round(sel.rate * 100)}%` }))),
        h("div", { class: "kv" },
          Object.keys(sel.byCat).length
            ? Object.entries(sel.byCat).sort((a, b) => b[1] - a[1]).map(([c, x]) => h("div", {}, h("span", { text: c }), h("b", { text: fmt(x) })))
            : h("div", {}, h("span", { text: "收入" }), h("b", { text: fmt(0) })),
          h("div", {}, h("span", { text: "支出" }), h("b", { text: sel.expense ? "−" + fmt(sel.expense) : fmt(0) })))) : null));

    // yearly composition
    const yearCat = {};
    months.forEach((x) => { for (const [c, a] of Object.entries(x.byCat)) yearCat[c] = (yearCat[c] || 0) + a; });
    const cats = Object.entries(yearCat).sort((a, b) => b[1] - a[1]);
    if (cats.length) v.append(h("section", { class: "card" }, h("h2", { text: `${INC.year} 年收入來源` }),
      h("div", { class: "bars accent" }, cats.map(([c, a]) => barRow(c, fmt(a), total ? a / total : 0)))));

    // month list
    v.append(h("h2", { text: "每月明細" }), h("div", { class: "rows" }, shown.slice().reverse().map((x) =>
      h("button", { type: "button", class: "rowbtn" + (x.key === INC.sel ? " picked" : ""), onclick: () => { INC.sel = x.key; render(); window.scrollTo({ top: 0, behavior: "smooth" }); } },
        h("span", {}, h("span", { class: "name", text: `${x.m} 月` }), h("span", { class: "meta", text: Object.entries(x.byCat).map(([c, a]) => `${c} ${compactTwd(a)}`).join(" · ") || "沒有收入" })),
        h("span", { class: "right" }, h("span", { class: "num", style: "color:var(--in)", text: fmt(x.income) }),
          h("span", { class: "meta num " + plClass(x.saved), text: `存下 ${fmtSigned(x.saved)}` }))))));
    v.append(h("p", { class: "small muted", text: "收入專區統計的是「記帳」裡所有的收入。存下 = 收入 − 支出（不含轉帳和股票買賣）。" }));
  }

  function sourceSheet(src, preset = {}) {
    const d = src || { name: "", category: "薪資", amount: 0, day: 5, account: (accountsSorted().find((a) => a.kind === "bank") || accountsSorted()[0] || {}).id, ...preset };
    if (!src && preset.category === "零用錢") d.account = (accountsSorted().find((a) => a.kind === "cash") || accountsSorted()[0] || {}).id;
    const name = h("input", { id: "isName", type: "text", maxlength: "20", value: d.name, placeholder: "例如：薪水、零用錢、家教" });
    const cat = h("select", { id: "isCat" }, options(CATS.in.map((c) => [c, c]), d.category));
    const amount = h("input", { id: "isAmt", type: "number", inputmode: "numeric", min: "0", step: "1", value: d.amount || "", placeholder: "不固定可以留空" });
    const day = h("input", { id: "isDay", type: "number", inputmode: "numeric", min: "1", max: "31", step: "1", value: d.day || 1 });
    const acc = h("select", { id: "isAcc" }, options(accountsSorted().map((a) => [a.id, a.name]), d.account));
    const m = h("div", { class: "msg" });
    const btn = h("button", { type: "button", class: "primary block", text: src ? "儲存" : "新增" });
    btn.onclick = async () => {
      const err = (t) => { m.textContent = t; m.classList.add("err"); };
      const n = name.value.trim(), dd = Math.round(num(day.value));
      if (!n) return err("請輸入名稱。");
      if (!(dd >= 1 && dd <= 31)) return err("入帳日請填 1 到 31。");
      const rec = { id: src ? src.id : newId(), name: n, category: cat.value, amount: Math.max(0, Math.round(num(amount.value) || 0)), day: dd, account: acc.value };
      const list = src ? S.incomeSources.map((x) => (x.id === src.id ? rec : x)) : [...S.incomeSources, rec];
      try { await store.setSetting("incomeSources", list); S.incomeSources = list; closeSheet(); render(); toast(src ? "已儲存" : `已新增「${n}」`); }
      catch { err("沒有存成功，請再試一次。"); }
    };
    const body = [
      field("名稱", name),
      h("div", { class: "row-2" }, field("分類", cat), field("每月金額 (NT$)", amount)),
      h("div", { class: "row-2" }, field("每月幾號入帳", day, "月底沒有這天時，算當月最後一天"), field("存入帳戶", acc)),
      btn, m,
    ];
    if (src) body.push(h("hr"), armDelete(h("button", { type: "button", class: "ghost", text: "刪除這項固定收入" }), "刪除", async () => {
      const list = S.incomeSources.filter((x) => x.id !== src.id);
      await store.setSetting("incomeSources", list); S.incomeSources = list; closeSheet(); render(); toast("已刪除，過去的收入紀錄不受影響");
    }));
    openSheet(src ? src.name : "新增固定收入", body);
  }

  function receiveSheet(src, mk) {
    const due = sourceDate(src, mk);
    const amount = h("input", { id: "rcAmt", type: "number", inputmode: "numeric", min: "0", step: "1", value: src.amount || "", placeholder: "0" });
    const date = h("input", { id: "rcDate", type: "date", value: mk === monthOf(today()) && today() < due ? today() : due });
    const acc = h("select", { id: "rcAcc" }, options(accountsSorted().map((a) => [a.id, a.name]), src.account));
    const note = h("input", { id: "rcNote", type: "text", maxlength: "80", value: src.name });
    const m = h("div", { class: "msg" });
    const btn = h("button", { type: "button", class: "primary block", text: "記入帳" });
    btn.onclick = async () => {
      const a = Math.round(num(amount.value));
      if (!(a > 0)) { m.textContent = "請輸入金額。"; m.classList.add("err"); return; }
      if (!isDate(date.value)) { m.textContent = "請選擇日期。"; m.classList.add("err"); return; }
      try {
        await save("tx", { id: newId(), type: "in", amount: a, date: date.value, category: src.category, account: acc.value, note: note.value.trim(), sourceId: src.id, createdAt: new Date().toISOString() });
        closeSheet(); render(); toast(`已記入 ${src.name} ${fmt(a)}`);
      } catch { m.textContent = "沒有存成功，請再試一次。"; m.classList.add("err"); }
    };
    openSheet(`${src.name}入帳`, [
      h("div", { class: "row-2" }, h("label", { class: "field amt" }, h("span", { text: "金額 (NT$)" }), amount), field("入帳日期", date)),
      field("存入帳戶", acc), field("備註", note), btn, m,
      h("p", { class: "small muted", text: "會記成「記帳」裡的一筆收入，帳戶餘額和總資產也會一起更新。" }),
    ]);
  }

  /* ---------- Live closing prices ----------
     1. data/prices.json, refreshed after each close by a GitHub Action (上市 + 上櫃)
     2. the same file straight from GitHub, in case the Pages copy lags behind
     3. 證交所 directly (上市 only), the freshest source for listed stocks */
  const PRICE_SOURCES = (() => {
    const list = [{ kind: "json", url: "data/prices.json" }];
    const host = location.hostname, seg = location.pathname.split("/").filter(Boolean)[0];
    if (host.endsWith(".github.io") && seg) list.push({ kind: "json", url: `https://raw.githubusercontent.com/${host.split(".")[0]}/${seg}/main/data/prices.json` });
    list.push({ kind: "twse", url: "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=csv" });
    return list;
  })();
  const SYNC_EVERY_MS = 20 * 60 * 1000;

  function rocToIso(s) {
    s = String(s).trim().replace(/\//g, "");
    if (/^20\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
    return `${parseInt(s.slice(0, -4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
  }
  function parseTwseCsv(text) {
    const out = {};
    for (const line of text.split(/\r?\n/).slice(1)) {
      const cells = [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2] ?? "").trim());
      if (cells.length < 9) continue;
      const code = cells[1], close = parseFloat(cells[8].replace(/,/g, ""));
      if (/^(\d{4}|00\d{2,4}[A-Z]?)$/.test(code) && close > 0) out[code] = [cells[2], close, rocToIso(cells[0]), "twse"];
    }
    return out;
  }
  async function fetchSource(src) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const sep = src.url.includes("?") ? "&" : "?";
      const r = await fetch(src.url + sep + "_=" + Date.now(), { cache: "no-store", signal: ctl.signal });
      if (!r.ok) throw new Error(r.status);
      if (src.kind === "twse") return parseTwseCsv(await r.text());
      const d = await r.json();
      return d && d.prices && typeof d.prices === "object" ? d.prices : {};
    } finally { clearTimeout(timer); }
  }

  /** Fetch every source, keep the newest close per code, and apply it to quotes. */
  async function syncPrices(force) {
    const ps = S.priceSync;
    if (ps.busy || (!force && Date.now() - ps.lastTry < SYNC_EVERY_MS)) return;
    if (navigator.onLine === false) { ps.error = true; if (S.tab === "stocks") render(); return; }
    ps.busy = true; ps.lastTry = Date.now();
    if (S.tab === "stocks") render();
    const results = await Promise.allSettled(PRICE_SOURCES.map(fetchSource));
    const market = { ...S.market };
    let got = 0;
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const [code, v] of Object.entries(r.value)) {
        if (!Array.isArray(v) || !(Number(v[1]) > 0) || !isDate(v[2])) continue;
        got++;
        if (!market[code] || v[2] >= market[code][2]) market[code] = [String(v[0] || ""), Number(v[1]), v[2], v[3] || ""];
      }
    }
    ps.busy = false;
    ps.error = got === 0;
    if (got) {
      S.market = market; S.marketAt = new Date().toISOString();
      await Promise.all([store.setSetting("market", market), store.setSetting("marketAt", S.marketAt)]).catch(() => {});
      await applyMarket();
    }
    render();
  }

  /** Copy the newest known close onto each held symbol's quote (a manual price stays until a close for that day or later arrives). */
  async function applyMarket() {
    const quotes = { ...S.quotes };
    let changed = 0;
    for (const sym of new Set(S.trades.map((t) => t.symbol))) {
      const m = S.market[sym]; if (!m) continue;
      const q = quotes[sym], qDate = q ? q.date || (q.at || "").slice(0, 10) : "";
      if (!q || m[2] >= qDate) {
        if (!q || q.price !== m[1] || q.date !== m[2] || !q.auto) { changed++; quotes[sym] = { price: m[1], at: S.marketAt || new Date().toISOString(), date: m[2], auto: true }; }
      }
    }
    if (changed) { S.quotes = quotes; await store.setSetting("quotes", quotes).catch(() => {}); }
  }
  window.addEventListener("online", () => syncPrices(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncPrices(false); });

  function priceStatus() {
    const ps = S.priceSync;
    if (ps.busy) return "正在更新股價…";
    const dates = Object.values(S.market).map((m) => m[2]).sort();
    const latest = dates[dates.length - 1];
    if (ps.error) return latest ? `無法連線，顯示 ${shortDate(latest)} 的收盤價` : "無法連線，請確認網路後再試";
    if (!latest) return "還沒有抓過股價";
    const mins = S.marketAt ? Math.round((Date.now() - new Date(S.marketAt)) / 60000) : null;
    const ago = mins == null ? "" : mins < 1 ? " · 剛剛更新" : mins < 60 ? ` · ${mins} 分鐘前更新` : "";
    return `最新收盤價：${shortDate(latest)}${ago}`;
  }

  function renderStocks() {
    const v = $("view-stocks"); v.innerHTML = "";
    const list = portfolio();
    const s = portfolioSummary(list);

    v.append(h("section", { class: "hero" },
      h("span", { class: "label", text: "未實現損益" }),
      h("span", { class: "big num " + plClass(s.unreal), text: fmtSigned(s.unreal) }),
      h("div", { class: "split" },
        h("span", {}, "報酬率 ", h("b", { class: "num " + plClass(s.unreal), text: s.invested ? fmtPct(s.ret) : "—" })),
        h("span", {}, "持有 ", h("b", { class: "num", text: `${s.held.length} 檔` }))),
      s.missing ? h("span", { class: "muted", text: `${s.missing} 檔抓不到股價，沒算進未實現損益。點持股可以手動輸入。` }) : null));

    v.append(h("section", { class: "totals two" },
      h("div", { class: "total" }, h("span", { class: "label", text: "投入成本" }), h("span", { class: "val num", text: fmt(s.invested) }), h("span", { class: "hint", text: "目前持股，含買進手續費" })),
      h("div", { class: "total" }, h("span", { class: "label", text: "目前市值" }), h("span", { class: "val num", text: fmt(s.mv) }), h("span", { class: "hint", text: "帳面價值 = 股數 × 現價" })),
      h("div", { class: "total" }, h("span", { class: "label", text: "已實現損益" }), h("span", { class: "val num " + plClass(s.realized), text: fmtSigned(s.realized) }), h("span", { class: "hint", text: "已賣出的部分" })),
      h("div", { class: "total" }, h("span", { class: "label", text: "累計股利" }), h("span", { class: "val num", text: fmt(s.dividends) }), h("span", { class: "hint", text: "現金股利" })),
      h("div", { class: "total wide" }, h("span", { class: "label", text: "總損益" }), h("span", { class: "val num " + plClass(s.unreal + s.realized + s.dividends), text: fmtSigned(s.unreal + s.realized + s.dividends) }), h("span", { class: "hint", text: "未實現 + 已實現 + 股利" }))));

    v.append(h("div", { class: "btns" },
      h("button", { type: "button", class: "primary", text: "＋ 新增交易", onclick: () => tradeSheet(null) }),
      h("button", { type: "button", class: "ghost", text: S.priceSync.busy ? "更新中…" : "更新股價", disabled: S.priceSync.busy, onclick: () => syncPrices(true) }),
      h("button", { type: "button", class: "ghost", text: "手續費設定", onclick: feeSheet })));
    v.append(h("p", { class: "small " + (S.priceSync.error ? "" : "muted"), style: S.priceSync.error ? "color:var(--out)" : "", text: priceStatus() }));

    v.append(h("h2", { text: "持股" }));
    if (!s.held.length) {
      v.append(h("div", { class: "empty-state" }, h("strong", { text: "還沒有持股" }),
        h("span", { text: "按「新增交易」輸入買進紀錄（代號、股數、成交價），這裡就會算出成本、市值和損益。" })));
    } else {
      const box = h("div", { class: "panel" });
      for (const p of s.held.sort((a, b) => (b.mv ?? b.cost) - (a.mv ?? a.cost))) {
        const stale = p.quoteDate && daysBetween(p.quoteDate, today()) > 7;
        const priceLabel = p.quoteDate ? `現價（${shortDate(p.quoteDate)}${p.quoteAuto ? " 收盤" : " 手動"}）` : "現價";
        box.append(h("button", { type: "button", class: "holding", onclick: () => holdingSheet(p.symbol) },
          h("div", { class: "h-top" },
            h("span", { class: "h-name" }, h("span", { class: "num", text: p.symbol }), p.name !== p.symbol ? p.name : ""),
            p.unreal == null
              ? h("span", { class: "h-pl" }, h("span", { class: "pill stale", text: "沒有股價" }))
              : h("span", { class: "h-pl num " + plClass(p.unreal) }, fmtSigned(p.unreal), h("small", { text: fmtPct(p.ret) }))),
          h("div", { class: "kv" },
            h("div", {}, h("span", { text: "股數" }), h("b", { text: fmtShares(p.shares) })),
            h("div", {}, h("span", { text: "均價" }), h("b", { text: fmtPrice(round2(p.avg)) })),
            h("div", {}, h("span", { text: stale ? priceLabel + "⚠︎" : priceLabel }), h("b", { text: fmtPrice(p.price) })),
            h("div", {}, h("span", { text: "市值" }), h("b", { text: p.mv == null ? "—" : fmt(p.mv) })))));
      }
      v.append(box);
    }

    const closed = list.filter((p) => p.shares === 0 && p.trades.some((t) => t.kind === "sell"));
    if (closed.length) {
      v.append(h("h2", { text: "已出清" }));
      v.append(h("div", { class: "rows" }, closed.map((p) => h("button", { type: "button", class: "rowbtn", onclick: () => holdingSheet(p.symbol) },
        h("span", {}, h("span", { class: "name" }, h("span", { class: "num", text: p.symbol + " " }), p.name !== p.symbol ? p.name : "")),
        h("span", { class: "right" }, h("span", { class: "num " + plClass(p.realized), text: fmtSigned(p.realized) }), h("span", { class: "meta", text: "已實現" }))))));
    }

    v.append(h("p", { class: "small muted", text: `未實現損益已扣掉預估的賣出手續費和證交稅（股票 0.3%，00 開頭的 ETF 0.1%），跟券商 App 的「預估損益」算法相同。顏色依台股習慣：紅色是賺、綠色是賠。現價用證交所、櫃買中心公布的收盤價（上市、上櫃都有），每天收盤後更新；盤中想看即時價，可以點持股手動輸入，收盤後會自動換回收盤價。` }));
  }

  function holdingSheet(symbol) {
    const p = portfolio().find((x) => x.symbol === symbol);
    if (!p) return;
    const price = h("input", { id: "qPrice", type: "number", inputmode: "decimal", step: "0.01", min: "0", value: p.price ?? "", placeholder: "例如 1085" });
    const m = h("div", { class: "msg" });
    const saveQ = h("button", { type: "button", class: "ghost", text: "更新現價" });
    saveQ.onclick = async () => {
      const x = num(price.value);
      if (!(x > 0)) { m.textContent = "請輸入大於 0 的價格。"; m.classList.add("err"); return; }
      S.quotes = { ...S.quotes, [symbol]: { price: x, at: new Date().toISOString(), date: today(), auto: false } };
      await store.setSetting("quotes", S.quotes);
      render(); holdingSheet(symbol); toast(`${symbol} 現價更新為 ${fmtPrice(x)}`);
    };
    const body = [];
    if (p.shares > 0) {
      body.push(h("div", { class: "inline-edit" }, price, saveQ), m);
      if (p.quoteAt) body.push(h("p", { class: "small muted", text: p.quoteAuto
        ? `${shortDate(p.quoteDate)} 收盤價，自動更新。盤中可以在上面輸入即時價，收盤後會換回收盤價。`
        : `手動輸入於 ${new Date(p.quoteAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })}，下次收盤價出來後會自動更新。` }));
      body.push(h("div", { class: "kv" },
        h("div", {}, h("span", { text: "股數" }), h("b", { text: fmtShares(p.shares) })),
        h("div", {}, h("span", { text: "均價" }), h("b", { text: fmtPrice(round2(p.avg)) })),
        h("div", {}, h("span", { text: "投入成本" }), h("b", { text: fmt(p.cost) })),
        h("div", {}, h("span", { text: "市值" }), h("b", { text: p.mv == null ? "—" : fmt(p.mv) })),
        h("div", {}, h("span", { text: "未實現損益" }), h("b", { class: p.unreal == null ? "" : plClass(p.unreal), text: p.unreal == null ? "—" : fmtSigned(p.unreal) })),
        h("div", {}, h("span", { text: "報酬率" }), h("b", { class: p.unreal == null ? "" : plClass(p.unreal), text: p.ret == null ? "—" : fmtPct(p.ret) })),
        h("div", {}, h("span", { text: "已實現" }), h("b", { class: plClass(p.realized), text: fmtSigned(p.realized) })),
        h("div", {}, h("span", { text: "股利" }), h("b", { text: fmt(p.dividends) }))));
      if (p.sellCost != null) body.push(h("p", { class: "small muted", text: `預估賣出成本 ${fmt(p.sellCost)}（手續費 + 證交稅），已從未實現損益扣除。` }));
    } else {
      body.push(h("p", { class: "small", text: `已全部賣出。已實現損益 ${fmtSigned(p.realized)}，股利 ${fmt(p.dividends)}。` }));
    }
    body.push(h("div", { class: "btns" },
      h("button", { type: "button", class: "primary", text: "＋ 這檔的交易", onclick: () => tradeSheet(null, { symbol: p.symbol, name: p.name }) })));
    body.push(h("hr"), h("h2", { text: "交易紀錄" }));
    const rows = h("div", { class: "rows" });
    for (const t of p.trades.slice().reverse()) {
      const desc = t.kind === "div" ? fmt(t.amount) : t.kind === "sdiv" ? `${fmtShares(t.shares)} 股` : `${fmtShares(t.shares)} 股 @ ${fmtPrice(t.price)}`;
      const cash = tradeCash(t);
      rows.append(h("button", { type: "button", class: "rowbtn", onclick: () => tradeSheet(t) },
        h("span", {}, h("span", { class: "name", text: `${TRADE_KINDS[t.kind]} · ${desc}` }),
          h("span", { class: "meta", text: `${t.date}${t.account ? " · " + accName(t.account) : ""}${t.note ? " · " + t.note : ""}` })),
        h("span", { class: "right" }, cash ? h("span", { class: "num", text: (cash > 0 ? "+" : "−") + "NT$" + group(Math.round(cash)) }) : h("span", { class: "meta", text: "—" }))));
    }
    body.push(rows, h("p", { class: "small muted", text: "點一筆交易可以修改或刪除。" }));
    openSheet(`${p.symbol} ${p.name !== p.symbol ? p.name : ""}`, body);
  }

  function tradeSheet(t, preset = {}) {
    const editing = !!t;
    let kind = t ? t.kind : preset.kind || "buy";
    let feeTouched = editing, taxTouched = editing;
    const symbols = portfolio();
    const accs = accountsSorted();
    const defAcc = (accs.find((a) => a.kind === "bank") || accs[0] || {}).id || "";

    const seg = h("div", { class: "seg", role: "group", "aria-label": "交易類型" },
      Object.entries(TRADE_KINDS).map(([k, label]) => h("button", { type: "button", dataset: { k }, "aria-pressed": String(k === kind), text: label })));
    const date = h("input", { id: "trDate", type: "date", value: t ? t.date : today() });
    const symbol = h("input", { id: "trSym", type: "text", inputmode: "text", autocapitalize: "characters", maxlength: "10", list: "symList", value: t ? t.symbol : preset.symbol || "", placeholder: "例如 2330" });
    const dl = h("datalist", { id: "symList" }, symbols.map((p) => h("option", { value: p.symbol, text: p.name })));
    const name = h("input", { id: "trName", type: "text", maxlength: "20", value: t ? t.name || "" : preset.name || "", placeholder: "例如 台積電" });
    const shares = h("input", { id: "trShares", type: "number", inputmode: "numeric", pattern: "[0-9]*", min: "0", step: "1", value: t && t.shares ? t.shares : "", placeholder: "例如 1000（一張）" });
    const price = h("input", { id: "trPrice", type: "number", inputmode: "decimal", min: "0", step: "0.01", value: t && t.price ? t.price : "", placeholder: "0.00" });
    const fee = h("input", { id: "trFee", type: "number", inputmode: "numeric", min: "0", step: "1", value: t ? t.fee ?? "" : "", placeholder: "自動計算" });
    const tax = h("input", { id: "trTax", type: "number", inputmode: "numeric", min: "0", step: "1", value: t ? t.tax ?? "" : "", placeholder: "自動計算" });
    const amount = h("input", { id: "trAmt", type: "number", inputmode: "numeric", min: "0", step: "1", value: t && t.amount ? t.amount : "", placeholder: "入帳金額" });
    const acc = h("select", { id: "trAcc" }, options([["", "不連動帳戶"], ...accs.map((a) => [a.id, a.name])], t ? t.account || "" : defAcc));
    const note = h("input", { id: "trNote", type: "text", maxlength: "60", value: t ? t.note || "" : "" });
    const calc = h("div", { class: "calc" });
    const m = h("div", { class: "msg" });

    const fShares = field("股數", shares, "一張 = 1000 股，零股就填實際股數");
    const fPrice = field("成交價", price);
    const fFee = field("手續費", fee);
    const fTax = field("證交稅", tax);
    const fAmt = field("股利金額 (NT$)", amount, "實際入帳金額（已扣二代健保補充保費和匯費）");
    const fAcc = field("交割帳戶", acc, "買進會從這個帳戶扣款，賣出和股利會入帳到這裡。");

    const closeHint = h("span", { class: "help" });
    symbol.addEventListener("input", () => {
      const code = symbol.value.trim().toUpperCase();
      const p = symbols.find((x) => x.symbol === code), mk = S.market[code];
      if (!name.dataset.typed) name.value = p ? p.name : mk ? mk[0] : "";
      closeHint.textContent = mk ? `${mk[0]} · ${shortDate(mk[2])} 收盤 ${fmtPrice(mk[1])}` : "";
      update();
    });
    name.addEventListener("input", () => { name.dataset.typed = name.value ? "1" : ""; });
    if (t || preset.name) name.dataset.typed = "1";
    fee.addEventListener("input", () => { feeTouched = fee.value !== ""; update(); });
    tax.addEventListener("input", () => { taxTouched = tax.value !== ""; update(); });
    shares.addEventListener("input", update);
    price.addEventListener("input", update);
    amount.addEventListener("input", update);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      kind = b.dataset.k;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === kind)));
      update();
    });

    function update() {
      const isTrade = kind === "buy" || kind === "sell";
      fPrice.hidden = !isTrade; fFee.hidden = !isTrade; fTax.hidden = kind !== "sell";
      fShares.hidden = kind === "div"; fAmt.hidden = kind !== "div"; fAcc.hidden = kind === "sdiv";
      fShares.querySelector("span").textContent = kind === "sdiv" ? "配發股數" : "股數";
      const n = num(shares.value), px = num(price.value), gross = n > 0 && px > 0 ? n * px : 0;
      if (isTrade && !feeTouched) fee.value = gross ? calcFee(gross) : "";
      if (kind === "sell" && !taxTouched) tax.value = gross ? Math.floor(gross * taxRate(symbol.value.trim().toUpperCase())) : "";
      calc.innerHTML = "";
      if (kind === "buy" && gross) calc.append(h("span", { text: "應付金額" }), h("b", { text: fmt(gross + (num(fee.value) || 0)) }));
      else if (kind === "sell" && gross) calc.append(h("span", { text: "實收金額" }), h("b", { text: fmt(gross - (num(fee.value) || 0) - (num(tax.value) || 0)) }));
      calc.hidden = !calc.childNodes.length;
    }

    const saveBtn = h("button", { type: "button", class: "primary block", text: editing ? "儲存修改" : "新增交易" });
    saveBtn.onclick = async () => {
      const err = (text) => { m.textContent = text; m.classList.add("err"); };
      const sym = symbol.value.trim().toUpperCase();
      if (!sym) return err("請輸入股票代號。");
      if (!isDate(date.value)) return err("請選擇日期。");
      const rec = { id: t ? t.id : newId(), kind, date: date.value, symbol: sym, name: name.value.trim() || sym, account: kind === "sdiv" ? null : acc.value || null, note: note.value.trim(), createdAt: t ? t.createdAt : new Date().toISOString() };
      if (kind === "div") {
        rec.amount = Math.round(num(amount.value));
        if (!(rec.amount > 0)) return err("請輸入股利金額。");
      } else {
        rec.shares = Math.round(num(shares.value));
        if (!(rec.shares > 0)) return err("請輸入股數。");
        if (kind === "buy" || kind === "sell") {
          rec.price = num(price.value);
          if (!(rec.price > 0)) return err("請輸入成交價。");
          rec.fee = Math.max(0, Math.round(num(fee.value) || 0));
          rec.tax = kind === "sell" ? Math.max(0, Math.round(num(tax.value) || 0)) : 0;
        }
        if (kind === "sell") {
          const held = (portfolio(rec.id).find((p) => p.symbol === sym) || { shares: 0 }).shares;
          if (rec.shares > held) return err(`目前只持有 ${fmtShares(held)} 股 ${sym}，不能賣出 ${fmtShares(rec.shares)} 股。`);
        }
      }
      try {
        await save("trades", rec);
        await applyMarket();
        closeSheet(); render(); toast(editing ? "已更新交易" : `已新增 ${TRADE_KINDS[kind]} ${sym}`);
      } catch { err("沒有存成功，請再試一次。"); }
    };

    const body = [
      seg,
      h("div", { class: "row-2" }, h("label", { class: "field" }, h("span", { text: "代號" }), symbol, closeHint), field("名稱", name)), dl,
      field("日期", date),
      h("div", { class: "row-2" }, fShares, fPrice), fAmt,
      h("div", { class: "row-2" }, fFee, fTax),
      calc, fAcc, field("備註", note), saveBtn, m,
    ];
    if (editing) body.push(h("hr"), armDelete(h("button", { type: "button", class: "ghost", text: "刪除這筆交易" }), "刪除這筆交易", async () => {
      await remove("trades", t.id); closeSheet(); render(); toast("已刪除交易");
    }));
    openSheet(editing ? "修改交易" : "新增交易", body);
    update();
  }

  function feeSheet() {
    const disc = h("input", { id: "feeDisc", type: "number", inputmode: "decimal", step: "0.1", min: "0.1", max: "10", value: round2(S.feeCfg.discount * 10) });
    const min = h("input", { id: "feeMin", type: "number", inputmode: "numeric", step: "1", min: "0", value: S.feeCfg.minFee });
    const m = h("div", { class: "msg" });
    const btn = h("button", { type: "button", class: "primary block", text: "儲存" });
    btn.onclick = async () => {
      const d = num(disc.value), mf = Math.round(num(min.value));
      if (!(d > 0 && d <= 10)) { m.textContent = "折數請填 0.1 到 10 之間，例如 6 代表六折。"; m.classList.add("err"); return; }
      if (!(mf >= 0)) { m.textContent = "最低手續費請填 0 以上。"; m.classList.add("err"); return; }
      S.feeCfg = { discount: d / 10, minFee: mf };
      await store.setSetting("feeCfg", S.feeCfg);
      closeSheet(); render(); toast("已更新手續費設定");
    };
    openSheet("手續費設定", [
      h("p", { class: "small", text: "台股手續費是成交金額 × 0.1425% × 券商折扣，未滿最低手續費時以最低手續費計算。新增交易時會自動算好，你也可以直接改。" }),
      h("div", { class: "row-2" }, field("折數", disc, "6 = 六折，10 = 不打折"), field("最低手續費 (NT$)", min, "整股常見 20 元，零股常見 1 元")),
      btn, m,
    ]);
  }

  /* =====================================================================
     旅遊 (trips)
     ===================================================================== */
  const T = { editingId: null, openId: null, cat: TRIP_CATS[0], pay: TRIP_PAY[0], shellFor: null };

  function tripStatus(trip) {
    const d = today();
    if (d < trip.start) return ["soon", daysBetween(d, trip.start) <= 30 ? `${daysBetween(d, trip.start)} 天後出發` : "即將出發"];
    if (d <= trip.end) return ["live", "旅途中"];
    return ["", "已結束"];
  }
  const tripTotal = (trip) => S.tripx.filter((x) => x.tripId === trip.id).reduce((s, x) => s + x.amount, 0);

  function renderTrips() {
    const trip = S.openTrip && S.trips.find((x) => x.id === S.openTrip);
    if (!trip) { S.openTrip = null; T.shellFor = null; return renderTripList(); }
    if (T.shellFor !== trip.id) buildTripShell(trip);
    renderTripData(trip);
  }

  function renderTripList() {
    const v = $("view-trips"); v.innerHTML = "";
    v.append(h("div", { class: "section-head" },
      h("p", { class: "small muted", text: "每趟旅程一本獨立的帳，可以用當地貨幣記帳，自動換算新台幣。" }),
      h("button", { type: "button", class: "primary", text: "＋ 新增旅程", onclick: () => tripSheet(null) })));
    if (!S.trips.length) {
      v.append(h("div", { class: "empty-state" }, h("strong", { text: "還沒有旅程" }),
        h("span", { text: "按「新增旅程」，填目的地、日期、貨幣和匯率。國內旅遊選新台幣就好。" })));
      return;
    }
    const sorted = S.trips.slice().sort((a, b) => b.start.localeCompare(a.start));
    v.append(h("div", { class: "panel" }, sorted.map((trip) => {
      const [cls, label] = tripStatus(trip);
      const total = tripTotal(trip);
      return h("button", { type: "button", class: "trip-card", onclick: () => { S.openTrip = trip.id; render(); window.scrollTo(0, 0); } },
        h("span", { class: "t-name" }, trip.name, h("span", { class: "pill " + cls, text: label })),
        h("span", { class: "t-line" }, h("span", { text: `${trip.start.replace(/-/g, "/")} – ${shortDate(trip.end)} · ${daysBetween(trip.start, trip.end) + 1} 天 · ${cur(trip.currency).name}` })),
        h("span", { class: "t-line" },
          h("span", { class: "t-total", text: fmtCur(total, trip.currency) }),
          trip.currency !== "TWD" ? h("span", { class: "num", text: "≈ " + fmt(total * trip.rate) }) : null));
    })));
    v.append(h("p", { class: "small muted", text: "出發前換的外幣或刷卡帳單，可以在「記帳」記一筆「旅遊」支出，這樣日常帳本和帳戶餘額也會正確。" }));
  }

  function buildTripShell(trip) {
    T.shellFor = trip.id; T.editingId = null; T.openId = null;
    const c = cur(trip.currency);
    const v = $("view-trips"); v.innerHTML = "";
    const defDate = today() >= trip.start && today() <= trip.end ? today() : trip.start;

    const amount = h("input", { id: "tAmount", type: "number", inputmode: c.dp ? "decimal" : "numeric", min: "0", step: c.dp ? "0.01" : "1", placeholder: "0" });
    const date = h("input", { id: "tDate", type: "date", value: defDate });
    const note = h("input", { id: "tNote", type: "text", maxlength: "80", placeholder: "例如：一蘭拉麵、Suica 加值", enterkeyhint: "done" });
    const catChips = h("div", { class: "chips", id: "tCats" });
    const payChips = h("div", { class: "chips", id: "tPays" });
    const conv = h("span", { class: "help num", id: "tConv" });
    const submit = h("button", { class: "primary", id: "tSubmit", type: "submit", text: "記一筆" });
    const m = h("div", { class: "msg", id: "tMsg" });
    const hint = h("span", { class: "muted", id: "tEditHint", hidden: true }, "正在編輯 · ", h("button", { type: "button", class: "link", text: "取消", onclick: resetTripForm }));

    const drawChips = () => {
      catChips.innerHTML = ""; payChips.innerHTML = "";
      TRIP_CATS.forEach((x) => catChips.append(h("button", { type: "button", class: "chip", "aria-pressed": String(x === T.cat), text: x, onclick: () => { T.cat = x; drawChips(); } })));
      TRIP_PAY.forEach((x) => payChips.append(h("button", { type: "button", class: "chip", "aria-pressed": String(x === T.pay), text: x, onclick: () => { T.pay = x; drawChips(); } })));
    };
    T.drawChips = drawChips;
    drawChips();
    amount.addEventListener("input", () => {
      const a = num(amount.value);
      conv.textContent = trip.currency !== "TWD" && a > 0 ? "≈ " + fmt(a * trip.rate) : "";
    });

    const form = h("form", { class: "entry", autocomplete: "off", novalidate: true },
      h("div", { class: "entry-head" }, h("h2", { text: "記一筆旅費" }), hint),
      h("div", { class: "row-2" },
        h("label", { class: "field amt" }, h("span", { text: `金額 (${trip.currency})` }), amount, conv),
        field("日期", date)),
      h("div", { class: "field" }, h("span", { class: "muted", text: "分類" }), catChips),
      h("div", { class: "field" }, h("span", { class: "muted", text: "付款方式" }), payChips),
      h("div", { class: "row2" }, field("備註", note), submit), m);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = round2(num(amount.value));
      const err = (text) => { m.textContent = text; m.classList.add("err"); };
      m.classList.remove("err");
      if (!(a > 0)) { err("請輸入大於 0 的金額。"); amount.focus(); return; }
      if (!isDate(date.value)) return err("請選擇日期。");
      const base = { tripId: trip.id, amount: a, date: date.value, category: T.cat, pay: T.pay, note: note.value.trim() };
      try {
        if (T.editingId) {
          const old = S.tripx.find((x) => x.id === T.editingId) || {};
          await save("tripx", { ...old, ...base, id: T.editingId });
          m.textContent = "已更新。";
        } else {
          await save("tripx", { ...base, id: newId(), createdAt: new Date().toISOString() });
          m.textContent = `已記下 ${T.cat} ${fmtCur(a, trip.currency)}。`;
        }
        resetTripForm(true);
      } catch { err("沒有存成功，請再試一次。"); }
    });

    const back = h("button", { type: "button", class: "back", text: "‹ 所有旅程", onclick: () => { S.openTrip = null; render(); } });
    const head = h("div", { class: "section-head" },
      h("div", {}, h("div", { style: "font-size:20px;font-weight:700", id: "tName" }), h("div", { class: "muted", id: "tDates" })),
      h("div", { class: "btns" },
        h("button", { type: "button", class: "ghost", id: "tSettleBtn", text: "回國結算", onclick: () => settleSheet(S.trips.find((x) => x.id === trip.id) || trip) }),
        h("button", { type: "button", class: "ghost", text: "旅程設定", onclick: () => tripSheet(S.trips.find((x) => x.id === trip.id) || trip) })));

    const summary = h("section", { class: "hero", id: "tSummary" });
    const listBox = h("div", { class: "panel", id: "tList" });
    const side = h("aside", { class: "side" },
      h("section", { class: "card" }, h("h2", { text: "分類" }), h("div", { class: "bars", id: "tCatBars" })),
      h("section", { class: "card" }, h("h2", { text: "付款方式" }), h("div", { class: "bars accent", id: "tPayBars" })),
      h("button", { type: "button", class: "ghost", text: "匯出這趟 CSV", onclick: () => exportTripCsv(trip) }));
    v.append(back, head, summary, form, h("div", { class: "cols" }, h("section", { class: "panel" }, h("h2", { text: "明細" }), listBox), side));

    listBox.addEventListener("click", async (e) => {
      const it = e.target.closest(".item"); if (!it) return;
      const id = it.dataset.id, x = S.tripx.find((r) => r.id === id); if (!x) return;
      const btn = e.target.closest("button[data-act]");
      if (!btn) { T.openId = T.openId === id ? null : id; T.pendingDel = null; renderTripData(trip); return; }
      if (btn.dataset.act === "edit") {
        T.editingId = id; T.openId = null; T.cat = x.category; T.pay = x.pay || TRIP_PAY[0];
        amount.value = x.amount; date.value = x.date; note.value = x.note || "";
        amount.dispatchEvent(new Event("input"));
        drawChips(); hint.hidden = false; submit.textContent = "儲存修改"; m.textContent = "";
        renderTripData(trip);
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (btn.dataset.act === "del") {
        if (T.pendingDel !== id) {
          T.pendingDel = id; renderTripData(trip);
          setTimeout(() => { if (T.pendingDel === id) { T.pendingDel = null; renderTripData(trip); } }, 3000);
          return;
        }
        T.pendingDel = null;
        await remove("tripx", id);
        if (T.editingId === id) resetTripForm();
        T.openId = null; renderTripData(trip); m.textContent = "已刪除一筆。";
      }
    });

    function resetTripForm(keepMsg) {
      T.editingId = null; amount.value = ""; note.value = ""; conv.textContent = "";
      hint.hidden = true; submit.textContent = "記一筆";
      if (!keepMsg) m.textContent = "";
      amount.blur();
      renderTripData(trip);
    }
  }

  function renderTripData(tripArg) {
    $("status").textContent = `共 ${S.tx.length + S.trades.length + S.tripx.length} 筆 · 存在這台裝置`;
    const trip = S.trips.find((x) => x.id === tripArg.id) || tripArg;
    const code = trip.currency, isTWD = code === "TWD";
    const rows = S.tripx.filter((x) => x.tripId === trip.id);
    const total = rows.reduce((s, x) => s + x.amount, 0);
    const days = daysBetween(trip.start, trip.end) + 1;
    const [cls, label] = tripStatus(trip);
    $("tName").textContent = trip.name;
    $("tDates").textContent = `${trip.start.replace(/-/g, "/")} – ${shortDate(trip.end)} · ${days} 天 · ${cur(code).name}${isTWD ? "" : `（1 ${code} = ${trip.rate} NT$）`}`;

    const sum = $("tSummary"); sum.innerHTML = "";
    const elapsed = Math.min(days, Math.max(1, daysBetween(trip.start, today()) + 1));
    const perDay = total / (cls === "live" ? elapsed : days);
    sum.append(
      h("span", { class: "label" }, "總花費", h("span", { class: "pill " + cls, text: label })),
      h("span", { class: "big num", text: fmtCur(total, code) }),
      h("div", { class: "split" },
        isTWD ? null : h("span", {}, "約 ", h("b", { class: "num", text: fmt(total * trip.rate) })),
        h("span", {}, "每天平均 ", h("b", { class: "num", text: fmtCur(perDay, code) })),
        h("span", {}, "共 ", h("b", { class: "num", text: rows.length }), " 筆")));
    if (trip.budget > 0) {
      const p = total / trip.budget, rest = trip.budget - total;
      sum.append(
        h("div", { class: "budget-line" }, h("span", { text: `預算 ${fmtCur(trip.budget, code)}` }),
          h("span", { style: rest < 0 ? "color:var(--out)" : "", text: rest >= 0 ? `剩 ${fmtCur(rest, code)}` : `超支 ${fmtCur(-rest, code)}` })),
        h("div", { class: "meter" }, h("i", { class: p > 1 ? "over" : p > 0.8 ? "warn" : "", style: `width:${Math.min(100, p * 100)}%` })));
    }

    // settlement status
    const st = settlementOf(trip);
    $("tSettleBtn").textContent = st ? "重新結算" : "回國結算";
    if (st) {
      const changed = Math.abs(st.foreignTotal - total) > 0.005;
      sum.append(h("div", { class: "small", style: changed ? "color:var(--warn)" : "color:var(--muted)" },
        changed
          ? `已在 ${shortDate(st.date)} 結算，但之後旅費有變動。按「重新結算」更新日常帳本。`
          : `已結算到日常帳本：${st.lines.map((l) => `${l.pay} ${fmt(l.twd)}（${accName(l.account)}）`).join("、") || "無"}`));
    }

    // list grouped by day
    const list = $("tList"); list.innerHTML = "";
    if (!rows.length) {
      list.append(h("div", { class: "empty-state" }, h("strong", { text: "這趟還沒有花費" }), h("span", { text: "在上方輸入金額、選分類和付款方式，按「記一筆」。" })));
    } else {
      const groups = {};
      rows.slice().sort((a, b) => sortByDate(b, a)).forEach((x) => (groups[x.date] ||= []).push(x));
      for (const d of Object.keys(groups).sort().reverse()) {
        const items = groups[d];
        const dayTotal = items.reduce((s, x) => s + x.amount, 0);
        const n = daysBetween(trip.start, d) + 1;
        const dayName = n >= 1 && n <= days ? `第 ${n} 天 · ${dayLabel(d)}` : dayLabel(d);
        const box = h("div", { class: "day" }, h("div", { class: "day-h" }, h("span", { text: dayName }), h("span", { class: "num", text: fmtCur(dayTotal, code) })));
        for (const x of items) {
          box.append(h("div", { class: "item" + (x.id === T.openId ? " open" : "") + (x.id === T.editingId ? " editing" : ""), dataset: { id: x.id } },
            h("span", { class: "tag", text: x.category }),
            h("span", { class: "note" + (x.note ? "" : " empty") }, h("span", { class: "main", text: x.note || "—" }), h("span", { class: "meta", text: x.pay || "" })),
            h("span", { class: "amount num out" }, fmtCur(x.amount, code), isTWD ? null : h("span", { class: "conv", text: "≈ " + fmt(x.amount * trip.rate) })),
            h("span", { class: "acts" },
              h("button", { type: "button", dataset: { act: "edit" }, text: "編輯" }),
              h("button", { type: "button", class: T.pendingDel === x.id ? "danger" : "", dataset: { act: "del" }, text: T.pendingDel === x.id ? "確定刪除？" : "刪除" }))));
        }
        list.append(box);
      }
    }

    const breakdown = (key, el) => {
      const m = {};
      rows.forEach((x) => { const k = x[key] || "其他"; m[k] = (m[k] || 0) + x.amount; });
      el.innerHTML = "";
      const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
      if (!e.length) el.append(h("p", { class: "small muted", text: "還沒有資料。" }));
      else el.append(...e.map(([k, v]) => barRow(k, fmtCur(v, code), total ? v / total : 0)));
    };
    breakdown("category", $("tCatBars"));
    breakdown("pay", $("tPayBars"));
  }

  function tripSheet(trip) {
    const editing = !!trip;
    const name = h("input", { id: "tpName", type: "text", maxlength: "30", value: trip ? trip.name : "", placeholder: "例如：大阪京都 5 日" });
    const start = h("input", { id: "tpStart", type: "date", value: trip ? trip.start : today() });
    const end = h("input", { id: "tpEnd", type: "date", value: trip ? trip.end : today() });
    const currency = h("select", { id: "tpCur" }, options(Object.entries(CURRENCIES).map(([k, c]) => [k, `${c.name} ${k}`]), trip ? trip.currency : "JPY"));
    const rate = h("input", { id: "tpRate", type: "number", inputmode: "decimal", step: "0.0001", min: "0", value: trip ? trip.rate : "", placeholder: "例如 0.21" });
    const budget = h("input", { id: "tpBudget", type: "number", inputmode: "decimal", step: "1", min: "0", value: trip && trip.budget ? trip.budget : "", placeholder: "可不填" });
    const rateField = field("匯率：1 外幣 = 多少新台幣", rate, "照你換匯或刷卡的匯率填，之後可以隨時改。");
    const budgetLabel = h("span", {});
    const budgetField = h("label", { class: "field" }, budgetLabel, budget);
    const sync = () => {
      const isTWD = currency.value === "TWD";
      rateField.hidden = isTWD;
      budgetLabel.textContent = `預算（${currency.value}）`;
    };
    currency.addEventListener("change", sync);
    const m = h("div", { class: "msg" });
    const btn = h("button", { type: "button", class: "primary block", text: editing ? "儲存" : "建立旅程" });
    btn.onclick = async () => {
      const err = (t) => { m.textContent = t; m.classList.add("err"); };
      const n = name.value.trim();
      if (!n) return err("請輸入旅程名稱。");
      if (!isDate(start.value) || !isDate(end.value)) return err("請選擇出發和回程日期。");
      if (end.value < start.value) return err("回程日期不能早於出發日期。");
      const isTWD = currency.value === "TWD";
      const r = isTWD ? 1 : num(rate.value);
      if (!(r > 0)) return err("請輸入匯率，例如日圓大約是 0.2 左右。");
      const rec = { ...(trip || { id: newId(), createdAt: new Date().toISOString() }), name: n, start: start.value, end: end.value, currency: currency.value, rate: r, budget: Math.max(0, num(budget.value) || 0) };
      try {
        await save("trips", rec);
        closeSheet();
        S.openTrip = rec.id; T.shellFor = null;
        render(); window.scrollTo(0, 0);
        toast(editing ? "已更新旅程" : `已建立「${n}」`);
      } catch { err("沒有存成功，請再試一次。"); }
    };
    const body = [
      field("旅程名稱", name),
      h("div", { class: "row-2" }, field("出發", start), field("回程", end)),
      field("記帳貨幣", currency),
      rateField, budgetField, btn, m,
    ];
    if (editing) {
      const count = S.tripx.filter((x) => x.tripId === trip.id).length;
      body.push(h("hr"), armDelete(h("button", { type: "button", class: "ghost", text: "刪除旅程" }), `刪除旅程和 ${count} 筆花費`, async () => {
        await store.delMany("tripx", S.tripx.filter((x) => x.tripId === trip.id).map((x) => x.id));
        S.tripx = S.tripx.filter((x) => x.tripId !== trip.id);
        await remove("trips", trip.id);
        S.openTrip = null; closeSheet(); render(); toast("已刪除旅程");
      }));
    }
    openSheet(editing ? "旅程設定" : "新增旅程", body);
    sync();
  }

  /* ---------- 回國結算: post a trip's spending into the daily ledger ---------- */
  function settlementOf(trip) {
    const s = trip.settlement;
    if (!s || !Array.isArray(s.txIds)) return null;
    const lines = S.tx.filter((r) => s.txIds.includes(r.id)).map((r) => ({ pay: r.settlePay || "旅費", twd: r.amount, account: r.account, foreign: r.settleForeign }));
    return { ...s, lines };
  }

  function settleSheet(trip) {
    const code = trip.currency, isTWD = code === "TWD";
    const rows = S.tripx.filter((x) => x.tripId === trip.id);
    const prev = settlementOf(trip);
    if (!rows.length) { toast("這趟還沒有花費可以結算"); return; }
    const byPay = {};
    rows.forEach((x) => { const k = x.pay || "其他"; byPay[k] = (byPay[k] || 0) + x.amount; });
    const accs = accountsSorted();
    const cashAcc = (accs.find((a) => a.kind === "cash") || accs[0]).id;
    const bankAcc = (accs.find((a) => a.kind === "bank") || accs[0]).id;
    const prevBy = {};
    if (prev) for (const l of prev.lines) prevBy[l.pay] = l;

    const lines = Object.entries(byPay).sort((a, b) => b[1] - a[1]).map(([pay, amt]) => {
      const p = prevBy[pay];
      const include = h("input", { type: "checkbox", id: "st-inc-" + pay });
      // Cash was usually bought before the trip; if that exchange is already a 旅遊 expense, posting it again would count it twice.
      include.checked = p ? true : pay !== "現金";
      const same = p && Math.abs((p.foreign ?? -1) - amt) < 0.005;
      const twd = h("input", { type: "number", id: "st-twd-" + pay, inputmode: "numeric", min: "0", step: "1", value: same ? p.twd : Math.round(amt * trip.rate) });
      const acc = h("select", { id: "st-acc-" + pay }, options(accs.map((a) => [a.id, a.name]), p ? p.account : pay === "現金" ? cashAcc : bankAcc));
      const box = h("div", { class: "card", style: "padding:12px" },
        h("label", { style: "display:flex;gap:10px;align-items:center;font-weight:600" }, include,
          h("span", {}, pay, " ", h("span", { class: "muted num", text: isTWD ? fmt(amt) : `${fmtCur(amt, code)} ≈ ${fmt(amt * trip.rate)}` }))),
        h("div", { class: "row-2" }, field("記入日常帳本的金額 (NT$)", twd), field("從哪個帳戶扣", acc)),
        p && !same ? h("p", { class: "small", style: "color:var(--warn)", text: `花費有變動，已重新換算（上次記 ${fmt(p.twd)}）。` }) : null,
        pay === "現金" ? h("p", { class: "small muted", text: "出發前換匯時，如果已經在「記帳」記過「旅遊」支出，這行不要勾，否則會重複扣。" }) : null,
        pay === "信用卡" && !isTWD ? h("p", { class: "small muted", text: "可以改成信用卡帳單上的實際台幣金額（含海外手續費）。" }) : null);
      const sync = () => { twd.disabled = acc.disabled = !include.checked; box.style.opacity = include.checked ? "1" : ".6"; };
      include.addEventListener("change", sync); sync();
      return { pay, amt, include, twd, acc, box };
    });

    const date = h("input", { id: "stDate", type: "date", value: prev ? prev.date : (today() > trip.end ? today() : trip.end) });
    const m = h("div", { class: "msg" });
    const btn = h("button", { type: "button", class: "primary block", text: prev ? "更新結算" : "記到日常帳本" });
    btn.onclick = async () => {
      const err = (t) => { m.textContent = t; m.classList.add("err"); };
      if (!isDate(date.value)) return err("請選擇日期。");
      const picked = lines.filter((l) => l.include.checked);
      for (const l of picked) if (!(Math.round(num(l.twd.value)) > 0)) return err(`請輸入「${l.pay}」的台幣金額。`);
      try {
        // Replace any earlier settlement so re-settling never double-counts.
        if (prev) { await store.delMany("tx", prev.txIds); S.tx = S.tx.filter((r) => !prev.txIds.includes(r.id)); }
        const now = new Date().toISOString();
        const recs = picked.map((l) => ({
          id: newId(), type: "out", category: "旅遊", amount: Math.round(num(l.twd.value)), date: date.value,
          account: l.acc.value, note: `${trip.name}・${l.pay}`, tripId: trip.id, settlePay: l.pay, settleForeign: l.amt, createdAt: now,
        }));
        if (recs.length) await store.putMany("tx", recs);
        S.tx.push(...recs);
        const total = rows.reduce((s, x) => s + x.amount, 0);
        await save("trips", { ...trip, settlement: { date: date.value, txIds: recs.map((r) => r.id), foreignTotal: total, at: now } });
        closeSheet(); render();
        toast(recs.length ? `已記到日常帳本，共 ${fmt(recs.reduce((s, r) => s + r.amount, 0))}` : "已結算，這次沒有記入日常帳本");
      } catch { err("沒有存成功，請再試一次。"); }
    };

    const body = [
      h("p", { class: "small", text: "把這趟的花費依付款方式換算成台幣，記成日常帳本的「旅遊」支出，並從你選的帳戶扣款，總資產就會跟著更新。" }),
      ...lines.map((l) => l.box),
      field("記帳日期", date, "通常是回國那天，或信用卡扣款那天。"),
      btn, m,
    ];
    if (prev) body.push(h("hr"), h("p", { class: "small muted", text: `這趟已在 ${shortDate(prev.date)} 結算過。更新結算會取代上次記入的 ${prev.lines.length} 筆，不會重複。` }),
      armDelete(h("button", { type: "button", class: "ghost", text: "取消結算" }), "取消結算", async () => {
        await store.delMany("tx", prev.txIds);
        S.tx = S.tx.filter((r) => !prev.txIds.includes(r.id));
        const { settlement, ...rest } = trip;
        await save("trips", rest);
        closeSheet(); render(); toast("已取消結算，日常帳本的那幾筆已刪除");
      }));
    openSheet(prev ? "重新結算" : "回國結算", body);
  }

  async function exportTripCsv(trip) {
    const rows = S.tripx.filter((x) => x.tripId === trip.id).sort(sortByDate);
    if (!rows.length) { toast("這趟還沒有花費可以匯出"); return; }
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = `﻿日期,分類,付款方式,金額(${trip.currency}),約新台幣,備註\n` +
      rows.map((x) => [x.date, x.category, x.pay, x.amount, Math.round(x.amount * trip.rate), x.note].map(esc).join(",")).join("\n");
    await saveFile(`旅遊-${trip.name}.csv`, csv, "text/csv");
  }

  /* =====================================================================
     Backup / restore / export
     ===================================================================== */
  async function saveFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return true; }
      catch (e) { if (e && e.name === "AbortError") return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  function renderBackupInfo() {
    $("lastBackup").textContent = S.lastBackup ? `上次備份：${new Date(S.lastBackup).toLocaleDateString("zh-TW")}` : "還沒有備份過。";
    const days = S.lastBackup ? (Date.now() - new Date(S.lastBackup).getTime()) / 864e5 : Infinity;
    const count = S.tx.length + S.trades.length + S.tripx.length;
    const nag = count >= 10 && days > BACKUP_REMIND_DAYS;
    $("backupNag").hidden = !nag;
    if (nag) $("backupNagText").textContent = S.lastBackup ? `已經 ${Math.floor(days)} 天沒有備份了。資料只存在這支手機。` : "你已經記了不少筆，資料只存在這支手機，建議先備份一次。";
  }

  async function doBackup() {
    const data = {
      app: "xiao-zhangben", version: 2, exportedAt: new Date().toISOString(),
      tx: S.tx, accounts: S.accounts, trades: S.trades, trips: S.trips, tripx: S.tripx, snaps: S.snaps,
      settings: { budget: S.budget, quotes: S.quotes, feeCfg: S.feeCfg, incomeSources: S.incomeSources },
    };
    const ok = await saveFile(`小帳本備份-${today()}.json`, JSON.stringify(data, null, 1), "application/json");
    if (ok) {
      S.lastBackup = new Date().toISOString();
      await store.setSetting("lastBackup", S.lastBackup).catch(() => {});
      render(); toast("備份檔已產生，請存到「檔案」或 iCloud");
    }
  }
  $("backup").onclick = doBackup;
  $("nagBackup").onclick = doBackup;

  $("csv").onclick = async () => {
    const mk = monthKey();
    const rows = S.tx.filter((r) => (r.date || "").startsWith(mk)).sort(sortByDate);
    if (!rows.length) { msg("這個月沒有紀錄可以匯出。", true); return; }
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const typeName = { in: "收入", out: "支出", transfer: "轉帳" };
    const csv = "﻿日期,類型,分類,金額,帳戶,轉入帳戶,備註\n" +
      rows.map((r) => [r.date, typeName[r.type], r.category, r.amount, accName(r.account), r.type === "transfer" ? accName(r.toAccount) : "", r.note].map(esc).join(",")).join("\n");
    await saveFile(`小帳本-${mk}.csv`, csv, "text/csv");
  };

  const str = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
  const okId = (r) => r && typeof r.id === "string" && r.id.length > 0 && r.id.length < 100;
  const CLEAN = {
    tx: (r) => okId(r) && ["in", "out", "transfer"].includes(r.type) && Number(r.amount) > 0 && isDate(r.date)
      ? { id: r.id, type: r.type, amount: Math.round(Number(r.amount)), date: r.date, category: str(r.category, 20) || "其他", note: str(r.note), account: str(r.account, 100) || null, toAccount: r.type === "transfer" ? str(r.toAccount, 100) : undefined, tripId: str(r.tripId, 100) || undefined, settlePay: str(r.settlePay, 20) || undefined, sourceId: str(r.sourceId, 100) || undefined, settleForeign: Number(r.settleForeign) || undefined, createdAt: str(r.createdAt, 40) || undefined } : null,
    accounts: (r) => okId(r) && str(r.name, 20)
      ? { id: r.id, name: str(r.name, 20), kind: ACCOUNT_KINDS[r.kind] ? r.kind : "other", opening: Math.round(Number(r.opening) || 0), order: Number(r.order) || 0, createdAt: str(r.createdAt, 40) || undefined } : null,
    trades: (r) => okId(r) && TRADE_KINDS[r.kind] && isDate(r.date) && str(r.symbol, 10)
      ? { id: r.id, kind: r.kind, date: r.date, symbol: str(r.symbol, 10).toUpperCase(), name: str(r.name, 20), shares: Math.round(Number(r.shares) || 0), price: Number(r.price) || 0, fee: Math.round(Number(r.fee) || 0), tax: Math.round(Number(r.tax) || 0), amount: Math.round(Number(r.amount) || 0), account: str(r.account, 100) || null, note: str(r.note, 60), createdAt: str(r.createdAt, 40) || undefined } : null,
    trips: (r) => okId(r) && str(r.name, 30) && isDate(r.start) && isDate(r.end) && Number(r.rate) > 0
      ? { id: r.id, name: str(r.name, 30), start: r.start, end: r.end, currency: CURRENCIES[r.currency] ? r.currency : "TWD", rate: Number(r.rate), budget: Math.max(0, Number(r.budget) || 0), createdAt: str(r.createdAt, 40) || undefined,
        settlement: r.settlement && Array.isArray(r.settlement.txIds) && isDate(r.settlement.date) ? { date: r.settlement.date, txIds: r.settlement.txIds.filter((x) => typeof x === "string"), foreignTotal: Number(r.settlement.foreignTotal) || 0, at: str(r.settlement.at, 40) } : undefined } : null,
    snaps: (r) => r && isDate(r.id) && Number.isFinite(Number(r.total))
      ? { id: r.id, cash: Math.round(Number(r.cash) || 0), stock: Math.round(Number(r.stock) || 0), total: Math.round(Number(r.total)), at: str(r.at, 40) } : null,
    tripx: (r) => okId(r) && typeof r.tripId === "string" && Number(r.amount) > 0 && isDate(r.date)
      ? { id: r.id, tripId: r.tripId, amount: round2(Number(r.amount)), date: r.date, category: str(r.category, 20) || "其他", pay: str(r.pay, 20), note: str(r.note), createdAt: str(r.createdAt, 40) || undefined } : null,
  };

  $("restore").onclick = () => { $("restoreFile").value = ""; $("restoreFile").click(); };
  $("restoreFile").addEventListener("change", async () => {
    const f = $("restoreFile").files[0]; if (!f) return;
    const box = $("restoreConfirm");
    let data;
    try { data = JSON.parse(await f.text()); } catch { data = null; }
    const incoming = {};
    let total = 0, fresh = 0;
    if (data && typeof data === "object") {
      for (const name of STORES) {
        const rows = Array.isArray(data[name]) ? data[name].map(CLEAN[name]).filter(Boolean) : [];
        incoming[name] = rows;
        total += rows.length;
        const have = new Set(S[name].map((r) => r.id));
        fresh += rows.filter((r) => !have.has(r.id)).length;
      }
    }
    box.hidden = false; box.innerHTML = "";
    if (!total) {
      box.append(h("div", { text: "這個檔案不是小帳本的備份，或裡面沒有資料。請選擇「備份全部資料」產生的 .json 檔。" }));
      setTimeout(() => { box.hidden = true; }, 6000);
      return;
    }
    const parts = [["tx", "筆記帳"], ["accounts", "個帳戶"], ["trades", "筆股票交易"], ["trips", "趟旅程"], ["tripx", "筆旅費"], ["snaps", "天資產紀錄"]]
      .filter(([k]) => incoming[k].length).map(([k, t]) => `${incoming[k].length} ${t}`).join("、");
    const yes = h("button", { type: "button", class: "primary", text: "還原" });
    const no = h("button", { type: "button", class: "ghost", text: "取消", onclick: () => { box.hidden = true; } });
    box.append(h("div", { text: `備份裡有 ${parts}，其中 ${fresh} 項是新的。還原會合併進目前的資料，同一筆不會重複。` }), h("div", { class: "btns" }, yes, no));
    yes.onclick = async () => {
      try {
        for (const name of STORES) if (incoming[name].length) await store.putMany(name, incoming[name]);
        const st = data.settings || {};
        const budget = Number(st.budget ?? data.budget);
        if (!S.budget && budget > 0) await store.setSetting("budget", Math.round(budget));
        if (st.quotes && typeof st.quotes === "object") {
          const q = { ...S.quotes };
          for (const [k, v] of Object.entries(st.quotes)) if (v && Number(v.price) > 0 && (!q[k] || (v.at || "") > (q[k].at || ""))) q[k] = { price: Number(v.price), at: str(v.at, 40) };
          await store.setSetting("quotes", q);
        }
        if (Array.isArray(st.incomeSources)) {
          const list = [...S.incomeSources];
          for (const x of st.incomeSources) {
            if (!x || !okId(x) || !str(x.name, 20)) continue;
            const rec = { id: x.id, name: str(x.name, 20), category: CATS.in.includes(x.category) ? x.category : "其他", amount: Math.max(0, Math.round(Number(x.amount) || 0)), day: Math.min(31, Math.max(1, Math.round(Number(x.day) || 1))), account: str(x.account, 100) };
            const i = list.findIndex((y) => y.id === rec.id);
            if (i >= 0) list[i] = rec; else list.push(rec);
          }
          await store.setSetting("incomeSources", list);
        }
        if (st.feeCfg && Number(st.feeCfg.discount) > 0) await store.setSetting("feeCfg", { discount: Number(st.feeCfg.discount), minFee: Math.max(0, Number(st.feeCfg.minFee) || 0) });
        await loadAll();
        await applyMarket();
        box.hidden = true; fillAccountSelects(); render(); toast(`已還原 ${total} 項資料`);
      } catch { box.innerHTML = ""; box.append(h("div", { text: "還原失敗，請再試一次。" })); }
    };
  });

  /* =====================================================================
     Render + boot
     ===================================================================== */
  function render() {
    scheduleSnapshot();
    const n = S.tx.length + S.trades.length + S.tripx.length;
    $("status").textContent = `共 ${n} 筆 · 存在這台裝置`;
    if (S.tab === "ledger") renderLedger();
    else if (S.tab === "assets") renderAssets();
    else if (S.tab === "stocks") renderStocks();
    else if (S.tab === "trips") renderTrips();
    else if (S.tab === "income") renderIncome();
    renderBackupInfo();
  }

  async function loadAll() {
    const [tx, accounts, trades, trips, tripx, snaps, budget, lastBackup, quotes, feeCfg, market, marketAt, incomeSources] = await Promise.all([
      store.all("tx"), store.all("accounts"), store.all("trades"), store.all("trips"), store.all("tripx"), store.all("snaps"),
      store.getSetting("budget"), store.getSetting("lastBackup"), store.getSetting("quotes"), store.getSetting("feeCfg"),
      store.getSetting("market"), store.getSetting("marketAt"), store.getSetting("incomeSources"),
    ]);
    S.accounts = accounts || [];
    if (!S.accounts.length) {
      S.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a, createdAt: new Date().toISOString() }));
      await store.putMany("accounts", S.accounts);
    }
    // Records from before accounts existed (or from an old backup) go to the first account.
    const fallback = accountsSorted()[0].id;
    const ids = new Set(S.accounts.map((a) => a.id));
    const fix = (tx || []).filter((r) => !r.account || !ids.has(r.account)).map((r) => ({ ...r, account: fallback }));
    if (fix.length) await store.putMany("tx", fix);
    const fixed = new Map(fix.map((r) => [r.id, r]));
    S.tx = (tx || []).map((r) => ({ ...(fixed.get(r.id) || r), amount: Number(r.amount) || 0 }));
    S.trades = trades || [];
    S.trips = trips || [];
    S.tripx = tripx || [];
    S.snaps = snaps || [];
    S.budget = Number(budget) || 0;
    S.lastBackup = lastBackup || null;
    S.quotes = quotes || {};
    S.market = market && typeof market === "object" ? market : {};
    S.marketAt = marketAt || null;
    S.incomeSources = Array.isArray(incomeSources) ? incomeSources : [];
    if (feeCfg && feeCfg.discount > 0) S.feeCfg = feeCfg;
  }

  // Install hint (Safari, not yet on home screen)
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("install").hidden = standalone || !isIOS;

  // Service worker (offline + updates)
  if ("serviceWorker" in navigator) {
    // Only an update replaces a running worker; the very first install needs no reload or prompt.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return; reloading = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const offer = (w) => { $("update").hidden = false; $("updateBtn").onclick = () => w.postMessage("skip-waiting"); };
      if (reg.waiting && hadController) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed" && hadController) offer(w); });
      });
    }).catch(() => {});
  }

  (async () => {
    setLedgerType("out");
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      await loadAll();
    } catch {
      $("status").textContent = "無法讀取資料。如果在無痕模式，請改用一般模式開啟。";
    }
    fillAccountSelects();
    setTab(S.tab);
    syncPrices(false);
  })();
})();
