// Relay for live aircraft near a point. Browsers can't call these feeds directly (CORS),
// so the page calls /api/planes and this function fetches server-side.
export default async function handler(req, res) {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  const dist = Math.min(100, Math.max(1, parseFloat(req.query.dist) || 25));
  if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'lat/lon required' });
  const sources = [
    ['adsb.lol', `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`],
    ['airplanes.live', `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`],
    ['adsb.fi', `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`]
  ];
  const errors = [];
  for (const [name, url] of sources) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'harbour-planes/1.0 (+https://harbour-planes.vercel.app)', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) { errors.push(`${name}: ${r.status}`); continue; }
      const j = await r.json();
      const ac = j.ac || j.aircraft || [];
      let now = +j.now || 0; if (now && now < 1e12) now *= 1000; // feed timestamp (ms)
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ source: name, now, served: Date.now(), ac });
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  res.status(502).json({ error: 'all feeds failed', errors });
}
