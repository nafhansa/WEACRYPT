/* WEACRYPT: landing scroll-driven (GSAP + ScrollTrigger).
   Tanpa GSAP atau dengan reduced motion, halaman tetap utuh sebagai layout statis. */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, $$ = ui.$$;
  var reduced = U.reducedMotion();
  var lastSample = false;

  /* ================= Data cuaca live (bukti pemanggilan API) ================= */
  function renderWeather(c) {
    $("#intro-live").textContent = "Langit Bandung sekarang: " + c.condition.desc + ", " + U.fmtNum(Math.round(c.temp)) + "°C" +
      (c.offline ? " (snapshot offline)" : "");
    $("#sc-temp").textContent = U.fmtNum(c.temp, 1) + "°C";
    $("#sc-desc").textContent = c.condition.desc.charAt(0).toUpperCase() + c.condition.desc.slice(1) + " di " + c.place;
    $("#sc-hum").textContent = U.fmtNum(c.humidity) + "%";
    $("#sc-wind").textContent = U.fmtNum(c.wind.speed, 1) + " m/s";
    $("#sc-clouds").textContent = U.fmtNum(c.clouds) + "%";
    var r = c.raw || {};
    $("#sc-json").textContent = JSON.stringify({
      name: r.name, weather: r.weather && [{ main: r.weather[0].main, description: r.weather[0].description }],
      main: r.main && { temp: r.main.temp, humidity: r.main.humidity, pressure: r.main.pressure },
      wind: r.wind, clouds: r.clouds, dt: r.dt
    }, null, 2);
    if (lastSample) $("#sc-stamp").textContent = EW.entropy.stampText(EW.entropy.weatherStamp(), "Dibuat");
  }
  EW.weather.onUpdate(renderWeather);

  /* ================= Contoh password (langkah 3) ================= */
  async function makeSample() {
    if (!EW.cryptoAvailable) return;
    var r = await EW.entropy.password({ length: 18, lower: true, upper: true, digits: true, symbols: true, excludeSimilar: true, purpose: "preview" });
    $("#sc-pass").textContent = r.value;
    lastSample = true;
    $("#sc-stamp").textContent = EW.entropy.stampText(EW.entropy.weatherStamp(), "Dibuat");
  }
  $("#btn-sample").addEventListener("click", makeSample);
  makeSample();

  /* ================= Grid hex 256 bit (langkah 2) ================= */
  var grid = $("#hexgrid"), cells = [];
  for (var i = 0; i < 32; i++) { var s = document.createElement("span"); grid.appendChild(s); cells.push(s); }
  function fillHex(all) {
    var b = new Uint8Array(32);
    crypto.getRandomValues(b); // hanya visual
    cells.forEach(function (c, k) {
      if (!all && b[k] > 70) return;
      c.textContent = U.toHex(b.subarray(k, k + 1));
      c.classList.toggle("flip", !all);
    });
  }
  fillHex(true);
  var hexTimer = null;
  function startHex() { if (!hexTimer && !reduced) hexTimer = setInterval(function () { fillHex(false); }, 160); }
  function stopHex() { clearInterval(hexTimer); hexTimer = null; }
  new IntersectionObserver(function (en) { if (en[0].isIntersecting) startHex(); else stopHex(); }).observe($("#story"));

  /* Header bergaris setelah mulai menggulir */
  var topBar = $(".lp-top");
  window.addEventListener("scroll", function () { topBar.classList.toggle("is-scrolled", window.scrollY > 8); }, { passive: true });

  /* ================= Animasi GSAP ================= */
  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST || reduced) {
    // Tanpa animasi: tampilkan langsung arti nama.
    $$(".w-x").forEach(function (el) { el.style.width = "auto"; el.style.opacity = "1"; });
    $(".w-gap").style.width = "0.25em";
    return;
  }
  gsap.registerPlugin(ST);
  document.documentElement.classList.add("is-animated");

  // Pecah huruf untuk animasi masuk.
  $$(".w-part").forEach(function (el) {
    var t = el.textContent;
    el.textContent = "";
    t.split("").forEach(function (ch) {
      var c = document.createElement("span");
      c.className = "char";
      c.textContent = ch;
      el.appendChild(c);
    });
  });

  // 1. Masuk: huruf WEACRYPT naik satu per satu.
  gsap.from(".word .char", { yPercent: 110, opacity: 0, duration: 0.9, ease: "power4.out", stagger: 0.05 });
  gsap.from([".intro-kicker", ".intro-line", ".intro-live", ".scroll-cue"], { y: 16, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.1, delay: 0.5 });

  // 2. Gulir: WEACRYPT terurai menjadi WEAther enCRYPTion, sambil mengecil agar muat di layar.
  var word = $(".word");
  function fitScale() {
    var extra = $$(".w-x").reduce(function (sum, el) { return sum + el.scrollWidth; }, 0);
    var gap = parseFloat(getComputedStyle(word).fontSize) * 0.25;
    var base = $$(".w-part").reduce(function (sum, el) { return sum + el.getBoundingClientRect().width; }, 0);
    var full = base + extra + gap;
    return Math.min(1, (window.innerWidth * 0.84) / full);
  }
  gsap.timeline({
    scrollTrigger: { trigger: "#intro", start: "top top", end: "+=130%", scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true }
  })
    .to(".scroll-cue", { opacity: 0, duration: 0.2 }, 0)
    .to(".w-gap", { width: "0.25em", duration: 0.6 }, 0.1)
    .to(".w-x", { width: function (i, el) { return el.scrollWidth; }, opacity: 1, duration: 0.8, stagger: 0.12, ease: "power2.out" }, 0.1)
    .to(word, { scale: fitScale, duration: 1, ease: "power2.out" }, 0.1)
    .to(".intro-kicker", { letterSpacing: "0.5em", opacity: 0.4, duration: 0.8 }, 0.2)
    .to([".intro-line", ".intro-live"], { y: -20, duration: 0.8 }, 1.1);

  // Keluar dengan halus: saat pin selesai, intro naik dan memudar bersamaan dengan
  // section berikutnya yang masuk, jadi tidak pernah ada layar kosong.
  gsap.to(".intro-inner", {
    opacity: 0, y: -80, ease: "none",
    scrollTrigger: { trigger: "#story", start: "top 90%", end: "top 25%", scrub: 0.6 }
  });

  var mm = gsap.matchMedia();

  // 3. Cerita bertahap (layar lebar): teks dan kartu berganti saat digulir.
  mm.add("(min-width: 900px)", function () {
    var steps = $$(".story-step"), cards = $$(".story-card");
    gsap.set(steps.slice(1), { opacity: 0, y: 40 });
    gsap.set(cards.slice(1), { opacity: 0, y: 40, scale: 0.96 });
    var tl = gsap.timeline({
      scrollTrigger: { trigger: "#story", start: "top top", end: "+=220%", scrub: 0.6, pin: true, anticipatePin: 1 }
    });
    // Kepala section dan langkah pertama muncul saat section masih masuk ke layar (sebelum pin).
    gsap.from([".story-head", steps[0], cards[0]], {
      y: 60, opacity: 0, stagger: 0.08, ease: "none",
      scrollTrigger: { trigger: "#story", start: "top 85%", end: "top 15%", scrub: 0.6 }
    });
    for (var k = 1; k < steps.length; k++) {
      var at = (k - 1) * 1.2 + 0.4;
      // Berurutan, tidak bertumpuk: yang lama hilang dulu, baru yang baru masuk.
      tl.to(steps[k - 1], { opacity: 0, y: -40, duration: 0.3 }, at)
        .to(cards[k - 1], { opacity: 0, y: -40, scale: 0.97, duration: 0.3 }, at)
        .to(steps[k], { opacity: 1, y: 0, duration: 0.35 }, at + 0.32)
        .to(cards[k], { opacity: 1, y: 0, scale: 1, duration: 0.35 }, at + 0.32);
    }
    tl.to({}, { duration: 0.5 }); // jeda singkat agar langkah terakhir sempat dibaca
    tl.to(".story-bar-fill", { width: "100%", ease: "none", duration: tl.duration() }, 0);
  });

  // Layar kecil: tiap blok muncul saat masuk viewport.
  mm.add("(max-width: 899px)", function () {
    $$(".story-step, .story-card, .feat").forEach(function (el) {
      gsap.from(el, { y: 30, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
    });
  });

  // 4. Fitur: gulir horizontal yang di-pin (layar lebar).
  mm.add("(min-width: 900px)", function () {
    var track = $("#features-track");
    function distance() { return Math.max(0, track.scrollWidth - window.innerWidth); }
    gsap.from(".features-head > *", { y: 30, opacity: 0, stagger: 0.1, duration: 0.7, scrollTrigger: { trigger: "#features", start: "top 70%" } });
    gsap.to(track, {
      x: function () { return -distance(); },
      ease: "none",
      scrollTrigger: { trigger: "#features", start: "top top", end: function () { return "+=" + distance(); }, scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true }
    });
  });

  // 5. Privasi dan ajakan: muncul halus.
  $$(".reveal").forEach(function (el) {
    gsap.from(el, { y: 36, opacity: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
  });

  // Font web mengubah lebar huruf: hitung ulang posisi setelah font siap.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
})();
