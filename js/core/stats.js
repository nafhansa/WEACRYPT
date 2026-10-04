/* WEACRYPT: uji randomness sederhana (monobit, chi-square, runs) + bitmap.
   Pelajaran: acak secara statistik tidak sama dengan tidak bisa ditebak. */
(function () {
  "use strict";
  var EW = window.EW;
  var ALPHA = 0.01;

  // erfc (Numerical Recipes, akurasi ~1e-7)
  function erfc(x) {
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function normUpper(z) { return 0.5 * erfc(z / Math.SQRT2); }

  var POP = new Uint8Array(256);
  for (var i = 0; i < 256; i++) { var c = 0, v = i; while (v) { c += v & 1; v >>= 1; } POP[i] = c; }

  function monobit(u8) {
    var n = u8.length * 8, ones = 0;
    for (var i = 0; i < u8.length; i++) ones += POP[u8[i]];
    var s = ones - (n - ones);
    var z = Math.abs(s) / Math.sqrt(n);
    var p = erfc(z / Math.SQRT2);
    return { name: "Monobit", ones: ones, n: n, proportion: ones / n, z: z, p: p, pass: p >= ALPHA };
  }

  /* p-value upper tail via aproksimasi Wilson-Hilferty. */
  function chiSquareP(x2, df) {
    var a = 2 / (9 * df);
    var z = (Math.pow(x2 / df, 1 / 3) - (1 - a)) / Math.sqrt(a);
    return normUpper(z);
  }

  function chiSquareCounts(counts, total) {
    var k = counts.length, exp = total / k, x2 = 0;
    for (var i = 0; i < k; i++) { var d = counts[i] - exp; x2 += d * d / exp; }
    var df = k - 1;
    var p = chiSquareP(x2, df);
    // Distribusi yang terlalu sempurna (p sangat dekat 1) juga mencurigakan, misalnya LCG berperiode penuh.
    return { name: "Chi-square", statistic: x2, df: df, p: p, pass: p >= ALPHA && p <= 1 - 1e-4, tooUniform: p > 1 - 1e-4 };
  }

  function chiSquare(u8) {
    var counts = new Float64Array(256);
    for (var i = 0; i < u8.length; i++) counts[u8[i]]++;
    return chiSquareCounts(counts, u8.length);
  }

  /* Runs test (NIST SP 800-22 2.3). */
  function runs(u8) {
    var n = u8.length * 8, ones = 0;
    for (var i = 0; i < u8.length; i++) ones += POP[u8[i]];
    var pi = ones / n;
    if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
      return { name: "Runs", runs: null, expected: null, p: 0, pass: false, note: "Prasyarat monobit gagal" };
    }
    var V = 1, prev = (u8[0] >> 7) & 1;
    for (var b = 1; b < n; b++) {
      var bit = (u8[b >> 3] >> (7 - (b & 7))) & 1;
      if (bit !== prev) V++;
      prev = bit;
    }
    var expected = 2 * n * pi * (1 - pi);
    var p = erfc(Math.abs(V - expected) / (2 * Math.sqrt(2 * n) * pi * (1 - pi)));
    return { name: "Runs", runs: V, expected: expected, p: p, pass: p >= ALPHA };
  }

  /* Kanvas 256 x 256 grayscale dari 65.536 byte pertama. */
  function drawBitmap(canvas, u8) {
    canvas.width = 256; canvas.height = 256;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(256, 256);
    for (var i = 0; i < 65536; i++) {
      var v = i < u8.length ? u8[i] : 0;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  EW.stats = {
    ALPHA: ALPHA, erfc: erfc, chiSquareP: chiSquareP,
    monobit: monobit, chiSquare: chiSquare, chiSquareCounts: chiSquareCounts, runs: runs, drawBitmap: drawBitmap
  };
})();
