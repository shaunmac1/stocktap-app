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
    if (require('./scan-handlers.cjs')(req, u, body, send, db, log)) return;
    if (u.pathname.startsWith('/functions/v1/')) return send(200, {});
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname);
    if (rpc) {
      const args = body ? JSON.parse(body) : {};
      log.push({ rpc: rpc[1], args });
      if (rpc[1] === 'contribute_catalogue_calibration') return send(200, [{ contributed: false, sample_count: null, reason: 'submitted_for_review' }]);
      const CAT = [
        ['q1', 'Smirnoff Red Vodka 1L', 'vodka', 1000], ['q2', 'Smirnoff Red Vodka 70cl', 'vodka', 700], ['q3', "Gordon's Gin 70cl", 'gin', 700],
        ['q4', "Jack Daniel's Old No.7 70cl", 'whisky', 700], ['q5', 'Bacardi Carta Blanca 70cl', 'rum', 700], ['q6', 'Captain Morgan Spiced Gold 70cl', 'rum', 700],
        ['q7', "Bell's Whisky 70cl", 'whisky', 700], ['q8', 'Baileys Irish Cream 70cl', 'liqueur', 700], ['q9', 'Jägermeister 70cl', 'liqueur', 700],
        ['q10', 'Jameson Irish Whiskey 70cl', 'whisky', 700], ['q11', 'Absolut Vodka 70cl', 'vodka', 700], ['q12', 'Malibu 70cl', 'liqueur', 700],
        ['q13', 'Tanqueray London Dry Gin 70cl', 'gin', 700], ['q14', 'Pinot Grigio 75cl', 'wine', 750],
      ].map(([id, n, type, size]) => ({ id, canonical_name: n, type, category: type === 'wine' ? 'wines' : 'spirits', unit: 'weigh', counting_method: 'weigh', size_ml: size, container_type: null, container_l: null, pack_size: null, abv: 37.5, calibration_sample_count: 3, has_calibration: true, already_added: db.products.some(p => p.name === n) }));
      const nq = x => String(x).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f'’]/g, '');
      if (rpc[1] === 'search_catalogue_items') { const q = nq(args.p_query || ''); return send(200, q ? CAT.filter(c => nq(c.canonical_name).includes(q)) : CAT); }
      if (rpc[1] === 'add_catalogue_items_to_venue') {
        const out = [];
        for (const cid of args.p_catalogue_ids || []) {
          const c = CAT.find(x => x.id === cid); if (!c) continue;
          const ex = db.products.find(p => p.name === c.canonical_name);
          if (ex) { out.push({ product_id: ex.id, catalogue_id: cid, created: false }); continue; }
          const id = require('crypto').randomUUID();
          db.products.push({ id, venue_id: args.p_venue_id, name: c.canonical_name, type: c.type, unit: 'weigh', category: c.category, counting_method: 'weigh', size_ml: c.size_ml, density: 0.95,
            full_weight_g: Math.round(c.size_ml * 0.95 + 520), empty_weight_g: 520, cost_price: c.category === 'wines' ? 6 : 16, pour_price: c.category === 'wines' ? 6.2 : 4, pour_price_estimated: true, cost_price_estimated: true, created_at: now, updated_at: now });
          out.push({ product_id: id, catalogue_id: cid, created: true });
        }
        return send(200, out);
      }
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
