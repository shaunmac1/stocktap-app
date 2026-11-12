// Delivery-note scan + till-photo stand-ins for the local mock. Returns true when it handled the request.
const P = 568.261;
const rid = () => require('crypto').randomUUID();
const NOTE = [ // what the "scanner" reads off the test delivery note
  { description: 'CARLSBERG PILSNER 3.4% 50L KEG', quantity: 3, strong: true },
  { description: 'HOBGOBLIN GOLD 9G CASK', quantity: 2, strong: true },
  { description: 'MYSTERY LAGER 30L KEG', quantity: 1, strong: false },
];
const TILL = [
  { name: 'CARLSBERG PT', qty: 150, value: 630 }, { name: 'CARLSBERG HALF', qty: 20, value: 44 },
  { name: 'HOBGOBLIN GOLD PINT', qty: 39, value: 171.6 }, { name: 'MADRI PINT', qty: 12, value: 60 },
  { name: 'GORDONS DBL', qty: 9, value: 63 }, { name: 'FISH & CHIPS', qty: 11, value: 150 },
];
module.exports = function (req, u, body, send, db, log) {
  const now = new Date().toISOString();
  if (u.pathname.startsWith('/storage/v1/object/')) { log.push({ storage: req.method, path: u.pathname, bytes: body.length }); send(200, { Key: u.pathname }); return true; }
  if (u.pathname === '/functions/v1/read-till-photo') {
    const b = JSON.parse(body || '{}'); log.push({ fn: 'read-till-photo', bytes: (b.image_base64 || '').length, media: b.media_type });
    if (db.__tillFail) { send(422, { error: 'No product sales were found in that photo.' }); return true; }
    send(200, { rows: TILL, report_date: null }); return true;
  }
  if (u.pathname === '/functions/v1/send-push') { const b = JSON.parse(body || '{}'); log.push({ fn: 'send-push', notify_venue: b.notify_venue, title: b.title, body: b.body, url: b.url }); send(200, { sent: 1 }); return true; }
  const ex = /^\/__extract\/([0-9a-f-]{36})$/.exec(u.pathname);
  if (ex) {
    const doc = (db.delivery_documents || []).find(d => d.id === ex[1]); if (!doc) { send(404, { error: 'Document not found' }); return true; }
    db.delivery_document_lines = (db.delivery_document_lines || []).filter(l => l.document_id !== doc.id);
    const rows = NOTE.map((l, i) => {
      const prod = db.products.find(p => l.description.toLowerCase().startsWith(p.name.toLowerCase().split(' ')[0]));
      return { id: rid(), document_id: doc.id, line_number: i + 1, raw_description: l.description, purchase_quantity: l.quantity, unit_label: null,
        unit_cost_pence: prod && l.strong ? Math.round(prod.cost_price * 100) : null, line_total_pence: null, notes: prod ? 'No price on the note' : null,
        matched_product_id: prod && l.strong ? prod.id : null, match_confidence: prod && l.strong ? 0.9 : null, review_status: prod && l.strong ? 'accepted' : 'unmatched', created_at: now, updated_at: now };
    });
    db.delivery_document_lines.push(...rows);
    Object.assign(doc, { status: 'review', supplier: 'Carlsberg Britvic', invoice_ref: '0481288781', invoice_date: now.slice(0, 10) });
    log.push({ extract: doc.id });
    send(200, { document_id: doc.id, status: 'review', line_count: rows.length, matched_count: 2, accepted_count: db.__allStrong ? rows.length : 2 }); return true;
  }
  const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname);
  if (rpc && rpc[1] === 'create_delivery_document') {
    const a = JSON.parse(body || '{}'); db.delivery_documents = db.delivery_documents || [];
    const dup = db.delivery_documents.find(d => d.file_hash === a.p_file_hash);
    log.push({ rpc: rpc[1], mime: a.p_mime_type, dup: !!dup });
    if (dup) { send(200, [{ document_id: dup.id, duplicate: true, status: dup.status }]); return true; }
    const d = { id: rid(), venue_id: a.p_venue_id, file_path: a.p_file_path, file_hash: a.p_file_hash, original_filename: a.p_original_filename, mime_type: a.p_mime_type, status: 'uploaded', supplier: null, invoice_ref: null, invoice_date: null, currency: 'GBP', subtotal_pence: null, vat_pence: null, total_pence: null, created_at: now, updated_at: now };
    db.delivery_documents.push(d); send(200, [{ document_id: d.id, duplicate: false, status: 'uploaded' }]); return true;
  }
  if (rpc && rpc[1] === 'commit_delivery_document') {
    const a = JSON.parse(body || '{}'); const doc = (db.delivery_documents || []).find(d => d.id === a.p_document_id);
    const acc = (db.delivery_document_lines || []).filter(l => l.document_id === doc.id && l.review_status === 'accepted');
    if (acc.some(l => !l.matched_product_id || l.unit_cost_pence == null)) { send(400, { message: 'Every accepted line needs a product match and unit cost' }); return true; }
    db.deliveries = db.deliveries || []; let total = 0;
    for (const l of acc) {
      const p = db.products.find(x => x.id === l.matched_product_id);
      db.deliveries.push({ id: rid(), venue_id: doc.venue_id, product_id: p.id, entry_method: 'invoice', quantity: l.purchase_quantity, unit_cost: l.unit_cost_pence / 100, quantity_ml: l.purchase_quantity * p.container_l * 1000, delivered_at: now, created_at: now, updated_at: now, supplier: doc.supplier, invoice_ref: 'document:' + doc.id });
      if (l.unit_cost_pence > 0) p.cost_price = l.unit_cost_pence / 100;
      total += Math.round(l.purchase_quantity * l.unit_cost_pence);
    }
    doc.status = 'committed'; doc.committed_at = now; log.push({ rpc: rpc[1], lines: acc.length });
    send(200, [{ delivery_count: acc.length, movement_count: acc.length, total_pence: total }]); return true;
  }
  if (u.pathname === '/__set') { Object.assign(db, JSON.parse(body || '{}')); send(200, {}); return true; }
  return false;
};
