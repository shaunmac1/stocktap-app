// Minimal Supabase stand-in for driving the real UI locally (no real accounts, no real data).
const http = require('http');
const shapes = require('./shapes_fx.json');
const U = '11111111-1111-4111-8111-111111111111', V = '22222222-2222-4222-8222-222222222222';
const now = new Date().toISOString();
const db = {
  profiles: [{ id: U, user_id: U, full_name: process.env.ROLE === 'staff' ? 'Alex' : 'Test Owner', email: 'owner@example.test', created_at: now, onboarding_completed: true }],
  venue_members: [{ id: 'm1', venue_id: V, user_id: U, role: process.env.ROLE || 'owner' }],
  venues: [{ id: V, owner_id: U, name: 'Demo Bar', tier: 'premium', trial_ends_at: new Date(Date.now() + 10 * 864e5).toISOString(), default_measure_ml: 25, created_at: now, onboarding_completed: true }],
  delivery_documents: [{ id: 'dd1', venue_id: V, uploaded_by: U, file_path: 'x', file_hash: 'h', original_filename: 'delivery-note.jpg', mime_type: 'image/jpeg', status: 'review', supplier: 'Demo Wholesale', invoice_ref: 'DW-10482', invoice_date: new Date().toISOString().slice(0, 10), currency: 'GBP', subtotal_pence: 10560, vat_pence: 2112, total_pence: 12672, extraction_model: null, extraction_error: null, committed_at: null, created_at: now, updated_at: now }],
  delivery_document_lines: [
    { id: 'dl1', document_id: 'dd1', line_number: 1, raw_description: 'GORDONS LDN DRY GIN 37.5% 70CL', purchase_quantity: 2, unit_label: 'bottle', unit_cost_pence: 1420, line_total_pence: 2840, matched_product_id: 'aaaaaaaa-0000-4000-8000-000000000001', match_confidence: 0.94, review_status: 'unmatched', notes: null, created_at: now, updated_at: now },
    { id: 'dl2', document_id: 'dd1', line_number: 2, raw_description: 'BOMBAY SAPPHIRE 40% 70CL', purchase_quantity: 2, unit_label: 'bottle', unit_cost_pence: 1780, line_total_pence: 3560, matched_product_id: 'aaaaaaaa-0000-4000-8000-000000000004', match_confidence: 0.91, review_status: 'unmatched', notes: null, created_at: now, updated_at: now },
    { id: 'dl3', document_id: 'dd1', line_number: 3, raw_description: 'TANGO APPLE S/FREE 24X330ML', purchase_quantity: 1, unit_label: 'case', unit_cost_pence: 1440, line_total_pence: 1440, matched_product_id: 'aaaaaaaa-0000-4000-8000-000000000007', match_confidence: 0.86, review_status: 'unmatched', notes: null, created_at: now, updated_at: now },
    { id: 'dl4', document_id: 'dd1', line_number: 4, raw_description: 'DELIVERY CHARGE', purchase_quantity: 1, unit_label: null, unit_cost_pence: 2720, line_total_pence: 2720, matched_product_id: null, match_confidence: null, review_status: 'unmatched', notes: null, created_at: now, updated_at: now },
  ],
  locations: [{ id: 'l1', venue_id: V, name: 'Main Bar' }, { id: 'l2', venue_id: V, name: 'Back Bar' }],
  products: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', venue_id: V, name: "Gordon's Gin 70cl", type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'weigh', size_ml: 700, abv: 37.5, density: 0.9517, full_weight_g: null, empty_weight_g: null, cost_price: 14, pour_price: 3.5, external_id: null, shape_path: shapes.gordon.path, fill_curve: shapes.gordon.curve, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', venue_id: V, name: 'Tanqueray London Dry Gin 70cl', type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'tenths', size_ml: 700, abv: 41.3, density: 0.946, full_weight_g: null, empty_weight_g: null, cost_price: 17, pour_price: 4, external_id: null, shape_path: shapes.tanq.path, fill_curve: shapes.tanq.curve, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', venue_id: V, name: 'House Vodka 70cl', type: 'vodka', unit: 'weigh', category: 'spirits', counting_method: 'tenths', size_ml: 700, abv: 37.5, density: 0.9517, full_weight_g: null, empty_weight_g: null, cost_price: 10, pour_price: 3, external_id: null, shape_path: null, fill_curve: null, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', venue_id: V, name: 'Bombay Sapphire 70cl', type: 'gin', unit: 'weigh', category: 'spirits', counting_method: 'weigh', size_ml: 700, abv: 40, density: 0.948, full_weight_g: null, empty_weight_g: null, cost_price: 16, pour_price: 3.8, external_id: null, shape_path: null, fill_curve: null, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000005', venue_id: V, name: 'Lager Carlsberg', type: 'packaged', unit: 'count', category: 'draught_lager', counting_method: 'keg_weight', container_type: 'keg', container_l: 50, size_ml: null, cost_price: 150, pour_price: 4, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000006', venue_id: V, name: 'Postmix Pepsi', type: 'packaged', unit: 'count', category: 'postmix', counting_method: 'litre', container_type: 'bag_in_box', container_l: 12, size_ml: null, cost_price: 60, pour_price: 2.4, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000007', venue_id: V, name: 'Soft Tango Apple SF Can 330ml', type: 'packaged', unit: 'count', category: 'minerals', counting_method: 'each', size_ml: 330, cost_price: 0.6, pour_price: 2, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000008', venue_id: V, name: 'Cordial Britvic Lime 12x1L', type: 'packaged', unit: 'count', category: 'minerals', counting_method: 'dozen', size_ml: 1000, pack_size: 12, cost_price: 36, pour_price: null, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-000000000009', venue_id: V, name: 'Juice Sunpride Apple', type: 'packaged', unit: 'count', category: 'minerals', counting_method: 'litre', size_ml: null, cost_price: 3.6, pour_price: null, created_at: now, updated_at: now },
    { id: 'aaaaaaaa-0000-4000-8000-00000000000a', venue_id: V, name: 'Water Aq/Li Rasp Black Spark 330ml', type: 'packaged', unit: 'count', category: 'minerals', counting_method: 'each', size_ml: 700, cost_price: 0.7, pour_price: 2, created_at: now, updated_at: now },
    ...[
      ['b1','Stout Guinness','draught_stout','keg_weight',{container_l:50,container_type:'keg',cost_price:190}],
      ['b2','Lager Estrella Damm','draught_lager','keg_weight',{container_l:50,container_type:'keg',cost_price:165}],
      ['b3','Cider Old Mout FlavourWave 30L Keg','draught_cider','keg_weight',{container_l:30,container_type:'keg'}],
      ['b4','PPA Guinness 0% 538ml Can','packaged','each',{size_ml:538,cost_price:1.65}],
      ['b5','Soft FruitShoot LS App/Blk 275ml','minerals','each',{size_ml:275,cost_price:0.8}],
      ['b6','Wine Chard Hardy\'s 202','wines','tenths',{size_ml:750,cost_price:6.5}],
      ['b7','Rum Captain Morgan Spiced','spirits','tenths',{size_ml:700,cost_price:14.5}],
      ['b8','Postmix Lemonade','postmix','litre',{container_l:12,container_type:'bag_in_box',cost_price:52,pack_size:84}],
      ['b9','Postmix Pepsi Max','postmix','litre',{container_l:12,container_type:'bag_in_box',cost_price:52,pack_size:84}],
      ['ba','Crisps McCoys Cheese & Onion 45g','packaged','each',{}],
      ['bb','Nuts KP Original Salted','packaged','each',{}],
      ['bc','Lovelli Prosecco (single serve)','wines','weigh',{size_ml:200,cost_price:2.4}],
    ].map(([k,name,category,counting_method,o]) => ({ id: 'bbbbbbbb-0000-4000-8000-0000000000'+k.replace('b','').padStart(2,'0'), venue_id: V, name, type:'packaged', unit: counting_method==='tenths'||counting_method==='weigh'?'weigh':'count', category, counting_method, size_ml:null, pack_size:null, sku:null, cost_price:null, created_at: now, updated_at: now, ...o })),
  ],
};
db.deliveries = [
  { id: 'd1', venue_id: V, product_id: 'bbbbbbbb-0000-4000-8000-000000000009', entry_method: 'ledger', quantity: 2, quantity_ml: 24000, delivered_at: '2026-09-28T06:00:00Z', created_at: now, updated_at: now },
  { id: 'd2', venue_id: V, product_id: 'bbbbbbbb-0000-4000-8000-000000000008', entry_method: 'ledger', quantity: 2, quantity_ml: 24000, delivered_at: '2026-09-28T06:00:00Z', created_at: now, updated_at: now },
  { id: 'd3', venue_id: V, product_id: 'bbbbbbbb-0000-4000-8000-000000000002', entry_method: 'ledger', quantity: 4, quantity_ml: 200000, delivered_at: '2026-09-28T06:00:00Z', created_at: now, updated_at: now },
];
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
      const num = v => (v !== '' && !isNaN(+v) ? +v : v); const a = num(String(x ?? '')), b = num(decodeURIComponent(val));
      if (op === 'gte') return a >= b; if (op === 'lte') return a <= b; if (op === 'gt') return a > b; if (op === 'lt') return a < b;
      return true;
    });
  }
  return out;
}

// ── Three closed stocktakes a week apart, no Venners audits: the order list builds from counts ──
{
  const DAY = 864e5, t = n => new Date(Date.now() - n * DAY).toISOString();
  const A = 'st-a', B = 'st-b', C = 'st-c';
  db.stocktakes = [
    { id: A, venue_id: V, status: 'closed', opened_at: t(21), closed_at: t(20.9), created_at: t(21) },
    { id: B, venue_id: V, status: 'closed', opened_at: t(14), closed_at: t(13.9), created_at: t(14) },
    { id: C, venue_id: V, status: 'closed', opened_at: t(7), closed_at: t(6.9), created_at: t(7) },
  ];
  const PINT = 568.26125;
  const G = 'aaaaaaaa-0000-4000-8000-000000000001', CARL = 'aaaaaaaa-0000-4000-8000-000000000005', GUIN = 'bbbbbbbb-0000-4000-8000-000000000001',
        RUM = 'bbbbbbbb-0000-4000-8000-000000000007', MAX = 'bbbbbbbb-0000-4000-8000-000000000009', CRISP = 'bbbbbbbb-0000-4000-8000-00000000000a',
        WINE = 'bbbbbbbb-0000-4000-8000-000000000006';
  // [product, [A, B, C] as ml or count]
  const rows = [
    [G, [2800, 1600, 350], 'ml'],             // 4 → 2.3 → 0.5 bottles
    [CARL, [150 * PINT, 70 * PINT, 30 * PINT], 'ml'],
    [GUIN, [120 * PINT, 60 * PINT, 25 * PINT], 'ml'],
    [RUM, [2100, 1400, 900], 'ml'],
    [MAX, [150000, 90000, 20000], 'ml'],      // litres of drink
    [CRISP, [40, 22, 6], 'count'],
    [WINE, [9000, 7500, 6000], 'ml'],
  ];
  let k = 0;
  db.readings = [];
  for (const [pid, vals, kind] of rows) [A, B, C].forEach((st, j) => db.readings.push({
    id: 'r' + (k++), venue_id: V, product_id: pid, stocktake_id: st, location_id: null, method: 'weigh',
    ml_remaining: kind === 'ml' ? vals[j] : 0, count: kind === 'count' ? vals[j] : 0, reading_at: db.stocktakes[j].closed_at,
  }));
  db.stock_audits = [];
  db.deliveries = [
    { id: 'cd1', venue_id: V, product_id: CARL, entry_method: 'ledger', quantity: 1, quantity_ml: 50000, delivered_at: t(17) },
    { id: 'cd2', venue_id: V, product_id: GUIN, entry_method: 'ledger', quantity: 1, quantity_ml: 50000, delivered_at: t(10) },
    { id: 'cd3', venue_id: V, product_id: G, entry_method: 'ledger', quantity: 2, quantity_ml: 1400, delivered_at: t(10) },
    { id: 'cd4', venue_id: V, product_id: CARL, entry_method: 'ledger', quantity: 1, quantity_ml: 50000, delivered_at: t(3) },
  ];
}

// Demo team (invented names) for the team, clock and rota films
db.staff = [
  { id: 's1', venue_id: V, name: 'Alex', hourly_rate: 12.21, active: true, link_code: 'K7Q2MX', user_id: null, created_at: now },
  { id: 's2', venue_id: V, name: 'Jordan', hourly_rate: 12.21, active: true, link_code: 'P4WN8R', user_id: null, created_at: now },
  { id: 's3', venue_id: V, name: 'Sam', hourly_rate: 13.5, active: true, link_code: 'T9HB3C', user_id: 'u3', created_at: now },
];
db.shifts = [];
// Demo takings: three years of invented nightly figures (not any real pub's), so the
// Daily Board's day, week and month views have history. Deterministic so films repeat.
{
  const base = [2200, 900, 1500, 1300, 1700, 3600, 4000]; // Sun..Sat
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  db.cash_ups = []; db.finance_entries = db.finance_entries || [];
  for (let i = 1100; i >= 1; i--) {
    const d = new Date(today.getTime() - i * 864e5); const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay(); const m = d.getUTCMonth();
    const season = [0.85, 0.85, 0.95, 1, 1.05, 1.1, 1.15, 1.1, 1, 0.95, 1, 1.25][m];
    const growth = 1 + (1100 - i) / 1100 * 0.08;
    const t = Math.round(base[dow] * season * growth * (0.8 + rnd() * 0.4) * 100) / 100;
    db.cash_ups.push({ id: 'c' + i, venue_id: V, business_date: iso, total_taken: t, wet_sales: null, dry_sales: null, what_was_on: null, act_or_match: null, fee: null, created_at: now, updated_at: now });
    if (dow === 0) db.finance_entries.push({ id: 'w' + i, venue_id: V, direction: 'out', entry_date: iso, category: 'wages', description: 'Staffing for the week', amount: Math.round(15500 * season * growth * (0.9 + rnd() * 0.2) * 0.15 * 100) / 100, status: 'paid', source: 'import', supplier: null, reference: null, due_date: null, vat_rate: null, vat_amount: null, net_amount: null, created_at: now, updated_at: now });
  }
}
// CHECKS=1: temperature points and checklists set up, with five weeks of invented history
if (process.env.CHECKS) {
  const A = [["Cellar fridge", "fridge", 0, 5], ["Kitchen fridge", "fridge", 0, 5], ["Bottle fridge", "fridge", 0, 5], ["Freezer", "freezer", -30, -18], ["Cellar", "cellar", 11, 13]];
  db.check_appliances = A.map(([name, kind, min_c, max_c], i) => ({ id: 'ap' + i, venue_id: V, name, kind, min_c, max_c, sort: i, active: true, created_at: now }));
  const I = [["opening", "Fridges and freezers running and cold"], ["opening", "No signs of pests"], ["opening", "Hand-wash sink stocked (soap and towels)"], ["closing", "All food covered, labelled and in date"], ["closing", "Waste and recycling out"], ["cleaning", "Toilets checked and clean"]];
  db.check_items = I.map(([section, label], i) => ({ id: 'ci' + i, venue_id: V, section, label, cadence: 'daily', sort: i, active: true, created_at: now }));
  db.check_items.push({ id: 'ciw', venue_id: V, section: 'cleaning', label: 'Beer lines cleaned', cadence: 'weekly', sort: 9, active: true, created_at: now });
  db.temp_readings = []; db.check_completions = []; db.refusals = [];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const who = ['u3', 'u3', 'u3', 'u3', null];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = 35; i >= 1; i--) {
    const d = new Date(today.getTime() - i * 864e5).toISOString().slice(0, 10);
    const skip = i === 9; // one day nobody did the temps
    for (const a of db.check_appliances) {
      if (skip) continue;
      let v = a.kind === 'freezer' ? -20 + rnd() * 2 : a.kind === 'cellar' ? 11.5 + rnd() * 1.2 : 2 + rnd() * 2.5;
      if (i === 17 && a.name === 'Kitchen fridge') v = 7.4; // an out-of-range night
      db.temp_readings.push({ id: `tr${i}${a.id}`, venue_id: V, appliance_id: a.id, business_date: d, reading_c: Math.round(v * 10) / 10, recorded_by: who[i % 5], note: null, created_at: d + 'T10:' + String(10 + a.sort).padStart(2, '0') + ':00Z' });
    }
    for (const it of db.check_items) {
      if (it.cadence === 'weekly' ? i % 7 !== 3 : (i === 12 && it.section === 'closing')) continue;
      db.check_completions.push({ id: `cc${i}${it.id}`, venue_id: V, item_id: it.id, business_date: d, done: true, note: null, recorded_by: who[(i + 1) % 5], created_at: d + (it.section === 'closing' ? 'T23:05:00Z' : 'T10:30:00Z') });
    }
    if (i % 11 === 4) db.refusals.push({ id: 'rf' + i, venue_id: V, business_date: d, occurred_at: d + 'T21:40:00Z', reason: 'No ID shown', description: 'Asked for ID, none shown', note: null, recorded_by: 'u3', created_at: d + 'T21:40:00Z' });
  }
}
// REAL=/path/products.json swaps in a real product list (local testing only, never committed).
if (process.env.REAL) { db.products = require(process.env.REAL).map(p => ({ ...p, venue_id: V })); for (const k of Object.keys(db)) if (/readings|stocktake|line_entries/.test(k)) db[k] = []; }
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
      if (rpc[1] === 'record_manual_delivery') {
        db.deliveries = db.deliveries || []; db.stock_movements = db.stock_movements || [];
        const ex = db.deliveries.find(d => d.client_reference === args.p_client_reference);
        if (ex) return send(200, [{ delivery_id: ex.id, movement_id: ex.stock_movement_id, created: false }]);
        const mv = { id: rid(), venue_id: args.p_venue_id, product_id: args.p_product_id, movement_type: 'delivery', quantity_ml: args.p_quantity_ml, unit_cost_pence: args.p_unit_cost_pence, reason: args.p_invoice_ref || 'Manual delivery', notes: args.p_notes, moved_at: args.p_delivered_at, created_at: now, updated_at: now };
        const d = { id: rid(), venue_id: args.p_venue_id, product_id: args.p_product_id, entry_method: 'ledger', quantity: args.p_purchase_quantity, unit_cost: args.p_unit_cost_pence / 100, invoice_ref: args.p_invoice_ref, delivered_at: args.p_delivered_at, quantity_ml: args.p_quantity_ml, supplier: args.p_supplier, notes: args.p_notes, client_reference: args.p_client_reference, stock_movement_id: mv.id, created_at: now, updated_at: now };
        db.stock_movements.push(mv); db.deliveries.push(d);
        return send(200, [{ delivery_id: d.id, movement_id: mv.id, created: true }]);
      }
      if (rpc[1] === 'commit_delivery_document') { const d = db.delivery_documents.find(x => x.id === args.p_document_id); if (d) { d.status = 'committed'; d.committed_at = new Date().toISOString(); } return send(200, { committed: true, lines: 3 }); }
      // staff phone
      if (rpc[1] === 'my_shift_status') return send(200, { linked: true, on_shift: !!db.__onShift, since: db.__onShift || null, name: 'Alex', venue: 'Demo Bar' });
      if (rpc[1] === 'clock_in') { db.__onShift = db.__onShift || new Date().toISOString(); return send(200, { on_shift: true, since: db.__onShift }); }
      if (rpc[1] === 'clock_out') { db.__onShift = null; return send(200, { on_shift: false }); }
      if (rpc[1] === 'my_rota') { const d = new Date().toISOString().slice(0, 10); return send(200, [{ id: 'r1', area: 'bar', shift_date: d, start_time: '17:00', end_time: null, until_close: true, note: null }]); }
      if (rpc[1] === 'redeem_staff_code') return send(200, { venue_id: V });
      if (rpc[1] === 'contribute_catalogue_calibration') return send(200, [{ contributed: false, sample_count: null, reason: 'submitted_for_review' }]);
      const CAT = (() => {
        return [
          ["k1", "Hendrick's Gin 70cl", 'gin', 'spirits', 700, 41.4], ["k2", 'Bombay Sapphire Gin 1L', 'gin', 'spirits', 1000, 40], ["k3", 'Whitley Neill Rhubarb & Ginger Gin 70cl', 'gin', 'spirits', 700, 43],
          ["k4", 'Smirnoff Red Vodka 70cl', 'vodka', 'spirits', 700, 37.5], ["k5", "Jack Daniel's Old No.7 70cl", 'whisky', 'spirits', 700, 40], ["k6", 'Baileys Original Irish Cream 70cl', 'liqueur', 'spirits', 700, 17],
          ["k7", 'Jägermeister 70cl', 'liqueur', 'spirits', 700, 35], ["k8", 'Aperol 70cl', 'liqueur', 'spirits', 700, 11], ["k9", 'Pinot Grigio 75cl', 'wine', 'wines', 750, 12],
        ].map(([id, n, type, category, size, abv]) => ({ id, canonical_name: n, type, category, unit: 'weigh', counting_method: 'weigh', size_ml: size, container_type: null, container_l: null, pack_size: null, abv, calibration_sample_count: 14, calibration_confidence: 'verified', has_calibration: true, already_added: false, shape_path: null }));
      })();
      if (rpc[1] === 'search_catalogue_items') {
        const nq = x => String(x).toLowerCase().replace(/['’]/g, '');
        const q = nq(Object.values(args).find(v => typeof v === 'string' && v.length > 1 && !/^[0-9a-f-]{36}$/.test(v)) || '');
        return send(200, q ? CAT.filter(c => nq(c.canonical_name).includes(q)) : CAT);
      }
      if (rpc[1] === 'list_catalogue_names') {
        const extra = [['w1', 'Hardys Main Road Rose', 'wines', 750], ['w2', 'Waipara Hills Pinot Noir', 'wines', 750], ['w3', 'Victor Bernard Cotes du Rhone', 'wines', 750]];
        return send(200, [...CAT.map(c => ({ id: c.id, canonical_name: c.canonical_name, aliases: [], category: c.category, size_ml: c.size_ml, has_calibration: true })),
          ...extra.map(([id, n, category, size_ml]) => ({ id, canonical_name: n, aliases: [], category, size_ml, has_calibration: true }))]);
      }
      if (rpc[1] === 'apply_catalogue_calibration') {
        const pr = db.products.find(x => x.id === args.p_product_id); if (!pr) return send(200, false);
        pr.full_weight_g = pr.category === 'wines' ? 1290 : 1180; pr.empty_weight_g = pr.category === 'wines' ? 540 : 520;
        return send(200, true);
      }
      if (rpc[1] === 'add_catalogue_items_to_venue') {
        const out = [];
        for (const cid of args.p_catalogue_ids || []) {
          const c = CAT.find(x => x.id === cid); if (!c) continue;
          const id = rid();
          const dens = c.abv > 30 ? 0.95 : 1.0;
          db.products.push({ id, venue_id: args.p_venue_id, name: c.canonical_name, type: c.type, unit: 'weigh', category: c.category, counting_method: 'weigh', size_ml: c.size_ml, abv: c.abv, density: dens,
            full_weight_g: Math.round(c.size_ml * dens + 520), empty_weight_g: 520, cost_price: c.category === 'wines' ? 6.5 : 16, pour_price: c.category === 'wines' ? 6 : 4, location_id: args.p_location_id || null, created_at: now, updated_at: now });
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
      let rows = filt(db[table], params).map(r => table === 'products' ? { ...r, locations: null } : r);
      const pget = k => { for (const [a, b] of params) if (a === k) return b; return null; };
      const ord = pget('order');
      if (ord) { const [col, dir] = ord.split(',')[0].split('.'); rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const off = +(pget('offset') || 0), lim = pget('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + +lim : undefined);
      if (single) return rows.length ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'no rows' });
      return send(200, rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
    }
    if (req.method === 'POST') {
      let items = body ? JSON.parse(body) : []; if (!Array.isArray(items)) items = [items];
      const oc = u.searchParams.get('on_conflict');
      items = items.map(i => {
        if (oc) { const cols = oc.split(','); const ex = db[table].find(r => cols.every(c => String(r[c]) === String(i[c]))); if (ex) return { ...ex, ...i, id: ex.id }; }
        const dflt = ['check_appliances', 'check_items', 'team_members', 'staff'].includes(table) ? { active: true, is_active: true } : {};
        return { id: i.id || rid(), created_at: new Date().toISOString(), ...(table === 'refusals' ? { occurred_at: new Date().toISOString() } : {}), ...dflt, ...i };
      });
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
