/* F5 File Locker */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  var MAX = 200 * 1024 * 1024, WARN = 100 * 1024 * 1024;
  var lockFiles = [];
  var unlockFile = null;
  var opened = null; // { meta, data }
  var previewUrl = null;

  var lpass = $("#lpass"), lpass2 = $("#lpass2");
  var bar = ui.strengthBar($("#lpass-strength"));

  /* ---------- Kunci ---------- */
  function renderLockFiles() {
    var ul = $("#lock-files");
    ul.textContent = "";
    lockFiles.forEach(function (f, i) {
      var rm = h("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": "Hapus " + f.name + " dari daftar" }, [ui.icon("x")]);
      rm.addEventListener("click", function () { lockFiles.splice(i, 1); renderLockFiles(); });
      var warn = f.size > WARN ? h("span", { class: "tag tag-warn", text: "Besar: browser HP bisa kehabisan memori" }) : null;
      ul.appendChild(h("li", {}, [ui.icon("file"), h("span", { class: "file-name", text: f.name }), h("span", { class: "muted", text: U.fmtBytes(f.size) }), warn, rm]));
    });
  }

  ui.dropZone($("#lock-drop"), {
    multiple: true,
    onFiles: function (files) {
      files.forEach(function (f) {
        if (f.size > MAX) { ui.toast(f.name + " lebih dari 200 MB. Pakai Python CLI untuk file sebesar ini.", "error"); return; }
        lockFiles.push(f);
      });
      renderLockFiles();
    }
  });

  function rate() {
    if (!lpass.value) { bar.set(null, null, "Belum ada passphrase"); return; }
    var r = EW.strength.estimateTyped(lpass.value);
    bar.set(r.score, r.bits);
  }
  lpass.addEventListener("input", rate);
  rate();

  function setVisible(show) {
    lpass.type = lpass2.type = show ? "text" : "password";
    var b = $("#lpass-toggle");
    b.setAttribute("aria-pressed", String(show));
    b.replaceChild(ui.icon(show ? "eye-off" : "eye"), b.firstChild);
    b.lastChild.textContent = show ? "Sembunyikan" : "Tampilkan";
  }
  $("#lpass-toggle").addEventListener("click", function () { setVisible(lpass.type === "password"); });

  $("#btn-genpass").addEventListener("click", async function () {
    var r = await EW.entropy.passphrase({ words: 6, separator: "-" });
    lpass.value = lpass2.value = r.value;
    setVisible(true);
    bar.set(EW.strength.scoreFromBits(r.bits), r.bits);
    ui.toast("Passphrase dibuat. Simpan di password manager sebelum mengunci.");
  });

  function progress(prefix, pct, text) {
    $("#" + prefix + "-progress").hidden = false;
    $("#" + prefix + "-stage").textContent = text;
    var b = $("#" + prefix + "-bar");
    b.setAttribute("aria-valuenow", String(Math.round(pct)));
    b.firstElementChild.style.width = pct + "%";
  }

  $("#form-lock").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#lock-error");
    err.textContent = "";
    if (!lockFiles.length) { err.textContent = "Pilih minimal satu file dulu."; return; }
    if (Array.from(lpass.value).length < 12) { err.textContent = "Passphrase minimal 12 karakter. Tekan \"Buat passphrase kuat\" bila perlu."; lpass.focus(); return; }
    if (lpass.value !== lpass2.value) { err.textContent = "Kedua passphrase tidak sama. Ketik ulang di kolom kedua."; lpass2.focus(); return; }
    var btn = $("#btn-lock");
    btn.disabled = true;
    var done = $("#lock-done");
    done.textContent = "";
    var list = h("ul", { class: "file-list" });
    var files = lockFiles.slice();
    var total = files.length;
    try {
      var st = await EW.entropy.stampNow();
      for (var i = 0; i < total; i++) {
        var f = files[i];
        var base = (i / total) * 100, step = 100 / total;
        var label = total > 1 ? " (" + (i + 1) + " dari " + total + ")" : "";
        progress("lock", base, "Membaca " + f.name + label + "…");
        var bytes = new Uint8Array(await f.arrayBuffer());
        var meta = {
          name: f.name, type: f.type || "application/octet-stream", size: f.size,
          lockedAt: new Date().toISOString(),
          stamp: { place: st.place, desc: st.desc, temp: st.temp, id: st.id, sky: st.sky }
        };
        var out = await EW.crypto.ewall.encrypt(bytes, meta, lpass.value, EW.config.PBKDF2_ITERS, function (stage) {
          if (stage === "kdf") progress("lock", base + step * 0.1, "Menurunkan kunci (PBKDF2, 600.000 iterasi)" + label + "…");
          else progress("lock", base + step * 0.5, "Mengenkripsi " + f.name + label + "…");
        });
        U.wipe(bytes);
        var name = "locked-" + U.toHex(U.randomBytes(4)) + ".ewall";
        var blob = new Blob([out], { type: "application/octet-stream" });
        ui.download(blob, name);
        var again = h("button", { type: "button", class: "btn btn-ghost btn-sm" }, [ui.icon("download"), "Unduh lagi"]);
        (function (b, n) { again.addEventListener("click", function () { ui.download(b, n); }); })(blob, name);
        list.appendChild(h("li", {}, [ui.icon("lock"), h("span", { class: "file-name mono", text: name }), h("span", { class: "muted", text: U.fmtBytes(out.length) }), again]));
        ui.record("lock", { fileSize: f.size }, { silent: i < total - 1 });
      }
      progress("lock", 100, total > 1 ? total + " file dikunci." : "File dikunci.");
      done.appendChild(h("div", { class: "status status-ok" }, [ui.icon("check"), h("div", {}, [
        h("strong", { text: total > 1 ? total + " file dikunci" : "File dikunci" }),
        h("p", { text: "Nama asli tersimpan di dalam file terenkripsi. Simpan passphrase-mu: tanpa itu file tidak bisa dibuka." })
      ])]));
      done.appendChild(list);
      var sc = h("div");
      done.appendChild(sc);
      ui.stampCard(sc, st, "Dikunci");
      ui.toast(total > 1 ? total + " file dikunci" : "File dikunci");
      lockFiles = [];
      renderLockFiles();
      lpass.value = lpass2.value = "";
      setVisible(false);
      rate();
    } catch (ex) {
      err.textContent = "Gagal mengunci. File mungkin terlalu besar untuk memori browser ini; coba Python CLI.";
    } finally {
      btn.disabled = !EW.cryptoAvailable;
    }
  });

  /* ---------- Buka ---------- */
  ui.dropZone($("#unlock-drop"), {
    multiple: false, accept: ".ewall,application/octet-stream", text: "Tarik file .ewall ke sini, atau",
    onFiles: async function (files) {
      var f = files[0];
      var ul = $("#unlock-file");
      ul.textContent = "";
      $("#unlock-error").textContent = "";
      unlockFile = null;
      var head = new Uint8Array(await f.slice(0, 64).arrayBuffer());
      var hdr = EW.crypto.ewall.parseHeader(head.length >= 54 ? head : new Uint8Array(54).fill(0));
      if (!hdr.ok || head.length < 54) {
        ul.appendChild(h("li", { class: "is-bad" }, [ui.icon("alert"), h("span", { class: "file-name", text: f.name }),
          h("span", { text: "Bukan file .ewall v1 yang valid." })]));
        return;
      }
      unlockFile = f;
      ul.appendChild(h("li", {}, [ui.icon("lock"), h("span", { class: "file-name", text: f.name }),
        h("span", { class: "muted", text: U.fmtBytes(f.size) + ", PBKDF2 " + U.fmtNum(hdr.iters) + " iterasi" })]));
      $("#upass").focus();
    }
  });

  function forget() {
    if (opened) { U.wipe(opened.data); opened = null; }
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $("#preview").textContent = "";
    $("#meta-list").textContent = "";
    $("#unlock-out").hidden = true;
    $("#unlock-empty").hidden = false;
  }

  $("#form-unlock").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#unlock-error");
    err.textContent = "";
    if (!unlockFile) { err.textContent = "Pilih file .ewall dulu."; return; }
    if (!$("#upass").value) { err.textContent = "Masukkan passphrase."; $("#upass").focus(); return; }
    var btn = $("#btn-unlock");
    btn.disabled = true;
    forget();
    try {
      progress("unlock", 5, "Membaca file…");
      var buf = new Uint8Array(await unlockFile.arrayBuffer());
      var res = await EW.crypto.ewall.decrypt(buf, $("#upass").value, function (stage) {
        if (stage === "kdf") progress("unlock", 20, "Menurunkan kunci (PBKDF2)…");
        else progress("unlock", 60, "Mendekripsi dan memeriksa integritas…");
      });
      progress("unlock", 100, "File terbuka.");
      opened = res;
      $("#upass").value = "";
      showOpened(res);
      ui.toast("File dibuka");
    } catch (ex) {
      $("#unlock-progress").hidden = true;
      err.textContent = ex.code === "NOT_EWALL"
        ? "Bukan file .ewall v1 yang valid."
        : "Tidak bisa membuka. Passphrase salah atau file rusak/diubah. Tidak ada file yang dihasilkan.";
    } finally {
      btn.disabled = !EW.cryptoAvailable;
    }
  });

  function safeName(n) {
    var s = String(n || "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 180);
    return s || "file";
  }

  function showOpened(res) {
    var m = res.meta || {};
    var dl = $("#meta-list");
    dl.textContent = "";
    function row(k, v) { dl.appendChild(h("dt", { text: k })); dl.appendChild(h("dd", { text: v })); }
    row("Nama asli", safeName(m.name));
    row("Tipe", String(m.type || "tidak diketahui"));
    row("Ukuran", U.fmtBytes(res.data.length) + (typeof m.size === "number" && m.size !== res.data.length ? " (metadata menyebut " + U.fmtBytes(m.size) + ")" : ""));
    var at = Date.parse(m.lockedAt);
    if (!isNaN(at)) row("Dikunci", U.fmtDateTime(at, 25200));
    row("KDF", "PBKDF2-HMAC-SHA256, " + U.fmtNum(res.iters) + " iterasi");
    var st = m.stamp;
    var card = $("#ustamp");
    if (st && typeof st === "object" && st.place) {
      ui.stampCard(card, { place: String(st.place), desc: st.desc ? String(st.desc) : null, temp: typeof st.temp === "number" ? st.temp : null, id: st.id ? String(st.id).slice(0, 8) : null, sky: typeof st.sky === "string" ? st.sky : null, at: m.lockedAt, tz: 25200 }, "Dikunci");
    } else card.hidden = true;

    var pv = $("#preview");
    pv.textContent = "";
    var type = String(m.type || "");
    var name = String(m.name || "").toLowerCase();
    if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type)) {
      previewUrl = URL.createObjectURL(new Blob([res.data], { type: type }));
      pv.appendChild(h("img", { src: previewUrl, alt: "Pratinjau " + safeName(m.name) }));
    } else if (/^text\/|json|xml|csv/.test(type) || /\.(txt|md|csv|json|log)$/.test(name)) {
      var text = new TextDecoder("utf-8", { fatal: false }).decode(res.data.subarray(0, 8192));
      pv.appendChild(h("pre", { class: "mono text-preview", text: text + (res.data.length > 8192 ? "\n…" : "") }));
    } else {
      pv.appendChild(h("p", { class: "hint", text: "Tidak ada pratinjau untuk tipe file ini." }));
    }
    $("#btn-save-label").textContent = "Unduh " + safeName(m.name);
    $("#unlock-empty").hidden = true;
    $("#unlock-out").hidden = false;
  }

  $("#btn-save").addEventListener("click", function () {
    if (!opened) return;
    ui.download(new Blob([opened.data], { type: (opened.meta && opened.meta.type) || "application/octet-stream" }), safeName(opened.meta && opened.meta.name));
  });
  $("#btn-forget").addEventListener("click", function () { forget(); ui.toast("Isi file dihapus dari memori tab"); });

  ui.tabs(document.querySelector(".tabs"));
})();
