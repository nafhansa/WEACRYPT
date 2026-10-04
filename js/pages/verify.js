/* F9 Integrity Checker */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  var WARN = 500 * 1024 * 1024;
  var file = null, fileHash = null, textHash = null;
  var cmp = { a: null, b: null };

  function algo() { return $("#algo").value; }
  function norm(s) { return String(s || "").replace(/\s+/g, "").toLowerCase().replace(/^(sha(1|256|384|512)[:=-]?)/, ""); }

  async function hashFile(f) {
    var buf = new Uint8Array(await f.arrayBuffer());
    var d = await EW.crypto.shaHex(algo(), buf);
    return d;
  }

  /* Bandingkan dan tampilkan, sorot karakter pertama yang berbeda. */
  function compare(actual, expectedRaw, hashEl, resultEl, record) {
    resultEl.textContent = "";
    hashEl.textContent = actual || "-";
    var exp = norm(expectedRaw);
    if (!actual || !exp) return;
    var match = exp === actual;
    if (!match) {
      var i = 0;
      while (i < actual.length && actual[i] === exp[i]) i++;
      hashEl.textContent = "";
      hashEl.appendChild(document.createTextNode(actual.slice(0, i)));
      hashEl.appendChild(h("mark", { class: "diff", text: actual.charAt(i) || "∅" }));
      hashEl.appendChild(document.createTextNode(actual.slice(i + 1)));
      var lenNote = exp.length !== actual.length ? " Panjang hash yang ditempel " + exp.length + " karakter, " + algo() + " menghasilkan " + actual.length + "." : "";
      resultEl.appendChild(h("div", { class: "status status-danger" }, [ui.icon("x"), h("div", {}, [
        h("strong", { text: "Tidak cocok" }),
        h("p", { text: "Berbeda mulai karakter ke-" + (i + 1) + "." + lenNote + " Jangan pakai file ini; unduh ulang dari sumber resmi." })
      ])]));
    } else {
      resultEl.appendChild(h("div", { class: "status status-ok" }, [ui.icon("check"), h("div", {}, [
        h("strong", { text: "Cocok" }),
        h("p", { text: "Hash " + algo() + " identik dengan yang diharapkan." + (algo() === "SHA-1" ? " Catatan: SHA-1 sudah bisa ditabrakkan, pakai SHA-256 bila tersedia." : "") })
      ])]));
    }
    // Catat ke ledger sekali per pasangan, dan hanya bila hash yang ditempel sudah lengkap.
    var key = actual + "|" + exp;
    if (record && exp.length === actual.length && key !== lastRecorded) {
      lastRecorded = key;
      ui.record("verify", { result: match ? "match" : "mismatch" }, { silent: true });
    }
  }
  var lastRecorded = null;

  /* ---------- File ---------- */
  ui.dropZone($("#file-drop"), {
    multiple: false,
    onFiles: function (files) { file = files[0]; runFile(true); }
  });

  async function runFile(record) {
    if (!file) return;
    var info = $("#file-info");
    info.textContent = "";
    info.appendChild(h("li", {}, [ui.icon("file"), h("span", { class: "file-name", text: file.name }), h("span", { class: "muted", text: U.fmtBytes(file.size) }),
      file.size > WARN ? h("span", { class: "tag tag-warn", text: "Lebih dari 500 MB: butuh memori besar" }) : null]));
    $("#file-hash").textContent = "Menghitung " + algo() + "…";
    $("#file-result").textContent = "";
    try {
      fileHash = await hashFile(file);
      $("#btn-copy-file").disabled = false;
      compare(fileHash, $("#expected").value, $("#file-hash"), $("#file-result"), record && !!norm($("#expected").value));
    } catch (e) {
      $("#file-hash").textContent = "-";
      $("#file-result").appendChild(h("p", { class: "error-text", text: "Gagal membaca file. Bila file sangat besar, memori browser mungkin tidak cukup." }));
    }
  }
  var expTimer = null;
  $("#expected").addEventListener("input", function () {
    clearTimeout(expTimer);
    expTimer = setTimeout(function () { if (fileHash) compare(fileHash, $("#expected").value, $("#file-hash"), $("#file-result"), true); }, 400);
  });
  $("#btn-copy-file").addEventListener("click", function () { if (fileHash) ui.copy(fileHash); });

  /* ---------- Teks ---------- */
  var textTimer = null;
  async function runText(record) {
    var v = $("#text-in").value;
    textHash = await EW.crypto.shaHex(algo(), v);
    $("#btn-copy-text").disabled = false;
    compare(textHash, $("#text-expected").value, $("#text-hash"), $("#text-result"), record);
  }
  $("#text-in").addEventListener("input", function () { clearTimeout(textTimer); textTimer = setTimeout(function () { runText(false); }, 120); });
  $("#text-expected").addEventListener("input", function () {
    clearTimeout(textTimer);
    textTimer = setTimeout(function () { runText(!!norm($("#text-expected").value)); }, 400);
  });
  $("#btn-copy-text").addEventListener("click", function () { if (textHash) ui.copy(textHash); });

  /* ---------- Dua file ---------- */
  function cmpDrop(side) {
    ui.dropZone($("#drop-" + side), {
      multiple: false,
      onFiles: async function (files) {
        cmp[side] = { file: files[0], hash: null };
        $("#hash-" + side).textContent = files[0].name + ": menghitung…";
        cmp[side].hash = await hashFile(files[0]);
        $("#hash-" + side).textContent = files[0].name + " (" + U.fmtBytes(files[0].size) + "): " + cmp[side].hash;
        runCompare(true);
      }
    });
  }
  cmpDrop("a"); cmpDrop("b");

  function runCompare(record) {
    var box = $("#compare-result");
    box.textContent = "";
    if (!cmp.a || !cmp.b || !cmp.a.hash || !cmp.b.hash) return;
    var same = cmp.a.hash === cmp.b.hash;
    box.appendChild(h("div", { class: "status " + (same ? "status-ok" : "status-danger") }, [ui.icon(same ? "check" : "x"), h("div", {}, [
      h("strong", { text: same ? "Identik" : "Berbeda" }),
      h("p", { text: same ? "Kedua file punya hash " + algo() + " yang sama, isinya identik byte per byte." : "Hash " + algo() + " berbeda, isi kedua file tidak sama." })
    ])]));
    if (record) ui.record("verify", { result: same ? "match" : "mismatch" }, { silent: true });
  }

  $("#algo").addEventListener("change", async function () {
    if (file) await runFile(false);
    if ($("#text-in").value || textHash) await runText(false);
    for (var s of ["a", "b"]) if (cmp[s] && cmp[s].file) {
      cmp[s].hash = await hashFile(cmp[s].file);
      $("#hash-" + s).textContent = cmp[s].file.name + " (" + U.fmtBytes(cmp[s].file.size) + "): " + cmp[s].hash;
    }
    runCompare(false);
  });

  ui.tabs(document.querySelector(".tabs"));
})();
