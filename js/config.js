/* WEACRYPT: konfigurasi global.
   Catatan: tanpa backend, API key OpenWeatherMap pasti terlihat di frontend.
   Ini key tugas dan akan di-rotate setelah penilaian. Untuk produksi, pakai proxy serverless. */
window.EW = window.EW || {};

EW.config = {
  // Hanya untuk menjalankan lokal tanpa proxy (file:// atau python -m http.server).
  // JANGAN diisi untuk deploy publik: pakai environment variable OWM_KEY di Vercel.
  OWM_KEY: "",
  CITY: "Bandung",
  OWM_ENDPOINT: "https://api.openweathermap.org/data/2.5/weather",
  // Proxy serverless (api/weather.js) saat di-hosting di Vercel. API key ada di env var OWM_KEY,
  // jadi untuk deploy OWM_KEY di atas boleh tetap kosong. Path relatif supaya jalan di subfolder.
  WEATHER_PROXY: "api/weather",
  // Endpoint asli dari soal tugas (tanpa units dan lang). Aplikasi menambahkan
  // units=metric (Celsius) dan lang=id (deskripsi Bahasa Indonesia).
  TASK_ENDPOINT: "https://api.openweathermap.org/data/2.5/weather?q=Bandung&appid={KEY}",
  UNITS: "metric",
  LANG: "id",
  CACHE_KEY: "ew.weather.v1",
  CACHE_TTL_MS: 10 * 60 * 1000, // jangan pernah fetch lebih sering dari 1x per 10 menit
  HIBP_RANGE: "https://api.pwnedpasswords.com/range/",
  LEDGER_KEY: "ew.ledger.v1",
  LEDGER_MAX: 500,
  LEDGER_DIFFICULTY_KEY: "ew.ledger.difficulty",
  CHECKLIST_KEY: "ew.checklist.v1",
  PBKDF2_ITERS: 600000,
  CREATOR: "Nafhan",

  // Snapshot statis Bandung (bentuk respons OWM asli) untuk visual saat API tidak bisa dihubungi.
  // Bukan data live. UI selalu menandainya sebagai "snapshot".
  FALLBACK: {
    coord: { lon: 107.6186, lat: -6.9039 },
    weather: [{ id: 500, main: "Rain", description: "hujan ringan", icon: "10d" }],
    base: "stations",
    main: { temp: 21.4, feels_like: 21.6, temp_min: 20.9, temp_max: 22.1, pressure: 1011, humidity: 88, sea_level: 1011, grnd_level: 922 },
    visibility: 8000,
    wind: { speed: 2.57, deg: 240 },
    rain: { "1h": 0.42 },
    clouds: { all: 75 },
    dt: 1759550400,
    sys: { country: "ID", sunrise: 1759531560, sunset: 1759575600 },
    timezone: 25200,
    id: 1650357,
    name: "Bandung",
    cod: 200
  }
};
