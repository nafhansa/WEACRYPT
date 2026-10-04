/* WEACRYPT: namespace global, event bus, dan util encoding.
   Classic script (bukan ES module) supaya jalan dari file://. */
(function () {
  "use strict";
  var EW = (window.EW = window.EW || {});

  /* ---------- Event bus ---------- */
  var handlers = {};
  EW.bus = {
    on: function (evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
      return fn;
    },
    off: function (evt, fn) {
      if (!handlers[evt]) return;
      handlers[evt] = handlers[evt].filter(function (f) { return f !== fn; });
    },
    emit: function (evt, data) {
      (handlers[evt] || []).slice().forEach(function (fn) {
        try { fn(data); } catch (e) { console.error("[EW.bus] handler error untuk", evt, e); }
      });
    }
  };

  /* ---------- Util ---------- */
  var enc = new TextEncoder();
  var dec = new TextDecoder("utf-8", { fatal: true });

  function b64urlEncode(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlDecode(str) {
    if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("base64url tidak valid");
    var s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  var HEX = [];
  for (var h = 0; h < 256; h++) HEX.push((h < 16 ? "0" : "") + h.toString(16));

  function toHex(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += HEX[u8[i]];
    return s;
  }

  function fromHex(str) {
    var clean = String(str).replace(/\s+/g, "").toLowerCase();
    if (clean.length % 2 || !/^[0-9a-f]*$/.test(clean)) throw new Error("hex tidak valid");
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function utf8Encode(str) { return enc.encode(str); }
  function utf8Decode(u8) { return dec.decode(u8); }

  /* JSON dengan key diurutkan alfabetis, tanpa spasi. Kompatibel dengan
     Python json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False). */
  function canonicalJSON(value) {
    if (value === null || typeof value !== "object") {
      if (typeof value === "number" && !isFinite(value)) return "null";
      return JSON.stringify(value === undefined ? null : value);
    }
    if (Array.isArray(value)) {
      return "[" + value.map(function (v) { return canonicalJSON(v); }).join(",") + "]";
    }
    var keys = Object.keys(value).filter(function (k) { return value[k] !== undefined; }).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + canonicalJSON(value[k]); }).join(",") + "}";
  }

  function wipe() {
    for (var i = 0; i < arguments.length; i++) {
      var b = arguments[i];
      if (b && typeof b.fill === "function") { try { b.fill(0); } catch (e) { /* buffer read-only */ } }
    }
  }

  function concat() {
    var total = 0, i;
    for (i = 0; i < arguments.length; i++) total += arguments[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], off); off += arguments[i].length; }
    return out;
  }

  function randomBytes(n) {
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
    return out;
  }

  /* ---------- Format Bahasa Indonesia ---------- */
  var BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var ARAH = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];

  function fmtNum(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return Number(n).toLocaleString("id-ID", {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function tzLabel(offsetSec) {
    if (offsetSec === 25200) return "WIB";
    if (offsetSec === 28800) return "WITA";
    if (offsetSec === 32400) return "WIT";
    var hrs = offsetSec / 3600;
    return "UTC" + (hrs >= 0 ? "+" : "") + hrs;
  }

  // Waktu dalam zona kota (offset detik dari OWM `timezone`), bukan zona perangkat.
  function cityParts(ms, offsetSec) {
    var off = typeof offsetSec === "number" ? offsetSec : 25200;
    var d = new Date(ms + off * 1000);
    return {
      day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(),
      h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), tz: tzLabel(off)
    };
  }

  function fmtTime(ms, offsetSec) {
    var p = cityParts(ms, offsetSec);
    return pad2(p.h) + ":" + pad2(p.m) + " " + p.tz;
  }

  function fmtDateTime(ms, offsetSec) {
    var p = cityParts(ms, offsetSec);
    return p.day + " " + BULAN[p.month] + " " + p.year + " " + pad2(p.h) + ":" + pad2(p.m) + " " + p.tz;
  }

  function windDir(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "";
    return ARAH[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }

  function relTime(ms) {
    var diff = Math.max(0, Date.now() - ms);
    var m = Math.floor(diff / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return m + " menit lalu";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " jam lalu";
    return Math.floor(h / 24) + " hari lalu";
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return fmtNum(n / 1024, 1) + " KB";
    if (n < 1073741824) return fmtNum(n / 1048576, 1) + " MB";
    return fmtNum(n / 1073741824, 2) + " GB";
  }

  function storageGet(store, key) {
    try { return window[store].getItem(key); } catch (e) { return null; }
  }
  function storageSet(store, key, val) {
    try { window[store].setItem(key, val); return true; } catch (e) { return false; }
  }
  function storageRemove(store, key) {
    try { window[store].removeItem(key); } catch (e) { /* storage tidak tersedia */ }
  }

  EW.util = {
    b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    toHex: toHex, fromHex: fromHex,
    utf8Encode: utf8Encode, utf8Decode: utf8Decode,
    canonicalJSON: canonicalJSON, wipe: wipe, concat: concat, randomBytes: randomBytes,
    fmtNum: fmtNum, fmtTime: fmtTime, fmtDateTime: fmtDateTime, cityParts: cityParts,
    tzLabel: tzLabel, windDir: windDir, relTime: relTime, fmtBytes: fmtBytes, pad2: pad2,
    BULAN: BULAN,
    store: {
      get: function (k) { return storageGet("localStorage", k); },
      set: function (k, v) { return storageSet("localStorage", k, v); },
      remove: function (k) { storageRemove("localStorage", k); }
    },
    session: {
      get: function (k) { return storageGet("sessionStorage", k); },
      set: function (k, v) { return storageSet("sessionStorage", k, v); },
      remove: function (k) { storageRemove("sessionStorage", k); }
    },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    reducedMotion: function () {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  };

  EW.cryptoAvailable = !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
  EW.isFileProtocol = location.protocol === "file:";
})();
