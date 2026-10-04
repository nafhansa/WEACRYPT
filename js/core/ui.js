/* WEACRYPT: komponen UI bersama. Semua data dari user, API, atau dekripsi
   ditulis lewat textContent, tidak pernah innerHTML. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- Ikon (buatan sendiri, stroke 1.75, viewBox 24) ---------- */
  var ICONS = {
    logo: ["M7 18.5h10a4.2 4.2 0 0 0 .6-8.35A6.2 6.2 0 0 0 5.9 9.2 4.7 4.7 0 0 0 7 18.5z", ["c", 12, 12.6, 1.5], "M12 14.1v2.2"],
    sun: [["c", 12, 12, 4], "M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"],
    moon: ["M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"],
    cloud: ["M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"],
    rain: ["M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 7 14z", "M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3"],
    storm: ["M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 7 14z", "M12.5 14.5l-2.2 3.5h3.4l-2.2 3.5"],
    mist: ["M3 8h12M7 12h14M3 16h14M8 20h9", "M18 8h3"],
    forge: ["M14.5 3.5a6 6 0 0 0-5.6 8.1L3 17.5V21h3.5v-2h2v-2h2l1.6-1.6A6 6 0 1 0 14.5 3.5z", "M16.2 7.8h.01"],
    radar: ["M12 3a9 9 0 1 0 9 9", "M12 7a5 5 0 1 0 5 5", "M12 12l6.5-6.5", ["c", 12, 12, 1]],
    seal: ["M3 6.5h18v12H3z", "M3 7.5l9 6 9-6", ["c", 18, 17, 2.6]],
    locker: ["M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z", "M14 3v4.5h4.5", "M9.5 14.5h5v4h-5z", "M10.5 14.5v-1.3a1.5 1.5 0 0 1 3 0v1.3"],
    split: ["M12 3v5", "M12 8l-7 7v6", "M12 8l7 7v6", "M12 8v13"],
    ledger: ["M2.5 9h6v6h-6zM15.5 9h6v6h-6z", "M8.5 12h7"],
    lab: ["M9 3h6", "M10 3v6l-5.6 9.6A1.6 1.6 0 0 0 5.8 21h12.4a1.6 1.6 0 0 0 1.4-2.4L14 9V3", "M7.2 15h9.6"],
    verify: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M8.5 12l2.5 2.5 4.5-5"],
    dashboard: ["M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"],
    about: [["c", 12, 12, 9], "M12 11v6M12 7.5v.01"],
    copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
    eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", ["c", 12, 12, 3]],
    "eye-off": ["M3 3l18 18", "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1", "M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
    check: ["M5 12.5l4.5 4.5L19 7.5"],
    x: ["M6 6l12 12M18 6L6 18"],
    alert: ["M12 3.5l9.5 17h-19z", "M12 10v4.5", "M12 17.5v.01"],
    download: ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"],
    upload: ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"],
    refresh: ["M20 12a8 8 0 1 1-2.3-5.7", "M20 4v4.5h-4.5"],
    lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
    unlock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2"],
    print: ["M7 9V3h10v6", "M7 17H4v-7h16v7h-3", "M7 14h10v7H7z"],
    share: ["M12 3v12", "M7 8l5-5 5 5", "M5 13v7h14v-7"],
    wind: ["M3 8h10a2.5 2.5 0 1 0-2.5-2.5", "M3 12h15a2.5 2.5 0 1 1-2.5 2.5", "M3 16h7"],
    droplet: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
    gauge: [["c", 12, 12, 9], "M12 12l4-4"],
    sunrise: ["M3 18h18", "M7 18a5 5 0 0 1 10 0", "M12 3.5v5", "M9 6.5l3-3 3 3"],
    sunset: ["M3 18h18", "M7 18a5 5 0 0 1 10 0", "M12 3.5v5", "M9 5.5l3 3 3-3"],
    menu: ["M4 7h16M4 12h16M4 17h16"],
    more: [["c", 6, 12, 1.2], ["c", 12, 12, 1.2], ["c", 18, 12, 1.2]],
    thermo: ["M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z", "M12 15v-5"],
    hash: ["M5 9h15M4 15h15M10 4l-2 16M16 4l-2 16"],
    file: ["M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z", "M14 3v4.5h4.5"],
    cpu: ["M7 7h10v10H7z", "M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"],
    globe: [["c", 12, 12, 9], "M3 12h18", "M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"],
    pointer: ["M5 3l14 7.5-6 1.5-2.5 6z"]
  };

  function icon(name, cls) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    (ICONS[name] || ICONS.about).forEach(function (d) {
      var el;
      if (Array.isArray(d)) {
        el = document.createElementNS(SVGNS, "circle");
        el.setAttribute("cx", d[1]); el.setAttribute("cy", d[2]); el.setAttribute("r", d[3]);
      } else {
        el = document.createElementNS(SVGNS, "path");
        el.setAttribute("d", d);
      }
      svg.appendChild(el);
    });
    return svg;
  }

  function hydrateIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      if (el.firstChild && el.firstChild.nodeName === "svg") return;
      el.appendChild(icon(el.getAttribute("data-icon")));
    });
  }

  function weatherIconName(c) {
    if (!c) return "cloud";
    var sky = EW.theme ? EW.theme.skyFor(c.condition.main) : "clouds";
    if (sky === "clear") return c.isNight ? "moon" : "sun";
    if (sky === "clouds") return "cloud";
    return sky;
  }

  /* ---------- Helper DOM ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Toast ---------- */
  var toastRegion;
  function toast(msg, kind) {
    if (!toastRegion) {
      toastRegion = h("div", { class: "toasts", role: "status", "aria-live": "polite", "aria-atomic": "false" });
      document.body.appendChild(toastRegion);
    }
    var t = h("div", { class: "toast" + (kind ? " toast-" + kind : "") }, [
      icon(kind === "error" ? "alert" : "check"), h("span", { text: msg })
    ]);
    toastRegion.appendChild(t);
    setTimeout(function () { t.classList.add("toast-out"); }, 3600);
    setTimeout(function () { t.remove(); }, 4000);
  }

  /* ---------- Clipboard ---------- */
  var clearTimer = null;
  async function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    var ta = h("textarea", { class: "sr-only", "aria-hidden": "true" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand("copy");
    ta.value = "";
    ta.remove();
    if (!ok) throw new Error("COPY");
  }

  async function copy(text, opts) {
    opts = opts || {};
    try {
      await writeClipboard(text);
    } catch (e) {
      toast("Tidak bisa menyalin. Pilih teksnya lalu tekan Ctrl+C.", "error");
      return false;
    }
    if (opts.secret) {
      toast("Disalin. Clipboard akan dikosongkan dalam 30 detik");
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(function () {
        // Usaha terbaik: browser bisa menolak bila tab tidak fokus. Tidak dijamin.
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText("").catch(function () {});
      }, 30000);
    } else {
      toast(opts.message || "Disalin.");
    }
    return true;
  }

  var COPY_TITLE = "Salin ke clipboard. Pengosongan otomatis setelah 30 detik adalah usaha terbaik dan tidak dijamin (browser bisa menolaknya).";

  /* ---------- Secret field ---------- */
  function classOf(ch) {
    if (/[a-z]/.test(ch)) return "c-lower";
    if (/[A-Z]/.test(ch)) return "c-upper";
    if (/[0-9]/.test(ch)) return "c-digit";
    return "c-symbol";
  }

  function secretField(el, opts) {
    opts = opts || {};
    var value = "";
    var shown = false;
    var colorize = opts.colorize !== false;
    var hideTimer = null;
    el.classList.add("secret");
    if (opts.large) el.classList.add("secret-lg");
    var out = h("div", { class: "secret-value mono", "data-empty": "true" });
    var revealBtn = h("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-pressed": "false" }, [icon("eye"), h("span", { text: "Tampilkan" })]);
    var copyBtn = h("button", { type: "button", class: "btn btn-ghost btn-sm", title: COPY_TITLE }, [icon("copy"), h("span", { text: "Salin" })]);
    var actions = h("div", { class: "secret-actions" }, [revealBtn, copyBtn]);
    el.textContent = "";
    el.appendChild(out);
    el.appendChild(actions);

    function render() {
      out.textContent = "";
      out.setAttribute("data-empty", value ? "false" : "true");
      revealBtn.disabled = copyBtn.disabled = !value;
      if (!value) { out.textContent = opts.placeholder || "Belum ada hasil"; return; }
      if (!shown) {
        var n = Array.from(value).length;
        out.textContent = "•".repeat(Math.min(n, 48)) + (n > 48 ? "…" : "");
        out.setAttribute("aria-label", "Tersembunyi, " + n + " karakter");
        return;
      }
      out.removeAttribute("aria-label");
      if (colorize && value.length <= 4096) {
        var frag = document.createDocumentFragment();
        Array.from(value).forEach(function (ch) { frag.appendChild(h("span", { class: classOf(ch), text: ch })); });
        out.appendChild(frag);
      } else {
        out.textContent = value;
      }
    }

    function setShown(v) {
      shown = v;
      revealBtn.setAttribute("aria-pressed", String(v));
      revealBtn.lastChild.textContent = v ? "Sembunyikan" : "Tampilkan";
      revealBtn.replaceChild(icon(v ? "eye-off" : "eye"), revealBtn.firstChild);
      if (hideTimer) clearTimeout(hideTimer);
      if (v) hideTimer = setTimeout(function () { setShown(false); }, 30000);
      render();
    }

    revealBtn.addEventListener("click", function () { setShown(!shown); });
    copyBtn.addEventListener("click", function () { if (value) copy(value, { secret: true }); });
    render();

    return {
      // Nilai baru selalu kembali tersembunyi (default secret field).
      set: function (v, o) { value = v || ""; setShown(!!(o && o.reveal)); },
      value: function () { return value; },
      clear: function () { value = ""; setShown(false); },
      reveal: setShown,
      setColorize: function (v) { colorize = v; render(); }
    };
  }

  /* ---------- Strength bar ---------- */
  function strengthBar(el) {
    el.classList.add("strength");
    el.textContent = "";
    var segs = h("div", { class: "strength-segs", "aria-hidden": "true" });
    for (var i = 0; i < 5; i++) segs.appendChild(h("span"));
    var label = h("span", { class: "strength-label" });
    var bits = h("span", { class: "strength-bits mono" });
    el.appendChild(segs);
    el.appendChild(h("div", { class: "strength-text" }, [label, bits]));
    function set(score, b, text) {
      if (score === null || score === undefined) {
        el.setAttribute("data-score", "none");
        label.textContent = text || "Belum dinilai";
        bits.textContent = "";
        return;
      }
      el.setAttribute("data-score", String(score));
      label.textContent = text || EW.strength.LABELS[score];
      bits.textContent = typeof b === "number" ? "≈ " + U.fmtNum(b, 1) + " bit" : "";
    }
    set(null);
    return { set: set };
  }

  /* ---------- Stamp card ---------- */
  function stampCard(el, st, verb) {
    el.textContent = "";
    el.classList.add("stamp");
    if (!st) { el.hidden = true; return; }
    el.hidden = false;
    if (st.sky) el.setAttribute("data-stamp-sky", st.sky);
    el.appendChild(h("span", { class: "stamp-icon", "aria-hidden": "true" }, [icon(st.sky === "clear" ? "sun" : st.sky === "clouds" || !st.sky ? "cloud" : st.sky)]));
    el.appendChild(h("div", { class: "stamp-body" }, [
      h("p", { class: "stamp-text", text: EW.entropy.stampText(st, verb) }),
      h("p", { class: "stamp-id" }, ["Stamp ID: ", h("span", { class: "mono", text: st.id || "--------" }),
        st.simulated ? h("span", { class: "stamp-sim", text: " (cuaca simulasi)" }) : null])
    ]));
  }

  /* ---------- Drop zone ---------- */
  function dropZone(el, opts) {
    var input = h("input", { type: "file", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    if (opts.multiple) input.multiple = true;
    if (opts.accept) input.accept = opts.accept;
    var btn = h("button", { type: "button", class: "btn btn-secondary" }, [icon("upload"), h("span", { text: opts.buttonText || "Pilih file" })]);
    el.classList.add("dropzone");
    el.textContent = "";
    el.appendChild(h("span", { class: "dropzone-icon", "aria-hidden": "true" }, [icon("file")]));
    el.appendChild(h("p", { class: "dropzone-text", text: opts.text || "Tarik file ke sini, atau" }));
    el.appendChild(btn);
    el.appendChild(input);
    btn.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      if (input.files && input.files.length) opts.onFiles(Array.prototype.slice.call(input.files));
      input.value = "";
    });
    ["dragenter", "dragover"].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); el.classList.remove("is-over"); });
    });
    el.addEventListener("drop", function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) opts.onFiles(Array.prototype.slice.call(files, 0, opts.multiple ? files.length : 1));
    });
    return { input: input, button: btn };
  }

  /* ---------- Tabs (role=tablist, panah kiri/kanan) ---------- */
  function tabs(root, onChange) {
    var list = $('[role="tablist"]', root);
    var tabEls = $$('[role="tab"]', list);
    function select(tab, focus) {
      tabEls.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      if (onChange) onChange(tab.getAttribute("data-tab"));
    }
    tabEls.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabEls.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabEls.length) % tabEls.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabEls.length - 1;
        if (j !== null) { e.preventDefault(); select(tabEls[j], true); }
      });
    });
    return {
      select: function (name) {
        var t = tabEls.filter(function (x) { return x.getAttribute("data-tab") === name; })[0];
        if (t) select(t);
      }
    };
  }

  /* ---------- Modal konfirmasi ---------- */
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var dlg = h("dialog", { class: "modal", "aria-labelledby": "modal-title" });
      var ok = h("button", { type: "button", class: "btn " + (o.danger ? "btn-danger" : "btn-primary"), text: o.confirmText || "Lanjutkan" });
      var cancel = h("button", { type: "button", class: "btn btn-ghost", text: o.cancelText || "Batal" });
      dlg.appendChild(h("h2", { id: "modal-title", class: "modal-title", text: o.title }));
      if (o.body) dlg.appendChild(h("p", { class: "modal-body", text: o.body }));
      dlg.appendChild(h("div", { class: "modal-actions" }, [cancel, ok]));
      document.body.appendChild(dlg);
      function close(v) { dlg.close(); dlg.remove(); resolve(v); }
      ok.addEventListener("click", function () { close(true); });
      cancel.addEventListener("click", function () { close(false); });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(false); });
      if (typeof dlg.showModal === "function") dlg.showModal();
      else resolve(window.confirm(o.title + (o.body ? "\n\n" + o.body : "")));
      cancel.focus();
    });
  }

  /* ---------- Unduhan ---------- */
  function download(data, filename, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: filename, class: "sr-only" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- QR (library opsional qrcode-generator) ---------- */
  function qr(canvas, text, opts) {
    opts = opts || {};
    if (typeof window.qrcode !== "function") return false;
    try {
      var q = window.qrcode(0, opts.ecl || "L");
      q.addData(text, "Byte");
      q.make();
      var count = q.getModuleCount();
      var quiet = 4;
      var size = opts.size || 240;
      var scale = Math.max(1, Math.floor(size / (count + quiet * 2)));
      var px = (count + quiet * 2) * scale;
      canvas.width = px; canvas.height = px;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = "#1F2A1B";
      for (var r = 0; r < count; r++) for (var c = 0; c < count; c++) {
        if (q.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Weather chip ---------- */
  function chipStatus(c) {
    if (c.simulated) return { key: "sim", text: "simulasi" };
    if (c.source === "live") return { key: "live", text: "live" };
    if (c.source === "cache" && !c.offline) return { key: "cache", text: "cache" };
    return { key: "offline", text: "offline" };
  }

  function renderChip(el, c) {
    el.textContent = "";
    el.classList.add("wchip");
    if (!c) { el.appendChild(h("span", { class: "wchip-text", text: "Memuat cuaca Bandung…" })); return; }
    var st = chipStatus(c);
    el.setAttribute("data-status", st.key);
    var status = EW.weather.status();
    el.title = c.offline ? (status.message || "Data cuaca offline, visual pakai snapshot") : "Data OpenWeatherMap untuk " + c.place;
    el.appendChild(h("span", { class: "wchip-icon", "aria-hidden": "true" }, [icon(weatherIconName(c))]));
    el.appendChild(h("span", { class: "wchip-temp", text: U.fmtNum(c.temp, 1) + "°C" }));
    el.appendChild(h("span", { class: "wchip-desc", text: c.condition.desc }));
    if (!c.offline) el.appendChild(h("span", { class: "wchip-age", text: "diperbarui " + U.relTime(c.fetchedAt) }));
    el.appendChild(h("span", { class: "wchip-status" }, [h("span", { class: "wchip-dot", "aria-hidden": "true" }), h("span", { text: st.text })]));
  }

  function renderChips() {
    var c = EW.weather && EW.weather.current;
    $$("[data-weather-chip]").forEach(function (el) { renderChip(el, c); });
    $$("[data-weather-notice]").forEach(function (el) {
      var s = EW.weather.status();
      var show = c && c.offline && s.message;
      el.hidden = !show;
      el.textContent = show ? s.message : "";
    });
  }

  /* ---------- Banner crypto.subtle ---------- */
  function cryptoBanner() {
    if (EW.cryptoAvailable) return;
    var main = $("main") || document.body;
    var b = h("div", { class: "banner banner-danger", role: "alert" }, [
      icon("alert"),
      h("p", {}, [
        "Browser memblokir fitur kriptografi di mode ini. Jalankan ",
        h("code", { text: "python -m http.server" }),
        " di folder proyek, lalu buka ",
        h("code", { text: "http://localhost:8000" }), "."
      ])
    ]);
    main.insertBefore(b, main.firstChild);
    $$("[data-needs-crypto]").forEach(function (x) { x.disabled = true; });
  }

  /* ---------- Ledger helper ---------- */
  function record(type, meta, opts) {
    opts = opts || {};
    if (!EW.ledger) return Promise.resolve(null);
    return EW.ledger.append(type, meta, opts).then(function (blk) {
      if (!opts.silent) toast("Blok #" + blk.index + " ditambang ke ledger");
      return blk;
    }).catch(function (e) {
      if (e && e.code === "FULL") toast("Ledger penuh (500 blok). Buka halaman Ledger untuk ekspor dan arsip.", "error");
      else toast("Blok ledger gagal ditambang. Alat tetap bekerja normal.", "error");
      return null;
    });
  }

  /* ---------- Panel debug (Shift + D) ---------- */
  function debugPanel(opts) {
    opts = opts || {};
    var panel = null, fpsEl = null, fpsTimer = null;
    function build() {
      panel = h("aside", { class: "debug", "aria-label": "Panel debug cuaca" });
      panel.appendChild(h("div", { class: "debug-head" }, [
        h("strong", { text: "Panel debug" }),
        h("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": "Tutup panel debug", onclick: toggle }, [icon("x")])
      ]));
      var label = h("p", { class: "debug-label", text: "Mode demo: data cuaca disimulasikan" });
      label.hidden = !EW.weather.isOverridden();
      panel.appendChild(label);
      var conds = h("div", { class: "debug-row", role: "group", "aria-label": "Kondisi" });
      [["Clear", "Cerah"], ["Clouds", "Berawan"], ["Rain", "Hujan"], ["Thunderstorm", "Badai"], ["Mist", "Kabut"]].forEach(function (p) {
        conds.appendChild(h("button", { type: "button", class: "chip-btn", text: p[1], onclick: function () { set({ main: p[0] }); } }));
      });
      panel.appendChild(conds);
      var time = h("div", { class: "debug-row", role: "group", "aria-label": "Waktu" });
      time.appendChild(h("button", { type: "button", class: "chip-btn", text: "Siang", onclick: function () { set({ isNight: false }); } }));
      time.appendChild(h("button", { type: "button", class: "chip-btn", text: "Malam", onclick: function () { set({ isNight: true }); } }));
      panel.appendChild(time);
      var c = EW.weather.current || {};
      [["windSpeed", "Angin (m/s)", 0, 15, 0.1, c.wind ? c.wind.speed : 2],
       ["humidity", "Kelembapan (%)", 0, 100, 1, c.humidity || 80],
       ["clouds", "Awan (%)", 0, 100, 1, c.clouds || 50]].forEach(function (s) {
        var id = "dbg-" + s[0];
        var out = h("output", { for: id, text: String(s[5]) });
        var r = h("input", { type: "range", id: id, min: s[2], max: s[3], step: s[4], value: s[5] });
        r.addEventListener("input", function () {
          out.textContent = r.value;
          var o = {}; o[s[0]] = parseFloat(r.value); set(o);
        });
        panel.appendChild(h("div", { class: "debug-slider" }, [h("label", { for: id, text: s[1] }), r, out]));
      });
      fpsEl = h("p", { class: "debug-fps mono", text: "FPS: -" });
      panel.appendChild(fpsEl);
      panel.appendChild(h("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Kembali ke data asli", onclick: function () {
        EW.weather.clearOverride(); label.hidden = true;
      } }));
      function set(o) { EW.weather.override(o); label.hidden = false; }
      document.body.appendChild(panel);
    }
    function toggle() {
      if (!panel) build();
      else panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        var frames = 0, t0 = performance.now();
        var loop = function () {
          if (!panel || panel.hidden) return;
          frames++;
          var now = performance.now();
          if (now - t0 >= 1000) {
            fpsEl.textContent = "FPS: " + (opts.fps ? opts.fps() : Math.round(frames * 1000 / (now - t0)));
            frames = 0; t0 = now;
          }
          fpsTimer = requestAnimationFrame(loop);
        };
        cancelAnimationFrame(fpsTimer);
        fpsTimer = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.shiftKey && (e.key === "D" || e.key === "d") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggle(); }
    });
  }

  /* ---------- Teks kekuatan + waktu crack ---------- */
  function crackTable(tbody, bits) {
    tbody.textContent = "";
    EW.strength.crackTimes(bits).forEach(function (r) {
      tbody.appendChild(h("tr", {}, [
        h("th", { scope: "row" }, [h("span", { class: "ct-label", text: r.label }), h("span", { class: "ct-desc", text: r.desc })]),
        h("td", { class: "mono", text: r.rateLabel }),
        h("td", { text: r.human })
      ]));
    });
  }

  /* ---------- Panduan "Cara pakai": ingat terbuka/tertutup per halaman ---------- */
  function initHowto() {
    $$("details[data-howto]").forEach(function (d) {
      var key = "wc.howto." + d.getAttribute("data-howto");
      if (U.store.get(key) === "closed") d.removeAttribute("open");
      d.addEventListener("toggle", function () { U.store.set(key, d.open ? "open" : "closed"); });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    hydrateIcons();
    initHowto();
    cryptoBanner();
    if (EW.weather) {
      EW.bus.on("weather:update", renderChips);
      EW.bus.on("weather:status", renderChips);
      renderChips();
      setInterval(renderChips, 30000);
      EW.weather.load();
    }
    // Tutup menu <details> saat klik di luar atau Escape
    document.addEventListener("click", function (e) {
      $$("details.navmenu[open]").forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") $$("details.navmenu[open]").forEach(function (d) { d.removeAttribute("open"); var s = $("summary", d); if (s) s.focus(); });
    });
  }

  EW.ui = {
    icon: icon, icons: ICONS, hydrateIcons: hydrateIcons, weatherIconName: weatherIconName,
    h: h, $: $, $$: $$,
    toast: toast, copy: copy, COPY_TITLE: COPY_TITLE,
    secretField: secretField, strengthBar: strengthBar, stampCard: stampCard,
    dropZone: dropZone, tabs: tabs, confirm: confirmDialog, download: download, qr: qr,
    renderChip: renderChip, record: record, debugPanel: debugPanel, crackTable: crackTable
  };

  init();
})();
