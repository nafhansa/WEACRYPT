/* P3 Tentang + self-test tersembunyi (?selftest=1) */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;
  if (new URLSearchParams(location.search).get("selftest") !== "1") return;

  var section = $("#selftest");
  section.hidden = false;
  var body = $("#st-body");
  var pass = 0, fail = 0;

  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "tidak sama") + ": " + a + " ≠ " + b); }
  function ok(cond, msg) { if (!cond) throw new Error(msg || "kondisi gagal"); }
  async function rejects(p, code) {
    try { await p; } catch (e) { if (code && e.code !== code) throw new Error("error " + e.code + ", harap " + code); return; }
    throw new Error("seharusnya gagal");
  }

  var TESTS = [
    ["SHA-256 vektor \"abc\"", async function () {
      var d = await EW.crypto.shaHex("SHA-256", "abc");
      eq(d, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      return d.slice(0, 16) + "…";
    }],
    ["SHA-256 JS murni = Web Crypto", async function () {
      var lens = [0, 1, 55, 56, 63, 64, 65, 119, 1000];
      for (var i = 0; i < lens.length; i++) {
        var m = U.randomBytes(lens[i]);
        eq(U.toHex(EW.wlib.sha256(m)), await EW.crypto.shaHex("SHA-256", m), "panjang " + lens[i]);
      }
      return lens.length + " panjang pesan";
    }],
    ["HKDF-SHA256 RFC 5869 kasus 1", async function () {
      var ikm = new Uint8Array(22).fill(0x0b);
      var salt = U.fromHex("000102030405060708090a0b0c");
      var info = U.fromHex("f0f1f2f3f4f5f6f7f8f9");
      var okm = await EW.crypto.hkdf(ikm, salt, info, 42);
      eq(U.toHex(okm), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
      return "OKM 42 byte cocok";
    }],
    ["PBKDF2 = Python hashlib.pbkdf2_hmac", async function () {
      var d = await EW.crypto.pbkdf2Bits("Entropy Wall", U.utf8Encode("garam-bandung-16"), 600000, 32);
      eq(U.toHex(d), "b9a48b7ccf3be32d8490db7dab4586e3454d8622dce529ecc8bcea2e553c5940");
      return "600.000 iterasi, 32 byte";
    }],
    ["AES-GCM round trip + deteksi tamper", async function () {
      var key = await EW.crypto.importRawKey(U.randomBytes(32));
      var iv = U.randomBytes(12), pt = U.utf8Encode("halo Bandung 🌧");
      var ct = await EW.crypto.aesGcmEncrypt(key, iv, pt, "aad");
      eq(U.utf8Decode(await EW.crypto.aesGcmDecrypt(key, iv, ct, "aad")), "halo Bandung 🌧");
      var bad = ct.slice(); bad[3] ^= 1;
      await rejects(EW.crypto.aesGcmDecrypt(key, iv, bad, "aad"), "DECRYPT_FAILED");
      await rejects(EW.crypto.aesGcmDecrypt(key, iv, ct, "lain"), "DECRYPT_FAILED");
      return "ciphertext dan AAD diubah: ditolak";
    }],
    ["Encoding: base64url, hex, canonicalJSON", async function () {
      for (var n = 0; n < 40; n++) {
        var b = U.randomBytes(n);
        eq(U.toHex(U.b64urlDecode(U.b64urlEncode(b))), U.toHex(b));
        eq(U.toHex(U.fromHex(U.toHex(b))), U.toHex(b));
      }
      eq(U.canonicalJSON({ b: 1, a: { d: [1, "x"], c: null }, e: 21.4 }), '{"a":{"c":null,"d":[1,"x"]},"b":1,"e":21.4}');
      return "40 panjang + JSON kanonik";
    }],
    ["Rejection sampling tanpa keluar rentang", async function () {
      var s = await EW.entropy.stream("selftest");
      var ns = [2, 10, 94, 256, 7776, 65536, 100000];
      for (var i = 0; i < ns.length; i++) {
        for (var j = 0; j < 300; j++) { var v = await EW.entropy.randomInt(ns[i], s); ok(v >= 0 && v < ns[i] && v === Math.floor(v), "n=" + ns[i] + " v=" + v); }
      }
      s.close();
      return ns.length + " ukuran rentang";
    }],
    ["Uniformitas generator (chi-square 100.000 karakter)", async function () {
      var cs = EW.entropy.charset({ lower: true, upper: true, digits: true, symbols: true });
      eq(cs.length, 94, "charset");
      async function once() {
        var s = await EW.entropy.stream("password"), counts = new Float64Array(94);
        for (var i = 0; i < 100000; i++) counts[await EW.entropy.randomInt(94, s)]++;
        s.close();
        return EW.stats.chiSquareCounts(counts, 100000);
      }
      // Generator sempurna pun gagal ~1% dari waktu di α = 0,01. Uji dua tahap: ulangi sekali
      // dengan sampel baru; dua kegagalan beruntun (peluang 0,01%) menandakan bias sungguhan.
      var r = await once(), note = "";
      if (r.p <= 0.01) { note = " (percobaan 1 p = " + r.p.toFixed(4) + ", diulang)"; r = await once(); }
      ok(r.p > 0.01, "p = " + r.p.toFixed(4) + note);
      return "χ² " + r.statistic.toFixed(1) + ", p = " + r.p.toFixed(3) + note;
    }],
    ["PIN lemah tidak pernah keluar (10.000 PIN)", async function () {
      var s = await EW.entropy.stream("pin"), lens = [4, 6, 8];
      for (var i = 0; i < 10000; i++) {
        var p = await EW.entropy.pin(lens[i % 3], s);
        ok(!EW.entropy.isWeakPin(p.value) && /^\d+$/.test(p.value) && p.value.length === lens[i % 3], "PIN " + p.value);
      }
      s.close();
      ["0000", "1234", "9876", "1999", "2030", "1950", "123456", "654321", "88888888"].forEach(function (w) { ok(EW.entropy.isWeakPin(w), w + " harus lemah"); });
      ok(!EW.entropy.isWeakPin("2031") && !EW.entropy.isWeakPin("1949"), "batas tahun");
      return "panjang 4, 6, 8";
    }],
    ["Passphrase hanya dari EFF wordlist", async function () {
      eq(EW.data.wordlist.length, 7776, "ukuran wordlist");
      var set = new Set(EW.data.wordlist);
      eq(set.size, 7776, "kata unik");
      var s = await EW.entropy.stream("passphrase");
      for (var i = 0; i < 300; i++) {
        // Pemisah spasi: EFF list memuat 4 kata bertanda hubung (drop-down, felt-tip, t-shirt, yo-yo).
        var p = await EW.entropy.passphrase({ words: 6, separator: " " }, s);
        p.value.split(" ").forEach(function (w) { ok(set.has(w), "kata " + w); });
      }
      s.close();
      ok(Math.abs(EW.strength.bitsForPassphrase(6) - 77.55) < 0.01, "bit passphrase");
      ok(Math.abs(EW.strength.bitsFor(94, 20) - 131.09) < 0.01, "bit password");
      return "300 passphrase, 1.800 kata";
    }],
    ["Sealed Message round trip (r dan p) + tamper", async function () {
      var msgs = ["password WiFi: kopi-susu-123", "emoji 🌋🌧️🔐", "aksara: ꦧꦤ꧀ꦢꦸꦁ, 万隆, Бандунг, باندونغ"];
      for (var i = 0; i < msgs.length; i++) {
        var t = await EW.crypto.seal.encrypt({ msg: msgs[i], mode: "r", rawKey: U.randomBytes(32), stamp: { place: "Bandung", id: "abcd1234" } });
        eq((await EW.crypto.seal.open(EW.crypto.seal.parse("https://x/open.html#" + t))).msg, msgs[i], "mode r");
      }
      var tp = await EW.crypto.seal.encrypt({ msg: msgs[1], mode: "p", passphrase: "kawah-putih-ciwidey" });
      eq((await EW.crypto.seal.open(EW.crypto.seal.parse(EW.crypto.seal.armor(tp)), "kawah-putih-ciwidey")).msg, msgs[1], "mode p armored");
      await rejects(EW.crypto.seal.open(EW.crypto.seal.parse(tp), "salah-passphrase"), "DECRYPT_FAILED");
      var parts = tp.split(".");
      var ct = parts[4];
      parts[4] = ct.slice(0, 5) + (ct[5] === "A" ? "B" : "A") + ct.slice(6);
      await rejects(EW.crypto.seal.open(EW.crypto.seal.parse(parts.join(".")), "kawah-putih-ciwidey"), "DECRYPT_FAILED");
      return "ASCII, emoji, non-Latin; 1 karakter diubah: ditolak";
    }],
    [".ewall round trip + tamper header", async function () {
      var sizes = [0, 1, 1000];
      for (var i = 0; i < sizes.length; i++) {
        var data = U.randomBytes(sizes[i]);
        var f = await EW.crypto.ewall.encrypt(data, { name: "t.bin", type: "application/octet-stream", size: sizes[i] }, "passphrase-uji-123", 100000);
        eq(f.length, 38 + 4 + U.utf8Encode(JSON.stringify({ name: "t.bin", type: "application/octet-stream", size: sizes[i] })).length + sizes[i] + 16, "ukuran");
        var r = await EW.crypto.ewall.decrypt(f, "passphrase-uji-123");
        eq(U.toHex(r.data), U.toHex(data), "isi " + sizes[i] + " byte");
      }
      var g = f.slice(); g[20] ^= 1;
      await rejects(EW.crypto.ewall.decrypt(g, "passphrase-uji-123"), "DECRYPT_FAILED");
      var c2 = f.slice(); c2[c2.length - 1] ^= 1;
      await rejects(EW.crypto.ewall.decrypt(c2, "passphrase-uji-123"), "DECRYPT_FAILED");
      await rejects(EW.crypto.ewall.decrypt(f, "passphrase-salah"), "DECRYPT_FAILED");
      return "0, 1, 1.000 byte; header, ciphertext, passphrase salah: ditolak";
    }],
    ["Shamir semua kombinasi k-of-n (n ≤ 5)", async function () {
      var secret = U.utf8Encode("abandon ability able about above absent absorb abstract");
      var combos = 0;
      function subsets(arr, k) {
        if (k === 0) return [[]];
        if (arr.length < k) return [];
        var rest = arr.slice(1);
        return subsets(rest, k - 1).map(function (s) { return [arr[0]].concat(s); }).concat(subsets(rest, k));
      }
      for (var n = 2; n <= 5; n++) for (var k = 2; k <= n; k++) {
        var sh = await EW.shamir.split(secret, k, n);
        var subs = subsets(sh, k);
        for (var i = 0; i < subs.length; i++) {
          eq(U.toHex(await EW.shamir.combine(subs[i])), U.toHex(secret), k + "-of-" + n);
          combos++;
        }
        if (k > 2) await rejects(EW.shamir.combine(sh.slice(0, k - 1)), "NOT_ENOUGH");
      }
      var a = await EW.shamir.split(secret, 2, 3), b = await EW.shamir.split(secret, 2, 3);
      await rejects(EW.shamir.combine([a[0], b[1]]), "GROUP");
      var typo = a[0].slice(0, 30) + (a[0][30] === "a" ? "b" : "a") + a[0].slice(31);
      ok(!(await EW.shamir.validateShare(typo)).ok, "salah ketik terdeteksi");
      var big = await EW.shamir.split(secret, 7, 10);
      eq(U.toHex(await EW.shamir.combine([big[9], big[2], big[5], big[0], big[7], big[3], big[8]])), U.toHex(secret), "7-of-10");
      return combos + " subset + k-1 ditolak + group beda ditolak";
    }],
    ["Ledger mendeteksi manipulasi", async function () {
      var chain = [];
      for (var i = 0; i < 4; i++) {
        var base = {
          index: i, timestamp: new Date().toISOString(), type: i ? "password" : "genesis",
          meta: i ? { length: 20, bits: 131.1, charsetSize: 94 } : {}, weatherDigest: "00".repeat(32),
          stamp: { place: "Bandung", desc: "uji", temp: 21.4, sky: "rain" }, prevHash: i ? chain[i - 1].hash : EW.ledger.ZERO
        };
        chain.push(await EW.ledger.mine(base, 2));
      }
      ok((await EW.ledger.verify(chain)).ok, "rantai baru harus valid");
      var t = JSON.parse(JSON.stringify(chain));
      t[2].meta.bits = 40;
      var v = await EW.ledger.verify(t);
      ok(!v.ok && v.firstBad === 2 && !v.results[3].ok && v.results[1].ok, "firstBad " + v.firstBad);
      var t2 = JSON.parse(JSON.stringify(chain));
      t2[1].timestamp = t2[1].timestamp.replace(/.$/, "X");
      eq((await EW.ledger.verify(t2)).firstBad, 1, "ubah 1 karakter");
      return "4 blok, ubah meta & 1 karakter: rusak dari blok itu";
    }],
    ["Uji statistik: LCG gagal, mixer lolos", async function () {
      var lcg = new Uint8Array(262144), x = 7;
      for (var i = 0; i < lcg.length; i++) { x = (5 * x + 1) & 255; lcg[i] = x; }
      var r = [EW.stats.monobit(lcg), EW.stats.chiSquare(lcg), EW.stats.runs(lcg)];
      ok(r.some(function (t) { return !t.pass; }), "LCG harus gagal minimal satu uji");
      var m = await EW.entropy.derive("selftest-stats", 262144);
      var rm = [EW.stats.monobit(m), EW.stats.chiSquare(m), EW.stats.runs(m)];
      ok(rm.every(function (t) { return t.pass; }), "mixer: " + rm.map(function (t) { return t.name + " p=" + t.p.toFixed(3); }).join(", ") + " (gagal acak ~3% dari waktu)");
      return "LCG gagal " + r.filter(function (t) { return !t.pass; }).map(function (t) { return t.name; }).join(", ");
    }]
  ];

  async function run() {
    for (var i = 0; i < TESTS.length; i++) {
      var row = h("tr", {}, [h("th", { scope: "row", text: TESTS[i][0] }), h("td", { class: "small", text: "…" }), h("td", { text: "berjalan" })]);
      body.appendChild(row);
      var t0 = performance.now();
      try {
        var detail = await TESTS[i][1]();
        row.children[1].textContent = (detail || "") + " (" + Math.round(performance.now() - t0) + " ms)";
        row.children[2].textContent = "";
        row.children[2].appendChild(h("span", { class: "tag tag-ok" }, [ui.icon("check"), "PASS"]));
        pass++;
      } catch (e) {
        row.children[1].textContent = String(e && e.message || e);
        row.children[2].textContent = "";
        row.children[2].appendChild(h("span", { class: "tag tag-danger" }, [ui.icon("x"), "FAIL"]));
        fail++;
      }
    }
    var sum = $("#st-summary");
    sum.className = "tag " + (fail ? "tag-danger" : "tag-ok");
    sum.textContent = fail ? fail + " FAIL, " + pass + " PASS" : "Semua PASS (" + pass + ")";
    document.documentElement.setAttribute("data-selftest", fail ? "fail" : "pass");
  }
  if (!EW.cryptoAvailable) { $("#st-summary").textContent = "crypto.subtle tidak tersedia"; return; }
  run();
})();
