(() => {
  "use strict";

  /* =====================================================================
     Data model
     flights.json holds weekly patterns ("versions"), each in force from its
     date until the next one. A dated flight is expanded on demand:
     day number n (days since 1970-01-01) + weekly row → instance.
     All times are Taiwan local; instance.dep / .ret are minutes since
     1970-01-01 00:00 Taiwan time, so overnight (+1)/(+2) returns just work.
     ===================================================================== */
  const WD = ["一", "二", "三", "四", "五", "六", "日"]; // index 0 = Monday
  const BASES = { TPE: "桃園", TSA: "松山", KHH: "高雄" };
  const BASE_ORDER = ["TPE", "TSA", "KHH"];
  const TAB_TITLES = { day: "航班", find: "查詢", plane: "飛機", spare: "備機" };
  const PREP = 60; // minutes an aircraft is tied up before departure and after return
  // Where to borrow a spare when a pool has none on the ground (other config or other base; needs a reposition).
  const FALLBACK = {
    "TPE 78A": ["TPE 78X"], "TPE 78X": ["TPE 78A"], "TSA 78A": ["TPE 78A", "TPE 78X"],
    "TSA 320": ["TPE 320", "TSA 32Q"], "TSA 32Q": ["TPE 32Q"], "TPE 32Q": ["TSA 32Q"], "KHH 32Q": ["TPE 32Q"],
    "TSA 339": ["TPE 339"], "TPE 339": ["TSA 339"], "TPE 359": ["TPE 35K"], "TPE 35K": ["TPE 359"], "TPE 320": ["TPE 32Q"],
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");

  const dayNum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const isoOf = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const wdOf = (n) => (new Date(n * 864e5).getUTCDay() + 6) % 7;
  const nowMin = () => Math.floor((Date.now() + 8 * 3600e3) / 6e4); // Taiwan wall clock, in minutes
  const todayN = () => Math.floor(nowMin() / 1440);
  const fmtDate = (n, withWd = true) => { const s = isoOf(n).replace(/-/g, "/"); return withWd ? `${s}（${WD[wdOf(n)]}）` : s; };
  const fmtShort = (n) => { const s = isoOf(n); return `${+s.slice(5, 7)}/${+s.slice(8, 10)}（${WD[wdOf(n)]}）`; };
  const hhmm = (m) => `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(((m % 60) + 60) % 60)}`;
  const dur = (m) => `${Math.floor(m / 60)}h${pad(m % 60)}`;
  const destCode = (dest) => (dest.match(/[A-Z]{3}$/) || [dest])[0];

  let D = null;          // flights.json
  let W = null;          // { start, end } as day numbers
  let FLEET = new Map(); // tail → { tail, type, code, base }
  const dayCache = new Map();

  function versionFor(n) {
    let v = null;
    for (const x of D.versions) if (x.fromN <= n) v = x;
    return v;
  }
  function flightsOn(n) {
    if (dayCache.has(n)) return dayCache.get(n);
    let out = [];
    if (n >= W.start && n <= W.end) {
      const v = versionFor(n), wd = wdOf(n);
      if (v) out = v.flights.filter((f) => f[0] === wd).map((f) => ({
        n, base: f[1], dest: f[2], no: f[3], code: f[4], dep: n * 1440 + f[5], ret: n * 1440 + f[6], tail: f[7], note: f[8] || "",
        id: `${n}|${f[1]}|${f[3]}`,
      }));
    }
    dayCache.set(n, out);
    return out;
  }
  function flightsBetween(n0, n1) { const out = []; for (let n = n0; n <= n1; n++) out.push(...flightsOn(n)); return out; }
  const typeOf = (tail) => (FLEET.get(tail) || {}).type || "";
  // The aircraft actually assigned that day (e.g. 35K), not the route's allowed types (e.g. 359/35K).
  const codeOf = (f) => (FLEET.get(f.tail) || {}).code || f.code;
  const plusDays = (f) => Math.floor(f.ret / 1440) - f.n;
  const retLabel = (f) => `${hhmm(f.ret)}${plusDays(f) ? `<span class="plus">+${plusDays(f)}</span>` : ""}`;

  function status(f) {
    const t = nowMin();
    if (t >= f.ret) return ["已返回", "ok"];
    if (t >= f.dep) return ["執行中", "air"];
    if (t >= f.dep - PREP) return ["準備中", "air"];
    if (f.dep - t < 3 * 1440) return ["未出發", ""];
    return null;
  }
  const badge = (f) => { const s = status(f); return s ? `<span class="badge ${s[1]}">${s[0]}</span>` : ""; };
  const matches = (f, q) => {
    if (!q) return true;
    const hay = `${f.no} ${f.dest} ${f.tail} ${codeOf(f)} ${typeOf(f.tail)} ${BASES[f.base] || ""} ${f.base}`.toUpperCase();
    return q.toUpperCase().split(/\s+/).every((w) => hay.includes(w));
  };

  /* =====================================================================
     State (only the open tab is remembered; everything else is derived)
     ===================================================================== */
  const S = { tab: "day", day: 0, base: "", q: "", find: "", route: "", tail: "", pDay: 0, sDay: 0, sMin: 0 };
  const store = {
    get(k) { try { return localStorage.getItem("flights." + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("flights." + k, v); } catch { /* private mode: fine */ } },
  };
  const clampDay = (n) => Math.min(W.end, Math.max(W.start, n));

  /* =====================================================================
     Tabs
     ===================================================================== */
  function setTab(tab) {
    S.tab = tab; store.set("tab", tab);
    for (const k of Object.keys(TAB_TITLES)) $("view-" + k).hidden = k !== tab;
    document.querySelectorAll(".tabbar button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
    $("viewTitle").textContent = TAB_TITLES[tab];
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    if (!D) return;
    ({ day: renderDay, find: renderFind, plane: renderPlane, spare: renderSpare })[S.tab]();
  }

  /* =====================================================================
     航班：one day's departures
     ===================================================================== */
  function flightRow(f, opts = {}) {
    // Day lists are already grouped by base; elsewhere the base is spelled out.
    const from = opts.date && f.base !== "TPE" ? ` · ${esc(BASES[f.base] || f.base)}出發` : "";
    return `<button type="button" class="fl" data-id="${esc(f.id)}">
      <span class="t num">${hhmm(f.dep)}</span>
      <span class="main">
        <span class="dest">${opts.date ? `${esc(fmtShort(f.n))} ` : ""}${esc(f.dest)}</span>
        <span class="meta"> ${esc(f.no)}${from} · 回 <span class="num">${retLabel(f)}</span></span>
      </span>
      <span class="right"><span class="tail num">${esc(f.tail)}</span><span class="meta">${esc(codeOf(f))}</span>${opts.noBadge ? "" : badge(f)}</span>
    </button>`;
  }
  function renderDay() {
    const n = S.day;
    $("dLabel").textContent = fmtDate(n);
    $("dInput").value = isoOf(n);
    $("dPrev").disabled = n <= W.start; $("dNext").disabled = n >= W.end;
    const all = flightsOn(n).filter((f) => (!S.base || f.base === S.base) && matches(f, S.q));
    $("dCount").textContent = all.length;
    $("dPlanes").textContent = new Set(all.map((f) => f.tail)).size;
    $("dDests").textContent = new Set(all.map((f) => destCode(f.dest))).size;
    if (!all.length) {
      $("dList").innerHTML = `<div class="empty-state"><strong>${S.q ? "找不到符合的航班" : "這天沒有航班"}</strong>${S.q ? "換個關鍵字，或到「查詢」查一年內的日期。" : ""}</div>`;
      return;
    }
    const groups = BASE_ORDER.filter((b) => !S.base || b === S.base)
      .map((b) => [b, all.filter((f) => f.base === b).sort((a, c) => a.dep - c.dep || a.no.localeCompare(c.no))])
      .filter(([, fl]) => fl.length);
    $("dList").innerHTML = `<div class="list">${groups.map(([b, fl]) => `
      <section class="group"><div class="group-h"><span>${esc(BASES[b])} ${b} 出發</span><span>${fl.length} 班</span></div>
      ${fl.map((f) => flightRow(f)).join("")}</section>`).join("")}</div>`;
  }

  /* =====================================================================
     Flight detail (bottom sheet)
     ===================================================================== */
  function findById(id) { const n = +id.split("|")[0]; return flightsOn(n).find((f) => f.id === id); }
  function nextDates(f, count) {
    const out = [];
    for (let n = Math.max(f.n + 1, W.start); n <= W.end && out.length < count; n++) {
      const g = flightsOn(n).find((x) => x.no === f.no && x.base === f.base);
      if (g) out.push(g);
    }
    return out;
  }
  function openFlight(id) {
    const f = findById(id);
    if (!f) return;
    const same = flightsBetween(f.n - 2, f.n + 1).filter((x) => x.tail === f.tail && x.ret > f.n * 1440 && x.dep < (f.n + 1) * 1440).sort((a, b) => a.dep - b.dep);
    const nxt = nextDates(f, 8);
    const ft = FLEET.get(f.tail);
    openSheet(`${f.no}　${f.dest}`, `
      <div class="card">
        <div class="leg"><div><div class="code">${esc(f.base)}</div><div class="muted">${esc(BASES[f.base] || "")}</div></div>
          <div class="arrow">⇄<br>來回</div>
          <div><div class="code">${esc(destCode(f.dest))}</div><div class="muted">${esc(f.dest.replace(/\s*[A-Z]{3}$/, ""))}</div></div></div>
        <dl class="kv">
          <dt>日期</dt><dd>${esc(fmtDate(f.n))} ${badge(f)}</dd>
          <dt>出發</dt><dd class="num">${hhmm(f.dep)}（台灣時間）</dd>
          <dt>回到基地</dt><dd class="num">${hhmm(f.ret)}　${esc(fmtDate(Math.floor(f.ret / 1440)))}</dd>
          <dt>占用時間</dt><dd class="num">${dur(f.ret - f.dep)}</dd>
          <dt>執飛機型</dt><dd>${esc(codeOf(f))}${f.code.includes("/") ? `<span class="muted">（此航線 ${esc(f.code.split("/").join("、"))} 皆可飛）</span>` : ""}</dd>
          <dt>執飛飛機</dt><dd><button type="button" class="link num" data-tail="${esc(f.tail)}">${esc(f.tail)}</button>　${esc(ft ? ft.type : "")}</dd>
          ${f.note ? `<dt>備註</dt><dd>${esc(f.note)}</dd>` : ""}
        </dl>
      </div>
      <h2>${esc(f.tail)} 這天的任務</h2>
      <section class="group">${same.map((x) => flightRow(x, { date: x.n !== f.n, noBadge: true })).join("")}</section>
      <h2>${esc(f.no)} 接下來的日期</h2>
      ${nxt.length ? `<section class="group">${nxt.map((x) => flightRow(x, { date: true, noBadge: true })).join("")}</section>` : `<p class="muted small">查詢範圍內沒有更多日期。</p>`}
      <button type="button" class="ghost" data-find="${esc(f.no)}">查看 ${esc(f.no)} 一年內全部日期</button>`);
  }

  /* =====================================================================
     查詢：every date of one flight number / route within the window
     ===================================================================== */
  function allRoutes() {
    const seen = new Map();
    for (const v of D.versions) for (const f of v.flights) {
      const k = `${f[1]}|${f[3]}`;
      if (!seen.has(k)) seen.set(k, { key: k, base: f[1], no: f[3], dest: f[2], code: f[4] });
    }
    return [...seen.values()].sort((a, b) => a.dest.localeCompare(b.dest, "zh-Hant") || a.no.localeCompare(b.no));
  }
  function renderFind() {
    const q = S.find.trim();
    $("fSearch").value = S.find;
    if (!q) {
      $("fRoutes").innerHTML = "";
      $("fResult").innerHTML = `<div class="empty-state"><strong>輸入班號或航點</strong>可查到 ${esc(fmtDate(W.end, false))} 為止的所有日期與執飛飛機。</div>`;
      return;
    }
    const up = q.toUpperCase();
    const routes = allRoutes().filter((r) => `${r.no} ${r.dest} ${r.base} ${BASES[r.base]} ${r.code}`.toUpperCase().includes(up));
    if (!routes.some((r) => r.key === S.route)) S.route = routes.length === 1 ? routes[0].key : "";
    $("fRoutes").innerHTML = routes.map((r) => `<button type="button" class="chip" data-route="${esc(r.key)}" aria-pressed="${r.key === S.route}">${esc(r.no)} ${esc(r.dest)}${r.base !== "TPE" ? `（${esc(BASES[r.base])}）` : ""}</button>`).join("");
    if (!routes.length) { $("fResult").innerHTML = `<div class="empty-state"><strong>找不到「${esc(q)}」</strong>試試班號數字、中文航點或三碼代號。</div>`; return; }
    if (!S.route) { $("fResult").innerHTML = `<p class="muted small">找到 ${routes.length} 條航線，點選一條查看一年內的日期。</p>`; return; }
    const [base, no] = S.route.split("|");
    const from = Math.max(W.start, todayN());
    const hits = [];
    for (let n = from; n <= W.end; n++) { const f = flightsOn(n).find((x) => x.no === no && x.base === base); if (f) hits.push(f); }
    const months = new Map();
    for (const f of hits) { const m = isoOf(f.n).slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(f); }
    const days = [...new Set(hits.map((f) => wdOf(f.n)))].sort().map((d) => WD[d]).join("、");
    const r = routes.find((x) => x.key === S.route);
    $("fResult").innerHTML = `
      <div class="card"><dl class="kv">
        <dt>航線</dt><dd>${esc(BASES[base])} ⇄ ${esc(r.dest)}　${esc(no)}</dd>
        <dt>班期</dt><dd>${hits.length ? `每週${esc(days)}` : "—"}</dd>
        <dt>查詢範圍</dt><dd class="num">${esc(fmtDate(from, false))} ～ ${esc(fmtDate(W.end, false))}，共 ${hits.length} 班</dd>
      </dl></div>
      ${hits.length ? `<div class="list">${[...months].map(([m, fl]) => `
        <section class="group"><div class="group-h"><span>${m.replace("-", " 年 ")} 月</span><span>${fl.length} 班</span></div>
        ${fl.map((f) => flightRow(f, { date: true })).join("")}</section>`).join("")}</div>`
        : `<div class="empty-state"><strong>查詢範圍內沒有這班</strong></div>`}`;
  }

  /* =====================================================================
     飛機：one aircraft, 7 days from the chosen date as 24h tracks
     ===================================================================== */
  function fillTailSelect() {
    const byType = new Map();
    for (const a of FLEET.values()) { if (!byType.has(a.type)) byType.set(a.type, []); byType.get(a.type).push(a); }
    $("pTail").innerHTML = [...byType].map(([t, list]) => `<optgroup label="${esc(t)}">${list.map((a) =>
      `<option value="${esc(a.tail)}">${esc(a.tail)}　${esc(a.code)}・${esc(BASES[a.base] || a.base)}</option>`).join("")}</optgroup>`).join("");
  }
  function renderPlane() {
    if (!S.tail) S.tail = FLEET.keys().next().value;
    $("pTail").value = S.tail; $("pDate").value = isoOf(S.pDay);
    const n0 = S.pDay, n1 = Math.min(W.end, n0 + 6), today = todayN();
    const mine = flightsBetween(n0 - 3, n1).filter((f) => f.tail === S.tail && f.ret > n0 * 1440).sort((a, b) => a.dep - b.dep);
    const inRange = mine.filter((f) => f.n >= n0);
    const busy = mine.reduce((s, f) => s + Math.max(0, Math.min(f.ret, (n1 + 1) * 1440) - Math.max(f.dep, n0 * 1440)), 0);
    const a = FLEET.get(S.tail) || {};
    $("pSummary").innerHTML = `<section class="totals">
      <div class="total"><span class="label">機型</span><span class="val">${esc(a.code || "—")}</span></div>
      <div class="total"><span class="label">${n1 - n0 + 1} 天內出發</span><span class="val num">${inRange.length} 班</span></div>
      <div class="total"><span class="label">任務占用</span><span class="val num">${Math.round(busy / 60)} h</span></div></section>`;
    let rows = "";
    for (let n = n0; n <= n1; n++) {
      const d0 = n * 1440, d1 = d0 + 1440;
      const blocks = mine.filter((f) => f.dep < d1 && f.ret > d0).map((f) => {
        const s = Math.max(f.dep, d0), e = Math.min(f.ret, d1);
        const cls = `${f.dep < d0 ? " cont" : ""}${f.ret > d1 ? " more" : ""}`;
        return `<button type="button" class="blk${cls}" data-id="${esc(f.id)}" style="left:${((s - d0) / 14.4).toFixed(2)}%;width:${((e - s) / 14.4).toFixed(2)}%" title="${esc(`${f.no} ${f.dest} ${hhmm(f.dep)}–${hhmm(f.ret)}`)}">${esc(destCode(f.dest))} ${esc(f.no.split("/")[0])}</button>`;
      }).join("");
      rows += `<div class="tl-row"><span class="tl-day${n === today ? " today" : ""}">${esc(fmtShort(n))}</span><div class="track">${blocks}</div></div>`;
    }
    $("pTimeline").innerHTML = `
      <div class="tl">${rows}<div class="ticks"><div></div><div><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div></div></div>
      <h2>任務清單</h2>
      ${inRange.length ? `<section class="group">${inRange.map((f) => flightRow(f, { date: true })).join("")}</section>` : `<div class="empty-state"><strong>這段期間沒有任務</strong></div>`}`;
  }

  /* =====================================================================
     備機：aircraft on the ground at base at a given moment, per pool
     ===================================================================== */
  function renderSpare() {
    $("sDate").value = isoOf(S.sDay); $("sTime").value = hhmm(S.sMin);
    const t = S.sDay * 1440 + S.sMin;
    const near = flightsBetween(S.sDay - 3, Math.min(W.end, S.sDay + 7));
    const byTail = new Map();
    for (const f of near) { if (!byTail.has(f.tail)) byTail.set(f.tail, []); byTail.get(f.tail).push(f); }
    const pools = new Map();
    for (const a of FLEET.values()) {
      const k = `${a.base} ${a.code}`;
      if (!pools.has(k)) pools.set(k, { key: k, base: a.base, code: a.code, type: a.type, free: [], busy: 0 });
      const fl = byTail.get(a.tail) || [];
      const tied = fl.some((f) => f.dep - PREP <= t && t < f.ret + PREP);
      if (tied) { pools.get(k).busy++; continue; }
      const next = fl.filter((f) => f.dep - PREP > t).sort((x, y) => x.dep - y.dep)[0];
      pools.get(k).free.push({ tail: a.tail, until: next ? next.dep - PREP : null });
    }
    const order = [...pools.values()].sort((a, b) => BASE_ORDER.indexOf(a.base) - BASE_ORDER.indexOf(b.base) || a.code.localeCompare(b.code));
    const untilLabel = (u) => u === null ? "7 天內無任務" : (Math.floor(u / 1440) === S.sDay ? `至 ${hhmm(u)}` : `至 ${fmtShort(Math.floor(u / 1440))} ${hhmm(u)}`);
    const html = BASE_ORDER.map((b) => {
      const ps = order.filter((p) => p.base === b);
      if (!ps.length) return "";
      return `<section class="group"><div class="group-h"><span>${esc(BASES[b])} ${b}</span><span>地面可用 ${ps.reduce((s, p) => s + p.free.length, 0)} 架</span></div>
        ${ps.map((p) => {
          const alt = p.free.length ? "" : (FALLBACK[p.key] || []).map((k) => { const q = pools.get(k); return q && q.free.length ? `${k}：${q.free.slice(0, 3).map((x) => x.tail).join("、")}` : ""; }).filter(Boolean).join("；");
          return `<div class="pool${p.free.length ? "" : " none"}">
            <span class="name">${esc(p.code)} <span class="muted">${esc(p.type)}</span></span>
            <span class="muted num">可用 ${p.free.length}／任務中 ${p.busy}</span>
            <div class="tails">${p.free.length
              ? p.free.sort((x, y) => (y.until ?? Infinity) - (x.until ?? Infinity)).map((x) => `<button type="button" class="chip num" data-tail="${esc(x.tail)}">${esc(x.tail)} · ${esc(untilLabel(x.until))}</button>`).join("")
              : `<span class="muted">此時段沒有本機隊備機${alt ? `，可調度 ${esc(alt)}` : ""}</span>`}</div>
          </div>`;
        }).join("")}</section>`;
    }).join("");
    $("sList").innerHTML = `<div class="list">${html}</div>`;
  }

  /* =====================================================================
     Bottom sheet
     ===================================================================== */
  let lastFocus = null;
  function openSheet(title, body) {
    lastFocus = document.activeElement;
    $("sheetTitle").textContent = title; $("sheetBody").innerHTML = body;
    $("sheet").hidden = false; document.body.style.overflow = "hidden";
    $("sheetClose").focus();
  }
  function closeSheet() {
    $("sheet").hidden = true; document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* =====================================================================
     Events
     ===================================================================== */
  document.querySelector(".tabbar").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); });
  $("dPrev").onclick = () => { S.day = clampDay(S.day - 1); renderDay(); };
  $("dNext").onclick = () => { S.day = clampDay(S.day + 1); renderDay(); };
  $("dToday").onclick = () => { S.day = clampDay(todayN()); renderDay(); };
  $("dInput").onchange = (e) => { if (e.target.value) { S.day = clampDay(dayNum(e.target.value)); renderDay(); } };
  $("dBase").onclick = (e) => {
    const b = e.target.closest("button[data-b]"); if (!b) return;
    S.base = b.dataset.b;
    $("dBase").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderDay();
  };
  $("dSearch").oninput = (e) => { S.q = e.target.value.trim(); renderDay(); };
  $("fSearch").oninput = (e) => { S.find = e.target.value; renderFind(); };
  $("fRoutes").onclick = (e) => { const b = e.target.closest("[data-route]"); if (b) { S.route = b.dataset.route; renderFind(); } };
  $("pTail").onchange = (e) => { S.tail = e.target.value; renderPlane(); };
  $("pDate").onchange = (e) => { if (e.target.value) { S.pDay = clampDay(dayNum(e.target.value)); renderPlane(); } };
  $("sDate").onchange = (e) => { if (e.target.value) { S.sDay = clampDay(dayNum(e.target.value)); renderSpare(); } };
  $("sTime").onchange = (e) => { const m = /^(\d{2}):(\d{2})/.exec(e.target.value); if (m) { S.sMin = +m[1] * 60 + +m[2]; renderSpare(); } };
  $("sNow").onclick = () => { const t = nowMin(); S.sDay = clampDay(Math.floor(t / 1440)); S.sMin = t % 1440; renderSpare(); };

  // Flight rows, timeline blocks and tail links work the same in every view and in the sheet.
  document.addEventListener("click", (e) => {
    const fl = e.target.closest("[data-id]");
    if (fl) { openFlight(fl.dataset.id); return; }
    const tl = e.target.closest("[data-tail]");
    if (tl) { closeSheet(); S.tail = tl.dataset.tail; if (S.tab !== "plane") S.pDay = S.tab === "spare" ? S.sDay : S.tab === "day" ? S.day : clampDay(todayN()); setTab("plane"); return; }
    const fd = e.target.closest("[data-find]");
    if (fd) { closeSheet(); S.find = fd.dataset.find; S.route = ""; setTab("find"); }
  });
  $("sheetBg").onclick = closeSheet;
  $("sheetClose").onclick = closeSheet;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });

  /* =====================================================================
     Boot
     ===================================================================== */
  async function load() {
    const res = await fetch("data/flights.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
    D.versions.forEach((v) => { v.fromN = dayNum(v.from); });
    D.versions.sort((a, b) => a.fromN - b.fromN);
    W = { start: dayNum(D.window.start), end: dayNum(D.window.end) };
    FLEET = new Map(D.fleet.map(([tail, type, code, base]) => [tail, { tail, type, code, base }]));
    dayCache.clear();
    const t = nowMin(), today = clampDay(Math.floor(t / 1440));
    S.day = today; S.pDay = today; S.sDay = today; S.sMin = t % 1440;
    for (const id of ["dInput", "pDate", "sDate"]) { $(id).min = D.window.start; $(id).max = D.window.end; }
    fillTailSelect();
    const gen = new Date(D.generated);
    $("status").textContent = `可查到 ${fmtDate(W.end, false)} · 資料 ${gen.getFullYear()}/${gen.getMonth() + 1}/${gen.getDate()} 更新`;
    const age = (Date.now() - gen.getTime()) / 864e5;
    if (age > 9) { $("stale").hidden = false; $("stale").textContent = `航班資料已 ${Math.floor(age)} 天沒有更新（正常每週一自動更新），顯示的可能不是最新班表。`; }
  }

  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const offer = (w) => { $("update").hidden = false; $("updateBtn").onclick = () => w.postMessage("skip-waiting"); };
      if (reg.waiting && hadController) offer(reg.waiting);
      reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && hadController) offer(w); }); });
    }).catch(() => {});
  }

  (async () => {
    try { await load(); } catch {
      $("status").textContent = "無法讀取航班資料，請連上網路後重新整理。";
      return;
    }
    const saved = store.get("tab");
    setTab(TAB_TITLES[saved] ? saved : "day");
  })();
})();
