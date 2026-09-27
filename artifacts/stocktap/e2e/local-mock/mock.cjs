// Minimal Supabase stand-in for driving the real UI locally (no real accounts, no real data).
const http = require('http');
const shapes = require('./shapes_fx.json');
const U = '11111111-1111-4111-8111-111111111111', V = '22222222-2222-4222-8222-222222222222';
const now = new Date().toISOString();
const db = {
  profiles: [{ id: U, user_id: U, full_name: 'Test Owner', email: 'owner@example.test', created_at: now, onboarding_completed: true }],
  venue_members: [{ id: 'm1', venue_id: V, user_id: U, role: 'owner' }],
  venues: [{ id: V, owner_id: U, name: 'Demo Bar', tier: 'pro', trial_ends_at: '2099-01-01T00:00:00Z', default_measure_ml: 25, created_at: now, onboarding_completed: true }],
  locations: [],
  products: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', venue_id: V, name: "Gordon's Gin 70cl", type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'weigh', size_ml: 700, abv: 37.5, density: 0.9517, full_weight_g: null, empty_weight_g: null, cost_price: 14, pour_price: 3.5, external_id: null, shape_path: shapes.gordon.path, fill_curve: shapes.gordon.curve, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', venue_id: V, name: 'Tanqueray London Dry Gin 70cl', type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'tenths', size_ml: 700, abv: 41.3, density: 0.946, full_weight_g: null, empty_weight_g: null, cost_price: 17, pour_price: 4, external_id: null, shape_path: shapes.tanq.path, fill_curve: shapes.tanq.curve, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', venue_id: V, name: 'House Vodka 70cl', type: 'vodka', unit: 'weigh', category: 'spirits', counting_method: 'tenths', size_ml: 700, abv: 37.5, density: 0.9517, full_weight_g: null, empty_weight_g: null, cost_price: 10, pour_price: 3, external_id: null, shape_path: null, fill_curve: null, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', venue_id: V, name: 'Bombay Sapphire 70cl', type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'weigh', size_ml: 700, abv: 40, density: 0.948, full_weight_g: null, empty_weight_g: null, cost_price: 16, pour_price: 3.8, external_id: null, shape_path: null, fill_curve: null, created_at: now, updated_at: now },
  ],
};
const log = [];
const rid = () => require('crypto').randomUUID();
function filt(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|is|in|gte|lte|gt|lt|like)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, val] = m;
    out = out.filter(r => {
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'is') return val === 'null' ? x == null : String(x) === val;
      if (op === 'like') return new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$').test(String(x ?? ''));
      if (op === 'in') return val.replace(/[()]/g, '').split(',').map(s => s.replace(/"/g, '')).includes(String(x));
      return true;
    });
  }
  return out;
}
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'content-range' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const send = (code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors, ...extra }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (u.pathname.startsWith('/__log')) return send(200, { log, products: db.products });
    if (u.pathname === '/auth/v1/user') return send(200, { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now });
    if (u.pathname.startsWith('/auth/v1/')) return send(200, {});
    if (u.pathname.startsWith('/functions/v1/')) return send(200, {});
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname);
    if (rpc) {
      const args = body ? JSON.parse(body) : {};
      log.push({ rpc: rpc[1], args });
      if (rpc[1] === 'contribute_catalogue_calibration') return send(200, [{ contributed: false, sample_count: null, reason: 'submitted_for_review' }]);
      if (rpc[1] === 'search_catalogue_items') return send(200, [
        { id: 'c1', canonical_name: "Gordon's Gin 70cl", type: 'gin', category: 'spirits', unit: 'weigh', counting_method: 'tenths', size_ml: 700, container_type: null, container_l: null, pack_size: null, abv: 37.5, calibration_sample_count: 0, calibration_confidence: 'unverified', has_calibration: false, already_added: false, shape_path: shapes.gordon.path },
        { id: 'c2', canonical_name: 'Tanqueray London Dry Gin 70cl', type: 'gin', category: 'spirits', unit: 'weigh', counting_method: 'tenths', size_ml: 700, container_type: null, container_l: null, pack_size: null, abv: 41.3, calibration_sample_count: 0, calibration_confidence: 'unverified', has_calibration: false, already_added: false, shape_path: shapes.tanq.path },
        { id: 'c3', canonical_name: 'Coca-Cola 330ml can', type: 'packaged', category: 'minerals', unit: 'count', counting_method: 'each', size_ml: 330, container_type: null, container_l: null, pack_size: null, abv: 0, calibration_sample_count: 0, calibration_confidence: 'unverified', has_calibration: true, already_added: false, shape_path: null },
      ]);
      return send(200, []);
    }
    const t = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (!t) return send(404, { message: 'nf' });
    const table = t[1]; db[table] = db[table] || [];
    const single = (req.headers['accept'] || '').includes('vnd.pgrst.object');
    const params = [...u.searchParams.entries()];
    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = filt(db[table], params).map(r => table === 'products' ? { ...r, locations: null } : r);
      if (single) return rows.length ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'no rows' });
      return send(200, rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
    }
    if (req.method === 'POST') {
      let items = body ? JSON.parse(body) : []; if (!Array.isArray(items)) items = [items];
      items = items.map(i => ({ id: i.id || rid(), created_at: now, ...i }));
      for (const i of items) { const k = db[table].findIndex(r => r.id === i.id); if (k >= 0) db[table][k] = { ...db[table][k], ...i }; else db[table].push(i); }
      log.push({ insert: table, items });
      return send(201, single ? items[0] : items);
    }
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body || '{}'); const rows = filt(db[table], params);
      rows.forEach(r => Object.assign(r, patch)); log.push({ update: table, patch, n: rows.length });
      return send(200, single ? rows[0] : rows);
    }
    if (req.method === 'DELETE') { const rows = filt(db[table], params); db[table] = db[table].filter(r => !rows.includes(r)); return send(200, rows); }
    send(405, {});
  });
}).listen(8899, () => console.log('mock on 8899'));
