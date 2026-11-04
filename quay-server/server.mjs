// Quầy server: lưu dữ liệu, đồng bộ nhiều máy, đặt lịch online, thẻ quà tặng, SMS, Stripe.
// Chạy: node server.mjs  (Node 22+, không cần cài thư viện)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));

const E = process.env;
const PORT = +(E.PORT || 8080);
const DATA_DIR = path.resolve(E.DATA_DIR || path.join(__dirname, 'data'));
const STATIC_DIR = path.resolve(E.STATIC_DIR || path.join(__dirname, '..', 'ban-hang'));
const PUBLIC_URL = (E.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const TZ = E.TZ_SHOP || 'Australia/Melbourne';
const SHOP_PASSWORD = E.SHOP_PASSWORD || '';
const STRIPE_KEY = E.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = E.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_API = E.STRIPE_API || 'https://api.stripe.com';
const SMS = E.CLICKSEND_USERNAME && E.CLICKSEND_API_KEY ? 'clicksend' : E.TWILIO_ACCOUNT_SID && E.TWILIO_AUTH_TOKEN ? 'twilio' : null;
const CLICKSEND_API = E.CLICKSEND_API || 'https://rest.clicksend.com';
const TWILIO_API = E.TWILIO_API || 'https://api.twilio.com';
const COLS = new Set(['meta', 'products', 'customers', 'orders', 'bookings', 'vouchers']);
const DAY = 864e5;

if (!SHOP_PASSWORD || SHOP_PASSWORD.length < 6) {
  console.error('Thiếu SHOP_PASSWORD (ít nhất 6 ký tự) trong file .env');
  process.exit(1);
}
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

/* ---------------- database ---------------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'quay.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS docs(col TEXT, id TEXT, data TEXT, rev INTEGER, PRIMARY KEY(col,id));
CREATE INDEX IF NOT EXISTS docs_rev ON docs(rev);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);`);
const q = {
  get: db.prepare('SELECT data FROM docs WHERE col=? AND id=?'),
  put: db.prepare('INSERT INTO docs(col,id,data,rev) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, rev=excluded.rev'),
  all: db.prepare('SELECT col,id,data FROM docs WHERE data IS NOT NULL'),
  col: db.prepare('SELECT id,data FROM docs WHERE col=? AND data IS NOT NULL'),
  since: db.prepare('SELECT col,id,data FROM docs WHERE rev>? ORDER BY rev'),
  kvGet: db.prepare('SELECT v FROM kv WHERE k=?'),
  kvSet: db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'),
};
const kv = (k, d = null) => { const r = q.kvGet.get(k); return r ? JSON.parse(r.v) : d; };
const kvSet = (k, v) => q.kvSet.run(k, JSON.stringify(v));
const getDoc = (col, id) => { const r = q.get.get(col, id); return r && r.data ? JSON.parse(r.data) : null; };
const colDocs = col => q.col.all(col).map(r => JSON.parse(r.data));
let REV = kv('rev', 0);
const SECRET = kv('secret') || (() => { const s = crypto.randomBytes(32).toString('hex'); kvSet('secret', s); return s; })();

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
// Ghi nhiều tài liệu trong một giao dịch rồi báo cho các máy đang mở.
function write(changes, origin) {
  if (!changes.length) return REV;
  const out = tx(() => {
    const docs = [];
    for (const c of changes) {
      REV++;
      q.put.run(c.col, c.id, c.data == null ? null : JSON.stringify(c.data), REV);
      docs.push({ col: c.col, id: c.id, data: c.data ?? null });
    }
    kvSet('rev', REV);
    return docs;
  });
  broadcast({ rev: REV, origin: origin || null, docs: out });
  return REV;
}

/* ---------------- auth ---------------- */
const b64 = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(device) { const p = b64(JSON.stringify({ d: device, exp: Date.now() + 180 * DAY, v: kv('tokenVersion', 1) })); return p + '.' + sign(p); }
function checkToken(t) {
  if (!t || typeof t !== 'string') return null;
  const [p, s] = t.split('.');
  if (!p || !s || s.length !== 43 || !crypto.timingSafeEqual(Buffer.from(sign(p)), Buffer.from(s))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() && o.v === kv('tokenVersion', 1) ? o : null; } catch { return null; }
}
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < ms);
  a.push(now); hits.set(key, a); return a.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 36e5)) hits.delete(k); }, 6e5).unref();

/* ---------------- SSE ---------------- */
const clients = new Set();
function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(s);
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25e3).unref();

/* ---------------- helpers ---------------- */
const r2 = n => Math.round((+n || 0) * 100) / 100;
const uid = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
const GC_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function gcCode() {
  const ex = new Set(colDocs('vouchers').map(v => v.code));
  let c; do { c = 'GC-'; for (let i = 0; i < 8; i++) { if (i === 4) c += '-'; c += GC_ALPHA[crypto.randomInt(GC_ALPHA.length)]; } } while (ex.has(c));
  return c;
}
const digits = s => String(s || '').replace(/\D/g, '');
function e164(phone) {
  const d = digits(phone);
  if (d.startsWith('61')) return '+' + d;
  if (d.startsWith('04') && d.length === 10) return '+61' + d.slice(1);
  if (d.length >= 9) return '+' + d;
  return null;
}
const money = n => '$' + r2(n).toLocaleString('en-AU', { minimumFractionDigits: r2(n) % 1 ? 2 : 0 });
const fmtWhen = ts => new Date(ts).toLocaleString('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString('en-AU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
function localMinutes(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}
const shop = () => getDoc('meta', 'shop') || {};
const overlaps = (b, ts, dur) => b.status !== 'cancelled' && b.ts < ts + dur * 6e4 && b.ts + b.dur * 6e4 > ts;

/* ---------------- SMS ---------------- */
async function sendSms(to, body) {
  const num = e164(to);
  const log = kv('smsLog', []);
  const entry = { ts: Date.now(), to: num || String(to), body, ok: false };
  try {
    if (!SMS) throw new Error('Chưa cấu hình SMS');
    if (!num) throw new Error('Số điện thoại không hợp lệ');
    let r;
    if (SMS === 'clicksend') {
      r = await fetch(CLICKSEND_API + '/v3/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(E.CLICKSEND_USERNAME + ':' + E.CLICKSEND_API_KEY).toString('base64') },
        body: JSON.stringify({ messages: [{ source: 'quay', to: num, body, ...(E.SMS_FROM ? { from: E.SMS_FROM } : {}) }] }),
      });
    } else {
      r = await fetch(`${TWILIO_API}/2010-04-01/Accounts/${E.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(E.TWILIO_ACCOUNT_SID + ':' + E.TWILIO_AUTH_TOKEN).toString('base64') },
        body: new URLSearchParams({ To: num, From: E.TWILIO_FROM || E.SMS_FROM || '', Body: body }),
      });
    }
    if (!r.ok) throw new Error('Nhà cung cấp SMS trả lỗi ' + r.status + ': ' + (await r.text()).slice(0, 200));
    entry.ok = true;
  } catch (e) { entry.error = e.message; }
  log.unshift(entry); kvSet('smsLog', log.slice(0, 100));
  return entry;
}
function bookingSms(b, kind) {
  const s = shop(); const sv = (s.services || []).find(x => x.id === b.svc); const st = (s.staff || []).find(x => x.id === b.staff);
  const store = s.settings?.store || 'the salon';
  const what = `${sv ? sv.name : 'your appointment'}${st ? ' with ' + st.name : ''}`;
  return kind === 'confirm'
    ? `Hi ${b.name.split(' ')[0]}, you're booked at ${store}: ${what}, ${fmtWhen(b.ts)}. Need to change? Call ${s.settings?.phone || ''}.`
    : `Reminder from ${store}: ${what} tomorrow, ${fmtWhen(b.ts)}. Reply or call ${s.settings?.phone || ''} if you can't make it. See you soon!`;
}
// Nhắc lịch trước ~24 giờ.
async function remindLoop() {
  if (!SMS) return;
  const now = Date.now();
  for (const b of colDocs('bookings')) {
    if (b.status !== 'booked' || b.reminded || !b.phone) continue;
    const left = b.ts - now;
    if (left > DAY || left < 2 * 36e5) continue;
    if (b.ts - b.created < DAY + 36e5) continue; // vừa đặt sát giờ: tin xác nhận đã đủ
    const r = await sendSms(b.phone, bookingSms(b, 'remind'));
    const cur = getDoc('bookings', b.id); if (!cur) continue;
    cur.reminded = r.ok ? Date.now() : -1;
    write([{ col: 'bookings', id: b.id, data: cur }]);
  }
}
const REMIND_MS = +(E.REMIND_MS || 5 * 6e4);
setInterval(() => remindLoop().catch(e => console.error('remind', e)), REMIND_MS).unref();
setTimeout(() => remindLoop().catch(e => console.error('remind', e)), Math.min(REMIND_MS, 15e3)).unref();

/* ---------------- Stripe ---------------- */
async function stripe(method, p, form) {
  const r = await fetch(STRIPE_API + '/v1/' + p, { method, headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form ? new URLSearchParams(form) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Stripe ' + r.status);
  return j;
}
function fulfilGift(sess) {
  if (sess.payment_status !== 'paid') return null;
  const key = 'stripe:' + sess.id;
  const done = kv(key); if (done) return getDoc('vouchers', done);
  const m = sess.metadata || {};
  const amount = r2(sess.amount_total / 100);
  const months = Math.max(36, +(shop().settings?.gcMonths) || 36);
  const now = Date.now();
  const v = { id: 'g' + uid(), code: gcCode(), amount, balance: amount, cust: null, to: m.to || '', from: m.from || '', msg: m.msg || '', design: m.design || 'rose', created: now, expires: now + months * 30.44 * DAY, status: 'active', src: 'online', stripeSession: sess.id, buyerPhone: m.phone || '', buyerEmail: sess.customer_details?.email || m.email || '', log: [{ ts: now, type: 'issue', amt: amount }] };
  // liên kết người mua với khách hàng có sẵn theo số điện thoại
  if (m.phone) { const c = colDocs('customers').find(x => digits(x.phone) === digits(m.phone)); if (c) v.cust = c.id; }
  kvSet(key, v.id);
  write([{ col: 'vouchers', id: v.id, data: v }]);
  if (m.phone) sendSms(m.phone, `Thank you! Your ${money(amount)} gift card for ${shop().settings?.store || 'the salon'}${v.to ? ' (for ' + v.to + ')' : ''}: code ${v.code}, valid until ${fmtDate(v.expires)}. Show this code when you pay.`).catch(() => {});
  return v;
}
function verifyStripeSig(raw, header) {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(String(header || '').split(',').map(x => x.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 600) return false;
  const exp = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(parts.t + '.' + raw).digest('hex');
  return exp.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(parts.v1));
}

/* ---------------- backups ---------------- */
function backup() {
  const f = path.join(DATA_DIR, 'backups', `quay-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(f)) return;
  try { db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { console.error('backup', e.message); }
  const all = fs.readdirSync(path.join(DATA_DIR, 'backups')).filter(x => x.endsWith('.db')).sort();
  for (const x of all.slice(0, -30)) fs.rmSync(path.join(DATA_DIR, 'backups', x));
}
backup(); setInterval(backup, 36e5).unref();

/* ---------------- HTTP ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };
function send(res, code, obj, headers = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req, limit = 8e6) {
  return new Promise((ok, bad) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { bad(Object.assign(new Error('Dữ liệu quá lớn'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString()));
    req.on('error', bad);
  });
}
const json = async req => { const t = await readBody(req); try { return t ? JSON.parse(t) : {}; } catch { throw Object.assign(new Error('JSON không hợp lệ'), { code: 400 }); } };
const ip = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const fail = (code, msg) => { throw Object.assign(new Error(msg), { code }); };

function publicInfo() {
  const s = shop(); const st = s.settings || {};
  const now = Date.now();
  const busy = colDocs('bookings').filter(b => b.status !== 'cancelled' && b.ts + b.dur * 6e4 > now && b.ts < now + 22 * DAY).map(b => ({ staff: b.staff, ts: b.ts, dur: b.dur }));
  return {
    store: st.store || '', address: st.address || '', phone: st.phone || '', open: st.openHour ?? 9, close: st.closeHour ?? 19, tz: TZ,
    services: (s.services || []).map(x => ({ id: x.id, name: x.name, dur: x.dur, price: x.price })),
    staff: (s.staff || []).map(x => ({ id: x.id, name: x.name, color: x.color })),
    busy, stripe: !!STRIPE_KEY, gcMonths: Math.max(36, +st.gcMonths || 36), gcAmounts: [50, 80, 100, 150, 200],
  };
}

const routes = {
  'GET /api/hello': () => ({ ok: true, app: 'quay', v: 1 }),
  'POST /api/login': async (req) => {
    if (limited('login:' + ip(req), 8, 10 * 6e4)) fail(429, 'Thử sai quá nhiều lần, đợi 10 phút');
    const { password, device } = await json(req);
    const a = Buffer.from(String(password || '')), b = Buffer.from(SHOP_PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail(401, 'Sai mật khẩu');
    return { token: makeToken(String(device || 'thiết bị').slice(0, 60)) };
  },
  'POST /api/logout-all': (req, auth) => { kvSet('tokenVersion', kv('tokenVersion', 1) + 1); return { ok: true }; },
  'GET /api/state': () => {
    const out = {}; for (const c of COLS) out[c] = [];
    for (const r of q.all.all()) if (COLS.has(r.col)) out[r.col].push(JSON.parse(r.data));
    return { rev: REV, ...out };
  },
  'GET /api/changes': (req, auth, url) => {
    const since = +url.searchParams.get('since') || 0;
    return { rev: REV, docs: q.since.all(since).map(r => ({ col: r.col, id: r.id, data: r.data ? JSON.parse(r.data) : null })) };
  },
  'POST /api/sync': async (req) => {
    const { client, puts = [], dels = [] } = await json(req);
    const changes = []; const rejected = [];
    for (const p of puts) {
      if (!COLS.has(p.col) || typeof p.id !== 'string' || !p.id || p.id.length > 80 || typeof p.data !== 'object' || !p.data) fail(400, 'Dữ liệu không hợp lệ');
      if (p.col === 'vouchers' && getDoc('vouchers', p.id)) { rejected.push(p.id); continue; } // thẻ đã có: chỉ sửa qua /api/gc-op
      if (p.col === 'orders') { const cur = getDoc('orders', p.id); if (cur && cur.no && p.data.no !== cur.no) p.data.no = cur.no; }
      changes.push({ col: p.col, id: p.id, data: p.data });
    }
    for (const d of dels) { if (!COLS.has(d.col) || d.col === 'vouchers' || d.col === 'orders') continue; changes.push({ col: d.col, id: d.id, data: null }); }
    const rev = write(changes, client);
    return { rev, rejected: rejected.map(id => getDoc('vouchers', id)) };
  },
  'POST /api/next-no': () => tx(() => {
    let n = kv('seq');
    if (!n) n = colDocs('orders').reduce((a, o) => Math.max(a, o.no || 0), 1000) + 1;
    kvSet('seq', n + 1); return { no: n };
  }),
  'POST /api/reset': async (req) => {
    const { confirm } = await json(req);
    if (confirm !== 'XOA') fail(400, 'Thiếu xác nhận');
    const changes = q.all.all().map(r => ({ col: r.col, id: r.id, data: null }));
    kvSet('seq', null);
    write(changes);
    return { ok: true };
  },
  'POST /api/gc-op': async (req) => {
    const { id, op, amt, order, days, client } = await json(req);
    let v;
    tx(() => {
      v = getDoc('vouchers', id); if (!v) fail(404, 'Không tìm thấy thẻ');
      const now = Date.now(); const a = r2(amt);
      if (op === 'redeem') {
        if (v.status !== 'active') fail(409, 'Thẻ đã bị huỷ');
        if (v.expires < now) fail(409, 'Thẻ đã hết hạn');
        if (!(a > 0) || a > r2(v.balance) + 1e-9) fail(409, 'Số dư thẻ không đủ (còn ' + money(v.balance) + ')');
        v.balance = r2(v.balance - a); v.log.push({ ts: now, type: 'redeem', amt: a, order });
      } else if (op === 'refund') {
        if (!(a > 0)) fail(400, 'Số tiền không hợp lệ');
        v.balance = r2(Math.min(v.amount, v.balance + a)); v.log.push({ ts: now, type: 'refund', amt: a, order });
      } else if (op === 'extend') {
        v.expires = Math.max(v.expires, now) + (+days || 91) * DAY; v.log.push({ ts: now, type: 'extend', amt: 0 });
      } else if (op === 'void') {
        if (v.status === 'void') return;
        v.log.push({ ts: now, type: 'void', amt: v.balance, order }); v.status = 'void';
      } else fail(400, 'Thao tác không hợp lệ');
    });
    write([{ col: 'vouchers', id, data: v }], client);
    return { voucher: v };
  },
  'GET /api/status': () => ({ sms: SMS, stripe: !!STRIPE_KEY, webhook: !!STRIPE_WEBHOOK_SECRET, publicUrl: PUBLIC_URL, tz: TZ, smsLog: kv('smsLog', []).slice(0, 20), backups: fs.readdirSync(path.join(DATA_DIR, 'backups')).filter(x => x.endsWith('.db')).sort().slice(-5) }),
  'POST /api/sms-test': async (req) => { const { phone } = await json(req); const r = await sendSms(phone, `Test message from ${shop().settings?.store || 'Quầy'}. SMS is working!`); if (!r.ok) fail(502, r.error); return r; },
  'POST /api/sms-booking': async (req) => { const { id } = await json(req); const b = getDoc('bookings', id); if (!b) fail(404, 'Không tìm thấy lịch'); const r = await sendSms(b.phone, bookingSms(b, 'confirm')); if (!r.ok) fail(502, r.error); return r; },

  // ---------- public (không cần đăng nhập) ----------
  'GET /api/public': () => publicInfo(),
  'POST /api/public/book': async (req) => {
    if (limited('book:' + ip(req), 10, 36e5)) fail(429, 'Too many bookings from this device. Please call the salon.');
    const { svc, staff, ts, name, phone, note } = await json(req);
    const s = shop(); const sv = (s.services || []).find(x => x.id === svc);
    if (!sv) fail(400, 'Please choose a service');
    const nm = String(name || '').trim().slice(0, 60), ph = String(phone || '').trim().slice(0, 20);
    if (!nm) fail(400, 'Please enter your name');
    if (digits(ph).length < 9) fail(400, 'Please enter a valid mobile number');
    const t = +ts; const now = Date.now();
    if (!(t > now + 15 * 6e4) || t > now + 60 * DAY) fail(400, 'Please pick a valid time');
    const open = (s.settings?.openHour ?? 9) * 60, close = (s.settings?.closeHour ?? 19) * 60, m = localMinutes(t);
    if (m < open || m + sv.dur > close) fail(400, 'That time is outside opening hours');
    let b, changes;
    tx(() => {
      const all = colDocs('bookings');
      const cands = staff && staff !== 'any' ? (s.staff || []).filter(x => x.id === staff) : (s.staff || []);
      const free = cands.find(x => !all.some(o => o.staff === x.id && overlaps(o, t, sv.dur)));
      if (!free) fail(409, 'Sorry, that time was just taken. Please pick another.');
      let c = colDocs('customers').find(x => digits(x.phone) === digits(ph));
      changes = [];
      if (!c) { c = { id: 'c' + uid(), name: nm, phone: ph, email: '', note: '', created: now }; changes.push({ col: 'customers', id: c.id, data: c }); }
      b = { id: 'b' + uid(), ts: t, dur: sv.dur, svc: sv.id, price: sv.price, staff: free.id, cust: c.id, name: nm, phone: ph, status: 'booked', note: String(note || '').slice(0, 300), src: 'online', created: now };
      changes.push({ col: 'bookings', id: b.id, data: b });
      // ghi ngay trong giao dịch để không bị đặt trùng
      for (const ch of changes) { REV++; q.put.run(ch.col, ch.id, JSON.stringify(ch.data), REV); }
      kvSet('rev', REV);
    });
    broadcast({ rev: REV, docs: changes.map(c => ({ col: c.col, id: c.id, data: c.data })) });
    if (SMS) sendSms(ph, bookingSms(b, 'confirm')).catch(() => {});
    return { booking: { id: b.id, ts: b.ts, dur: b.dur, svc: b.svc, staff: b.staff, name: b.name, price: b.price }, sms: !!SMS };
  },
  'POST /api/public/gift-checkout': async (req) => {
    if (!STRIPE_KEY) fail(400, 'Online gift cards are not available yet');
    if (limited('gift:' + ip(req), 20, 36e5)) fail(429, 'Too many attempts');
    const { amount, to, from, phone, email, msg, design } = await json(req);
    const a = Math.round(+amount);
    if (!(a >= 20 && a <= 1000)) fail(400, 'Amount must be between $20 and $1000');
    const store = shop().settings?.store || 'Gift card';
    const form = {
      mode: 'payment', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'aud',
      'line_items[0][price_data][unit_amount]': String(a * 100),
      'line_items[0][price_data][product_data][name]': `${store} gift card ${money(a)}`,
      success_url: `${PUBLIC_URL}/?gift={CHECKOUT_SESSION_ID}#dat-lich`, cancel_url: `${PUBLIC_URL}/#dat-lich`,
      'metadata[to]': String(to || '').slice(0, 40), 'metadata[from]': String(from || '').slice(0, 40), 'metadata[phone]': String(phone || '').slice(0, 20),
      'metadata[msg]': String(msg || '').slice(0, 120), 'metadata[design]': String(design || 'rose').slice(0, 12), 'metadata[kind]': 'giftcard',
    };
    if (email && /.+@.+\..+/.test(email)) form.customer_email = String(email).slice(0, 120);
    const sess = await stripe('POST', 'checkout/sessions', form);
    return { url: sess.url };
  },
  'GET /api/public/gift-session': async (req, auth, url) => {
    const sid = String(url.searchParams.get('sid') || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) fail(400, 'Invalid session');
    const id = kv('stripe:' + sid); let v = id && getDoc('vouchers', id);
    if (!v && STRIPE_KEY) { const sess = await stripe('GET', 'checkout/sessions/' + sid); v = fulfilGift(sess); }
    if (!v) return { pending: true };
    return { card: { code: v.code, amount: v.amount, to: v.to, msg: v.msg, design: v.design, expires: v.expires } };
  },
  'POST /api/stripe/webhook': async (req) => {
    const raw = await readBody(req, 1e6);
    if (!verifyStripeSig(raw, req.headers['stripe-signature'])) fail(400, 'Bad signature');
    const ev = JSON.parse(raw);
    if (ev.type === 'checkout.session.completed' && ev.data?.object?.metadata?.kind === 'giftcard') fulfilGift(ev.data.object);
    return { received: true };
  },
};
const PUBLIC = new Set(['GET /api/hello', 'POST /api/login', 'GET /api/public', 'POST /api/public/book', 'POST /api/public/gift-checkout', 'GET /api/public/gift-session', 'POST /api/stripe/webhook']);

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(STATIC_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(STATIC_DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': p.endsWith('.html') ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  fs.createReadStream(f).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/events') {
      if (!checkToken(url.searchParams.get('token'))) return send(res, 401, { error: 'Cần đăng nhập' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify({ hello: true, rev: REV })}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    const key = req.method + ' ' + url.pathname; const h = routes[key];
    if (!h) return send(res, 404, { error: 'Không có API này' });
    let auth = null;
    if (!PUBLIC.has(key)) { auth = checkToken((req.headers.authorization || '').replace(/^Bearer /, '')); if (!auth) return send(res, 401, { error: 'Cần đăng nhập' }); }
    send(res, 200, await h(req, auth, url));
  } catch (e) {
    if (!e.code || typeof e.code !== 'number') console.error(e);
    send(res, typeof e.code === 'number' ? e.code : 500, { error: typeof e.code === 'number' ? e.message : 'Lỗi máy chủ' });
  }
});
server.listen(PORT, () => console.log(`Quầy đang chạy: ${PUBLIC_URL} (cổng ${PORT}) · SMS: ${SMS || 'tắt'} · Stripe: ${STRIPE_KEY ? 'bật' : 'tắt'} · dữ liệu: ${DATA_DIR}`));

function loadEnvFile(f) {
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
