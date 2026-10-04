/* WEACRYPT: Shamir Secret Sharing di GF(2^8), polinomial reduksi 0x11B (sama dengan AES).
   Format share: EW-SSS1-{k}of{n}-{x}-{groupId}-{hexData}-{crc}
   Format ini milik WEACRYPT, bukan SLIP-39. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;

  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function buildTables() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      // x * 3 = x ^ xtime(x), generator 0x03 untuk 0x11B
      var x2 = x << 1;
      if (x2 & 0x100) x2 ^= 0x11b;
      x = x2 ^ x;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }
  function div(a, b) {
    if (b === 0) throw new Error("bagi nol");
    if (a === 0) return 0;
    return EXP[(LOG[a] + 255 - LOG[b]) % 255];
  }

  var MAX_SECRET = 1024;
  var RE = /^EW-SSS1-(\d{1,2})of(\d{1,2})-(\d{1,2})-([0-9a-f]{4})-([0-9a-f]+)-([0-9a-f]{4})$/;

  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  async function crcOf(body) { return (await EW.crypto.shaHex("SHA-256", body)).slice(0, 4); }

  /* -> Promise<string[]> */
  async function split(secretU8, k, n) {
    if (!(k >= 2 && k <= n && n <= 10)) throw fail("PARAMS", "Butuh 2 <= k <= n <= 10.");
    if (!secretU8.length) throw fail("EMPTY", "Rahasia kosong.");
    if (secretU8.length > MAX_SECRET) throw fail("TOO_LONG", "Rahasia maksimal 1.024 byte.");
    var check = (await EW.crypto.sha("SHA-256", secretU8)).subarray(0, 4);
    var payload = U.concat(secretU8, check);
    var groupId = U.toHex(U.randomBytes(2));
    var ys = [];
    for (var x = 1; x <= n; x++) ys.push(new Uint8Array(payload.length));
    var coeffs = new Uint8Array(k - 1);
    for (var b = 0; b < payload.length; b++) {
      crypto.getRandomValues(coeffs);
      for (var xi = 1; xi <= n; xi++) {
        // Horner: a0 + a1 x + ... + a(k-1) x^(k-1)
        var acc = 0;
        for (var c = k - 2; c >= 0; c--) acc = mul(acc, xi) ^ coeffs[c];
        acc = mul(acc, xi) ^ payload[b];
        ys[xi - 1][b] = acc;
      }
    }
    U.wipe(coeffs, payload);
    var out = [];
    for (var s = 0; s < n; s++) {
      var body = "EW-SSS1-" + k + "of" + n + "-" + (s + 1) + "-" + groupId + "-" + U.toHex(ys[s]);
      out.push(body + "-" + (await crcOf(body)));
      U.wipe(ys[s]);
    }
    return out;
  }

  /* -> Promise<{ ok, k, n, x, groupId, data, error }> */
  async function validateShare(str) {
    var s = String(str || "").trim().replace(/\s+/g, "");
    if (!s) return { ok: false, error: "Baris kosong." };
    var m = RE.exec(s.toLowerCase().replace(/^ew-sss1/, "EW-SSS1"));
    if (!m) return { ok: false, error: "Format tidak dikenali. Contoh: EW-SSS1-3of5-1-ab12-...-c0de" };
    var k = +m[1], n = +m[2], x = +m[3];
    if (!(k >= 2 && k <= n && n <= 10)) return { ok: false, error: "Nilai k/n tidak valid." };
    if (!(x >= 1 && x <= n)) return { ok: false, error: "Nomor share di luar 1 sampai " + n + "." };
    if (m[5].length % 2 || m[5].length < 10) return { ok: false, error: "Data share terpotong." };
    var body = "EW-SSS1-" + k + "of" + n + "-" + x + "-" + m[4] + "-" + m[5];
    if ((await crcOf(body)) !== m[6]) return { ok: false, error: "Checksum share tidak cocok. Kemungkinan salah ketik." };
    return { ok: true, k: k, n: n, x: x, groupId: m[4], data: U.fromHex(m[5]), text: body + "-" + m[6] };
  }

  /* -> Promise<Uint8Array> */
  async function combine(shares) {
    var parsed = [];
    for (var i = 0; i < shares.length; i++) {
      if (!String(shares[i]).trim()) continue;
      var v = await validateShare(shares[i]);
      if (!v.ok) throw fail("INVALID", "Share " + (i + 1) + ": " + v.error);
      parsed.push(v);
    }
    if (!parsed.length) throw fail("EMPTY", "Belum ada share.");
    var first = parsed[0];
    for (var j = 1; j < parsed.length; j++) {
      if (parsed[j].groupId !== first.groupId) throw fail("GROUP", "Share berasal dari set berbeda (group ID " + first.groupId + " dan " + parsed[j].groupId + "). Share dari set berbeda tidak bisa digabung.");
      if (parsed[j].k !== first.k || parsed[j].n !== first.n || parsed[j].data.length !== first.data.length) {
        throw fail("GROUP", "Share tidak berasal dari set yang sama.");
      }
    }
    var uniq = [];
    var seen = {};
    parsed.forEach(function (p) { if (!seen[p.x]) { seen[p.x] = 1; uniq.push(p); } });
    if (uniq.length < first.k) {
      throw fail("NOT_ENOUGH", "Share kurang: butuh " + first.k + " share berbeda, baru ada " + uniq.length + ".");
    }
    var use = uniq.slice(0, first.k);
    var len = first.data.length;
    var out = new Uint8Array(len);
    for (var b = 0; b < len; b++) {
      var acc = 0;
      for (var a = 0; a < use.length; a++) {
        var xa = use[a].x, num = 1, den = 1;
        for (var c = 0; c < use.length; c++) {
          if (c === a) continue;
          num = mul(num, use[c].x);
          den = mul(den, use[c].x ^ xa);
        }
        acc ^= mul(use[a].data[b], div(num, den));
      }
      out[b] = acc;
    }
    var secret = out.slice(0, len - 4);
    var check = (await EW.crypto.sha("SHA-256", secret)).subarray(0, 4);
    for (var q = 0; q < 4; q++) {
      if (check[q] !== out[len - 4 + q]) {
        U.wipe(out, secret);
        throw fail("CHECKSUM", "Checksum rahasia gagal. Ada share yang salah atau bukan dari set ini.");
      }
    }
    U.wipe(out);
    return secret;
  }

  EW.shamir = {
    split: split, combine: combine, validateShare: validateShare,
    MAX_SECRET: MAX_SECRET, _gf: { mul: mul, div: div, EXP: EXP, LOG: LOG }
  };
})();
