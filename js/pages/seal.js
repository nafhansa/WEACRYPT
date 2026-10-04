/* F4 Sealed Message: buat */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  var MAX = EW.crypto.seal.MAX_CHARS;

  var msg = $("#msg"), pass = $("#pass");
  var linkField = ui.secretField($("#link-out"), { colorize: false, placeholder: "Link muncul di sini" });
  var armorField = ui.secretField($("#armor-out"), { colorize: false, placeholder: "Blok armored muncul di sini" });
  var passStrength = ui.strengthBar($("#pass-strength"));
  var lastLink = "";

  if (EW.isFileProtocol) $("#file-notice").hidden = false;

  function mode() { return document.querySelector('input[name="mode"]:checked').value; }
  function count() { return Array.from(msg.value).length; }

  function updateCounter() {
    var n = count();
    var c = $("#msg-counter");
    c.textContent = U.fmtNum(n) + " / " + U.fmtNum(MAX) + " karakter";
    c.setAttribute("data-over", String(n > MAX));
  }
  msg.addEventListener("input", updateCounter);
  updateCounter();

  ui.$$('input[name="mode"]').forEach(function (r) {
    r.addEventListener("change", function () { $("#pass-block").hidden = mode() !== "p"; });
  });

  function rateBar() {
    if (!pass.value) { passStrength.set(null, null, "Belum ada passphrase"); return; }
    var r = EW.strength.estimateTyped(pass.value);
    passStrength.set(r.score, r.bits);
  }
  pass.addEventListener("input", rateBar);
  rateBar();

  function setPassVisible(show) {
    pass.type = show ? "text" : "password";
    var b = $("#pass-toggle");
    b.setAttribute("aria-pressed", String(show));
    b.replaceChild(ui.icon(show ? "eye-off" : "eye"), b.firstChild);
    b.lastChild.textContent = show ? "Sembunyikan" : "Tampilkan";
  }
  $("#pass-toggle").addEventListener("click", function () { setPassVisible(pass.type === "password"); });

  $("#btn-genpass").addEventListener("click", async function () {
    var r = await EW.entropy.passphrase({ words: 5, separator: "-" });
    pass.value = r.value;
    setPassVisible(true);
    passStrength.set(EW.strength.scoreFromBits(r.bits), r.bits);
    ui.toast("Passphrase dibuat. Catat, lalu kirim ke penerima lewat kanal lain.");
  });

  /* Animasi segel: maks 1,2 detik, bisa dilewati, mati saat reduced motion. */
  function playSeal(text) {
    if (U.reducedMotion()) return Promise.resolve();
    var box = $("#seal-anim");
    $("#seal-anim-text").textContent = text.slice(0, 80);
    box.hidden = false;
    box.classList.remove("is-playing");
    void box.offsetWidth;
    box.classList.add("is-playing");
    return new Promise(function (resolve) {
      var t = setTimeout(done, 1200);
      function done() { clearTimeout(t); box.hidden = true; box.classList.remove("is-playing"); $("#btn-anim-skip").onclick = null; resolve(); }
      $("#btn-anim-skip").onclick = done;
    });
  }

  $("#form-seal").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#seal-error");
    err.textContent = "";
    var text = msg.value;
    var m = mode();
    if (!text.trim()) { err.textContent = "Pesan masih kosong. Tulis dulu yang mau disegel."; msg.focus(); return; }
    if (count() > MAX) { err.textContent = "Pesan lebih dari 4.000 karakter. Pendekkan supaya link tetap bisa dikirim lewat chat."; msg.focus(); return; }
    if (m === "p" && Array.from(pass.value).length < 12) { err.textContent = "Passphrase minimal 12 karakter. Tekan \"Buat passphrase kuat\" bila perlu."; pass.focus(); return; }

    var btn = $("#btn-seal");
    btn.disabled = true;
    btn.textContent = m === "p" ? "Menurunkan kunci…" : "Menyegel…";
    try {
      var st = await EW.entropy.stampNow();
      var rawKey = m === "r" ? await EW.entropy.derive("aes-key", 32) : null;
      var job = EW.crypto.seal.encrypt({
        msg: text, mode: m, passphrase: pass.value, rawKey: rawKey,
        stamp: { place: st.place, desc: st.desc, temp: st.temp, id: st.id },
        hint: $("#hint").value.trim() || undefined
      });
      var results = await Promise.all([job, playSeal(text)]);
      if (rawKey) U.wipe(rawKey);
      var token = results[0];
      var u = new URL("open.html", location.href);
      u.search = ""; u.hash = "";
      lastLink = u.href + "#" + token;
      showResult(lastLink, token, m, st);
      ui.toast("Pesan disegel");
      ui.record("seal", { mode: m });
    } catch (ex) {
      err.textContent = "Gagal menyegel. Muat ulang halaman lalu coba lagi.";
    } finally {
      btn.disabled = !EW.cryptoAvailable;
      btn.textContent = "Segel pesan";
    }
  });

  function showResult(link, token, m, st) {
    $("#sealed-empty").hidden = true;
    $("#sealed-out").hidden = false;
    linkField.set(link);
    armorField.set(EW.crypto.seal.armor(token));
    $("#warn-text").textContent = (m === "r"
      ? "Siapa pun yang memegang link ini bisa membuka pesan."
      : "Siapa pun yang memegang link dan passphrase bisa membuka pesan.") +
      " Tidak ada fitur hapus otomatis karena tidak ada server.";

    var fig = $("#qr-figure"), note = $("#qr-note");
    fig.hidden = true; note.hidden = true;
    if (link.length >= 1500) {
      note.hidden = false;
      note.textContent = "QR tidak dibuat karena link lebih dari 1.500 karakter. Kirim link atau blok armored.";
    } else if (typeof window.qrcode !== "function") {
      note.hidden = false;
      note.textContent = "QR tidak tersedia (library QR gagal dimuat). Link dan blok armored tetap bisa dipakai.";
    } else {
      note.hidden = false;
      note.textContent = "";
      var reveal = h("button", { type: "button", class: "btn btn-secondary btn-sm" }, [ui.icon("eye"), "Tampilkan QR"]);
      note.appendChild(reveal);
      reveal.addEventListener("click", function () {
        if (ui.qr($("#qr"), link, { size: 260 })) { fig.hidden = false; note.hidden = true; }
      });
    }
    $("#btn-share").hidden = !navigator.share;
    var sc = $("#stamp-out");
    ui.stampCard(sc, st, "Disegel");
  }

  $("#btn-share").addEventListener("click", function () {
    if (!navigator.share || !lastLink) return;
    navigator.share({ title: "Pesan tersegel WEACRYPT", url: lastLink }).catch(function () {});
  });
})();
