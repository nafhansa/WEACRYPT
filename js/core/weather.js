/* WEACRYPT: data cuaca OpenWeatherMap (Bandung).
   Cuaca adalah sinyal publik, bukan rahasia. Tidak ada alat yang bergantung padanya untuk keamanan. */
(function () {
  "use strict";
  var EW = window.EW;
  var cfg = EW.config;
  var U = EW.util;

  var state = {
    current: null,
    real: null,          // data asli terakhir (sebelum override debug)
    override: null,      // override dari panel debug
    status: { kind: "idle", message: "" },
    loading: null,
    via: null
  };

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  function computeIsNight(raw) {
    var sys = raw.sys || {};
    var tz = num(raw.timezone) === null ? 25200 : raw.timezone;
    if (num(sys.sunrise) === null || num(sys.sunset) === null) {
      var icon = raw.weather && raw.weather[0] && raw.weather[0].icon;
      return !!(icon && icon.slice(-1) === "n");
    }
    // Bandingkan jam sekarang (zona kota) dengan jam terbit dan terbenam.
    function tod(sec) { return (((sec + tz) % 86400) + 86400) % 86400; }
    var now = tod(Math.floor(Date.now() / 1000));
    return now < tod(sys.sunrise) || now >= tod(sys.sunset);
  }

  function normalize(raw, source, fetchedAt) {
    var w = (raw.weather && raw.weather[0]) || {};
    var main = raw.main || {};
    var wind = raw.wind || {};
    var rain = raw.rain || {};
    var sys = raw.sys || {};
    return {
      place: raw.name || cfg.CITY,
      coord: raw.coord || null,
      observedAt: num(raw.dt),
      fetchedAt: fetchedAt,
      timezone: num(raw.timezone) === null ? 25200 : raw.timezone,
      isNight: computeIsNight(raw),
      condition: {
        main: w.main || "Clouds",
        desc: w.description || "berawan",
        id: num(w.id),
        icon: w.icon || "03d"
      },
      temp: num(main.temp), feelsLike: num(main.feels_like),
      humidity: num(main.humidity), pressure: num(main.pressure),
      wind: { speed: num(wind.speed), deg: num(wind.deg), gust: num(wind.gust) },
      clouds: raw.clouds ? num(raw.clouds.all) : null,
      visibility: num(raw.visibility),
      rain1h: num(rain["1h"]) === null ? 0 : rain["1h"],
      sun: { sunrise: num(sys.sunrise), sunset: num(sys.sunset) },
      source: source,
      raw: raw
    };
  }

  function readCache() {
    var s = U.session.get(cfg.CACHE_KEY);
    if (!s) return null;
    try {
      var c = JSON.parse(s);
      if (!c || !c.raw || typeof c.fetchedAt !== "number") return null;
      return c;
    } catch (e) { return null; }
  }

  function setStatus(kind, message) {
    state.status = { kind: kind, message: message || "" };
    EW.bus.emit("weather:status", state.status);
  }

  function publish(current) {
    state.real = current;
    state.current = state.override ? applyOverride(current, state.override) : current;
    EW.weather.current = state.current;
    EW.bus.emit("weather:update", state.current);
  }

  function hasKey() {
    return typeof cfg.OWM_KEY === "string" && /^[0-9a-f]{32}$/i.test(cfg.OWM_KEY.trim());
  }

  function buildUrl() {
    return cfg.OWM_ENDPOINT +
      "?q=" + encodeURIComponent(cfg.CITY) +
      "&appid=" + encodeURIComponent(cfg.OWM_KEY.trim()) +
      "&units=" + cfg.UNITS + "&lang=" + cfg.LANG;
  }

  function fallbackTo(cache, kind, message) {
    if (cache) {
      var stale = normalize(cache.raw, "cache", cache.fetchedAt);
      stale.offline = true;
      setStatus(kind, message);
      publish(stale);
    } else {
      var fb = normalize(cfg.FALLBACK, "fallback", Date.now());
      fb.offline = true;
      setStatus(kind, message);
      publish(fb);
    }
    return state.current;
  }

  async function doLoad(opts) {
    var cache = readCache();
    var age = cache ? Date.now() - cache.fetchedAt : Infinity;

    // Batas 10 menit selalu dihormati, juga saat force.
    if (cache && age < cfg.CACHE_TTL_MS) {
      if (!opts.force && state.real && state.real.fetchedAt === cache.fetchedAt) return state.current;
      setStatus("ok", "");
      publish(normalize(cache.raw, "cache", cache.fetchedAt));
      return state.current;
    }

    var OFFLINE = "Data cuaca tidak tersedia. Semua alat tetap bekerja; visual memakai snapshot terakhir.";

    // 1. Saat di-hosting (http/https): pakai proxy serverless, API key tersimpan di server.
    var proxyResult = null;
    if (useProxy()) {
      proxyResult = await getJSON(cfg.WEATHER_PROXY);
      if (proxyResult.raw) return accept(proxyResult.raw, "proxy");
      if (proxyResult.status === 401) return fallbackTo(cache, "unauthorized", "API key OpenWeatherMap ditolak. Cek environment variable OWM_KEY di Vercel.");
    }

    // 2. Lokal (file:// atau server tanpa /api): panggil OWM langsung bila key diisi di config.js.
    if (hasKey()) {
      var direct = await getJSON(buildUrl());
      if (direct.raw) return accept(direct.raw, "direct");
      if (direct.status === 401) return fallbackTo(cache, "unauthorized", "API key OpenWeatherMap ditolak. Cek js/config.js.");
      return fallbackTo(cache, "offline", OFFLINE);
    }

    if (proxyResult && proxyResult.body && proxyResult.body.error === "OWM_KEY_MISSING") {
      return fallbackTo(cache, "nokey", "Environment variable OWM_KEY belum diset di Vercel. Semua alat tetap bekerja; visual memakai snapshot.");
    }
    if (proxyResult && proxyResult.status && proxyResult.status !== 404) return fallbackTo(cache, "offline", OFFLINE);
    return fallbackTo(cache, "nokey",
      "API key OpenWeatherMap belum diisi. Isi OWM_KEY di js/config.js (lokal) atau environment variable OWM_KEY di Vercel. Semua alat tetap bekerja; visual memakai snapshot.");

    function accept(raw, via) {
      var fetchedAt = Date.now();
      state.via = via;
      U.session.set(cfg.CACHE_KEY, JSON.stringify({ fetchedAt: fetchedAt, raw: raw, via: via }));
      setStatus("ok", "");
      publish(normalize(raw, "live", fetchedAt));
      return state.current;
    }
  }

  function useProxy() {
    return !!cfg.WEATHER_PROXY && (location.protocol === "https:" || location.protocol === "http:");
  }

  /* -> { status, raw?, body? }  raw hanya diisi bila respons cuaca valid. */
  async function getJSON(url) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    try {
      var res = await fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" });
      var body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      var ok = res.ok && body && body.main && body.weather;
      return { status: res.status, raw: ok ? body : null, body: body };
    } catch (e) {
      return { status: 0 };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------- Override untuk panel debug (Shift + D) ---------- */
  var DESC = { Clear: "cerah", Clouds: "berawan", Rain: "hujan sedang", Thunderstorm: "badai petir", Mist: "kabut" };
  var IDS = { Clear: 800, Clouds: 803, Rain: 501, Thunderstorm: 211, Mist: 701 };

  function applyOverride(base, ov) {
    var c = JSON.parse(JSON.stringify(base));
    c.raw = base.raw;
    if (ov.main) {
      c.condition = { main: ov.main, desc: DESC[ov.main] || ov.main, id: IDS[ov.main] || 800, icon: c.condition.icon };
      c.rain1h = ov.main === "Rain" ? 2.5 : ov.main === "Thunderstorm" ? 6 : 0;
    }
    if (typeof ov.isNight === "boolean") c.isNight = ov.isNight;
    if (typeof ov.windSpeed === "number") c.wind.speed = ov.windSpeed;
    if (typeof ov.humidity === "number") c.humidity = ov.humidity;
    if (typeof ov.clouds === "number") c.clouds = ov.clouds;
    c.condition.icon = c.condition.icon.slice(0, 2) + (c.isNight ? "n" : "d");
    c.simulated = true;
    return c;
  }

  EW.weather = {
    current: null,
    load: function (opts) {
      opts = opts || {};
      if (state.loading) return state.loading;
      state.loading = doLoad(opts).finally(function () { state.loading = null; });
      return state.loading;
    },
    ageMinutes: function () {
      if (!state.current) return null;
      return Math.floor((Date.now() - state.current.fetchedAt) / 60000);
    },
    // Milidetik sampai boleh fetch lagi (0 bila cache sudah kedaluwarsa).
    msUntilRefresh: function () {
      var cache = readCache();
      if (!cache) return 0;
      return Math.max(0, cfg.CACHE_TTL_MS - (Date.now() - cache.fetchedAt));
    },
    onUpdate: function (fn) {
      EW.bus.on("weather:update", fn);
      if (state.current) fn(state.current);
      return fn;
    },
    status: function () { return state.status; },
    real: function () { return state.real; },
    override: function (ov) {
      state.override = Object.assign({}, state.override || {}, ov);
      if (state.real) publish(state.real);
    },
    clearOverride: function () {
      state.override = null;
      if (state.real) publish(state.real);
    },
    isOverridden: function () { return !!state.override; },
    endpointFor: function (key) { return cfg.TASK_ENDPOINT.replace("{KEY}", key || "{KEY}"); },
    via: function () {
      if (state.via) return state.via;
      var c = readCache();
      return c && c.via ? c.via : null;
    },
    requestUrlMasked: function () {
      if (EW.weather.via() === "proxy") {
        return cfg.WEATHER_PROXY + " (proxy Vercel) → " + cfg.OWM_ENDPOINT + "?q=" + cfg.CITY + "&appid=••••&units=" + cfg.UNITS + "&lang=" + cfg.LANG;
      }
      return cfg.OWM_ENDPOINT + "?q=" + cfg.CITY + "&appid=" + (hasKey() ? "••••" + cfg.OWM_KEY.trim().slice(-4) : "{KEY}") +
        "&units=" + cfg.UNITS + "&lang=" + cfg.LANG;
    }
  };

  // Muat ulang otomatis paling cepat tiap 10 menit, hanya saat tab terlihat.
  setInterval(function () {
    if (document.visibilityState === "visible" && EW.weather.msUntilRefresh() === 0) EW.weather.load();
  }, 60 * 1000);
})();
