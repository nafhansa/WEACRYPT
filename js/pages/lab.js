/* F8 Attack Lab + Randomness Tests */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  var SAMPLE_MSG = "Saldo rahasia: Rp 12.500.000";
  var AAD = "EW-LAB-NAIVE-v1";
  var victim = null;     // { fields, iv, ct, observedAt }
  var crackRate = null;  // kandidat per detik yang terukur di perangkat ini

  /* ================= Serangan 1 ================= */
  async function makeVictim() {
    await EW.weather.load();
    var c = EW.weather.current;
    var fields = EW.entropy.naiveFields(c);
    var keyBytes = await EW.entropy.naiveKeyBytes(fields);
    var key = await EW.crypto.importRawKey(keyBytes, false);
    var iv = U.randomBytes(12);
    var ct = await EW.crypto.aesGcmEncrypt(key, iv, U.utf8Encode(SAMPLE_MSG), AAD);
    victim = { fields: fields, keyHex: U.toHex(keyBytes), iv: iv, ct: ct, observedAt: c.observedAt };
    return victim;
  }

  $("#btn-naive").addEventListener("click", async function () {
    var v = await makeVictim();
    $("#victim-out").hidden = false;
    $("#v-fields").textContent = U.canonicalJSON(v.fields);
    $("#v-key").textContent = v.keyHex;
    $("#v-iv").textContent = U.toHex(v.iv);
    $("#v-ct").textContent = U.b64urlEncode(v.ct);
    $("#btn-hack").disabled = false;
    $("#timeline").textContent = "";
    $("#shatter").hidden = true;
    ui.toast("Kunci naif dibuat dan pesan dienkripsi");
  });

  function step(text, detail) {
    var li = h("li", {}, [h("span", { class: "tl-text", text: text })]);
    if (detail) li.appendChild(h("span", { class: "tl-detail mono", text: detail }));
    $("#timeline").appendChild(li);
  }

  $("#btn-hack").addEventListener("click", async function () {
    if (!victim) return;
    $("#timeline").textContent = "";
    $("#shatter").hidden = true;
    var t0 = performance.now();
    // Penyerang di kota yang sama: endpoint yang sama, atau cache yang sama (data identik dalam 10 menit).
    await EW.weather.load();
    var c = EW.weather.current;
    step("1. Memanggil endpoint OpenWeatherMap untuk Bandung (1 permintaan API)", EW.weather.requestUrlMasked());
    var fields = EW.entropy.naiveFields(c);
    var keyBytes = await EW.entropy.naiveKeyBytes(fields);
    step("2. Menurunkan kunci yang sama: SHA-256 dari JSON cuaca", U.toHex(keyBytes));
    var pt;
    try {
      pt = await EW.crypto.aesGcmDecrypt(await EW.crypto.importRawKey(keyBytes, false), victim.iv, victim.ct, AAD);
    } catch (e) {
      // Observasi OWM sudah berganti: penyerang memakai data historis jam yang sama.
      step("Observasi sudah berganti. Penyerang memakai data cuaca historis jam yang sama (layanan cuaca historis itu publik).");
      keyBytes = await EW.entropy.naiveKeyBytes(victim.fields);
      pt = await EW.crypto.aesGcmDecrypt(await EW.crypto.importRawKey(keyBytes, false), victim.iv, victim.ct, AAD);
    }
    var ms = performance.now() - t0;
    step("3. AES-GCM dekripsi berhasil, tag valid", U.fmtNum(ms, 1) + " ms total");
    var sh = $("#shatter");
    $("#shatter-text").textContent = "Kunci ditemukan dalam 1 permintaan API. Plaintext: \"" + U.utf8Decode(pt) + "\"";
    sh.hidden = false;
    sh.classList.remove("is-breaking");
    void sh.offsetWidth;
    if (!U.reducedMotion()) sh.classList.add("is-breaking");
    ui.toast("Kunci naif dibobol");
  });

  /* ================= Serangan 2: ruang kunci ================= */
  var SPACE = [
    ["Suhu", "15 sampai 35 °C", "0,01", 2001],
    ["Humidity", "0 sampai 100 %", "1", 101],
    ["Pressure", "1000 sampai 1020 hPa", "1", 21],
    ["Wind speed", "0 sampai 15 m/s", "0,01", 1501],
    ["Wind deg", "0 sampai 359", "1", 360],
    ["Clouds", "0 sampai 100 %", "1", 101]
  ];
  (function renderSpace() {
    var tb = $("#space-body"), total = 1;
    SPACE.forEach(function (r) {
      total *= r[3];
      tb.appendChild(h("tr", {}, [h("th", { scope: "row", text: r[0] }), h("td", { text: r[1] }), h("td", { text: r[2] }),
        h("td", { class: "num", text: U.fmtNum(r[3]) }), h("td", { class: "num", text: U.fmtNum(Math.log2(r[3]), 2) })]));
    });
    var bits = Math.log2(total);
    var exp = Math.floor(Math.log10(total));
    $("#space-total").textContent = "≈ " + U.fmtNum(total / Math.pow(10, exp), 1) + " × 10^" + exp;
    $("#space-bits").textContent = "≈ " + U.fmtNum(bits, 1);
    var gpuSec = Math.pow(2, bits - 1) / 1e10;
    $("#gpu-time").textContent = "≈ " + U.fmtNum(gpuSec / 3600, 1) + " jam";
    var l10 = 255 * Math.log10(2) - 10;
    var yrs = l10 - Math.log10(31557600);
    $("#csprng-time").textContent = EW.strength.humanFromLog10(l10);
    $("#csprng-years").textContent = "≈ " + U.fmtNum(Math.pow(10, yrs - Math.floor(yrs)), 1) + " × 10^" + Math.floor(yrs) + " tahun rata-rata.";
  })();

  /* ================= Serangan 2: demo live ================= */
  var UNKNOWN = [
    { name: "windDeg", label: "wind.deg", from: 0, to: 359, step: 1 },
    { name: "clouds", label: "clouds", from: 0, to: 100, step: 1 },
    { name: "humidity", label: "humidity", from: 0, to: 100, step: 1 },
    { name: "pressure", label: "pressure", from: 1000, to: 1020, step: 1 }
  ];
  function countFor(n) { return UNKNOWN.slice(0, n).reduce(function (a, u) { return a * ((u.to - u.from) / u.step + 1); }, 1); }

  function describeUnknown() {
    var n = +$("#unknown").value;
    $("#unknown-out").textContent = String(n);
    var total = countFor(n);
    var rate = crackRate || 20000;
    var browser = EW.strength.humanFromLog10(Math.log10(total / rate));
    var gpu = EW.strength.humanFromLog10(Math.log10(total / 1e10));
    var names = UNKNOWN.slice(0, n).map(function (u) { return u.label; }).join(", ");
    $("#unknown-desc").textContent = "Tidak diketahui: " + names + ". " + U.fmtNum(total) + " kandidat. Di browser ini " +
      (crackRate ? "" : "kira-kira ") + browser + " (" + U.fmtNum(rate) + " kandidat/detik" + (crackRate ? ", terukur" : ", perkiraan") + "); GPU: " + gpu + "." +
      (n === 4 ? " Tidak dijalankan di browser karena tidak masuk akal, tapi tetap mudah untuk GPU." : "");
    $("#btn-brute").disabled = n === 4 || !EW.cryptoAvailable;
  }
  $("#unknown").addEventListener("input", describeUnknown);
  describeUnknown();

  var job = null;
  $("#btn-brute").addEventListener("click", async function () {
    var n = +$("#unknown").value;
    if (n === 4) return;
    if (!victim) {
      await makeVictim();
      ui.toast("Ciphertext korban dibuat otomatis dari Serangan 1");
    }
    var unknown = UNKNOWN.slice(0, n);
    var known = {};
    Object.keys(victim.fields).forEach(function (k) {
      if (!unknown.some(function (u) { return u.name === k; })) known[k] = victim.fields[k];
    });
    var out = $("#brute-out"), bar = $("#brute-bar");
    out.hidden = false;
    $("#brute-stats").textContent = "";
    $("#brute-status").textContent = "Menyiapkan worker…";
    $("#btn-brute").disabled = true;
    $("#btn-brute-stop").hidden = false;
    var lastPaint = 0;
    job = EW.jobs.run({
      cmd: "crack", known: known, unknown: unknown,
      iv: Array.from(victim.iv), ct: Array.from(victim.ct), aad: Array.from(U.utf8Encode(AAD))
    }, function (m) {
      var pct = Math.min(100, (m.tried || 0) / (m.total || 1) * 100);
      var rate = m.ms > 0 ? m.tried / (m.ms / 1000) : 0;
      if (m.type === "progress") {
        var now = performance.now();
        if (now - lastPaint < 100) return;
        lastPaint = now;
        bar.setAttribute("aria-valuenow", String(Math.round(pct)));
        bar.firstElementChild.style.width = pct + "%";
        $("#brute-status").textContent = "Mencoba " + U.fmtNum(m.tried) + " dari " + U.fmtNum(m.total) + " kandidat, " + U.fmtNum(rate) + " kandidat/detik (" + (m.thread === "worker" ? "Web Worker" : "main thread") + ").";
        return;
      }
      $("#btn-brute").disabled = false;
      $("#btn-brute-stop").hidden = true;
      if (m.tried && m.ms > 200) crackRate = Math.round(rate);
      describeUnknown();
      if (m.type === "found") {
        bar.firstElementChild.style.width = pct + "%";
        $("#brute-status").textContent = "Kunci ditemukan.";
        var dl = $("#brute-stats");
        [["Kandidat dicoba", U.fmtNum(m.tried) + " dari " + U.fmtNum(m.total)],
         ["Waktu", U.fmtNum(m.ms / 1000, 2) + " detik"],
         ["Kecepatan", U.fmtNum(rate) + " kandidat/detik"],
         ["Field yang ditebak", m.json],
         ["Kunci", m.key],
         ["Plaintext", U.utf8Decode(new Uint8Array(m.plaintext))]].forEach(function (r) {
          dl.appendChild(h("dt", { text: r[0] })); dl.appendChild(h("dd", { class: r[0] === "Plaintext" || r[0] === "Kunci" || r[0] === "Field yang ditebak" ? "mono" : "", text: r[1] }));
        });
        ui.toast("Brute force berhasil dalam " + U.fmtNum(m.ms / 1000, 1) + " detik");
      } else if (m.type === "notfound") {
        $("#brute-status").textContent = "Tidak ditemukan di rentang ini. Nilai cuaca korban berada di luar rentang tebakan (misal pressure di luar 1000 sampai 1020).";
      } else if (m.type === "cancelled") {
        $("#brute-status").textContent = "Dihentikan.";
      } else {
        $("#brute-status").textContent = "Brute force gagal berjalan di browser ini.";
      }
    });
  });
  $("#btn-brute-stop").addEventListener("click", function () { if (job) job.cancel(); });

  /* ================= Uji randomness ================= */
  var SIZE = 1048576;
  var VERDICT = {
    mixer: ["ok", "Aman: lolos uji dan tidak bisa ditebak, karena bersandar pada 256 bit CSPRNG sistem operasi."],
    math: ["warn", "Tidak aman secara kriptografis. Math.random() lolos uji statistik, tapi keluarannya bisa diprediksi dari keluaran sebelumnya."],
    weather: ["warn", "Dapat diprediksi. Siapa pun dengan data cuaca yang sama bisa membuat ulang semua byte ini, dan uji statistik tidak bisa mendeteksinya."],
    lcg: ["bad", "Generator buruk: state 8 bit, periodenya cuma 256 byte lalu berulang."]
  };

  async function sample(src) {
    var out = new Uint8Array(SIZE), i;
    if (src === "mixer") return EW.entropy.derive("lab-sample", SIZE);
    if (src === "math") { for (i = 0; i < SIZE; i++) out[i] = Math.floor(Math.random() * 256); return out; }
    if (src === "weather") {
      var hsh = EW.wlib.sha256(U.utf8Encode(U.canonicalJSON(EW.entropy.weatherFields())));
      for (i = 0; i < SIZE; i += 32) { out.set(hsh.subarray(0, Math.min(32, SIZE - i)), i); hsh = EW.wlib.sha256(hsh); }
      return out;
    }
    // LCG 8 bit: x = (5x + 1) mod 256
    var x = 42;
    for (i = 0; i < SIZE; i++) { x = (5 * x + 1) & 255; out[i] = x; }
    return out;
  }

  function verdictCell(r) {
    return h("td", {}, [h("span", { class: "tag " + (r.pass ? "tag-ok" : "tag-danger") }, [ui.icon(r.pass ? "check" : "x"), r.pass ? "Lolos" : "Gagal"])]);
  }

  $("#btn-tests").addEventListener("click", async function () {
    var btn = $("#btn-tests");
    btn.disabled = true;
    btn.textContent = "Menguji…";
    try {
      var src = document.querySelector('input[name="src"]:checked').value;
      await U.sleep(20);
      var data = await sample(src);
      var tests = [EW.stats.monobit(data), EW.stats.chiSquare(data), EW.stats.runs(data)];
      var tb = $("#tests-body");
      tb.textContent = "";
      tests.forEach(function (t) {
        var stat = t.name === "Monobit" ? "proporsi 1 = " + U.fmtNum(t.proportion, 5) + ", z = " + U.fmtNum(t.z, 3)
          : t.name === "Chi-square" ? "χ² = " + U.fmtNum(t.statistic, 1) + ", df " + t.df + (t.tooUniform ? " (terlalu seragam)" : "")
          : t.runs === null ? t.note : "runs = " + U.fmtNum(t.runs) + ", harapan " + U.fmtNum(t.expected, 0);
        tb.appendChild(h("tr", {}, [h("th", { scope: "row", text: t.name }), h("td", { text: stat }), h("td", { class: "num mono", text: t.p < 1e-6 ? "< 0,000001" : U.fmtNum(t.p, 4) }), verdictCell(t)]));
      });
      var v = VERDICT[src];
      var pv = $("#source-verdict");
      pv.className = "source-verdict tag tag-" + (v[0] === "ok" ? "ok" : v[0] === "bad" ? "danger" : "warn");
      pv.textContent = "";
      pv.appendChild(ui.icon(v[0] === "ok" ? "check" : "alert"));
      pv.appendChild(document.createTextNode(v[1]));
      EW.stats.drawBitmap($("#bitmap"), data);
      $("#tests-out").hidden = false;
    } finally {
      btn.disabled = !EW.cryptoAvailable;
      btn.textContent = "Jalankan uji";
    }
  });

  $("#btn-forge-test").addEventListener("click", async function () {
    var btn = $("#btn-forge-test");
    btn.disabled = true;
    var box = $("#forge-out");
    box.textContent = "";
    box.appendChild(h("p", { class: "hint", text: "Membuat 100.000 karakter dengan generator Key Forge (charset 94)…" }));
    try {
      var cs = EW.entropy.charset({ lower: true, upper: true, digits: true, symbols: true });
      var s = await EW.entropy.stream("password");
      var counts = new Float64Array(cs.length), N = 100000;
      for (var i = 0; i < N; i++) counts[await EW.entropy.randomInt(cs.length, s)]++;
      s.close();
      var r = EW.stats.chiSquareCounts(counts, N);
      var ok = r.p > 0.01;
      box.textContent = "";
      box.appendChild(h("div", { class: "status " + (ok ? "status-ok" : "status-danger") }, [ui.icon(ok ? "check" : "x"), h("div", {}, [
        h("strong", { text: ok ? "Distribusi karakter seragam" : "Distribusi menyimpang (ulangi uji; di α = 0,01 ini terjadi ~1% dari waktu)" }),
        h("p", { text: "100.000 karakter dari charset " + cs.length + ": χ² = " + U.fmtNum(r.statistic, 1) + ", df " + r.df + ", p = " + U.fmtNum(r.p, 4) + " (lolos bila p > 0,01). Frekuensi min " + Math.min.apply(null, counts) + ", max " + Math.max.apply(null, counts) + ", harapan " + U.fmtNum(N / cs.length, 1) + "." })
      ])]));
    } finally {
      btn.disabled = !EW.cryptoAvailable;
    }
  });
})();
