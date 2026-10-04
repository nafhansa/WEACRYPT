// WEACRYPT: proxy serverless OpenWeatherMap (Vercel Function, Node.js).
// - API key disimpan di environment variable OWM_KEY, tidak pernah dikirim ke browser.
// - Kota dikunci di server (Bandung), jadi proxy tidak bisa dipakai orang lain untuk kota apa pun.
// - Respons di-cache di CDN Vercel selama 10 menit: OWM dipanggil paling banyak ~6x per jam,
//   berapa pun jumlah pengunjungnya.

const CITY = "Bandung";
const UPSTREAM = "https://api.openweathermap.org/data/2.5/weather";

function json(body, status, cache) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function GET() {
  const key = (process.env.OWM_KEY || "").trim();
  if (!key) {
    return json({ error: "OWM_KEY_MISSING", message: "Environment variable OWM_KEY belum diset di Vercel." }, 500, "no-store");
  }

  const url = `${UPSTREAM}?q=${encodeURIComponent(CITY)}&appid=${encodeURIComponent(key)}&units=metric&lang=id`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return json({ error: "UPSTREAM_UNREACHABLE" }, 502, "public, max-age=0, s-maxage=60");
  }

  if (res.status === 401) {
    return json({ error: "OWM_KEY_REJECTED", message: "API key OpenWeatherMap ditolak. Cek OWM_KEY di Vercel." }, 401, "no-store");
  }
  if (!res.ok) {
    // Cache singkat supaya lonjakan error (misal 429) tidak membanjiri OWM.
    return json({ error: "UPSTREAM_" + res.status }, 502, "public, max-age=0, s-maxage=60");
  }

  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Browser 60 detik, CDN Vercel 10 menit, lalu sajikan versi lama sambil memperbarui.
      "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
