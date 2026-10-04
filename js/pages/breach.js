/* F3 Breach Radar */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;

  var input = $("#pw");
  var strength = ui.strengthBar($("#ana-strength"));
  var skipAnim = null;
  var busy = false;

  /* ---------- Tampilkan / sembunyikan ---------- */
  $("#pw-toggle").addEventListener("click", function () {
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    var b = $("#pw-toggle");
    b.setAttribute("aria-pressed", String(show));
    b.replaceChild(ui.icon(show ? "eye-off" : "eye"), b.firstChild);
    b.lastChild.textContent = show ? "Sembunyikan" : "Tampilkan";
  });

  /* ---------- Analisis kekuatan (lokal, selalu tampil) ---------- */
  var anaTimer = null;
  function analyze() {
    var pw = input.value;
    var r = EW.strength.estimateTyped(pw);
    $("#ana-source").textContent = r.source === "zxcvbn"
      ? "Dianalisis dengan zxcvbn di browsermu."
      : "Dianalisis dengan estimator internal (zxcvbn belum atau tidak termuat).";
    var fb = $("#ana-feedback");
    fb.textContent = "";
    if (!pw) {
      strength.set(null, null, "Ketik password untuk dianalisis");
      $("#ana-crack").textContent = "";
      return;
    }
    strength.set(r.score, r.bits);
    r.feedback.forEach(function (f) { fb.appendChild(h("li", { text: f })); });
    ui.crackTable($("#ana-crack"), Math.max(1, r.bits));
  }
  input.addEventListener("input", function () { clearTimeout(anaTimer); anaTimer = setTimeout(analyze, 150); });
  analyze();
  // zxcvbn dimuat async; analisis ulang begitu tersedia.
  var zxWait = setInterval(function () { if (typeof window.zxcvbn === "function") { clearInterval(zxWait); analyze(); } }, 300);
  setTimeout(function () { clearInterval(zxWait); }, 15000);

  /* ---------- Animasi k-anonymity ---------- */
  function animateKAnon(hash) {
    var stage = $("#kanon");
    stage.hidden = false;
    var hashEl = $("#kanon-hash"), fly = $("#kanon-fly"), prefixEl = $("#kanon-prefix");
    hashEl.textContent = "";
    hashEl.appendChild(h("span", { class: "kanon-pre", text: hash.slice(0, 5) }));
    hashEl.appendChild(h("span", { class: "kanon-rest", text: hash.slice(5) }));
    prefixEl.textContent = "-----";
    $("#kanon-live").textContent = "Hash SHA-1 dihitung. Hanya 5 karakter pertama, " + hash.slice(0, 5) + ", dikirim.";
    stage.classList.remove("is-flying", "is-landed");
    fly.textContent = hash.slice(0, 5);
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        stage.classList.remove("is-flying");
        stage.classList.add("is-landed");
        prefixEl.textContent = hash.slice(0, 5);
        skipAnim = null;
        $("#btn-skip").hidden = true;
        resolve();
      }
      skipAnim = finish;
      if (U.reducedMotion()) { finish(); return; }
      $("#btn-skip").hidden = false;
      void stage.offsetWidth;
      stage.classList.add("is-flying");
      setTimeout(finish, 1600);
    });
  }
  $("#btn-skip").addEventListener("click", function () { if (skipAnim) skipAnim(); });

  /* ---------- Hasil ---------- */
  function showResult(r) {
    var area = $("#result");
    area.textContent = "";
    if (r.error) {
      area.appendChild(h("div", { class: "status status-warn", role: "alert" }, [ui.icon("alert"), h("div", {}, [
        h("strong", { text: "Tidak bisa menghubungi layanan cek kebocoran." }),
        h("p", { text: "Periksa koneksi, password-mu tidak dikirim ke mana pun." })
      ])]));
      return;
    }
    if (r.found) {
      var go = h("a", { class: "btn btn-primary", href: "generate.html?mode=password&length=20" }, ["Buat pengganti"]);
      area.appendChild(h("div", { class: "status status-danger" }, [ui.icon("alert"), h("div", {}, [
        h("strong", { text: "Password ini muncul di " + U.fmtNum(r.count) + " kebocoran data." }),
        h("p", { text: "Jangan pakai lagi di mana pun. Ganti di semua akun yang memakainya, mulai dari email." }),
        h("div", { class: "row" }, [go])
      ])]));
    } else {
      area.appendChild(h("div", { class: "status status-ok" }, [ui.icon("check"), h("div", {}, [
        h("strong", { text: "Tidak ditemukan di database kebocoran yang diketahui." }),
        h("p", { text: "Tidak ditemukan bukan berarti kuat. Lihat analisis kekuatan di atas." })
      ])]));
    }
  }

  $("#form-check").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;
    var pw = input.value;
    if (!pw) { ui.toast("Ketik password dulu.", "error"); input.focus(); return; }
    busy = true;
    $("#btn-check").disabled = true;
    $("#result").textContent = "";
    analyze();
    try {
      var hash = await EW.hibp.sha1Upper(pw);
      var anim = animateKAnon(hash);
      var res;
      try { res = await EW.hibp.lookup(hash); } catch (err) { res = { error: true }; }
      await anim;
      showResult(res);
      if (!res.error) {
        ui.toast(res.found ? "Password ditemukan di kebocoran" : "Tidak ditemukan di kebocoran");
        ui.record("breach-check", { result: res.found ? "found" : "clean" }, { silent: true });
      }
    } finally {
      busy = false;
      $("#btn-check").disabled = !EW.cryptoAvailable;
    }
  });

  $("#btn-clear").addEventListener("click", function () {
    input.value = "";
    if (skipAnim) skipAnim();
    $("#kanon").hidden = true;
    $("#kanon-hash").textContent = "";
    $("#kanon-fly").textContent = "";
    $("#result").textContent = "";
    analyze();
    input.focus();
  });

  /* ---------- Cek massal ---------- */
  var bulkInput = $("#bulk-input");
  function lines() { return bulkInput.value.split(/\r?\n/).filter(function (l) { return l.length > 0; }); }
  bulkInput.addEventListener("input", function () {
    var n = lines().length;
    var c = $("#bulk-counter");
    c.textContent = n + " / 50 baris";
    c.setAttribute("data-over", String(n > 50));
  });

  function mask(pw) {
    var chars = Array.from(pw);
    if (chars.length < 6) return "•••";
    return chars.slice(0, 2).join("") + "•••" + chars.slice(-2).join("");
  }

  $("#btn-bulk").addEventListener("click", async function () {
    var list = lines();
    if (!list.length) { ui.toast("Isi minimal satu password.", "error"); return; }
    if (list.length > 50) { ui.toast("Maksimal 50 baris. Kurangi daftarnya.", "error"); return; }
    var btn = $("#btn-bulk");
    btn.disabled = true;
    var body = $("#bulk-body");
    body.textContent = "";
    $("#bulk-table").hidden = false;
    var anyFound = false, errors = 0;
    for (var i = 0; i < list.length; i++) {
      var tr = h("tr", {}, [h("td", { text: String(i + 1) }), h("td", { class: "mono", text: mask(list[i]) }), h("td", { text: "Mengecek…" }), h("td", { class: "num", text: "" })]);
      body.appendChild(tr);
      try {
        var r = await EW.hibp.check(list[i]);
        tr.children[2].textContent = "";
        tr.children[2].appendChild(h("span", { class: "tag " + (r.found ? "tag-danger" : "tag-ok") }, [ui.icon(r.found ? "alert" : "check"), r.found ? "Bocor" : "Tidak ditemukan"]));
        tr.children[3].textContent = r.found ? U.fmtNum(r.count) : "0";
        if (r.found) anyFound = true;
      } catch (e) {
        errors++;
        tr.children[2].textContent = "Gagal menghubungi layanan";
      }
      $("#bulk-live").textContent = "Selesai " + (i + 1) + " dari " + list.length;
      if (i < list.length - 1) await U.sleep(200);
    }
    btn.disabled = false;
    ui.toast("Cek massal selesai: " + list.length + " password" + (errors ? ", " + errors + " gagal" : ""));
    if (errors < list.length) ui.record("breach-check", { result: anyFound ? "found" : "clean", n: list.length }, { silent: true });
  });

  $("#btn-bulk-clear").addEventListener("click", function () {
    bulkInput.value = "";
    $("#bulk-body").textContent = "";
    $("#bulk-table").hidden = true;
    $("#bulk-counter").textContent = "0 / 50 baris";
  });

  ui.tabs(document.querySelector(".tabs"));
})();
