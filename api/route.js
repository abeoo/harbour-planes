// Relay for callsign -> origin/destination lookups (adsbdb.com).
export default async function handler(req, res) {
  const cs = String(req.query.cs || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(cs)) return res.status(400).json({ error: 'bad callsign' });
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${cs}`, { headers: { 'User-Agent': 'harbour-planes/1.0' }, signal: AbortSignal.timeout(6000) });
    const j = await r.json().catch(() => ({}));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(j);
  } catch (e) { res.status(502).json({ error: e.message }); }
}
