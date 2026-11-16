(() => {
  "use strict";

  const CATS = {
    out: ["餐飲", "交通", "購物", "日用品", "居住", "娛樂", "醫療", "學習", "社交", "其他"],
    in: ["薪資", "獎金", "投資", "副業", "其他"],
  };
  const WD = ["日", "一", "二", "三", "四", "五", "六"];
  const BACKUP_REMIND_DAYS = 30;

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (n) => (n < 0 ? "−" : "") + "NT$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------- Storage: IndexedDB on this device ---------- */
  const store = (() => {
    let dbp;
    function open() {
      dbp ||= new Promise((res, rej) => {
        const r = indexedDB.open("ledger", 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("tx")) db.createObjectStore("tx", { keyPath: "id" });
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
      allTx: () => run("tx", "readonly", (s) => s.getAll()),
      putTx: (r) => run("tx", "readwrite", (s) => s.put(r)),
      delTx: (id) => run("tx", "readwrite", (s) => s.delete(id)),
      putManyTx: (rows) => run("tx", "readwrite", (s) => { rows.forEach((r) => s.put(r)); }),
      getSetting: async (key) => { const v = await run("settings", "readonly", (s) => s.get(key)); return v ? v.value : undefined; },
      setSetting: (key, value) => run("settings", "readwrite", (s) => s.put({ key, value })),
    };
  })();

  /* ---------- State ---------- */
  let all = [];
  let budget = 0;
  let lastBackup = null;
  let type = "out";
  let editingId = null;
  let openId = null;
  let pendingDel = null;
  let cur = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })();
  const monthKey = () => `${cur.y}-${pad(cur.m)}`;

  /* ---------- Form ---------- */
  $("fDate").value = dateStr(new Date());

  function setType(t, keepCat) {
    type = t;
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    const sel = $("fCat"), prev = sel.value;
    sel.innerHTML = "";
    CATS[t].forEach((c) => { const o = document.createElement("option"); o.textContent = c; sel.append(o); });
    if (keepCat && CATS[t].includes(keepCat)) sel.value = keepCat;
    else if (CATS[t].includes(prev)) sel.value = prev;
    renderChips();
  }
  function renderChips() {
    const v = $("fCat").value, box = $("chips");
    box.innerHTML = "";
    CATS[type].forEach((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.dataset.c = c; b.textContent = c;
      b.setAttribute("aria-pressed", String(c === v));
      box.append(b);
    });
  }
  document.querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setType(b.dataset.t); });
  $("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { $("fCat").value = b.dataset.c; renderChips(); } });
  $("fCat").addEventListener("change", renderChips);
  setType("out");

  let msgTimer;
  function msg(text, err) {
    const m = $("msg"); m.textContent = text; m.classList.toggle("err", !!err);
    clearTimeout(msgTimer);
    if (!err && text) msgTimer = setTimeout(() => { m.textContent = ""; }, 4000);
  }

  function resetForm() {
    editingId = null;
    $("fAmount").value = ""; $("fNote").value = "";
    $("editHint").hidden = true; $("submit").textContent = "記一筆";
    render();
  }
  $("cancelEdit").onclick = resetForm;

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Math.round(parseFloat($("fAmount").value));
    if (!amount || amount <= 0) { msg("請輸入大於 0 的金額。", true); $("fAmount").focus(); return; }
    const date = $("fDate").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg("請選擇日期。", true); return; }
    const base = { type, amount, date, category: $("fCat").value, note: $("fNote").value.trim() };
    $("submit").disabled = true;
    try {
      if (editingId) {
        const old = all.find((r) => r.id === editingId) || {};
        const rec = { ...old, ...base, id: editingId, updatedAt: new Date().toISOString() };
        await store.putTx(rec);
        all = all.map((r) => (r.id === rec.id ? rec : r));
        msg("已更新。");
      } else {
        const rec = { ...base, id: newId(), createdAt: new Date().toISOString() };
        await store.putTx(rec);
        all.push(rec);
        msg(`已記下 ${rec.category} ${fmt(amount)}。`);
      }
      const [y, m] = date.split("-").map(Number); cur = { y, m };
      resetForm();
      $("fAmount").blur();
    } catch (err) {
      msg("沒有存成功，手機空間可能不足。請再試一次。", true);
    } finally {
      $("submit").disabled = false;
    }
  });

  /* ---------- Render ---------- */
  function render() {
    $("monthLabel").textContent = `${cur.y} 年 ${cur.m} 月`;
    const mk = monthKey();
    const rows = all.filter((r) => (r.date || "").startsWith(mk));
    let tin = 0, tout = 0;
    const byCat = {};
    rows.forEach((r) => {
      if (r.type === "in") tin += r.amount;
      else { tout += r.amount; byCat[r.category] = (byCat[r.category] || 0) + r.amount; }
    });
    $("tOut").textContent = fmt(tout);
    $("tIn").textContent = fmt(tin);
    const bal = tin - tout;
    $("tBal").textContent = fmt(bal);
    $("tBal").style.color = bal < 0 ? "var(--out)" : "var(--ink)";
    $("status").textContent = `共 ${all.length} 筆 · 存在這台裝置`;

    renderList(rows);
    renderCats(byCat, tout);
    renderBudget(tout);
    renderBackupInfo();
  }

  function renderList(rows) {
    const list = $("list");
    list.innerHTML = "";
    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "empty-state";
      e.innerHTML = `<strong></strong><span>在上方輸入金額，按「記一筆」就會出現在這裡。點一筆紀錄可以編輯或刪除。</span>`;
      e.querySelector("strong").textContent = `${cur.y} 年 ${cur.m} 月還沒有紀錄`;
      list.append(e);
      return;
    }
    const groups = {};
    rows.slice()
      .sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || "")))
      .forEach((r) => (groups[r.date] ||= []).push(r));
    Object.keys(groups).sort().reverse().forEach((d) => {
      const items = groups[d];
      const dayOut = items.filter((r) => r.type !== "in").reduce((s, r) => s + r.amount, 0);
      const dt = new Date(d + "T00:00:00");
      const box = document.createElement("div"); box.className = "day";
      const h = document.createElement("div"); h.className = "day-h";
      const hl = document.createElement("span"); hl.textContent = `${dt.getMonth() + 1}/${dt.getDate()}（${WD[dt.getDay()]}）`;
      const hr = document.createElement("span"); hr.className = "num"; hr.textContent = dayOut ? "支出 " + fmt(dayOut) : "";
      h.append(hl, hr); box.append(h);
      items.forEach((r) => {
        const it = document.createElement("div");
        it.className = "item" + (r.id === openId ? " open" : "") + (r.id === editingId ? " editing" : "");
        it.dataset.id = r.id;
        const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = r.category;
        const note = document.createElement("span"); note.className = "note" + (r.note ? "" : " empty"); note.textContent = r.note || "—";
        const amt = document.createElement("span"); amt.className = "amount num " + (r.type === "in" ? "in" : "out");
        amt.textContent = (r.type === "in" ? "+" : "−") + "NT$" + Math.round(r.amount).toLocaleString("en-US");
        const acts = document.createElement("span"); acts.className = "acts";
        const eb = document.createElement("button"); eb.type = "button"; eb.dataset.act = "edit"; eb.textContent = "編輯";
        const db = document.createElement("button"); db.type = "button"; db.dataset.act = "del";
        db.textContent = pendingDel === r.id ? "確定刪除？" : "刪除";
        if (pendingDel === r.id) db.classList.add("danger");
        acts.append(eb, db);
        it.append(tag, note, amt, acts);
        box.append(it);
      });
      list.append(box);
    });
  }

  function renderCats(byCat, tout) {
    const box = $("cats");
    box.innerHTML = "";
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (!cats.length) {
      const p = document.createElement("p"); p.className = "small muted"; p.textContent = "這個月還沒有支出。";
      box.append(p); return;
    }
    cats.forEach(([c, v]) => {
      const pct = tout ? (v / tout) * 100 : 0;
      const row = document.createElement("div"); row.className = "bar-row";
      row.innerHTML = `<div class="bar-top"><span></span><span><span class="num v"></span> <span class="pct num"></span></span></div><div class="bar"><i></i></div>`;
      row.querySelector(".bar-top > span").textContent = c;
      row.querySelector(".v").textContent = fmt(v);
      row.querySelector(".pct").textContent = pct.toFixed(0) + "%";
      row.querySelector(".bar i").style.width = pct.toFixed(1) + "%";
      box.append(row);
    });
  }

  function renderBudget(tout) {
    $("bSpent").textContent = fmt(tout);
    const meter = $("bMeter"), left = $("bLeft");
    if (budget > 0) {
      const p = (tout / budget) * 100;
      meter.style.width = Math.min(p, 100) + "%";
      meter.className = p > 100 ? "over" : p > 80 ? "warn" : "";
      const rest = budget - tout;
      left.textContent = rest >= 0 ? `剩 ${fmt(rest)} / ${fmt(budget)}` : `超支 ${fmt(-rest)}`;
      left.style.color = rest < 0 ? "var(--out)" : "";
    } else {
      meter.style.width = "0%"; meter.className = "";
      left.textContent = "尚未設定預算"; left.style.color = "";
    }
    if (document.activeElement !== $("bInput")) $("bInput").value = budget || "";
  }

  function renderBackupInfo() {
    $("lastBackup").textContent = lastBackup
      ? `上次備份：${new Date(lastBackup).toLocaleDateString("zh-TW")}`
      : "還沒有備份過。";
    const days = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 864e5 : Infinity;
    const nag = all.length >= 10 && days > BACKUP_REMIND_DAYS;
    $("backupNag").hidden = !nag;
    if (nag) $("backupNagText").textContent = lastBackup
      ? `已經 ${Math.floor(days)} 天沒有備份了。資料只存在這支手機。`
      : "你已經記了不少筆，資料只存在這支手機，建議先備份一次。";
  }

  /* ---------- List interactions ---------- */
  $("list").addEventListener("click", async (e) => {
    const it = e.target.closest(".item"); if (!it) return;
    const id = it.dataset.id;
    const r = all.find((x) => x.id === id); if (!r) return;
    const btn = e.target.closest("button[data-act]");
    if (!btn) {
      openId = openId === id ? null : id;
      pendingDel = null;
      render();
      return;
    }
    if (btn.dataset.act === "edit") {
      editingId = id; openId = null;
      setType(r.type === "in" ? "in" : "out", r.category);
      $("fAmount").value = r.amount; $("fDate").value = r.date; $("fNote").value = r.note || "";
      $("editHint").hidden = false; $("submit").textContent = "儲存修改"; msg("");
      render();
      $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (btn.dataset.act === "del") {
      if (pendingDel !== id) {
        pendingDel = id; render();
        setTimeout(() => { if (pendingDel === id) { pendingDel = null; render(); } }, 3000);
        return;
      }
      pendingDel = null;
      try {
        await store.delTx(id);
        all = all.filter((x) => x.id !== id);
        if (editingId === id) resetForm();
        openId = null; render(); msg("已刪除一筆。");
      } catch { msg("刪除失敗，請再試一次。", true); }
    }
  });

  /* ---------- Month nav ---------- */
  $("prev").onclick = () => { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } openId = null; render(); };
  $("next").onclick = () => { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } openId = null; render(); };
  $("monthLabel").onclick = () => { const d = new Date(); cur = { y: d.getFullYear(), m: d.getMonth() + 1 }; render(); };

  /* ---------- Budget ---------- */
  $("bSave").onclick = async () => {
    const v = Math.max(0, Math.round(parseFloat($("bInput").value) || 0));
    try {
      await store.setSetting("budget", v);
      budget = v; $("bInput").blur(); render();
      msg(v ? `預算設為每月 ${fmt(v)}。` : "已清除預算。");
    } catch { msg("預算沒有存成功。", true); }
  };

  /* ---------- Files: share sheet on iPhone, download elsewhere ---------- */
  async function saveFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return true; }
      catch (e) { if (e && e.name === "AbortError") return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  async function doBackup() {
    const data = { app: "xiao-zhangben", version: 1, exportedAt: new Date().toISOString(), budget, tx: all };
    const ok = await saveFile(`小帳本備份-${dateStr(new Date())}.json`, JSON.stringify(data, null, 1), "application/json");
    if (ok) {
      lastBackup = new Date().toISOString();
      await store.setSetting("lastBackup", lastBackup).catch(() => {});
      render(); msg("備份檔已產生。請存到「檔案」App 或 iCloud。");
    }
  }
  $("backup").onclick = doBackup;
  $("nagBackup").onclick = doBackup;

  $("csv").onclick = async () => {
    const mk = monthKey();
    const rows = all.filter((r) => (r.date || "").startsWith(mk)).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) { msg("這個月沒有紀錄可以匯出。", true); return; }
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿日期,類型,分類,金額,備註\n" +
      rows.map((r) => [r.date, r.type === "in" ? "收入" : "支出", r.category, r.amount, r.note].map(esc).join(",")).join("\n");
    await saveFile(`小帳本-${mk}.csv`, csv, "text/csv");
  };

  /* ---------- Restore ---------- */
  function validRow(r) {
    return r && typeof r.id === "string" && r.id && (r.type === "in" || r.type === "out") &&
      Number(r.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") && typeof r.category === "string";
  }
  $("restore").onclick = () => { $("restoreFile").value = ""; $("restoreFile").click(); };
  $("restoreFile").addEventListener("change", async () => {
    const f = $("restoreFile").files[0]; if (!f) return;
    const box = $("restoreConfirm");
    let data;
    try { data = JSON.parse(await f.text()); } catch { data = null; }
    const rows = data && Array.isArray(data.tx) ? data.tx.filter(validRow).map((r) => ({
      id: r.id, type: r.type, amount: Math.round(Number(r.amount)), date: r.date,
      category: r.category, note: typeof r.note === "string" ? r.note.slice(0, 80) : "",
      createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    })) : null;
    box.hidden = false; box.innerHTML = "";
    const p = document.createElement("div");
    if (!rows || !rows.length) {
      p.textContent = "這個檔案不是小帳本的備份，或裡面沒有紀錄。請選擇「備份全部資料」產生的 .json 檔。";
      box.append(p);
      setTimeout(() => { box.hidden = true; }, 6000);
      return;
    }
    const existing = new Set(all.map((r) => r.id));
    const fresh = rows.filter((r) => !existing.has(r.id)).length;
    p.textContent = `備份裡有 ${rows.length} 筆紀錄，其中 ${fresh} 筆是新的。還原會把它們合併進目前的帳本，同一筆不會重複。`;
    const btns = document.createElement("div"); btns.className = "btns";
    const yes = document.createElement("button"); yes.type = "button"; yes.className = "primary"; yes.textContent = "還原";
    const no = document.createElement("button"); no.type = "button"; no.className = "ghost"; no.textContent = "取消";
    btns.append(yes, no); box.append(p, btns);
    no.onclick = () => { box.hidden = true; };
    yes.onclick = async () => {
      try {
        await store.putManyTx(rows);
        if (!budget && Number(data.budget) > 0) { budget = Math.round(Number(data.budget)); await store.setSetting("budget", budget); }
        all = await store.allTx();
        box.hidden = true; render(); msg(`已還原 ${rows.length} 筆紀錄。`);
      } catch { msg("還原失敗，請再試一次。", true); }
    };
  });

  /* ---------- Install hint (Safari, not yet on home screen) ---------- */
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("install").hidden = standalone || !isIOS;

  /* ---------- Service worker (offline + updates) ---------- */
  if ("serviceWorker" in navigator) {
    // Only an update replaces a running worker; the very first install needs no reload or prompt.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return; reloading = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const offer = (w) => {
        $("update").hidden = false;
        $("updateBtn").onclick = () => w.postMessage("skip-waiting");
      };
      if (reg.waiting && hadController) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => {
          if (w.state === "installed" && hadController) offer(w);
        });
      });
    }).catch(() => {});
  }

  /* ---------- Boot ---------- */
  (async () => {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const [rows, b, lb] = await Promise.all([store.allTx(), store.getSetting("budget"), store.getSetting("lastBackup")]);
      all = (rows || []).map((r) => ({ ...r, amount: Number(r.amount) || 0 }));
      budget = Number(b) || 0;
      lastBackup = lb || null;
      render();
    } catch {
      $("status").textContent = "無法讀取資料。如果在無痕模式，請改用一般模式開啟。";
      render();
    }
  })();
})();
