// Computes the real skyline seen from a point: for each compass bearing, the highest
// apparent elevation angle of terrain in near / mid / far distance bands.
// Elevation data: Open-Meteo elevation API (Copernicus DEM, ~90 m). Cached hard at the edge.
const R = 6371000, K = 0.13; // earth radius, atmospheric refraction coefficient
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dest(lat, lon, brg, d) {
  const p1 = rad(lat), l1 = rad(lon), t = rad(brg), a = d / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), deg(l2)];
}
async function elevations(points) {
  const out = new Array(points.length);
  const chunks = [];
  for (let i = 0; i < points.length; i += 100) chunks.push(i);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = chunks[next++], part = points.slice(i, i + 100);
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${part.map(p => p[0].toFixed(5)).join(',')}&longitude=${part.map(p => p[1].toFixed(5)).join(',')}`;
      let j, last = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (r.ok) { j = await r.json(); break; }
          last = `${r.status} ${(await r.text()).slice(0, 160)}`;
        } catch (e) { last = e.message; }
        await new Promise(s => setTimeout(s, 700 * (attempt + 1)));
      }
      if (!j) throw new Error('elevation fetch failed: ' + last);
      j.elevation.forEach((e, k) => { out[i + k] = e; });
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  return out;
}
export default async function handler(req, res) {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  const agl = Math.max(0, parseFloat(req.query.agl) || 12);
  let from = parseFloat(req.query.from), to = parseFloat(req.query.to);
  if (![lat, lon, from, to].every(isFinite)) return res.status(400).json({ error: 'lat, lon, from, to required' });
  if (to < from) to += 360;
  if (to - from > 200) to = from + 200;
  const step = 1;
  const dists = [];
  for (let d = 250; d <= 45000; d *= 1.13) dists.push(Math.round(d));
  const bearings = [];
  for (let b = from; b <= to + 1e-9; b += step) bearings.push(((b % 360) + 360) % 360);
  const pts = [[lat, lon]];
  for (const b of bearings) for (const d of dists) pts.push(dest(lat, lon, b, d));
  try {
    const el = await elevations(pts);
    const ground = el[0], eye = ground + agl;
    const bands = [3000, 12000]; // near < 3 km, mid 3-12 km, far > 12 km
    let k = 1;
    const profile = bearings.map(b => {
      const m = { b: +b.toFixed(1), near: -90, mid: -90, far: -90 };
      for (const d of dists) {
        const h = Math.max(0, el[k++]); // sea level floor
        const drop = d * d * (1 - K) / (2 * R);
        const a = deg(Math.atan2(h - eye - drop, d));
        const band = d < bands[0] ? 'near' : d < bands[1] ? 'mid' : 'far';
        if (a > m[band]) m[band] = +a.toFixed(3);
      }
      return m;
    });
    res.setHeader('Cache-Control', 's-maxage=31536000, stale-while-revalidate=31536000');
    res.status(200).json({ ground, eye, agl, profile });
  } catch (e) { res.status(502).json({ error: e.message }); }
}
