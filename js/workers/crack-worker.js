/* WEACRYPT: kode Web Worker untuk penambangan ledger (proof-of-work) dan demo brute force Attack Lab.
   Chrome memblokir new Worker("file.js") dari file://, jadi source worker disimpan sebagai string
   (EW.workerSource) lalu dijalankan lewat Blob URL. Bila Worker gagal, kode yang sama berjalan
   di main thread dengan pembagian waktu via setTimeout agar UI tidak beku. */
(function () {
  "use strict";
  var EW = (window.EW = window.EW || {});

  /* Fungsi ini HARUS mandiri (tidak memakai variabel luar) karena di-serialisasi ke string. */
  function workerFactory(scope, sliceMs) {
    var K = new Int32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    var W = new Int32Array(64);
    var H = new Int32Array(8);
    var buf = new Uint8Array(1024);
    var enc = new TextEncoder();

    /* SHA-256 murni JS (sinkron, cepat untuk pesan pendek). Hasil Uint8Array(32). */
    function sha256(msg, len) {
      if (len === undefined) len = msg.length;
      var total = ((len + 9 + 63) >> 6) << 6;
      if (buf.length < total) buf = new Uint8Array(total * 2);
      buf.set(msg.subarray(0, len), 0);
      buf[len] = 0x80;
      buf.fill(0, len + 1, total);
      var bitLen = len * 8;
      buf[total - 4] = (bitLen >>> 24) & 255;
      buf[total - 3] = (bitLen >>> 16) & 255;
      buf[total - 2] = (bitLen >>> 8) & 255;
      buf[total - 1] = bitLen & 255;
      buf[total - 5] = (len / 0x20000000) & 255;
      H[0] = 0x6a09e667; H[1] = 0xbb67ae85; H[2] = 0x3c6ef372; H[3] = 0xa54ff53a;
      H[4] = 0x510e527f; H[5] = 0x9b05688c; H[6] = 0x1f83d9ab; H[7] = 0x5be0cd19;
      for (var off = 0; off < total; off += 64) {
        var i, t1, t2;
        for (i = 0; i < 16; i++) {
          var p = off + i * 4;
          W[i] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
        }
        for (i = 16; i < 64; i++) {
          var w15 = W[i - 15], w2 = W[i - 2];
          var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
          var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (i = 0; i < 64; i++) {
          var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
          var ch = (e & f) ^ (~e & g);
          t1 = (h + S1 + ch + K[i] + W[i]) | 0;
          var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
          var maj = (a & b) ^ (a & c) ^ (b & c);
          t2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      var out = new Uint8Array(32);
      for (var j = 0; j < 8; j++) {
        out[j * 4] = (H[j] >>> 24) & 255; out[j * 4 + 1] = (H[j] >>> 16) & 255;
        out[j * 4 + 2] = (H[j] >>> 8) & 255; out[j * 4 + 3] = H[j] & 255;
      }
      return out;
    }

    var HEXT = [];
    for (var q = 0; q < 256; q++) HEXT.push((q < 16 ? "0" : "") + q.toString(16));
    function hex(u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += HEXT[u8[i]]; return s; }

    function sha256Hex(str) { return hex(sha256(enc.encode(str))); }

    function now() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }
    function yieldNow() { return new Promise(function (r) { setTimeout(r, 0); }); }
    var slice = sliceMs || 40;
    var cancelled = {};

    /* Cari nonce sehingga SHA-256(prefix + nonce + suffix) diawali `difficulty` nol hex. */
    async function mine(msg, post) {
      var pre = enc.encode(msg.prefix), suf = enc.encode(msg.suffix);
      var m = new Uint8Array(pre.length + 20 + suf.length);
      m.set(pre, 0);
      var zeros = msg.difficulty;
      var fullBytes = zeros >> 1, half = zeros & 1;
      var nonce = msg.start || 0, t0 = now(), tries = 0;
      for (;;) {
        var tSlice = now();
        while (now() - tSlice < slice) {
          for (var k = 0; k < 2000; k++) {
            var ns = String(nonce);
            for (var d = 0; d < ns.length; d++) m[pre.length + d] = ns.charCodeAt(d);
            m.set(suf, pre.length + ns.length);
            var len = pre.length + ns.length + suf.length;
            var hsh = sha256(m, len);
            tries++;
            var ok = true;
            for (var z = 0; z < fullBytes; z++) if (hsh[z] !== 0) { ok = false; break; }
            if (ok && half && (hsh[fullBytes] >> 4) !== 0) ok = false;
            if (ok) {
              post({ type: "mined", id: msg.id, nonce: nonce, hash: hex(hsh), tries: tries, ms: now() - t0 });
              return;
            }
            nonce++;
          }
        }
        post({ type: "progress", id: msg.id, nonce: nonce, hash: hex(sha256(m, pre.length + String(nonce - 1).length + suf.length)), tries: tries, ms: now() - t0 });
        await yieldNow();
        if (cancelled[msg.id]) { delete cancelled[msg.id]; post({ type: "cancelled", id: msg.id }); return; }
      }
    }

    /* Brute force kunci naif: kunci = SHA-256(canonicalJSON(fields)).
       msg.known: field yang diketahui; msg.unknown: [{name, from, to, step, decimals}] */
    async function crack(msg, post) {
      var subtle = (typeof crypto !== "undefined") && crypto.subtle;
      if (!subtle) { post({ type: "error", id: msg.id, error: "NO_SUBTLE" }); return; }
      var unknown = msg.unknown;
      var counts = unknown.map(function (u) { return Math.round((u.to - u.from) / u.step) + 1; });
      var total = counts.reduce(function (a, b) { return a * b; }, 1);
      var iv = new Uint8Array(msg.iv), ct = new Uint8Array(msg.ct), aad = new Uint8Array(msg.aad);
      var t0 = now(), idx = 0, BATCH = 128;

      function candidate(i) {
        var f = {}, k;
        for (k in msg.known) f[k] = msg.known[k];
        var rest = i;
        for (var u = unknown.length - 1; u >= 0; u--) {
          var c = rest % counts[u];
          rest = Math.floor(rest / counts[u]);
          var v = unknown[u].from + c * unknown[u].step;
          f[unknown[u].name] = unknown[u].decimals ? Number(v.toFixed(unknown[u].decimals)) : v;
        }
        var keys = Object.keys(f).sort();
        return "{" + keys.map(function (key) { return JSON.stringify(key) + ":" + JSON.stringify(f[key]); }).join(",") + "}";
      }

      async function tryOne(i) {
        var json = candidate(i);
        var keyBytes = sha256(enc.encode(json));
        try {
          var key = await subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
          var pt = await subtle.decrypt({ name: "AES-GCM", iv: iv, additionalData: aad, tagLength: 128 }, key, ct);
          return { i: i, json: json, key: hex(keyBytes), pt: new Uint8Array(pt) };
        } catch (e) { return null; }
      }

      while (idx < total) {
        var tSlice = now();
        while (idx < total && now() - tSlice < slice) {
          var batch = [];
          for (var b = 0; b < BATCH && idx < total; b++, idx++) batch.push(tryOne(idx));
          var res = await Promise.all(batch);
          for (var r = 0; r < res.length; r++) {
            if (res[r]) {
              post({ type: "found", id: msg.id, tried: res[r].i + 1, total: total, ms: now() - t0, json: res[r].json, key: res[r].key, plaintext: Array.from(res[r].pt) });
              return;
            }
          }
        }
        post({ type: "progress", id: msg.id, tried: idx, total: total, ms: now() - t0 });
        await yieldNow();
        if (cancelled[msg.id]) { delete cancelled[msg.id]; post({ type: "cancelled", id: msg.id }); return; }
      }
      post({ type: "notfound", id: msg.id, tried: total, total: total, ms: now() - t0 });
    }

    function handle(msg, post) {
      if (msg.cmd === "cancel") { cancelled[msg.id] = true; return; }
      var job = msg.cmd === "mine" ? mine(msg, post) : msg.cmd === "crack" ? crack(msg, post) : null;
      if (!job) { post({ type: "error", id: msg.id, error: "UNKNOWN_CMD" }); return; }
      job.catch(function (e) { post({ type: "error", id: msg.id, error: String(e && e.message || e) }); });
    }

    if (scope && typeof scope.postMessage === "function") {
      scope.onmessage = function (ev) { handle(ev.data, function (m) { scope.postMessage(m); }); };
    }
    return { sha256: sha256, sha256Hex: sha256Hex, hex: hex, handle: handle };
  }

  EW.workerSource = "(" + workerFactory.toString() + ")(self, 40);";
  EW.wlib = workerFactory(null, 12); // fungsi yang sama untuk main thread (SHA-256 sinkron, fallback)

  /* Membuat "worker" dengan API sederhana: run(msg, onMessage) -> { cancel() }.
     Mencoba Blob Worker; bila gagal, jalan di main thread dengan potongan 12 ms. */
  var shared = null, sharedFailed = false, jobSeq = 0, listeners = {};

  function getWorker() {
    if (shared || sharedFailed) return shared;
    try {
      var url = URL.createObjectURL(new Blob([EW.workerSource], { type: "text/javascript" }));
      shared = new Worker(url);
      shared.onmessage = function (ev) { var l = listeners[ev.data.id]; if (l) l.fn(ev.data); };
      shared.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        sharedFailed = true;
        shared = null;
        // Worker diblokir (misalnya kebijakan file://): pindahkan job yang tertunda ke main thread.
        Object.keys(listeners).forEach(function (id) { var l = listeners[id]; delete listeners[id]; l.fallback(); });
      };
    } catch (e) {
      sharedFailed = true;
      shared = null;
    }
    return shared;
  }

  function runMain(msg, fn) {
    EW.wlib.handle(msg, function (m) { setTimeout(function () { fn(m); }, 0); });
  }

  EW.jobs = {
    usingWorker: function () { return !!getWorker(); },
    run: function (msg, onMessage) {
      var id = "j" + (++jobSeq);
      msg.id = id;
      var done = false, mode;
      function fn(m) {
        if (done) return;
        if (m.type === "error" && mode === "worker") {
          // Worker ada tapi gagal (misalnya crypto.subtle tidak tersedia di worker): ulangi di main thread.
          mode = "main";
          runMain(msg, fn);
          return;
        }
        if (m.type === "mined" || m.type === "found" || m.type === "notfound" || m.type === "cancelled" || m.type === "error") {
          done = true;
          delete listeners[id];
        }
        m.thread = mode;
        onMessage(m);
      }
      var w = getWorker();
      if (w) {
        mode = "worker";
        listeners[id] = { fn: fn, fallback: function () { mode = "main"; runMain(msg, fn); } };
        try { w.postMessage(msg); } catch (e) { mode = "main"; runMain(msg, fn); }
      } else {
        mode = "main";
        runMain(msg, fn);
      }
      return {
        id: id,
        thread: function () { return mode; },
        cancel: function () {
          if (mode === "worker" && shared) shared.postMessage({ cmd: "cancel", id: id });
          else EW.wlib.handle({ cmd: "cancel", id: id });
        }
      };
    }
  };
})();
