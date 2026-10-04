/* F7 Entropy Ledger */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;

  var TYPE_LABEL = {
    genesis: "Genesis", password: "Password", passphrase: "Passphrase", pin: "PIN", key: "Kunci",
    seal: "Pesan disegel", lock: "File dikunci", split: "Rahasia dipecah", "breach-check": "Cek kebocoran", verify: "Cek integritas"
  };
  var stored = EW.ledger.all();
  var working = null;         // salinan untuk mode penyerang
  var verifyResult = null;
  var selected = -1;
  var edited = {};
  var hashRate = null;

  function chain() { return working || stored; }
  function short(hash) { return hash ? hash.slice(0, 8) + "…" + hash.slice(-4) : "-"; }

  /* ---------- Rantai ---------- */
  function render() {
    var c = chain();
    var ol = $("#chain");
    ol.textContent = "";
    $("#chain-empty").hidden = c.length > 0;
    $("#full-banner").hidden = !(stored.length >= EW.config.LEDGER_MAX) || !!working;
    c.forEach(function (b, i) {
      var r = verifyResult && verifyResult.results[i];
      var bad = r && !r.ok;
      var st = b.stamp || {};
      var btn = h("button", {
        type: "button", class: "capsule" + (bad ? " is-bad" : r ? " is-ok" : "") + (i === selected ? " is-selected" : "") + (edited[i] ? " is-edited" : ""),
        "data-sky": st.sky || "clouds", "aria-pressed": String(i === selected),
        "aria-label": "Blok " + b.index + ", " + (TYPE_LABEL[b.type] || b.type) + (bad ? ", rusak" : r ? ", valid" : "")
      }, [
        h("span", { class: "capsule-index mono", text: "#" + b.index }),
        h("span", { class: "capsule-type", text: TYPE_LABEL[b.type] || String(b.type) }),
        h("span", { class: "capsule-hash mono", text: short(b.hash) }),
        h("span", { class: "capsule-wx", text: (st.desc || "-") + (typeof st.temp === "number" ? ", " + U.fmtNum(st.temp, 1) + "°C" : "") }),
        r ? h("span", { class: "capsule-flag" }, [ui.icon(bad ? "x" : "check"), bad ? "rusak" : "valid"]) : null
      ]);
      btn.addEventListener("click", function () { selected = i; render(); renderDetail(); });
      ol.appendChild(h("li", {}, [btn]));
    });
    renderStats();
  }

  function setStatus(text, kind) {
    var el = $("#chain-status");
    el.textContent = "";
    if (!text) return;
    el.className = "chain-status tag " + (kind === "bad" ? "tag-danger" : kind === "ok" ? "tag-ok" : "");
    el.appendChild(ui.icon(kind === "bad" ? "x" : kind === "ok" ? "check" : "about"));
    el.appendChild(document.createTextNode(text));
  }

  /* ---------- Detail (bisa diedit di mode penyerang) ---------- */
  function renderDetail() {
    var box = $("#detail");
    box.textContent = "";
    var b = chain()[selected];
    if (!b) { box.appendChild(h("p", { class: "muted", text: "Pilih blok untuk melihat semua field dan hash lengkap." })); return; }
    var dl = h("dl", { class: "block-fields" });
    function field(label, path, value, editable) {
      dl.appendChild(h("dt", { text: label }));
      if (working && editable) {
        var id = "edit-" + path.replace(/\./g, "-");
        var input = h("input", { type: "text", id: id, class: "mono", value: value === null || value === undefined ? "" : String(value), "aria-label": "Edit " + label, autocomplete: "off", spellcheck: "false" });
        input.addEventListener("change", function () { applyEdit(path, input.value); });
        dl.appendChild(h("dd", {}, [input]));
      } else {
        dl.appendChild(h("dd", { class: "mono", text: value === null || value === undefined ? "-" : String(value) }));
      }
    }
    field("index", "index", b.index, false);
    field("timestamp", "timestamp", b.timestamp, true);
    field("type", "type", b.type, true);
    Object.keys(b.meta || {}).forEach(function (k) { field("meta." + k, "meta." + k, b.meta[k], true); });
    if (b.stamp) {
      field("stamp.desc", "stamp.desc", b.stamp.desc, true);
      field("stamp.temp", "stamp.temp", b.stamp.temp, true);
      field("stamp.sky", "stamp.sky", b.stamp.sky, false);
    }
    field("weatherDigest", "weatherDigest", b.weatherDigest, false);
    field("prevHash", "prevHash", b.prevHash, false);
    field("difficulty", "difficulty", b.difficulty, false);
    field("nonce", "nonce", b.nonce, false);
    field("hash", "hash", b.hash, false);
    box.appendChild(dl);
    var r = verifyResult && verifyResult.results[selected];
    if (r && r.reasons.length) {
      box.appendChild(h("div", { class: "status status-danger" }, [ui.icon("alert"), h("div", {}, [
        h("strong", { text: "Blok ini rusak" }),
        h("p", { text: r.reasons.join("; ") + "." })
      ])]));
    } else if (r && !r.ok) {
      box.appendChild(h("p", { class: "tag tag-danger", text: "Isi blok ini utuh, tapi ikut tidak valid karena rantai sebelumnya rusak." }));
    }
  }

  function applyEdit(path, raw) {
    var b = working[selected];
    var parts = path.split(".");
    var target = b, key = parts[parts.length - 1];
    if (parts.length === 2) target = b[parts[0]];
    var old = target[key];
    var v = raw;
    if (typeof old === "number" && raw.trim() !== "" && !isNaN(Number(raw))) v = Number(raw);
    target[key] = v;
    edited[selected] = true;
    verifyResult = null;
    setStatus("Blok #" + selected + " diubah. Tekan Verifikasi rantai.", "");
    render();
    renderDetail();
  }

  /* ---------- Verifikasi ---------- */
  async function runVerify() {
    var c = chain();
    if (!c.length) { setStatus("Belum ada blok untuk diverifikasi.", ""); return; }
    verifyResult = await EW.ledger.verify(c);
    if (verifyResult.ok) setStatus("Rantai valid: " + c.length + " blok", "ok");
    else setStatus("Rantai rusak mulai blok #" + verifyResult.firstBad + " (" + (c.length - verifyResult.firstBad) + " blok terdampak)", "bad");
    render();
    if (selected === -1 && !verifyResult.ok) selected = verifyResult.firstBad;
    renderDetail();
    updateEstimate();
  }
  $("#btn-verify").addEventListener("click", runVerify);

  /* ---------- Mode penyerang ---------- */
  function setAttack(on) {
    working = on ? JSON.parse(JSON.stringify(stored)) : null;
    edited = {};
    verifyResult = null;
    $("#attack-panel").hidden = !on;
    var b = $("#btn-attack");
    b.setAttribute("aria-pressed", String(on));
    b.lastChild.textContent = on ? "Mode penyerang aktif" : "Mode penyerang";
    document.body.classList.toggle("is-attacking", on);
    setStatus(on ? "Mode penyerang: mengedit salinan di memori" : "", "");
    if (on && selected === -1 && working.length) selected = Math.min(1, working.length - 1);
    render();
    renderDetail();
    updateEstimate();
  }
  $("#btn-attack").addEventListener("click", function () {
    if (!stored.length) { ui.toast("Ledger masih kosong. Buat password dulu di Key Forge.", "error"); return; }
    setAttack(!working);
  });
  $("#btn-attack-exit").addEventListener("click", function () { setAttack(false); ui.toast("Salinan dibuang, rantai asli tidak berubah"); });

  function benchRate() {
    if (hashRate) return hashRate;
    var msg = U.utf8Encode("x".repeat(320)), n = 0, t0 = performance.now();
    while (performance.now() - t0 < 60) { EW.wlib.sha256(msg); n++; }
    hashRate = n / ((performance.now() - t0) / 1000);
    return hashRate;
  }

  function secondsFor(diff) { return Math.pow(16, diff) / benchRate(); }

  function updateEstimate() {
    var el = $("#remine-estimate");
    if (!working) { el.textContent = ""; return; }
    var from = verifyResult && !verifyResult.ok ? verifyResult.firstBad : null;
    if (from === null) { el.textContent = "Ubah sebuah blok lalu verifikasi untuk melihat biaya menutupi jejak."; return; }
    var t = 0;
    for (var i = from; i < working.length; i++) t += secondsFor(working[i].difficulty || 4);
    el.textContent = "Estimasi biaya menutupi jejak: " + (working.length - from) + " blok × rata-rata waktu per blok ≈ " +
      EW.strength.humanFromLog10(Math.log10(Math.max(t, 0.01))) + " di perangkat ini.";
  }

  $("#btn-remine").addEventListener("click", async function () {
    if (!working) return;
    if (!verifyResult) await runVerify();
    if (verifyResult.ok) { ui.toast("Rantai sudah valid, tidak ada yang perlu ditambang ulang."); return; }
    var from = verifyResult.firstBad;
    var btn = $("#btn-remine");
    btn.disabled = true;
    var t0 = performance.now(), tries = 0;
    $("#mining").hidden = false;
    try {
      for (var i = from; i < working.length; i++) {
        var b = working[i];
        b.index = i;
        b.prevHash = i === 0 ? EW.ledger.ZERO : working[i - 1].hash;
        $("#mining-title").textContent = "Menambang ulang blok #" + i + " dari " + (working.length - 1);
        var mined = await EW.ledger.mine(b, b.difficulty || 4, onMineProgress);
        tries += mined.nonce + 1;
        working[i] = mined;
      }
      var secs = (performance.now() - t0) / 1000;
      edited = {};
      await runVerify();
      $("#mining-info").textContent = "Selesai: " + (working.length - from) + " blok, " + U.fmtNum(tries) + " percobaan hash, " + U.fmtNum(secs, 1) + " detik.";
      setStatus("Rantai valid lagi setelah " + U.fmtNum(secs, 1) + " detik kerja ulang", "ok");
      ui.toast("Jejak tertutup, tapi butuh " + U.fmtNum(secs, 1) + " detik kerja. Di blockchain sungguhan, kamu harus mengalahkan seluruh jaringan.");
    } catch (e) {
      ui.toast("Penambangan dihentikan.", "error");
    } finally {
      btn.disabled = !EW.cryptoAvailable;
      $("#mining-title").textContent = "Penambangan selesai";
    }
  });

  var lastPaint = 0;
  function onMineProgress(m) {
    if (m.type === "start") return;
    var now = performance.now();
    if (m.type === "progress" && now - lastPaint < 60) return;
    lastPaint = now;
    $("#mining-nonce").textContent = "nonce " + U.fmtNum(m.nonce);
    $("#mining-hash").textContent = m.hash || "";
    var rate = m.ms > 0 ? m.tries / (m.ms / 1000) : 0;
    if (m.type === "mined") $("#mining-info").textContent = "Cocok setelah " + U.fmtNum(m.tries) + " percobaan (" + (m.thread === "worker" ? "Web Worker" : "main thread, dipotong per 12 ms") + ").";
    else $("#mining-info").textContent = U.fmtNum(rate) + " hash/detik " + (m.thread === "worker" ? "di Web Worker" : "di main thread") + ". UI tetap bisa dipakai.";
  }

  /* ---------- Difficulty ---------- */
  var diffEl = $("#difficulty");
  function showDiff() {
    var d = +diffEl.value;
    $("#difficulty-out").textContent = String(d);
    $("#difficulty-note").textContent = "Rata-rata " + U.fmtNum(Math.pow(16, d)) + " percobaan per blok, ≈ " +
      EW.strength.humanFromLog10(Math.log10(Math.max(secondsFor(d), 0.01))) + " di perangkat ini. Berlaku untuk blok baru.";
  }
  diffEl.value = EW.ledger.difficulty();
  diffEl.addEventListener("input", function () { EW.ledger.setDifficulty(+diffEl.value); showDiff(); });
  showDiff();

  /* ---------- Ekspor / impor / hapus ---------- */
  function exportFile() {
    var d = new Date();
    ui.download(EW.ledger.export(), "weacrypt-ledger-" + d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate()) + ".json", "application/json");
  }
  $("#btn-export").addEventListener("click", function () {
    if (!stored.length) { ui.toast("Ledger kosong, tidak ada yang diekspor.", "error"); return; }
    exportFile();
    ui.toast("Ledger diekspor");
  });
  $("#btn-archive").addEventListener("click", async function () {
    exportFile();
    var ok = await ui.confirm({ title: "Arsipkan ledger?", body: "File ekspor sudah diunduh. Ledger di browser ini akan dikosongkan agar rantai baru bisa dimulai.", confirmText: "Arsipkan", danger: true });
    if (ok) { EW.ledger.clear(); ui.toast("Ledger diarsipkan"); }
  });
  $("#btn-import").addEventListener("click", function () { $("#import-file").click(); });
  $("#import-file").addEventListener("change", async function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    try {
      var text = await f.text();
      if (stored.length) {
        var ok = await ui.confirm({ title: "Ganti ledger dengan file impor?", body: "Rantai di browser ini (" + stored.length + " blok) akan diganti. Ekspor dulu bila masih diperlukan.", confirmText: "Ganti", danger: true });
        if (!ok) return;
      }
      var n = await EW.ledger.import(text);
      ui.toast("Ledger diimpor: " + n + " blok, rantai valid");
    } catch (e) {
      ui.toast(e.message === "INVALID"
        ? "Impor ditolak: rantai di file rusak mulai blok #" + e.firstBad + "."
        : "Impor ditolak: file bukan ekspor ledger WEACRYPT yang valid.", "error");
    }
  });
  $("#btn-clear").addEventListener("click", async function () {
    if (!stored.length) return;
    var ok = await ui.confirm({ title: "Hapus seluruh ledger?", body: "Semua " + stored.length + " blok di browser ini dihapus permanen. Ekspor dulu bila ingin menyimpannya.", confirmText: "Hapus ledger", danger: true });
    if (ok) { if (working) setAttack(false); EW.ledger.clear(); ui.toast("Ledger dihapus"); }
  });

  /* ---------- Statistik ---------- */
  function renderStats() {
    var c = stored;
    var dl = $("#stats");
    dl.textContent = "";
    function row(k, v) { dl.appendChild(h("div", {}, [h("dt", { text: k }), h("dd", { text: v })])); }
    row("Total blok", U.fmtNum(c.length));
    var wx = {};
    c.forEach(function (b) { var d = b.stamp && b.stamp.desc; if (d) wx[d] = (wx[d] || 0) + 1; });
    var top = Object.keys(wx).sort(function (a, b) { return wx[b] - wx[a]; })[0];
    row("Cuaca paling sering", top ? top + " (" + wx[top] + " blok)" : "-");
    var pw = c.filter(function (b) { return b.type === "password" && b.meta && typeof b.meta.bits === "number"; });
    row("Rata-rata bit password", pw.length ? U.fmtNum(pw.reduce(function (s, b) { return s + b.meta.bits; }, 0) / pw.length, 1) + " bit (" + pw.length + " password)" : "-");
    var types = {};
    c.forEach(function (b) { types[b.type] = (types[b.type] || 0) + 1; });
    row("Aktivitas", Object.keys(types).filter(function (t) { return t !== "genesis"; }).map(function (t) { return (TYPE_LABEL[t] || t) + " " + types[t]; }).join(", ") || "-");
  }

  EW.bus.on("ledger:update", function () {
    stored = EW.ledger.all();
    if (!working) { verifyResult = null; if (selected >= stored.length) selected = -1; render(); renderDetail(); setStatus("", ""); }
  });

  render();
  if (stored.length) runVerify();
})();
