/* WEACRYPT: Entropy Ledger, hash chain lokal tamper-evident dengan mini proof-of-work.
   Bukan blockchain terdistribusi. Meta TIDAK PERNAH berisi rahasia atau hash rahasia. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;
  var cfg = EW.config;

  var META_KEYS = ["length", "bits", "charsetSize", "words", "mode", "fileSize", "k", "n", "result"];
  var TYPES = ["genesis", "password", "passphrase", "pin", "key", "seal", "lock", "split", "breach-check", "verify"];
  var ZERO = "0000000000000000000000000000000000000000000000000000000000000000";
  var queue = Promise.resolve();

  function read() {
    var s = U.store.get(cfg.LEDGER_KEY);
    if (!s) return [];
    try { var a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }

  function write(chain) {
    if (!U.store.set(cfg.LEDGER_KEY, JSON.stringify(chain))) throw new Error("STORAGE");
    EW.bus.emit("ledger:update", chain);
  }

  function difficulty() {
    var d = parseInt(U.store.get(cfg.LEDGER_DIFFICULTY_KEY), 10);
    return d >= 2 && d <= 5 ? d : 4;
  }

  function cleanMeta(meta) {
    var out = {};
    Object.keys(meta || {}).forEach(function (k) {
      if (META_KEYS.indexOf(k) === -1) throw new Error("META_KEY_DITOLAK: " + k);
      var v = meta[k];
      if (typeof v === "number") {
        if (!isFinite(v)) throw new Error("META_VALUE");
        out[k] = Math.round(v * 10) / 10;
      } else if (typeof v === "string" && /^[a-z0-9-]{1,24}$/i.test(v)) {
        out[k] = v;
      } else {
        throw new Error("META_VALUE");
      }
    });
    return out;
  }

  function withoutHash(block) {
    var b = {};
    Object.keys(block).forEach(function (k) { if (k !== "hash") b[k] = block[k]; });
    return b;
  }

  async function hashBlock(block) {
    return EW.crypto.shaHex("SHA-256", U.canonicalJSON(withoutHash(block)));
  }

  /* Tambang blok: base tanpa nonce/hash -> blok lengkap. */
  function mine(base, diff, onProgress) {
    return new Promise(function (resolve, reject) {
      var b = withoutHash(base);
      b.difficulty = diff;
      b.nonce = "__NONCE__";
      var canon = U.canonicalJSON(b);
      var marker = "\"nonce\":\"__NONCE__\"";
      var at = canon.indexOf(marker);
      var job = EW.jobs.run({
        cmd: "mine", difficulty: diff, start: 0,
        prefix: canon.slice(0, at) + "\"nonce\":",
        suffix: canon.slice(at + marker.length)
      }, function (m) {
        if (m.type === "progress" && onProgress) onProgress(m);
        else if (m.type === "mined") {
          b.nonce = m.nonce;
          b.hash = m.hash;
          if (onProgress) onProgress(m);
          resolve(b);
        } else if (m.type === "error" || m.type === "cancelled") reject(new Error(m.error || "CANCELLED"));
      });
      if (onProgress) onProgress({ type: "start", job: job });
    });
  }

  async function makeBase(chain, type, meta) {
    var prev = chain[chain.length - 1];
    var st = await EW.entropy.stampNow();
    return {
      index: chain.length,
      timestamp: new Date().toISOString(),
      type: type,
      meta: meta,
      weatherDigest: await EW.entropy.weatherDigestHex(),
      stamp: { place: st.place, desc: st.desc, temp: st.temp, sky: st.sky },
      prevHash: prev ? prev.hash : ZERO
    };
  }

  function append(type, meta, opts) {
    opts = opts || {};
    if (TYPES.indexOf(type) === -1 || type === "genesis") return Promise.reject(new Error("TYPE"));
    var clean;
    try { clean = cleanMeta(meta); } catch (e) { return Promise.reject(e); }
    var job = queue.then(async function () {
      var chain = read();
      if (chain.length >= cfg.LEDGER_MAX) { var full = new Error("FULL"); full.code = "FULL"; throw full; }
      var diff = opts.difficulty || difficulty();
      if (!chain.length) {
        var g = await mine(await makeBase(chain, "genesis", {}), diff, opts.onProgress);
        chain.push(g);
        write(chain);
      }
      var blk = await mine(await makeBase(chain, type, clean), diff, opts.onProgress);
      chain = read();
      if (chain.length && chain[chain.length - 1].hash !== blk.prevHash) {
        // Rantai berubah di tab lain saat menambang: tambang ulang di atas ujung terbaru.
        blk = await mine(await makeBase(chain, type, clean), diff, opts.onProgress);
      }
      chain.push(blk);
      write(chain);
      return blk;
    });
    queue = job.catch(function () {});
    return job;
  }

  /* Verifikasi: hash, proof-of-work, prevHash, dan index. */
  async function verify(chain) {
    chain = chain || read();
    var results = [], firstBad = -1;
    for (var i = 0; i < chain.length; i++) {
      var b = chain[i], reasons = [];
      if (!b || typeof b !== "object") { reasons.push("blok tidak valid"); }
      else {
        var h = await hashBlock(b);
        if (h !== b.hash) reasons.push("hash tidak cocok dengan isi blok");
        var d = b.difficulty;
        if (!(d >= 1 && d <= 8) || String(b.hash || "").slice(0, d) !== "00000000".slice(0, d)) reasons.push("proof-of-work tidak memenuhi difficulty");
        if (b.index !== i) reasons.push("index tidak berurutan");
        var expectPrev = i === 0 ? ZERO : chain[i - 1].hash;
        if (b.prevHash !== expectPrev) reasons.push("prevHash tidak menunjuk blok sebelumnya");
        if (i === 0 && b.type !== "genesis") reasons.push("blok pertama bukan genesis");
      }
      if (reasons.length && firstBad === -1) firstBad = i;
      results.push({ ok: !reasons.length && firstBad === -1, reasons: reasons });
    }
    return { ok: firstBad === -1, firstBad: firstBad, results: results };
  }

  function exportJSON() {
    return JSON.stringify({ format: "weacrypt-ledger", version: 1, exportedAt: new Date().toISOString(), blocks: read() }, null, 2);
  }

  async function importJSON(json) {
    var data = typeof json === "string" ? JSON.parse(json) : json;
    var blocks = Array.isArray(data) ? data : data && data.blocks;
    if (!Array.isArray(blocks)) throw new Error("FORMAT");
    if (blocks.length > cfg.LEDGER_MAX) throw new Error("FULL");
    blocks.forEach(function (b) {
      if (TYPES.indexOf(b.type) === -1) throw new Error("TYPE");
      cleanMeta(b.meta);
    });
    var v = await verify(blocks);
    if (!v.ok) { var e = new Error("INVALID"); e.firstBad = v.firstBad; throw e; }
    write(blocks);
    return blocks.length;
  }

  EW.ledger = {
    META_KEYS: META_KEYS, TYPES: TYPES, ZERO: ZERO,
    all: read,
    append: append,
    verify: verify,
    hashBlock: hashBlock,
    mine: mine,
    export: exportJSON,
    import: importJSON,
    clear: function () { U.store.remove(cfg.LEDGER_KEY); EW.bus.emit("ledger:update", []); },
    difficulty: difficulty,
    setDifficulty: function (d) { U.store.set(cfg.LEDGER_DIFFICULTY_KEY, String(Math.max(2, Math.min(5, d | 0)))); },
    isFull: function () { return read().length >= cfg.LEDGER_MAX; }
  };

  // Sinkron antar tab
  window.addEventListener("storage", function (e) { if (e.key === cfg.LEDGER_KEY) EW.bus.emit("ledger:update", read()); });
})();
