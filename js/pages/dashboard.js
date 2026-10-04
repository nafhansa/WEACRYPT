/* P2 Control Room */
(function () {
  "use strict";
  var EW = window.EW, U = EW.util, ui = EW.ui, $ = ui.$, h = ui.h;

  /* ================= Sky Feed ================= */
  var SOURCE = { live: "Live dari OpenWeatherMap", cache: "Cache sesi, maks 10 menit", fallback: "Snapshot offline" };

  function setBar(id, pct) { $(id).style.width = Math.max(0, Math.min(100, pct || 0)) + "%"; }

  function renderSky(c) {
    if (!c) return;
    var tz = c.timezone;
    $("#sky-temp").textContent = U.fmtNum(c.temp, 1) + "°C";
    $("#sky-desc").textContent = c.condition.desc.charAt(0).toUpperCase() + c.condition.desc.slice(1) + " di " + c.place;
    $("#sky-feels").textContent = "Terasa " + U.fmtNum(c.feelsLike, 1) + "°C · " + c.condition.main + " (kode " + c.condition.id + ") · " + (c.isNight ? "malam" : "siang");
    $("#sky-hum").textContent = U.fmtNum(c.humidity) + "%";
    setBar("#sky-hum-bar", c.humidity);
    $("#sky-clouds").textContent = U.fmtNum(c.clouds) + "%";
    setBar("#sky-clouds-bar", c.clouds);
    $("#sky-press").textContent = U.fmtNum(c.pressure) + " hPa";
    $("#sky-vis").textContent = c.visibility === null ? "-" : U.fmtNum(c.visibility / 1000, c.visibility % 1000 ? 1 : 0) + " km";
    var dir = U.windDir(c.wind.deg);
    $("#sky-wind").textContent = U.fmtNum(c.wind.speed, 1) + " m/s" + (c.wind.gust !== null ? ", hembusan " + U.fmtNum(c.wind.gust, 1) + " m/s" : "");
    $("#sky-rain").textContent = U.fmtNum(c.rain1h, 2) + " mm";
    $("#sky-sunrise").textContent = c.sun.sunrise ? U.fmtTime(c.sun.sunrise * 1000, tz) : "-";
    $("#sky-sunset").textContent = c.sun.sunset ? U.fmtTime(c.sun.sunset * 1000, tz) : "-";
    $("#compass-needle").style.transform = "rotate(" + (c.wind.deg || 0) + "deg)";
    $("#compass-cap").textContent = c.wind.deg === null ? "Arah angin tidak tersedia" : "Angin dari " + dir + " (" + c.wind.deg + "°)";
    var src = $("#sky-source");
    src.className = "sky-source tag " + (c.simulated ? "tag-warn" : c.source === "live" ? "tag-ok" : c.offline ? "tag-danger" : "");
    src.textContent = c.simulated ? "Mode demo: data cuaca disimulasikan" : (c.offline && c.source === "cache" ? "Cache lama, API offline" : SOURCE[c.source]);
    renderAge(c);
    $("#raw-json").textContent = JSON.stringify(c.raw, null, 2);
    $("#raw-url").textContent = EW.weather.requestUrlMasked();
    renderPoolWeather(c);
  }

  function renderAge(c) {
    c = c || EW.weather.current;
    if (!c) return;
    var obs = c.observedAt ? "observasi OpenWeatherMap " + U.fmtTime(c.observedAt * 1000, c.timezone) : "";
    $("#sky-age").textContent = (c.source === "fallback" ? "Snapshot statis, bukan data live" : "Diperbarui " + U.relTime(c.fetchedAt)) + (obs ? " · " + obs : "");
    var ms = EW.weather.msUntilRefresh();
    var btn = $("#btn-reload");
    if (ms > 0 && !c.offline) {
      btn.disabled = true;
      var s = Math.ceil(ms / 1000);
      $("#reload-label").textContent = "Muat ulang dalam " + Math.floor(s / 60) + ":" + U.pad2(s % 60);
      btn.title = "Cache 10 menit dihormati supaya API tidak dipanggil berlebihan.";
    } else {
      btn.disabled = false;
      $("#reload-label").textContent = "Muat ulang";
      btn.removeAttribute("title");
    }
  }
  setInterval(function () { renderAge(); }, 1000);

  $("#btn-reload").addEventListener("click", async function () {
    $("#reload-label").textContent = "Memuat…";
    await EW.weather.load({ force: true });
    var s = EW.weather.status();
    ui.toast(s.kind === "ok" ? "Data cuaca dimuat ulang" : s.message, s.kind === "ok" ? null : "error");
  });

  $("#btn-raw").addEventListener("click", function () {
    var p = $("#raw-panel");
    p.hidden = !p.hidden;
    $("#btn-raw").setAttribute("aria-expanded", String(!p.hidden));
    $("#btn-raw").lastChild.textContent = p.hidden ? "Lihat JSON mentah" : "Tutup JSON mentah";
  });
  $("#btn-copy-raw").addEventListener("click", function () {
    var c = EW.weather.current;
    if (c) ui.copy(JSON.stringify(c.raw, null, 2), { message: "JSON cuaca disalin." });
  });

  EW.weather.onUpdate(renderSky);

  /* ================= Entropy Pool ================= */
  function renderPoolWeather(c) {
    $("#ring-weather").style.strokeDasharray = (c ? 100 : 0) + " 100";
  }
  function renderJitter(n) {
    $("#jitter-count").textContent = String(n);
    $("#ring-jitter").style.strokeDasharray = (n / EW.entropy.MAX_JITTER * 100) + " 100";
    var bar = $("#jitter-bar");
    bar.setAttribute("aria-valuenow", String(n));
    bar.firstElementChild.style.width = (n / EW.entropy.MAX_JITTER * 100) + "%";
  }
  EW.bus.on("entropy:jitter", renderJitter);
  renderJitter(EW.entropy.jitterCount());

  // Area "aduk lava": setiap gerakan menambah sampel timing ke pool.
  var canvas = $("#stir-canvas"), ctx = canvas.getContext("2d");
  var dots = [], raf = null;
  function sizeCanvas() {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function draw() {
    var r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    var a = cssVar("--lava-a"), b = cssVar("--lava-b");
    dots = dots.filter(function (d) { return d.life > 0; });
    dots.forEach(function (d) {
      d.life -= U.reducedMotion() ? 0 : 0.02;
      d.y -= U.reducedMotion() ? 0 : 0.4;
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.fillStyle = d.alt ? b : a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (0.6 + d.life * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    raf = dots.length && !U.reducedMotion() ? requestAnimationFrame(draw) : null;
  }
  var stir = $("#stir");
  stir.addEventListener("pointermove", function (e) {
    EW.entropy.addJitter(performance.now());
    var r = canvas.getBoundingClientRect();
    if (dots.length < 140) dots.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 6 + (e.timeStamp % 9), life: 1, alt: dots.length % 3 === 0 });
    if (!raf) raf = requestAnimationFrame(draw);
  });
  stir.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

  /* ================= Quick Forge ================= */
  var quick = ui.secretField($("#quick-secret"), { placeholder: "Tekan Buat password" });
  $("#btn-quick").addEventListener("click", async function () {
    var btn = $("#btn-quick");
    btn.disabled = true;
    try {
      var r = await EW.entropy.password({ length: 20, lower: true, upper: true, digits: true, symbols: true });
      quick.set(r.value);
      ui.stampCard($("#quick-stamp"), EW.entropy.weatherStamp(), "Dibuat");
      ui.toast("Password dibuat");
      ui.record("password", { length: r.length, bits: r.bits, charsetSize: r.charsetSize });
    } finally { btn.disabled = !EW.cryptoAvailable; }
  });

  /* ================= Ledger feed ================= */
  var TYPE = { genesis: "Genesis", password: "Password", passphrase: "Passphrase", pin: "PIN", key: "Kunci", seal: "Pesan disegel", lock: "File dikunci", split: "Rahasia dipecah", "breach-check": "Cek kebocoran", verify: "Cek integritas" };
  async function renderFeed() {
    var chain = EW.ledger.all();
    var list = $("#feed-list");
    list.textContent = "";
    $("#feed-empty").hidden = chain.length > 0;
    chain.slice(-5).reverse().forEach(function (b) {
      var st = b.stamp || {};
      list.appendChild(h("li", { "data-sky": st.sky || "clouds" }, [
        h("span", { class: "feed-dot", "aria-hidden": "true" }),
        h("span", { class: "feed-main" }, [h("strong", { text: "#" + b.index + " " + (TYPE[b.type] || b.type) }), h("span", { class: "muted small", text: (st.desc || "-") + " · " + U.relTime(Date.parse(b.timestamp)) })]),
        h("span", { class: "mono small feed-hash", text: String(b.hash).slice(0, 10) + "…" })
      ]));
    });
    var badge = $("#chain-badge");
    badge.textContent = "";
    if (!chain.length) return;
    var v = await EW.ledger.verify(chain);
    badge.className = "chain-badge tag " + (v.ok ? "tag-ok" : "tag-danger");
    badge.appendChild(ui.icon(v.ok ? "lock" : "unlock"));
    badge.appendChild(document.createTextNode(v.ok ? "Rantai valid" : "Rantai rusak di blok #" + v.firstBad));
  }
  EW.bus.on("ledger:update", renderFeed);
  renderFeed();

  /* ================= Checklist ================= */
  var ITEMS = [
    ["pm", "Pakai password manager"],
    ["2fa", "Aktifkan 2FA di email utama"],
    ["unique", "Password email unik, tidak dipakai di tempat lain"],
    ["seed", "Backup seed phrase terpisah dari perangkat"],
    ["breach", "Cek password lama di Breach Radar"]
  ];
  var state = {};
  try { state = JSON.parse(U.store.get(EW.config.CHECKLIST_KEY) || "{}") || {}; } catch (e) { state = {}; }
  function renderChecklist() {
    var ul = $("#check-list");
    ul.textContent = "";
    var done = 0;
    ITEMS.forEach(function (it) {
      var id = "chk-" + it[0];
      var input = h("input", { type: "checkbox", id: id });
      input.checked = !!state[it[0]];
      if (input.checked) done++;
      input.addEventListener("change", function () {
        state[it[0]] = input.checked;
        U.store.set(EW.config.CHECKLIST_KEY, JSON.stringify(state));
        renderChecklist();
        document.getElementById(id).focus();
      });
      var label = h("label", { class: "check", for: id }, [input, h("span", { text: it[1] })]);
      if (it[0] === "breach") label.appendChild(h("a", { href: "breach.html", class: "small", text: "Buka" }));
      ul.appendChild(h("li", { class: input.checked ? "is-done" : "" }, [label]));
    });
    var pct = Math.round(done / ITEMS.length * 100);
    $("#check-pct").textContent = pct + "%";
    var bar = $("#check-bar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.firstElementChild.style.width = pct + "%";
  }
  renderChecklist();

  ui.debugPanel();
})();
