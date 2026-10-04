/* F2 Key Forge */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$;

  var mode = "password";
  var secret = ui.secretField($("#secret-out"), { large: true, placeholder: "Tekan tombol untuk membuat" });
  var strength = ui.strengthBar($("#strength-out"));
  var bulkValues = [];
  var bulkShown = false;
  $("#nist-note").textContent = EW.strength.NIST_NOTE;

  function linkRange(rangeId, numId, min, max) {
    var r = $(rangeId), n = $(numId);
    r.addEventListener("input", function () { n.value = r.value; refreshPreview(); });
    n.addEventListener("input", function () {
      var v = parseInt(n.value, 10);
      if (v >= min && v <= max) { r.value = v; refreshPreview(); }
    });
    n.addEventListener("change", function () {
      var v = Math.max(min, Math.min(max, parseInt(n.value, 10) || min));
      n.value = v; r.value = v; refreshPreview();
    });
    return function () { return Math.max(min, Math.min(max, parseInt(n.value, 10) || min)); };
  }
  var pwLen = linkRange("#pw-length-range", "#pw-length", 8, 128);
  var ppWords = linkRange("#pp-words-range", "#pp-words", 4, 12);
  var pinLen = linkRange("#pin-length-range", "#pin-length", 4, 12);
  var bulkCount = linkRange("#bulk-count-range", "#bulk-count", 1, 50);

  function pwOpts() {
    return {
      length: pwLen(),
      lower: $("#pw-lower").checked, upper: $("#pw-upper").checked,
      digits: $("#pw-digits").checked, symbols: $("#pw-symbols").checked,
      excludeSimilar: $("#pw-similar").checked, excludeSymbols: $("#pw-exclude").value
    };
  }
  function ppOpts() {
    return { words: ppWords(), separator: $("#pp-sep").value, capitalize: $("#pp-cap").checked, addNumber: $("#pp-num").checked };
  }
  function keyKind() { return document.querySelector('input[name="key-kind"]:checked').value; }

  ["#pw-lower", "#pw-upper", "#pw-digits", "#pw-symbols", "#pw-similar", "#pw-exclude", "#pp-sep", "#pp-cap", "#pp-num", "#bulk-mode"].forEach(function (s) {
    $(s).addEventListener("input", refreshPreview);
    $(s).addEventListener("change", refreshPreview);
  });
  ui.$$('input[name="key-kind"]').forEach(function (r) { r.addEventListener("change", refreshPreview); });

  /* Bit untuk pengaturan saat ini (tanpa membuat apa pun). */
  function settingsBits(m) {
    if (m === "password") {
      var cs = EW.entropy.charset(pwOpts());
      return cs.length < 2 ? null : { bits: EW.strength.bitsFor(cs.length, pwLen()), charsetSize: cs.length };
    }
    if (m === "passphrase") {
      var o = ppOpts();
      return { bits: EW.strength.bitsForPassphrase(o.words) + (o.addNumber ? Math.log2(10) : 0) };
    }
    if (m === "pin") { var l = pinLen(); return { bits: Math.log2(Math.pow(10, l) - EW.entropy.weakPinCount(l)) }; }
    if (m === "key") return { bits: keyKind() === "uuid" ? 122 : 256 };
    return settingsBits($("#bulk-mode").value);
  }

  var LABEL = { password: "Buat password", passphrase: "Buat passphrase", pin: "Buat PIN", key: "Buat kunci" };

  function refreshPreview() {
    var info = settingsBits(mode);
    var btn = $("#btn-generate");
    btn.textContent = mode === "bulk" ? "Buat " + bulkCount() + " sekaligus" : LABEL[mode];
    if (mode === "password" || (mode === "bulk" && $("#bulk-mode").value === "password")) {
      var cs = EW.entropy.charset(pwOpts());
      $("#pw-charset-info").textContent = cs.length < 2
        ? "Pilih minimal satu jenis karakter."
        : "Charset " + cs.length + " karakter, " + U.fmtNum(Math.log2(cs.length), 2) + " bit per karakter.";
    }
    btn.disabled = !info || !EW.cryptoAvailable;
    if (!info) { strength.set(null); $("#bits-line").textContent = ""; $("#crack-body").textContent = ""; return; }
    showBits(info.bits);
  }

  function showBits(bits) {
    strength.set(EW.strength.scoreFromBits(bits), bits);
    $("#bits-line").textContent = "Entropi: " + U.fmtNum(bits, 1) + " bit" +
      (mode === "passphrase" ? " (" + ppWords() + " kata × log₂ 7.776)" : "");
    ui.crackTable($("#crack-body"), bits);
  }

  async function makeOne(m, s) {
    if (m === "password") return EW.entropy.password(pwOpts(), s);
    if (m === "passphrase") return EW.entropy.passphrase(ppOpts(), s);
    if (m === "pin") return EW.entropy.pin(pinLen(), s);
    return EW.entropy.key(keyKind());
  }

  function ledgerFor(m, r, extra) {
    if (m === "password") return ["password", Object.assign({ length: r.length, bits: r.bits, charsetSize: r.charsetSize }, extra)];
    if (m === "passphrase") return ["passphrase", Object.assign({ words: r.words, bits: r.bits }, extra)];
    if (m === "pin") return ["pin", Object.assign({ length: r.length, bits: r.bits }, extra)];
    return ["key", Object.assign({ bits: r.bits, mode: keyKind() }, extra)];
  }

  var DONE = { password: "Password dibuat", passphrase: "Passphrase dibuat", pin: "PIN dibuat", key: "Kunci dibuat" };

  async function generate() {
    var btns = [$("#btn-generate"), $("#btn-regen")];
    btns.forEach(function (b) { b.disabled = true; });
    try {
      var stamp;
      if (mode === "bulk") {
        var m = $("#bulk-mode").value, n = bulkCount();
        var s = m === "key" ? null : await EW.entropy.stream(m);
        var out = [], last;
        for (var i = 0; i < n; i++) { last = await makeOne(m, s); out.push(last.value); }
        if (s) s.close();
        bulkValues = out;
        renderBulk();
        stamp = EW.entropy.weatherStamp();
        showBits(last.bits);
        ui.toast(n + " " + (m === "pin" ? "PIN" : m === "key" ? "kunci" : m) + " dibuat");
        if ($("#opt-ledger").checked) { var lb = ledgerFor(m, last, { mode: "bulk", n: n }); ui.record(lb[0], lb[1]); }
      } else {
        var r = await makeOne(mode);
        secret.set(r.value);
        stamp = EW.entropy.weatherStamp();
        showBits(r.bits);
        ui.toast(DONE[mode]);
        if ($("#opt-ledger").checked) { var l = ledgerFor(mode, r); ui.record(l[0], l[1]); }
      }
      var st = $("#stamp-out");
      ui.stampCard(st, stamp, "Dibuat");
    } catch (e) {
      if (e.message === "CHARSET_EMPTY") ui.toast("Pilih minimal satu jenis karakter.", "error");
      else if (e.message === "WORDLIST_MISSING") ui.toast("Wordlist tidak termuat. Muat ulang halaman.", "error");
      else ui.toast("Gagal membuat. Muat ulang halaman lalu coba lagi.", "error");
    } finally {
      btns.forEach(function (b) { b.disabled = !EW.cryptoAvailable; });
    }
  }

  function renderBulk() {
    var list = $("#bulk-list");
    list.textContent = "";
    bulkValues.forEach(function (v) {
      var n = Array.from(v).length;
      list.appendChild(ui.h("li", { text: bulkShown ? v : "•".repeat(Math.min(n, 40)) }));
    });
  }

  $("#btn-generate").addEventListener("click", generate);
  $("#btn-regen").addEventListener("click", generate);
  $("#opt-color").addEventListener("change", function () { secret.setColorize($("#opt-color").checked); });
  $("#btn-bulk-reveal").addEventListener("click", function () {
    bulkShown = !bulkShown;
    var b = $("#btn-bulk-reveal");
    b.setAttribute("aria-pressed", String(bulkShown));
    b.lastChild.textContent = bulkShown ? "Sembunyikan" : "Tampilkan";
    renderBulk();
  });
  $("#btn-bulk-copy").addEventListener("click", function () {
    if (bulkValues.length) ui.copy(bulkValues.join("\n"), { secret: true });
  });
  $("#btn-bulk-copy").title = ui.COPY_TITLE;
  $("#btn-bulk-download").addEventListener("click", function () {
    if (!bulkValues.length) return;
    ui.download(bulkValues.join("\n") + "\n", "weacrypt-" + $("#bulk-mode").value + "-" + bulkValues.length + ".txt", "text/plain;charset=utf-8");
    ui.toast("File .txt diunduh. Hapus setelah dipindah ke password manager.");
  });

  var tabsApi = ui.tabs(document.querySelector(".tabs"), function (t) {
    mode = t;
    $("#out-single").hidden = t === "bulk";
    $("#out-bulk").hidden = t !== "bulk";
    refreshPreview();
  });

  // Parameter non-rahasia dari halaman lain, misal Breach Radar: ?mode=password&length=24
  var q = new URLSearchParams(location.search);
  if (q.get("length")) {
    var L = Math.max(8, Math.min(128, parseInt(q.get("length"), 10) || 20));
    $("#pw-length").value = L; $("#pw-length-range").value = L;
  }
  if (q.get("mode") && LABEL[q.get("mode")]) tabsApi.select(q.get("mode"));
  refreshPreview();
})();
