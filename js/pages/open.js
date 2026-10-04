/* F4 Sealed Message: buka */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$;
  var parsed = null;
  var opened = "";

  $("#btn-copy").title = ui.COPY_TITLE;

  function errorFor(code) {
    if (code === "EMPTY") return "Tempel link atau blok pesan tersegel dulu.";
    if (code === "FORMAT") return "Format tidak dikenali. Pastikan link atau blok armored tersalin utuh, termasuk bagian setelah tanda #.";
    return "Tidak bisa membuka. Passphrase salah atau pesan rusak/terpotong.";
  }

  function useParsed(p, fromLink) {
    parsed = p;
    $("#pass-field").hidden = p.mode !== "p";
    if (fromLink) {
      $("#detected").hidden = false;
      $("#paste-field").hidden = true;
      $("#detected-sub").textContent = p.mode === "p"
        ? "Pesan ini butuh passphrase dari pengirim."
        : "Pesan ini bisa dibuka langsung dengan kunci di link.";
    }
  }

  // Fragment otomatis diparse saat halaman dibuka.
  if (location.hash.length > 1) {
    try { useParsed(EW.crypto.seal.parse(location.hash), true); }
    catch (e) { $("#open-error").textContent = errorFor(e.code); }
  }

  $("#paste").addEventListener("input", function () {
    $("#open-error").textContent = "";
    var v = $("#paste").value.trim();
    if (!v) { parsed = null; $("#pass-field").hidden = true; return; }
    try { useParsed(EW.crypto.seal.parse(v), false); } catch (e) { parsed = null; $("#pass-field").hidden = true; }
  });

  $("#form-open").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#open-error");
    err.textContent = "";
    var p = parsed;
    if (!p) {
      try { p = EW.crypto.seal.parse($("#paste").value); }
      catch (ex) { err.textContent = errorFor(ex.code || "FORMAT"); return; }
    }
    if (p.mode === "p" && !$("#pass").value) { err.textContent = "Masukkan passphrase dari pengirim."; $("#pass").focus(); return; }
    var btn = $("#btn-open");
    btn.disabled = true;
    btn.textContent = p.mode === "p" ? "Menurunkan kunci…" : "Membuka…";
    try {
      var payload = await EW.crypto.seal.open(p, $("#pass").value);
      show(payload);
      // Hapus fragment dari address bar dan history.
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      $("#pass").value = "";
      $("#paste").value = "";
      parsed = null;
      ui.toast("Segel dibuka");
    } catch (ex) {
      err.textContent = errorFor(ex.code);
    } finally {
      btn.disabled = !EW.cryptoAvailable;
      btn.textContent = "Buka segel";
    }
  });

  function show(payload) {
    opened = payload.msg;
    // textContent: pesan bisa berisi HTML jahat, jangan pernah dirender sebagai HTML.
    $("#message").textContent = payload.msg;
    var hb = $("#hint-box");
    hb.hidden = !payload.hint;
    $("#hint-text").textContent = payload.hint || "";
    var st = payload.stamp;
    var card = $("#stamp-out");
    if (st && typeof st === "object") {
      ui.stampCard(card, {
        place: String(st.place || "Bandung"), desc: st.desc ? String(st.desc) : null,
        temp: typeof st.temp === "number" ? st.temp : null, id: st.id ? String(st.id).slice(0, 8) : null,
        at: payload.sealedAt, tz: 25200
      }, "Disegel");
    } else card.hidden = true;
    var at = Date.parse(payload.sealedAt);
    $("#sealed-at").textContent = isNaN(at) ? "" : "Disegel " + U.fmtDateTime(at, 25200) + ".";
    $("#open-panel").hidden = true;
    $("#opened").hidden = false;
    $("#message").focus();
  }

  $("#btn-copy").addEventListener("click", function () { if (opened) ui.copy(opened, { secret: true }); });
  $("#btn-wipe").addEventListener("click", function () {
    opened = "";
    $("#message").textContent = "";
    $("#hint-text").textContent = "";
    $("#opened").hidden = true;
    $("#open-panel").hidden = false;
    $("#detected").hidden = true;
    $("#paste-field").hidden = false;
    $("#pass-field").hidden = true;
    ui.toast("Pesan dihapus dari layar");
  });
})();
