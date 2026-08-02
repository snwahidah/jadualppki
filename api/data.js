// API Jadual PPKI — baca/tulis keadaan penuh dari pangkalan data (Upstash Redis di Vercel)
// GET  /api/data          -> JSON keadaan terkini (404 jika belum ada)
// POST /api/data {pin, state} -> simpan keadaan baharu (PIN admin diperlukan)

const KEY = 'jadualppki:state';

async function redis(cmd) {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !tok) return { notConfigured: true };
  const r = await fetch(base, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const j = await redis(['GET', KEY]);
      if (j.notConfigured) return res.status(503).json({ error: 'storan_belum_dikonfigurasi' });
      if (!j.result) return res.status(404).json({ error: 'kosong' });
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(j.result);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const expected = String(process.env.ADMIN_PIN || '191989');
      if (String(body.pin || '') !== expected) return res.status(401).json({ error: 'pin_salah' });
      const s = body.state;
      if (!s || !s.config || !s.grid || !s.config.teachers || !s.config.classes)
        return res.status(400).json({ error: 'format_tidak_sah' });
      const value = JSON.stringify({ published: new Date().toISOString(), config: s.config, grid: s.grid });
      if (value.length > 900000) return res.status(413).json({ error: 'terlalu_besar' });
      const j = await redis(['SET', KEY, value]);
      if (j.notConfigured) return res.status(503).json({ error: 'storan_belum_dikonfigurasi' });
      if (j.result === 'OK') return res.status(200).json({ ok: true });
      return res.status(500).json({ error: 'redis', detail: j.error || j });
    }

    return res.status(405).json({ error: 'kaedah_tidak_dibenarkan' });
  } catch (e) {
    return res.status(500).json({ error: 'ralat_pelayan', detail: String(e).slice(0, 200) });
  }
};
