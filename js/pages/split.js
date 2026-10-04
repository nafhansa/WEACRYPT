/* F6 Secret Splitter */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  var shares = [];
  var recovered = ui.secretField($("#recovered"), { colorize: false, placeholder: "Hasil penggabungan muncul di sini" });

  /* ---------- Rahasia ---------- */
  var secretEl = $("#secret");
  function bytesLen() { return U.utf8Encode(secretEl.value).length; }
  secretEl.addEventListener("input", function () {
    var n = bytesLen();
    var c = $("#secret-counter");
    c.textContent = U.fmtNum(n) + " / 1.024 byte";
    c.setAttribute("data-over", String(n > EW.shamir.MAX_SECRET));
  });
  $("#secret-toggle").addEventListener("click", function () {
    var b = $("#secret-toggle");
    var show = secretEl.classList.contains("is-masked");
    secretEl.classList.toggle("is-masked", !show);
    b.setAttribute("aria-pressed", String(show));
    b.replaceChild(ui.icon(show ? "eye-off" : "eye"), b.firstChild);
    b.lastChild.textContent = show ? "Sembunyikan" : "Tampilkan";
  });

  /* ---------- k dan n ---------- */
  var kEl = $("#k"), nEl = $("#n");
  function clampKN(changed) {
    var n = Math.max(2, Math.min(10, parseInt(nEl.value, 10) || 3));
    var k = Math.max(2, Math.min(10, parseInt(kEl.value, 10) || 2));
    if (k > n) { if (changed === "k") n = k; else k = n; }
    kEl.value = k; nEl.value = n;
    renderVisual(k, n);
  }
  kEl.addEventListener("change", function () { clampKN("k"); });
  nEl.addEventListener("change", function () { clampKN("n"); });
  ui.$$("[data-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.getAttribute("data-step").split(":");
      var el = p[0] === "k" ? kEl : nEl;
      el.value = (parseInt(el.value, 10) || 2) + parseInt(p[1], 10);
      clampKN(p[0]);
    });
  });

  function renderVisual(k, n) {
    var box = $("#split-visual");
    box.textContent = "";
    box.style.setProperty("--n", n);
    var big = h("div", { class: "sv-big" }, [h("span", { class: "sv-blob" }), h("span", { class: "sv-blob" })]);
    box.appendChild(big);
    var row = h("div", { class: "sv-row" });
    for (var i = 0; i < n; i++) {
      row.appendChild(h("div", { class: "sv-lamp" + (i < k ? " is-lit" : "") }, [h("span", { class: "sv-num", text: String(i + 1) })]));
    }
    box.appendChild(row);
    $("#vis-caption").textContent = k + " dari " + n + ": " + n + " share dibuat, " + k + " share mana pun cukup untuk membuka. " +
      (k - 1) + " share atau kurang tidak membocorkan apa pun.";
  }
  clampKN();

  /* ---------- Pecah ---------- */
  $("#form-split").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#split-error");
    err.textContent = "";
    var bytes = U.utf8Encode(secretEl.value);
    if (!secretEl.value.length) { err.textContent = "Rahasia masih kosong."; secretEl.focus(); return; }
    if (bytes.length > EW.shamir.MAX_SECRET) { err.textContent = "Rahasia lebih dari 1.024 byte. Pecah per bagian atau kunci dulu dengan File Locker."; return; }
    clampKN();
    var k = +kEl.value, n = +nEl.value;
    var btn = $("#btn-split");
    btn.disabled = true;
    try {
      shares = await EW.shamir.split(bytes, k, n);
      U.wipe(bytes);
      var st = await EW.entropy.stampNow();
      renderCards(shares, k, n, st);
      ui.toast("Rahasia dipecah jadi " + n + " share");
      ui.record("split", { k: k, n: n });
    } catch (ex) {
      err.textContent = ex.message || "Gagal memecah rahasia.";
    } finally {
      btn.disabled = !EW.cryptoAvailable;
    }
  });

  function renderCards(list, k, n, st) {
    var wrap = $("#share-cards");
    wrap.textContent = "";
    var date = U.fmtDateTime(Date.now(), st.tz || 25200);
    var group = list[0].split("-")[4];
    var qrOk = typeof window.qrcode === "function";
    list.forEach(function (s, i) {
      var copyBtn = h("button", { type: "button", class: "btn btn-ghost btn-sm no-print", title: ui.COPY_TITLE }, [ui.icon("copy"), "Salin"]);
      copyBtn.addEventListener("click", function () { ui.copy(s, { secret: true }); });
      var canvas = h("canvas", { class: "share-qr", role: "img", "aria-label": "QR share " + (i + 1) });
      var stampEl = h("div");
      var card = h("article", { class: "share-card", "aria-label": "Share " + (i + 1) + " dari " + n }, [
        h("header", { class: "share-head" }, [
          h("div", {}, [
            h("p", { class: "share-title", text: "Share " + (i + 1) + " dari " + n + ", butuh " + k + " untuk membuka" }),
            h("p", { class: "share-meta" }, ["Group ID ", h("span", { class: "mono", text: group }), " · " + date])
          ]),
          copyBtn
        ]),
        h("div", { class: "share-body" }, [
          h("p", { class: "share-text mono", text: s }),
          qrOk ? canvas : null
        ]),
        stampEl,
        h("p", { class: "share-owner", text: "Disimpan oleh: ________________________" }),
        h("p", { class: "share-foot", text: "WEACRYPT Secret Splitter (format EW-SSS1, bukan SLIP-39). Gabungkan di split.html atau python ewall_cli.py shamir-combine." })
      ]);
      wrap.appendChild(card);
      ui.stampCard(stampEl, st, "Dipecah");
      if (qrOk && !ui.qr(canvas, s, { size: 200, ecl: "M" })) canvas.remove();
    });
    $("#shares-section").hidden = false;
    $("#shares-section").scrollIntoView({ behavior: U.reducedMotion() ? "auto" : "smooth", block: "start" });
  }

  $("#btn-print").addEventListener("click", function () { window.print(); });
  $("#btn-download-all").addEventListener("click", function () {
    if (!shares.length) return;
    var parts = shares[0].split("-");
    var txt = "# WEACRYPT Secret Splitter (EW-SSS1)\n# " + parts[2].replace("of", " dari ") + " dibutuhkan untuk membuka. Group ID " + parts[4] + ".\n" +
      "# Simpan tiap baris di tempat BERBEDA. File ini berisi semua share: hapus setelah dibagikan.\n\n" + shares.join("\n") + "\n";
    ui.download(txt, "shares-" + parts[4] + ".txt", "text/plain;charset=utf-8");
  });
  $("#btn-clear-shares").addEventListener("click", function () {
    shares = [];
    $("#share-cards").textContent = "";
    $("#shares-section").hidden = true;
    ui.toast("Share dihapus dari layar");
  });

  /* ---------- Gabungkan ---------- */
  var sharesIn = $("#shares-in");
  var checkSeq = 0;
  async function liveCheck() {
    var seq = ++checkSeq;
    var lines = sharesIn.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var results = [];
    for (var i = 0; i < lines.length; i++) results.push(await EW.shamir.validateShare(lines[i]));
    if (seq !== checkSeq) return;
    var ul = $("#share-checks");
    ul.textContent = "";
    var group = null;
    results.forEach(function (r, i) {
      var ok = r.ok, msg;
      if (ok) {
        if (group === null) group = r.groupId;
        if (r.groupId !== group) { ok = false; msg = "Group ID " + r.groupId + " berbeda dari share pertama (" + group + ")."; }
        else msg = "Share " + r.x + " dari " + r.n + ", group " + r.groupId + ", butuh " + r.k + ".";
      } else msg = r.error;
      ul.appendChild(h("li", { class: ok ? "is-ok" : "is-bad" }, [ui.icon(ok ? "check" : "x"), h("span", { text: "Baris " + (i + 1) + ": " + msg })]));
    });
  }
  var liveTimer = null;
  sharesIn.addEventListener("input", function () { clearTimeout(liveTimer); liveTimer = setTimeout(liveCheck, 150); });

  $("#btn-combine").addEventListener("click", async function () {
    var err = $("#combine-error");
    err.textContent = "";
    var lines = sharesIn.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    try {
      var secret = await EW.shamir.combine(lines);
      var note = "";
      try { recovered.set(U.utf8Decode(secret)); }
      catch (x) { recovered.set(U.toHex(secret)); note = "Rahasia bukan teks UTF-8, ditampilkan sebagai hex."; }
      U.wipe(secret);
      $("#recovered-note").textContent = note || "Checksum cocok: rahasia dipulihkan utuh.";
      ui.toast("Rahasia digabungkan");
    } catch (ex) {
      recovered.clear();
      $("#recovered-note").textContent = "";
      err.textContent = ex.message || "Gagal menggabungkan.";
    }
  });

  ui.tabs(document.querySelector(".tabs"));
})();
