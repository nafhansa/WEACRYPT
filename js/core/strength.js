/* WEACRYPT: estimator entropi dan waktu crack. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;

  var LOG2_7776 = Math.log2(7776); // ≈ 12,925
  var UNIVERSE_YEARS = 1.38e10;
  var LABELS = ["Sangat lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];

  var MODELS = [
    { id: "online-throttled", label: "Online dibatasi", rate: 10 / 3600, rateLabel: "10 / jam", desc: "Situs dengan rate limit dan lockout" },
    { id: "online-fast", label: "Online tanpa batas", rate: 1e3, rateLabel: "1.000 / detik", desc: "Situs tanpa proteksi" },
    { id: "offline-slow", label: "Offline hash lambat", rate: 1e4, rateLabel: "10.000 / detik", desc: "Database bocor, hash pakai bcrypt/PBKDF2 kuat" },
    { id: "offline-fast", label: "Offline hash cepat", rate: 1e11, rateLabel: "10^11 / detik", desc: "Database bocor, hash MD5/SHA-1 tanpa salt, GPU rig" }
  ];

  function bitsFor(charsetSize, length) { return length * Math.log2(charsetSize); }
  function bitsForPassphrase(words) { return words * LOG2_7776; }

  /* Ambang skor mengikuti zxcvbn (tebakan 10^3, 10^6, 10^8, 10^10). */
  function scoreFromBits(bits) {
    if (bits < 10) return 0;
    if (bits < 19.93) return 1;
    if (bits < 26.58) return 2;
    if (bits < 33.22) return 3;
    return 4;
  }

  var SCALE = [
    { s: 1e12, w: "triliun" }, { s: 1e9, w: "miliar" }, { s: 1e6, w: "juta" }, { s: 1e3, w: "ribu" }
  ];

  function bigNumWords(n) {
    for (var i = 0; i < SCALE.length; i++) {
      if (n >= SCALE[i].s) return U.fmtNum(n / SCALE[i].s, n / SCALE[i].s < 10 ? 1 : 0) + " " + SCALE[i].w;
    }
    return U.fmtNum(n, n < 10 ? 1 : 0);
  }

  /* Format durasi manusiawi dari log10(detik) agar aman untuk bit yang sangat besar. */
  function humanFromLog10(l10) {
    var yearsL10 = l10 - Math.log10(31557600);
    if (yearsL10 > Math.log10(UNIVERSE_YEARS)) return "lebih lama dari umur alam semesta";
    var sec = Math.pow(10, l10);
    if (sec < 1) return "kurang dari 1 detik";
    if (sec < 60) return U.fmtNum(Math.round(sec)) + " detik";
    if (sec < 3600) return U.fmtNum(Math.round(sec / 60)) + " menit";
    if (sec < 86400) return U.fmtNum(Math.round(sec / 3600)) + " jam";
    if (sec < 31557600) return U.fmtNum(Math.round(sec / 86400)) + " hari";
    return bigNumWords(sec / 31557600) + " tahun";
  }

  // seconds = 2^(bits-1) / guessesPerSecond (rata-rata setengah ruang)
  function crackTimes(bits) {
    return MODELS.map(function (m) {
      var l10 = (bits - 1) * Math.LOG10E * Math.LN2 - Math.log10(m.rate);
      return { id: m.id, label: m.label, rate: m.rate, rateLabel: m.rateLabel, desc: m.desc, log10Seconds: l10, human: humanFromLog10(l10) };
    });
  }

  /* ---------- Estimator internal (dipakai bila zxcvbn gagal dimuat) ---------- */
  var KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "qazwsxedc", "1qaz2wsx3edc"];
  var LEET = { "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g" };
  var commonRank = null;

  function commonMap() {
    if (commonRank) return commonRank;
    commonRank = new Map();
    var list = (EW.data && EW.data.common) || [];
    list.forEach(function (w, i) { commonRank.set(w, i + 1); });
    return commonRank;
  }

  function unleet(s) { return s.replace(/[4@31!05$7+89]/g, function (c) { return LEET[c] || c; }); }

  function poolSize(pw) {
    var n = 0;
    if (/[a-z]/.test(pw)) n += 26;
    if (/[A-Z]/.test(pw)) n += 26;
    if (/[0-9]/.test(pw)) n += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) n += 33;
    return Math.max(n, 10);
  }

  function estimateInternal(pw) {
    var feedback = [];
    if (!pw) return { score: 0, bits: 0, guessesLog10: 0, feedback: ["Ketik password untuk dianalisis."], source: "internal" };
    var lower = pw.toLowerCase();
    var map = commonMap();
    var rank = map.get(lower) || map.get(unleet(lower));
    if (rank) {
      var b0 = Math.log2(rank + 1);
      return {
        score: 0, bits: b0, guessesLog10: b0 * Math.log10(2),
        feedback: ["Ini termasuk " + U.fmtNum(map.size) + " password paling umum (peringkat " + U.fmtNum(rank) + ").", "Penyerang mencoba daftar ini pertama kali."],
        source: "internal"
      };
    }
    var n = pw.length;
    var covered = new Array(n).fill(false);
    var bits = 0;
    var pool = Math.log2(poolSize(pw));
    function cover(i, len, b, msg) {
      for (var k = i; k < i + len; k++) covered[k] = true;
      bits += b;
      if (msg && feedback.indexOf(msg) === -1) feedback.push(msg);
    }
    function free(i, len) { for (var k = i; k < i + len; k++) if (covered[k]) return false; return true; }

    // kata umum di dalam password (min 4 huruf), cocok panjang dulu
    var ul = unleet(lower);
    for (var len = Math.min(n, 12); len >= 4; len--) {
      for (var i = 0; i + len <= n; i++) {
        if (!free(i, len)) continue;
        var r = map.get(ul.substr(i, len)) || map.get(lower.substr(i, len));
        if (r) cover(i, len, Math.log2(r + 1) + 1, "Mengandung kata/password umum. Penyerang memakai kamus.");
      }
    }
    // tahun 1900-2039
    var yr = /(19|20)\d\d/g, m;
    while ((m = yr.exec(pw))) {
      if (free(m.index, 4) && (m[0] < "2040")) cover(m.index, 4, Math.log2(140), "Tahun mudah ditebak, apalagi tahun lahir.");
    }
    // urutan dan pola keyboard (min 3 karakter)
    var seqs = KEYBOARD_ROWS.concat(["abcdefghijklmnopqrstuvwxyz"]);
    for (var a = 0; a < n; a++) {
      for (var s = 0; s < seqs.length; s++) {
        var row = seqs[s], best = 0;
        [row, row.split("").reverse().join("")].forEach(function (rr) {
          for (var L = Math.min(n - a, rr.length); L >= 3; L--) {
            if (rr.indexOf(lower.substr(a, L)) !== -1) { if (L > best) best = L; break; }
          }
        });
        if (best >= 3 && free(a, best)) {
          cover(a, best, Math.log2(seqs.length * 2 * 26) + Math.log2(best), "Urutan seperti \"abc\", \"123\", atau \"qwerty\" langsung dicoba penyerang.");
        }
      }
    }
    // pengulangan karakter (aaa) dan pola berulang (abcabc)
    var rep = /(.+?)\1+/g;
    while ((m = rep.exec(pw))) {
      if (m[0].length >= 3 && free(m.index, m[0].length)) {
        cover(m.index, m[0].length, m[1].length * pool + Math.log2(m[0].length / m[1].length), "Pengulangan menambah panjang tapi hampir tidak menambah kekuatan.");
      }
    }
    for (var c = 0; c < n; c++) if (!covered[c]) bits += pool;
    if (n < 12) feedback.push("Terlalu pendek. Panjang lebih penting daripada simbol.");
    if (/^[a-z]+$/.test(pw) || /^\d+$/.test(pw)) feedback.push("Hanya satu jenis karakter.");
    if (!feedback.length) feedback.push("Tidak ada pola umum yang terdeteksi.");
    return { score: scoreFromBits(bits), bits: bits, guessesLog10: bits * Math.log10(2), feedback: feedback, source: "internal" };
  }

  var ZX_WARN = {
    "Straight rows of keys are easy to guess": "Baris tombol keyboard mudah ditebak.",
    "Short keyboard patterns are easy to guess": "Pola keyboard pendek mudah ditebak.",
    "Repeats like \"aaa\" are easy to guess": "Pengulangan seperti \"aaa\" mudah ditebak.",
    "Repeats like \"abcabcabc\" are only slightly harder to guess than \"abc\"": "Pola berulang seperti \"abcabc\" hampir sama lemahnya dengan \"abc\".",
    "Sequences like abc or 6543 are easy to guess": "Urutan seperti abc atau 6543 mudah ditebak.",
    "Recent years are easy to guess": "Tahun-tahun terakhir mudah ditebak.",
    "Dates are often easy to guess": "Tanggal sering mudah ditebak.",
    "This is a top-10 common password": "Ini termasuk 10 password paling umum.",
    "This is a top-100 common password": "Ini termasuk 100 password paling umum.",
    "This is a very common password": "Ini password yang sangat umum.",
    "This is similar to a commonly used password": "Ini mirip password yang umum dipakai.",
    "A word by itself is easy to guess": "Satu kata saja mudah ditebak.",
    "Names and surnames by themselves are easy to guess": "Nama saja mudah ditebak.",
    "Common names and surnames are easy to guess": "Nama umum mudah ditebak."
  };

  function estimateTyped(pw) {
    if (typeof window.zxcvbn === "function" && pw) {
      var r = window.zxcvbn(pw.slice(0, 100));
      var fb = [];
      if (r.feedback.warning) fb.push(ZX_WARN[r.feedback.warning] || r.feedback.warning);
      if (r.score < 3) fb.push("Pakai passphrase acak 5 kata atau lebih, atau password acak dari Key Forge.");
      if (!fb.length) fb.push("Tidak ada pola umum yang terdeteksi.");
      return { score: r.score, bits: r.guesses_log10 / Math.log10(2), guessesLog10: r.guesses_log10, feedback: fb, source: "zxcvbn" };
    }
    return estimateInternal(pw);
  }

  EW.strength = {
    LABELS: LABELS, MODELS: MODELS, LOG2_7776: LOG2_7776,
    bitsFor: bitsFor, bitsForPassphrase: bitsForPassphrase,
    crackTimes: crackTimes, humanFromLog10: humanFromLog10,
    scoreFromBits: scoreFromBits,
    estimateTyped: estimateTyped, estimateInternal: estimateInternal,
    // Angka diverifikasi dari NIST SP 800-63B-4: min 15 karakter untuk password
    // sebagai faktor tunggal, min 8 bila dipakai sebagai bagian MFA.
    NIST_NOTE: "NIST SP 800-63B-4: minimal 15 karakter bila password jadi satu-satunya faktor (8 bila dipakai bersama MFA). Panjang lebih penting daripada simbol."
  };
})();
