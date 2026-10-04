/* WEACRYPT: mapping cuaca ke tema. Hanya mengubah atribut data-sky dan data-time di <html>. */
(function () {
  "use strict";
  var EW = window.EW;

  var SKY = {
    Clear: "clear",
    Clouds: "clouds",
    Rain: "rain", Drizzle: "rain",
    Thunderstorm: "storm", Squall: "storm", Tornado: "storm",
    Mist: "mist", Fog: "mist", Haze: "mist", Smoke: "mist", Dust: "mist", Sand: "mist", Ash: "mist"
  };

  // Warna lava per kondisi (tabel 5.2): uColorA (bawah/inti) ke uColorB (atas/tepi).
  var LAVA = {
    clear: { a: "#E8483F", b: "#E9D43B", label: "Oranye magma ke belerang" },
    clouds: { a: "#D9B92E", b: "#F4EBA6", label: "Belerang pucat" },
    rain: { a: "#5FA8D3", b: "#8FD6CB", label: "Biru hujan ke kawah" },
    storm: { a: "#6B3FA0", b: "#E8483F", label: "Ungu magma" },
    mist: { a: "#BFE3DC", b: "#F4FBF9", label: "Putih kawah" }
  };

  var SKY_LABEL = { clear: "cerah", clouds: "berawan", rain: "hujan", storm: "badai", mist: "kabut" };

  function skyFor(main) { return SKY[main] || "clouds"; }

  function apply(current) {
    if (!current) return;
    var root = document.documentElement;
    root.setAttribute("data-sky", skyFor(current.condition.main));
    root.setAttribute("data-time", current.isNight ? "night" : "day");
  }

  EW.theme = {
    skyFor: skyFor,
    lava: LAVA,
    skyLabel: SKY_LABEL,
    apply: apply,
    current: function () {
      var r = document.documentElement;
      return { sky: r.getAttribute("data-sky") || "clouds", time: r.getAttribute("data-time") || "day" };
    }
  };

  EW.bus.on("weather:update", apply);
})();
