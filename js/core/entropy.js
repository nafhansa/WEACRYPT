/* WEACRYPT: entropy pool, mixer, jitter collector, dan generator.
   Keamanan HANYA bersandar pada crypto.getRandomValues (osSeed 256 bit).
   Cuaca dan jitter hanya pencampur: membuat hasil unik, bukan membuat aman. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;

  var MAX_JITTER = 256;
  var jitter = [];
  var digestCache = { obj: null, hex: null, bytes: null };

  /* ---------- Jitter ---------- */
  function addJitter(sample) {
    var v = typeof sample === "number" ? sample : performance.now();
    jitter.push(v);
    if (jitter.length > MAX_JITTER) jitter.shift();
    EW.bus.emit("entropy:jitter", jitter.length);
  }

  // Ketikan di mana pun (kecuali field rahasia) ikut menyumbang timing.
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.type === "password" || (t.classList && t.classList.contains("secret-input")))) return;
    addJitter(performance.now());
  }, { passive: true });

  /* ---------- Cuaca ---------- */
  // Field tabel 3.2 + fetchedAt, dalam bentuk kanonik.
  function weatherFields(c) {
    c = c || EW.weather && EW.weather.current;
    if (!c) return { place: null };
    return {
      place: c.place, observedAt: c.observedAt, fetchedAt: c.fetchedAt, isNight: c.isNight,
      condition: { main: c.condition.main, desc: c.condition.desc, id: c.condition.id, icon: c.condition.icon },
      temp: c.temp, feelsLike: c.feelsLike, humidity: c.humidity, pressure: c.pressure,
      wind: { speed: c.wind.speed, deg: c.wind.deg, gust: c.wind.gust },
      clouds: c.clouds, visibility: c.visibility, rain1h: c.rain1h,
      sun: { sunrise: c.sun.sunrise, sunset: c.sun.sunset }
    };
  }

  async function weatherDigest() {
    var c = EW.weather && EW.weather.current;
    if (c && digestCache.obj === c) return digestCache.bytes;
    var d = await EW.crypto.sha("SHA-256", U.canonicalJSON(weatherFields(c)));
    digestCache = { obj: c, bytes: d, hex: U.toHex(d) };
    return d;
  }

  async function jitterDigest() {
    var f = new Float64Array(jitter);
    return EW.crypto.sha("SHA-256", new Uint8Array(f.buffer));
  }

  if (EW.bus) EW.bus.on("weather:update", function () { if (EW.cryptoAvailable) weatherDigest(); });

  /* ---------- Mixer (4.2) ----------
     ikm = osSeed || weatherDigest || jitterDigest
     out = HKDF-SHA256(ikm, salt, "EW/v1/" + purpose)
     Stream: blok berikutnya diminta dengan counter pada info ("#1", "#2", ...). */
  var HKDF_MAX = 8160; // 255 * 32 byte, batas satu panggilan HKDF-SHA256

  async function stream(purpose) {
    var osSeed = U.randomBytes(32);
    var salt = U.randomBytes(16);
    var wd = await weatherDigest();
    var jd = await jitterDigest();
    var ikm = U.concat(osSeed, wd, jd);
    var key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    U.wipe(osSeed, ikm, jd);
    var counter = 0, buf = new Uint8Array(0), pos = 0;

    async function refill(minBytes) {
      var len = Math.min(HKDF_MAX, Math.max(minBytes, 64));
      var info = "EW/v1/" + purpose + (counter ? "#" + counter : "");
      counter++;
      var bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt, info: U.utf8Encode(info) }, key, len * 8);
      U.wipe(buf);
      buf = new Uint8Array(bits);
      pos = 0;
    }

    return {
      purpose: purpose,
      bytes: async function (n) {
        var out = new Uint8Array(n), o = 0;
        while (o < n) {
          if (pos >= buf.length) await refill(Math.min(HKDF_MAX, n - o));
          var take = Math.min(n - o, buf.length - pos);
          out.set(buf.subarray(pos, pos + take), o);
          pos += take; o += take;
        }
        return out;
      },
      close: function () { U.wipe(buf); buf = new Uint8Array(0); key = null; }
    };
  }

  async function derive(purpose, nBytes) {
    var s = await stream(purpose);
    var out = await s.bytes(nBytes);
    s.close();
    return out;
  }

  /* Bilangan bulat seragam [0, maxExclusive) dengan rejection sampling, tanpa bias modulo. */
  async function randomInt(maxExclusive, s) {
    if (!(maxExclusive >= 1) || maxExclusive > 4294967296) throw new Error("rentang tidak valid");
    if (maxExclusive === 1) return 0;
    var own = !s;
    if (own) s = await stream("int");
    try {
      if (maxExclusive <= 256) {
        var lim8 = 256 - (256 % maxExclusive);
        for (;;) { var b = (await s.bytes(1))[0]; if (b < lim8) return b % maxExclusive; }
      }
      if (maxExclusive <= 65536) {
        var lim16 = 65536 - (65536 % maxExclusive); // 7776 -> 62208
        for (;;) {
          var t = await s.bytes(2);
          var v = (t[0] << 8) | t[1];
          if (v < lim16) return v % maxExclusive;
        }
      }
      var lim32 = 4294967296 - (4294967296 % maxExclusive);
      for (;;) {
        var q = await s.bytes(4);
        var w = ((q[0] << 24) >>> 0) + (q[1] << 16) + (q[2] << 8) + q[3];
        if (w < lim32) return w % maxExclusive;
      }
    } finally { if (own) s.close(); }
  }

  /* ---------- Generator ---------- */
  var SETS = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
  };
  var SIMILAR = "Il1O0";

  function charset(opts) {
    var s = "";
    if (opts.lower) s += SETS.lower;
    if (opts.upper) s += SETS.upper;
    if (opts.digits) s += SETS.digits;
    if (opts.symbols) {
      var ex = opts.excludeSymbols || "";
      s += SETS.symbols.split("").filter(function (c) { return ex.indexOf(c) === -1; }).join("");
    }
    if (opts.excludeSimilar) s = s.split("").filter(function (c) { return SIMILAR.indexOf(c) === -1; }).join("");
    // unik, urutan tetap
    return Array.from(new Set(s.split(""))).join("");
  }

  async function password(opts, s) {
    var cs = charset(opts);
    if (cs.length < 2) throw new Error("CHARSET_EMPTY");
    var len = Math.max(1, Math.min(4096, opts.length | 0));
    var own = !s;
    if (own) s = await stream(opts.purpose || "password");
    var out = "";
    for (var i = 0; i < len; i++) out += cs[await randomInt(cs.length, s)];
    if (own) s.close();
    return { value: out, charsetSize: cs.length, length: len, bits: EW.strength ? EW.strength.bitsFor(cs.length, len) : len * Math.log2(cs.length) };
  }

  async function passphrase(opts, s) {
    var list = EW.data && EW.data.wordlist;
    if (!list || list.length !== 7776) throw new Error("WORDLIST_MISSING");
    var n = Math.max(1, Math.min(64, opts.words | 0));
    var sep = typeof opts.separator === "string" ? opts.separator : "-";
    var own = !s;
    if (own) s = await stream("passphrase");
    var words = [];
    for (var i = 0; i < n; i++) {
      var w = list[await randomInt(7776, s)];
      if (opts.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
      words.push(w);
    }
    var bits = n * Math.log2(7776);
    if (opts.addNumber) {
      words[words.length - 1] += String(await randomInt(10, s));
      bits += Math.log2(10);
    }
    if (own) s.close();
    return { value: words.join(sep), words: n, bits: bits };
  }

  /* PIN lemah: semua digit sama, berurutan naik/turun, atau tahun 1950 sampai 2030. */
  function isWeakPin(pin) {
    if (/^(\d)\1*$/.test(pin)) return true;
    var asc = true, desc = true;
    for (var i = 1; i < pin.length; i++) {
      var d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
      if (d !== 1) asc = false;
      if (d !== -1) desc = false;
    }
    if (asc || desc) return true;
    if (pin.length === 4) { var y = parseInt(pin, 10); if (y >= 1950 && y <= 2030) return true; }
    return false;
  }

  function weakPinCount(len) {
    var n = 10; // semua sama
    if (len <= 10) n += 2 * (10 - len + 1); // naik dan turun
    if (len === 4) n += 2030 - 1950 + 1;   // tidak beririsan dengan pola di atas untuk panjang 4
    return n;
  }

  async function pin(len, s) {
    len = Math.max(4, Math.min(12, len | 0));
    var own = !s;
    if (own) s = await stream("pin");
    var out;
    do {
      out = "";
      for (var i = 0; i < len; i++) out += String(await randomInt(10, s));
    } while (isWeakPin(out));
    if (own) s.close();
    var bits = Math.log2(Math.pow(10, len) - weakPinCount(len));
    return { value: out, length: len, bits: bits };
  }

  /* kind: "aes-hex" | "aes-b64" | "token" | "uuid" */
  async function key(kind) {
    if (kind === "uuid") {
      var b = await derive("uuid", 16);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var h = U.toHex(b);
      U.wipe(b);
      return { value: h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20), bits: 122, length: 36 };
    }
    var k = await derive(kind === "token" ? "api-token" : "aes-key", 32);
    var v = kind === "aes-b64" || kind === "token" ? U.b64urlEncode(k) : U.toHex(k);
    U.wipe(k);
    return { value: v, bits: 256, length: v.length };
  }

  /* ---------- Weather Stamp (metadata non-rahasia) ---------- */
  function weatherStamp() {
    var c = EW.weather && EW.weather.current;
    var id = digestCache.obj === c && digestCache.hex ? digestCache.hex.slice(0, 8) : null;
    if (!c) return { place: EW.config.CITY, desc: null, temp: null, id: id, sky: null, at: Date.now() };
    return {
      place: c.place, desc: c.condition.desc, temp: c.temp,
      windSpeed: c.wind.speed, windDeg: c.wind.deg,
      sky: EW.theme ? EW.theme.skyFor(c.condition.main) : null,
      tz: c.timezone, id: id, at: Date.now(), simulated: !!c.simulated
    };
  }

  // "Disegel di Bandung, 21,4°C, hujan ringan, angin 2,6 m/s barat daya, 4 Okt 2026 14:05 WIB"
  function stampText(st, verb) {
    verb = verb || "Dibuat";
    var parts = [verb + " di " + (st.place || EW.config.CITY)];
    if (typeof st.temp === "number") parts.push(U.fmtNum(st.temp, 1) + "°C");
    if (st.desc) parts.push(st.desc);
    if (typeof st.windSpeed === "number") {
      parts.push("angin " + U.fmtNum(st.windSpeed, 1) + " m/s" + (typeof st.windDeg === "number" ? " " + U.windDir(st.windDeg) : ""));
    }
    var at = typeof st.at === "number" ? st.at : Date.parse(st.at);
    if (!isNaN(at)) parts.push(U.fmtDateTime(at, typeof st.tz === "number" ? st.tz : 25200));
    return parts.join(", ");
  }

  /* ---------- Versi NAIF untuk Attack Lab. JANGAN dipakai untuk keamanan. ----------
     Field yang dipakai sama dengan tabel ruang kunci F8.2. */
  function naiveFields(c) {
    c = c || EW.weather.current;
    return {
      clouds: c.clouds, humidity: c.humidity, pressure: c.pressure,
      temp: c.temp, windDeg: c.wind.deg, windSpeed: c.wind.speed
    };
  }
  async function naiveKeyBytes(fields) {
    return EW.crypto.sha("SHA-256", U.canonicalJSON(fields));
  }

  EW.entropy = {
    addJitter: addJitter,
    jitterCount: function () { return jitter.length; },
    MAX_JITTER: MAX_JITTER,
    weatherFields: weatherFields,
    weatherDigest: weatherDigest,
    weatherDigestHex: async function () { await weatherDigest(); return digestCache.hex; },
    stream: stream,
    derive: derive,
    randomInt: randomInt,
    weatherStamp: weatherStamp,
    stampNow: async function () { await weatherDigest(); return weatherStamp(); },
    stampText: stampText,
    charset: charset, SETS: SETS, SIMILAR: SIMILAR,
    password: password, passphrase: passphrase, pin: pin, key: key,
    isWeakPin: isWeakPin, weakPinCount: weakPinCount,
    naiveFields: naiveFields, naiveKeyBytes: naiveKeyBytes
  };
})();
