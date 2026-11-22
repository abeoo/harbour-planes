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
// SRTM elevation from the public AWS Terrain Tiles bucket ("skadi" .hgt.gz, 1°x1° tiles).
import { gunzipSync } from 'node:zlib';
const tiles = new Map();
function tileName(lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon);
  const ns = la < 0 ? 'S' : 'N', ew = lo < 0 ? 'W' : 'E';
  const LA = String(Math.abs(la)).padStart(2, '0'), LO = String(Math.abs(lo)).padStart(3, '0');
  return { key: `${ns}${LA}${ew}${LO}`, dir: `${ns}${LA}`, la, lo };
}
async function loadTile(t) {
  if (tiles.has(t.key)) return tiles.get(t.key);
  const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/skadi/${t.dir}/${t.key}.hgt.gz`, { signal: AbortSignal.timeout(20000) });
  let tile = null;
  if (r.ok) {
    const buf = gunzipSync(Buffer.from(await r.arrayBuffer()));
    const n = Math.round(Math.sqrt(buf.length / 2));
    tile = { buf, n, la: t.la, lo: t.lo };
  } // a missing tile means open ocean
  tiles.set(t.key, tile);
  return tile;
}
async function elevations(points) {
  const need = new Map();
  for (const [la, lo] of points) { const t = tileName(la, lo); need.set(t.key, t); }
  await Promise.all([...need.values()].map(loadTile));
  return points.map(([la, lo]) => {
    const tile = tiles.get(tileName(la, lo).key);
    if (!tile) return 0;
    const { buf, n } = tile;
    const row = Math.round((tile.la + 1 - la) * (n - 1)), col = Math.round((lo - tile.lo) * (n - 1));
    const v = buf.readInt16BE(2 * (Math.min(n - 1, Math.max(0, row)) * n + Math.min(n - 1, Math.max(0, col))));
    return v < -1000 ? 0 : v;
  });
}
export default async function handler(req, res) {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  const agl = Math.max(0, parseFloat(req.query.agl) || 45);
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
