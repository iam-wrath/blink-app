// A tiny stand-in for Kwaku's API, so the frontend can be tested end to end
// before the real one is ready. No packages needed.
//   node mock-api.mjs        (serves http://localhost:3000/api)
// Kwaku can also use it to see exactly what the website expects.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT ?? 3000);
const status = {};

const base = {
  regionId: 'region-01',
  imageSize: { width: 1024, height: 1024 },
  images: { epochA: 'data/region-01/a.png', epochB: 'data/region-01/b_aligned.png' },
  candidates: [
    { id: 'c-001', x: 412.5, y: 630.2, ra: 150.1234, dec: 2.3456, fluxDiff: 18.7, confidence: 0.82, knownMatch: null },
    { id: 'c-002', x: 220, y: 180, ra: 150.0871, dec: 2.4012, fluxDiff: 15.1, confidence: 0.74, knownMatch: { name: 'Mock known object', separationArcsec: 4.2 } },
    { id: 'c-003', x: 760, y: 410, ra: 150.1679, dec: 2.379, fluxDiff: 9.8, confidence: 0.61, knownMatch: null },
    { id: 'c-004', x: 880, y: 850, ra: 150.1866, dec: 2.2795, fluxDiff: 7.2, confidence: 0.38, knownMatch: null },
    { id: 'c-005', x: 130, y: 720, ra: 150.0601, dec: 2.3203, fluxDiff: 6.1, confidence: 0.22, knownMatch: null },
  ],
  counts: { total: 5, matchedKnown: 1, unmatched: 4 },
};
const current = () => ({ ...base, candidates: base.candidates.map((c) => ({ ...c, status: status[c.id] ?? 'pending' })) });

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  let body = '';
  for await (const chunk of req) body += chunk;

  if (req.method === 'GET' && p === '/api/candidates') return send(res, 200, current());
  if (req.method === 'GET' && p === '/api/summary') {
    const c = current().candidates;
    return send(res, 200, {
      total: c.length,
      matchedKnown: c.filter((x) => x.knownMatch).length,
      unmatched: c.filter((x) => !x.knownMatch).length,
      confirmed: c.filter((x) => x.status === 'confirmed').length,
      rejected: c.filter((x) => x.status === 'rejected').length,
    });
  }
  const m = p.match(/^\/api\/candidates\/([^/]+)$/);
  if (req.method === 'PATCH' && m) {
    const id = decodeURIComponent(m[1]);
    const s = JSON.parse(body || '{}').status;
    if (!base.candidates.some((c) => c.id === id)) return send(res, 404, { error: 'no such candidate' });
    if (!['pending', 'confirmed', 'rejected'].includes(s)) return send(res, 400, { error: 'bad status' });
    status[id] = s;
    return send(res, 200, current().candidates.find((c) => c.id === id));
  }
  if (req.method === 'POST' && p === '/api/detect') {
    await new Promise((r) => setTimeout(r, 1500));
    return send(res, 200, current());
  }
  const img = p.match(/^\/api\/images\/(a|b)\.png$/);
  if (req.method === 'GET' && img) {
    const file = new URL(`./public/fake/${img[1]}.png`, import.meta.url);
    return send(res, 200, await readFile(file), 'image/png');
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`mock API on http://localhost:${PORT}/api`));
