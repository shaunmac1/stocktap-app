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
  count_locations: [{ id: 'loc-cellar', venue_id: V, name: 'Cellar', sort: 0, created_at: now, updated_at: now }, { id: 'loc-bar', venue_id: V, name: 'Bar', sort: 1, created_at: now, updated_at: now }],
  products: [
    { id: 'bbbbbbbb-0000-4000-8000-000000000001', venue_id: V, name: 'Soft J2O Apple & Mango 275ml', type: 'packaged', unit: 'count', category: 'minerals', counting_method: 'each', size_ml: 275, pack_size: 24, cost_price: 0.62, pour_price: 3.2, created_at: now, updated_at: now },
    { id: 'bbbbbbbb-0000-4000-8000-000000000002', venue_id: V, name: 'PPL Peroni Nastro Azzurro 330ml', type: 'packaged', unit: 'count', category: 'packaged', counting_method: 'each', size_ml: 330, pack_size: 24, cost_price: 1.15, pour_price: 4.6, created_at: now, updated_at: now },
    { id: 'bbbbbbbb-0000-4000-8000-000000000003', venue_id: V, name: 'Crisps McCoys Salted 45g', type: 'packaged', unit: 'count', category: 'packaged', counting_method: 'each', size_ml: null, pack_size: null, cost_price: 0.48, pour_price: 1.5, created_at: now, updated_at: now },
    { id: 'bbbbbbbb-0000-4000-8000-000000000004', venue_id: V, name: 'PPS Hooch Lemon 440ml Can', type: 'packaged', unit: 'count', category: 'packaged', counting_method: 'each', size_ml: 440, pack_size: 24, cost_price: 1.3, pour_price: 4.5, created_at: now, updated_at: now },
    { id: 'bbbbbbbb-0000-4000-8000-000000000005', venue_id: V, name: 'PPC Old Mout Berries 500ml', type: 'packaged', unit: 'count', category: 'packaged', counting_method: 'each', size_ml: 500, pack_size: 12, cost_price: 1.6, pour_price: 5.2, created_at: now, updated_at: now },
  ],
};

// A spirit with one open bottle weighed from the Library and a delivery logged as a reading
// since its count: neither is a count of the whole line.
db.products.push({ id: 'bbbbbbbb-0000-4000-8000-000000000006', venue_id: V, name: 'Gin Gordons 70cl', type: 'spirit', unit: 'weigh', category: 'spirits', counting_method: 'tenths', size_ml: 700, pack_size: null, cost_price: 14, pour_price: 3.6, created_at: now, updated_at: now });
// ── forecast data: counts, a delivery and a Venners-style audit ──
const DAYMS = 864e5, ago = d => new Date(Date.now() - d * DAYMS).toISOString();
const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const rd = (n, units, size, d) => ({ id: require('crypto').randomUUID(), venue_id: V, product_id: B(n), ml_remaining: units * size, reading_at: ago(d), method: 'each', created_at: now });
db.readings = [rd(1, 100, 275, 14), rd(1, 60, 275, 0.1), rd(2, 29, 330, 2), rd(3, 31, 1, 1), rd(5, 100, 500, 3)];
db.readings.push(
  { id: require('crypto').randomUUID(), venue_id: V, product_id: B(6), ml_remaining: 3 * 700, reading_at: ago(5), method: 'tenths', stocktake_id: 'st-old', created_at: now },
  { id: require('crypto').randomUUID(), venue_id: V, product_id: B(6), ml_remaining: 280, reading_at: ago(1), method: 'weigh', weight_g: 700, stocktake_id: null, full_containers: null, part_value: null, created_at: now },
  { id: require('crypto').randomUUID(), venue_id: V, product_id: B(6), ml_remaining: 0, reading_at: ago(0.5), method: 'weigh', is_delivery: true, full_containers: 6, stocktake_id: null, created_at: now },
);
db.deliveries = [{ id: require('crypto').randomUUID(), venue_id: V, product_id: B(1), delivered_at: ago(7), quantity: 48, quantity_ml: 48 * 275, created_at: now }];
const aline = (name, category, sold, counted) => ({ name, category, unit: 'Each', base: 'units', open: 0, del: 0, ret: 0, tin: 0, tout: 0, adj: 0, waste: 0, sold, expected: 0, counted, variance: 0, retail: 0, delist: false });
db.stock_audits = [{ id: 'aud1', venue_id: V, source: 'venners', file_name: null, created_at: now, period_start: '2026-08-25', period_end: '2026-09-25', days: 31, summary: { days: 31 },
  lines: [aline('PPL Peroni Nastro Azzurro 330ml', 'Packaged', 186, 40), aline('PPS Hooch Lemon 440ml Can', 'Packaged', 62, 30), aline('PPC Old Mout Berries 500ml', 'Packaged', 31, 50), aline('Soft J2O Apple & Mango 275ml', 'Minerals', 620, 200), aline('Crisps McCoys Salted 45g', 'Packaged', 0, 31), { ...aline('Gin Gordons 70cl', 'Spirits', 3.1, 3), unit: 'Bottle', base: 'bottles' }] }];
// Orders checks (HIDDEN=1): a line the pub has hidden that sold well on the audit, and a bottle
// line the audit calls "Dozen" with no case size set in StockTap.
if (process.env.HIDDEN) {
  db.products.push({ id: 'bbbbbbbb-0000-4000-8000-000000000007', venue_id: V, name: 'Cider Strongbow Dark Fruit 50L Keg', type: 'draught', unit: 'weigh', category: 'draught_cider', counting_method: 'keg_weight', size_ml: 50000, pack_size: null, cost_price: 120, pour_price: 4.8, hidden_at: now, created_at: now, updated_at: now });
  db.products.push({ id: 'bbbbbbbb-0000-4000-8000-000000000008', venue_id: V, name: 'PPS WKD Blue 275ml', type: 'packaged', unit: 'count', category: 'packaged', counting_method: 'each', size_ml: 275, pack_size: null, cost_price: 1.1, pour_price: 4, created_at: now, updated_at: now });
  db.stock_audits[0].lines.push({ ...aline('Cider Strongbow Dark Fruit 50L Keg', 'Draught Cider', 900, 0), unit: 'Keg', base: 'pints' }, { ...aline('PPS WKD Blue 275ml', 'Packaged', 124, 10), unit: 'Dozen' });
}
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
    if (require('./scan-handlers.cjs')(req, u, body, send, db, log)) return;
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
      // Like the real integrity trigger: no counts into a closed (or unknown) spot check.
      if (table === 'stocktake_line_entries') {
        for (const i of items) if (i.spot_check_id) {
          const sc = (db.spot_check_sessions || []).find(x => x.id === i.spot_check_id);
          if (!sc || sc.status === 'closed') return send(409, { code: 'P0001', message: 'Spot check does not belong to this venue or is already closed' });
        }
      }
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
