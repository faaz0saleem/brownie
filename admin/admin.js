/* ===== Fudgio — Admin dashboard logic ===== */
let CUR = 'Rs';
// Escape anything a customer typed before putting it in HTML. Order details are
// attacker-controlled text, so this is what stops a stored XSS in the dashboard.
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const RS = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');
let TOKEN = localStorage.getItem('fud_admin_token') || '';
let STATUSES = ['Awaiting Payment', 'Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
// Orders carry their own currency: rupees in Pakistan, dollars abroad.
const MON = (o, n) => (o && o.currency === 'USD') ? '$' + Number(n).toLocaleString('en-US') : RS(n);
// The bandana drawing from the shop (admin/art.js is a copy written by the build).
const ART = (c, i) => (window.bandanaSVG ? bandanaSVG(c || '#FF6A13', i || '#FFFFFF') : '');
// Photos come back as /api/img/... on the shop's domain; the admin lives on
// its own subdomain, so point them at the API's host.
const IMGURL = (u) => !u ? '' : (u.indexOf('/api/') === 0 ? API_BASE.replace(/\/api$/, '') + u : u);
const SWATCH = (c) => `<span class="sw-dot" style="background:${esc(c || '#ccc')}"></span>`;
const ADMIN_RECAPTCHA = (window.FUDGIO_ADMIN && window.FUDGIO_ADMIN.recaptcha) || { enabled: false, siteKey: '' };
let recaptchaScriptPromise = null;

function loadRecaptchaScript() {
  if (!ADMIN_RECAPTCHA.enabled) return Promise.resolve();
  if (window.grecaptcha && window.grecaptcha.enterprise) return Promise.resolve();
  if (recaptchaScriptPromise) return recaptchaScriptPromise;

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/enterprise.js?render=' + encodeURIComponent(ADMIN_RECAPTCHA.siteKey);
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Security verification could not be loaded.'));
    document.head.appendChild(script);
  });
  return recaptchaScriptPromise;
}

async function getAdminRecaptchaToken(action) {
  if (!ADMIN_RECAPTCHA.enabled) return null;
  await loadRecaptchaScript();
  if (!window.grecaptcha || !window.grecaptcha.enterprise) {
    throw new Error('Security verification is still loading. Please try again.');
  }

  return new Promise((resolve, reject) => {
    window.grecaptcha.enterprise.ready(async () => {
      try {
        const token = await window.grecaptcha.enterprise.execute(ADMIN_RECAPTCHA.siteKey, { action });
        resolve(token);
      } catch {
        reject(new Error('Security verification failed. Please try again.'));
      }
    });
  });
}

// If we're on the admin subdomain, call the main domain's API (same PHP backend).
var API_BASE = (location.hostname.indexOf('admin.') === 0)
  ? location.protocol + '//' + location.hostname.replace(/^admin\./, '') + '/api'
  : '/api';
async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts, credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN, ...(opts.headers || {}) }
  });
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  return res;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---------- Auth ----------
async function login() {
  const err = document.getElementById('loginErr');
  const token = document.getElementById('loginToken').value.trim();
  err.textContent = '';
  try {
    const recaptchaToken = await getAdminRecaptchaToken('ADMIN_LOGIN');
    const res = await fetch(API_BASE + '/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, recaptchaToken }) });
    if (!res.ok) { err.textContent = 'Wrong password. Try again.'; return; }
    TOKEN = token; localStorage.setItem('fud_admin_token', token); showApp();
  } catch (e) { err.textContent = e.message || 'Network error.'; }
}
function logout() {
  localStorage.removeItem('fud_admin_token'); TOKEN = '';
  document.getElementById('app').classList.remove('show');
  document.getElementById('loginScreen').style.display = 'grid';
}
async function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  try { const cfg = await (await api('/config')).json(); STATUSES = cfg.statuses; CUR = cfg.currency; } catch {}
  ensureQuickBar();
  refreshAll();
}

// ---------- Nav ----------
const VIEW_META = {
  dashboard: ['Dashboard', 'Store overview & analytics'],
  orders: ['Orders', 'Manage and track every order'],
  inventory: ['Products & Stock', 'Images, stock levels & product management'],
  customers: ['Customers', 'Your buyers and their locations'],
  settings: ['Settings', 'Delivery, the deal, payments & more'],
  messages: ['Messages', 'From the contact and bulk-order forms'],
  subscribers: ['Subscribers', 'People waiting for new colours']
};
document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    document.getElementById('viewTitle').textContent = VIEW_META[view][0];
    document.getElementById('viewSub').textContent = VIEW_META[view][1];
    if (view === 'settings') loadSettings();
    if (view === 'messages') loadMessages();
    if (view === 'subscribers') loadSubscribers();
  });
});

async function refreshAll() {
  await Promise.all([loadDashboard(), loadOrders(), loadInventory(), loadCustomers()]);
}

// ---------- Dashboard ----------
async function loadDashboard() {
  const a = await (await api('/analytics')).json();
  const t = a.totals;
  const kpis = [
    { ico: '👀', label: 'Site visitors', value: t.visitors ?? 0, foot: `${t.pageViews ?? 0} total page views` },
    { ico: '📈', label: 'Visitors today', value: t.visitorsToday ?? 0, foot: `${t.viewsToday ?? 0} views today` },
    { ico: '💰', label: 'Revenue', value: RS(t.revenue), foot: `${RS(t.revenuePkr || 0)} + $${(t.revenueUsd || 0).toLocaleString('en-US')} abroad` },
    { ico: '🧾', label: 'Total orders', value: t.orders, foot: `${t.pendingOrders} to handle · ${t.deliveredOrders} delivered` },
    { ico: '⏳', label: 'Awaiting payment', value: t.awaitingPayment || 0, foot: `$${(t.awaitingPaymentUsd || 0).toLocaleString('en-US')} in international orders` },
    { ico: '🧣', label: 'Bandanas sold', value: t.unitsSold, foot: `${t.bundleOrders || 0} orders used the bundle deal` },
    { ico: '🌍', label: 'International', value: t.intlOrders || 0, foot: 'orders shipped abroad' },
    { ico: '👥', label: 'Customers', value: t.customers, foot: 'unique buyers' },
    { ico: '📊', label: 'Avg order value', value: RS(t.avgOrderValue), foot: 'per order, in rupees' },
    { ico: '✉️', label: 'Messages', value: t.unreadMessages || 0, foot: `new · ${t.subscribers || 0} newsletter sign-ups` },
    { ico: '📦', label: 'Out of stock', value: t.outOfStock, foot: `${t.products} colours on sale` }
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map((k) => `
    <div class="kpi"><span class="ico">${k.ico}</span><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="foot">${k.foot}</div></div>`).join('');

  const alertEl = document.getElementById('lowStockAlert');
  alertEl.innerHTML = a.lowStock.length
    ? `<div class="alert-strip">⚠️ Low / out of stock: ${a.lowStock.map((p) => `${SWATCH(p.color)} ${esc(p.name)} (${p.stock})`).join(' · ')}</div>` : '';

  const maxRev = Math.max(1, ...a.salesByDay.map((d) => d.revenue));
  document.getElementById('salesChart').innerHTML = a.salesByDay.map((d) => `
    <div class="bar-col"><div class="bar-val">${d.revenue ? RS(d.revenue) : ''}</div>
      <div class="bar" style="height:${(d.revenue / maxRev) * 100}%" title="${d.label}: ${RS(d.revenue)} (${d.orders} orders)"></div>
      <div class="bar-label">${d.label}</div></div>`).join('');

  const maxUnits = Math.max(1, ...a.topProducts.map((p) => p.units));
  document.getElementById('topProducts').innerHTML = a.topProducts.length ? a.topProducts.map((p) => `
    <div class="rank-item"><div class="r-emoji">${SWATCH(p.color)}</div><div class="r-body">
      <div class="r-name"><span>${esc(p.name)}</span><span>${p.units} sold</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(p.units / maxUnits) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">🧣</div>No sales yet.</div>';

  const maxCity = Math.max(1, ...a.cityBreakdown.map((c) => c.count));
  document.getElementById('cityBreakdown').innerHTML = a.cityBreakdown.length ? a.cityBreakdown.map((c) => `
    <div class="rank-item"><div class="r-emoji">📍</div><div class="r-body">
      <div class="r-name"><span>${esc(c.city)}</span><span>${c.count} order(s)</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(c.count / maxCity) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">📍</div>No orders yet.</div>';

  const statusEmoji = { 'Awaiting Payment': '⏳', Pending: '🕒', Confirmed: '✅', Packed: '📦', Shipped: '✈️', 'Out for Delivery': '🚚', Delivered: '🏠', Cancelled: '❌' };
  const entries = Object.entries(a.statusCounts);
  const maxStatus = Math.max(1, ...entries.map(([, v]) => v));
  document.getElementById('statusBreakdown').innerHTML = entries.length ? entries.map(([status, count]) => `
    <div class="rank-item"><div class="r-emoji">${statusEmoji[status] || '•'}</div><div class="r-body">
      <div class="r-name"><span>${status}</span><span>${count}</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(count / maxStatus) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">🧾</div>No orders yet.</div>';

  // ----- Visitor analytics (injected once) -----
  const v = a.visits || { byDay: [], topPages: [] };
  let vp = document.getElementById('visitorsPanel');
  if (!vp) {
    vp = document.createElement('div'); vp.id = 'visitorsPanel'; vp.className = 'two-col';
    vp.innerHTML = `<div class="panel"><h3>👀 Visitors — last 14 days</h3><div class="panel-sub">Page views per day</div><div class="chart" id="visitsChart"></div></div>
      <div class="panel"><h3>🔗 Top pages</h3><div class="panel-sub">Most viewed pages</div><div class="rank-list" id="topPages"></div></div>`;
    document.getElementById('view-dashboard').appendChild(vp);
  }
  const maxV = Math.max(1, ...v.byDay.map((d) => d.views));
  document.getElementById('visitsChart').innerHTML = v.byDay.map((d) => `
    <div class="bar-col"><div class="bar-val">${d.views || ''}</div>
      <div class="bar" style="height:${(d.views / maxV) * 100}%" title="${d.label}: ${d.views} views"></div>
      <div class="bar-label">${d.label}</div></div>`).join('');
  const maxP = Math.max(1, ...v.topPages.map((p) => p.views));
  document.getElementById('topPages').innerHTML = v.topPages.length ? v.topPages.map((p) => `
    <div class="rank-item"><div class="r-emoji">📄</div><div class="r-body">
      <div class="r-name"><span>${esc(p.page)}</span><span>${p.views}</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(p.views / maxP) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">👀</div>No visits recorded yet.</div>';
}

// ---------- Orders ----------
const STATUS_CLASS = { 'Awaiting Payment': 'b-pending', Pending: 'b-pending', Confirmed: 'b-confirmed', Packed: 'b-confirmed', Shipped: 'b-out', 'Out for Delivery': 'b-out', Delivered: 'b-delivered', Cancelled: 'b-cancelled' };
const fmtDate = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
let ORDERS = [];
async function loadOrders() {
  const res = await api('/orders');
  if (!res.ok) { toast('Could not load orders'); return; } // never wipe the table on error
  ORDERS = await res.json();
  ensureOrderToolbar();
  renderOrders();
}
function ensureOrderToolbar() {
  if (document.getElementById('orderToolbar')) return;
  const panel = document.querySelector('#view-orders .panel');
  const wrap = panel.querySelector('.table-wrap');
  const bar = document.createElement('div');
  bar.id = 'orderToolbar'; bar.className = 'order-toolbar';
  bar.innerHTML = `<input id="ordSearch" placeholder="🔎 Search name, phone or order #" oninput="renderOrders()">
    <select id="ordFilter" onchange="renderOrders()"><option value="">All statuses</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
    <button class="refresh-btn" onclick="exportOrders()">⬇ Export CSV</button>`;
  panel.insertBefore(bar, wrap);
}
function renderOrders() {
  const q = (document.getElementById('ordSearch')?.value || '').toLowerCase();
  const f = document.getElementById('ordFilter')?.value || '';
  const list = ORDERS.filter((o) => {
    if (f && o.status !== f) return false;
    if (q && ((o.id + ' ' + o.customer.name + ' ' + o.customer.phone + ' ' + o.customer.city).toLowerCase().indexOf(q) < 0)) return false;
    return true;
  });
  const body = document.getElementById('ordersBody');
  if (!list.length) { body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="em">🧾</div>No matching orders.</div></td></tr>`; return; }
  body.innerHTML = list.map((o) => `
    <tr>
      <td class="mono"><b>${esc(o.id)}</b></td>
      <td><b>${esc(o.customer.name)}</b><br/><span class="muted">${esc(o.customer.phone)}</span>${o.customer.email ? `<br/><span class="muted" style="font-size:.76rem">${esc(o.customer.email)}</span>` : ''}</td>
      <td>${esc(o.customer.city)}${o.customer.countryName && o.customer.country !== 'PK' ? ', <b>' + esc(o.customer.countryName) + '</b>' : ''}<br/><span class="muted" style="font-size:.8rem">${esc(o.customer.address)}${o.customer.postcode ? ' ' + esc(o.customer.postcode) : ''}</span></td>
      <td class="order-items">${o.items.map((i) => `<span class="oi">${SWATCH(i.color)} ${i.qty}× ${esc(i.name)}</span>`).join('<br/>')}</td>
      <td class="mono"><b>${MON(o, o.total)}</b>${o.discount ? `<br/><span class="muted" style="font-size:.76rem">−${MON(o, o.discount)} bundle</span>` : ''}</td>
      <td>${o.currency === 'USD' ? '<span class="pill-cod" style="background:#ffe4f0;color:#b0105a">💳 Prepaid</span>' : '<span class="pill-cod">💵 COD</span>'}</td>
      <td class="muted" style="white-space:nowrap">${fmtDate(o.createdAt)}</td>
      <td>
        <span class="badge ${STATUS_CLASS[o.status]}" style="margin-bottom:6px;display:inline-flex">${o.status}</span><br/>
        <select class="status-select" onchange="setStatus('${esc(o.id)}', this.value)">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="mini" onclick="orderDetail('${esc(o.id)}')">Details</button>
          <button class="mini" onclick="printOrder('${esc(o.id)}')" title="Print packing slip">🖨</button>
          <button class="mini" onclick="contactCustomer('${esc(o.id)}','wa')" title="WhatsApp customer">💬</button>
          <button class="mini" onclick="contactCustomer('${esc(o.id)}','call')" title="Call customer">📞</button>
          <button class="mini danger" onclick="deleteOrder('${esc(o.id)}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}
async function setStatus(id, status) {
  const res = await api('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
  if (!res.ok) { toast('Could not update status'); return; }
  const u = await res.json();
  const o = ORDERS.find((x) => x.id === id); if (o) { o.status = u.status; o.statusHistory = u.statusHistory; }
  toast(`Order ${id} → ${status}`);
  renderOrders(); loadDashboard();
}
async function deleteOrder(id) {
  if (!confirm('Delete order ' + id + '? This restocks items and cannot be undone.')) return;
  const res = await api('/orders/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('Delete failed'); return; }
  ORDERS = ORDERS.filter((o) => o.id !== id);
  toast('Order deleted'); renderOrders(); loadDashboard(); loadInventory();
}
function orderDetail(id) {
  const o = ORDERS.find((x) => x.id === id); if (!o) return;
  const steps = o.currency === 'USD' ? ['Awaiting Payment', 'Confirmed', 'Packed', 'Shipped', 'Delivered'] : ['Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
  const idx = steps.indexOf(o.status);
  const tl = o.status === 'Cancelled' ? '<div style="color:var(--bad);font-weight:700">✖ Cancelled</div>'
    : steps.map((s, i) => `<div style="color:${i <= idx ? 'var(--ok)' : 'var(--dim)'};font-weight:600">${i <= idx ? '●' : '○'} ${s}</div>`).join('');
  showModal(`<h3 style="font-size:1.3rem;margin-bottom:6px">${esc(o.id)}</h3>
    <span class="badge ${STATUS_CLASS[o.status]}">${o.status}</span>
    <p style="margin:12px 0"><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}${o.customer.email ? ' · ' + esc(o.customer.email) : ''}<br>📍 ${esc(o.customer.address)}, ${esc(o.customer.city)}${o.customer.postcode ? ' ' + esc(o.customer.postcode) : ''}, ${esc(o.customer.countryName || 'Pakistan')}${o.customer.notes ? '<br><i>Note: ' + esc(o.customer.notes) + '</i>' : ''}</p>
    <table style="width:100%;border-collapse:collapse">${o.items.map((i) => `<tr><td style="padding:6px 0">${SWATCH(i.color)} ${i.qty}× ${esc(i.name)}${i.size ? ' (' + esc(i.size) + ')' : ''}</td><td style="text-align:right">${MON(o, i.lineTotal)}</td></tr>`).join('')}
      <tr><td style="padding:6px 0;border-top:1px solid var(--line)">Subtotal</td><td style="text-align:right;border-top:1px solid var(--line)">${MON(o, o.subtotal)}</td></tr>
      ${o.discount ? `<tr><td style="padding:6px 0">Bundle deal</td><td style="text-align:right">−${MON(o, o.discount)}</td></tr>` : ''}
      <tr><td style="padding:6px 0">${o.currency === 'USD' ? 'Shipping' : 'Delivery'}</td><td style="text-align:right">${o.deliveryFee ? MON(o, o.deliveryFee) : 'Free'}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid var(--line);font-weight:800">Total</td><td style="text-align:right;border-top:1px solid var(--line);font-weight:800">${MON(o, o.total)} (${o.currency === 'USD' ? 'prepaid — ship once paid' : 'cash on delivery'})</td></tr></table>
    <h4 style="margin:16px 0 8px">Status timeline</h4><div style="display:flex;gap:16px;flex-wrap:wrap">${tl}</div>`);
}
function exportOrders() { window.location = API_BASE + '/export/orders?token=' + encodeURIComponent(TOKEN); }

// ---------- Inventory ----------
function stockChip(stock) {
  if (stock === 0) return `<span class="stock-chip sc-out">Out of stock</span>`;
  if (stock <= 10) return `<span class="stock-chip sc-low">Low · ${stock}</span>`;
  return `<span class="stock-chip sc-in">${stock} in stock</span>`;
}
async function loadInventory() {
  const all = await (await api('/products')).json();
  // Rows with no print colour are the old brownies: never on sale again, so
  // they are kept out of the way here instead of filling the page with photos.
  const products = all.filter((p) => p.color);
  const retired = all.filter((p) => !p.color);
  const grid = document.getElementById('invGrid');
  let note = document.getElementById('invRetired');
  if (!note) { note = document.createElement('div'); note.id = 'invRetired'; grid.parentNode.insertBefore(note, grid); }
  note.innerHTML = retired.length
    ? `<div class="alert-strip" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${retired.length} old brownie product(s) are hidden from the shop. Past orders keep their own records.
        <button class="mini danger" onclick="deleteRetired()">Delete them for good</button></div>` : '';
  window._retired = retired;
  const addBar = document.getElementById('invAddBar');
  if (!addBar) {
    const bar = document.createElement('div'); bar.id = 'invAddBar'; bar.style.marginBottom = '16px';
    bar.innerHTML = '<button class="btn-sm btn-save" style="max-width:200px" onclick="addProduct()">➕ Add a colour</button>';
    grid.parentNode.insertBefore(bar, grid);
  }
  grid.innerHTML = products.map((p) => `
    <div class="inv-card">
      <div class="inv-top" style="background:#efe8de">
        ${!p.active ? '<span class="inactive-flag">Hidden</span>' : ''}
        ${p.imageUrl ? `<img src="${esc(IMGURL(p.imageUrl))}" alt="${esc(p.name)}" class="inv-img">` : `<span class="inv-art">${ART(p.color, p.ink)}</span>`}
      </div>
      <div class="inv-photos">
        ${(p.photos || []).map((u, n) => `<div class="ph-thumb${n ? '' : ' main'}"><img src="${esc(IMGURL(u))}" alt="">
          <div class="ph-tools">${n ? `<button title="Make this the main photo" onclick="photoMain('${p.id}',${n})">★</button>` : '<span title="Main photo">★</span>'}<button title="Remove" onclick="photoRemove('${p.id}',${n})">×</button></div></div>`).join('')}
        ${(p.photos || []).length < 6 ? `<label class="ph-add" title="Add photos">＋<input type="file" accept="image/*" multiple style="display:none" onchange="uploadPhotos('${p.id}', this)"></label>` : ''}
      </div>
      <div class="inv-body">
        <h4>${esc(p.name)} ${stockChip(p.stock)}</h4>
        <div class="inv-meta">${esc(p.tagline || '')} · <a href="https://fudgio.com/bandanas/${esc(p.slug)}" target="_blank" rel="noopener">view</a></div>
        <div class="inv-stats">
          <div><div class="n">${p.sold || 0}</div><div class="t">Sold</div></div>
          <div><div class="n">${p.stock}</div><div class="t">In stock</div></div>
          <div><div class="n">${RS((p.sold || 0) * p.price).replace(CUR + ' ', '')}</div><div class="t">Revenue</div></div>
        </div>
        <div class="inv-row"><label>Price (Rs)</label><input type="number" id="price-${p.id}" value="${(p.sizes && p.sizes[0] ? p.sizes[0].price : p.price)}" /></div>
        <div class="inv-row"><label>Price ($)</label><input type="number" id="usd-${p.id}" value="${(p.sizes && p.sizes[0] && p.sizes[0].usd) || ''}" placeholder="auto" /></div>
        <div class="inv-row"><label>Stock</label><input type="number" id="stock-${p.id}" value="${p.stock}" /></div>
        <div class="inv-actions">
          <button class="btn-sm btn-save" onclick="saveProduct('${p.id}')">💾 Save</button>
          <button class="btn-sm btn-toggle" onclick="editProductDetails('${p.id}')">✏️ Edit</button>
          <button class="btn-sm btn-toggle" onclick="toggleActive('${p.id}', ${p.active})">${p.active ? '🚫 Hide' : '✅ Show'}</button>
        </div>
        <div class="inv-actions" style="margin-top:8px">
          <label class="btn-sm btn-toggle upload-label">📷 Add photos
            <input type="file" accept="image/*" multiple style="display:none" onchange="uploadPhotos('${p.id}', this)">
          </label>
          <button class="btn-sm btn-toggle" onclick="markOutOfStock('${p.id}')">Out of stock</button>
          <button class="btn-sm btn-danger" onclick="deleteProduct('${p.id}', '${esc(p.name).replace(/'/g, "\\'")}')">🗑 Delete</button>
        </div>
      </div>
    </div>`).join('');
}
async function deleteRetired() {
  const list = window._retired || [];
  if (!list.length || !confirm(`Delete ${list.length} old brownie product(s) permanently?\n\nPast orders are not affected.`)) return;
  for (const p of list) await api('/products/' + p.id, { method: 'DELETE' });
  toast('Old products deleted'); loadInventory(); loadDashboard();
}
async function saveProduct(id) {
  const price = parseInt(document.getElementById('price-' + id).value, 10) || 0;
  const usd = parseInt(document.getElementById('usd-' + id).value, 10) || 0;
  const stock = document.getElementById('stock-' + id).value;
  const size = { label: '55 cm square', pieces: 1, price };
  if (usd > 0) size.usd = usd;
  await api('/products/' + id, { method: 'PATCH', body: JSON.stringify({ price, stock, sizes: [size] }) });
  toast('Product updated ✓'); loadInventory(); loadDashboard();
}
async function toggleActive(id, active) {
  await api('/products/' + id, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
  toast(active ? 'Product hidden' : 'Product visible'); loadInventory(); loadDashboard();
}
async function markOutOfStock(id) {
  await api('/products/' + id, { method: 'PATCH', body: JSON.stringify({ stock: 0 }) });
  toast('Marked out of stock'); loadInventory(); loadDashboard();
}
async function deleteProduct(id, name) {
  // Deleting removes it from the shop for good. Past orders are unaffected —
  // each order stores its own copy of the item's name, size and price.
  if (!confirm(`Delete "${name}" from the shop permanently?\n\nPast orders keep their records. To just take it off the shop, use Hide instead.`)) return;
  const res = await api('/products/' + id, { method: 'DELETE' });
  toast(res.ok ? 'Product deleted' : 'Delete failed');
  loadInventory(); loadDashboard();
}
// Several photos per colour, the first is the main one. Each is resized in
// the browser (long side 1600px) before upload, so phone photos are fine.
async function uploadPhotos(id, input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  toast('Uploading ' + files.length + ' photo(s)…');
  let done = 0;
  for (const file of files) {
    if (file.size > 15 * 1024 * 1024) { toast(file.name + ' is too large (max 15MB)'); continue; }
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    const small = await downscale(dataUrl, 1600);
    const res = await api('/products/' + id + '/photos', { method: 'POST', body: JSON.stringify({ imageUrl: small }) });
    if (res.ok) done++; else { const e = await res.json().catch(() => ({})); toast(e.error || 'Upload failed'); break; }
  }
  input.value = '';
  if (done) toast(done + ' photo(s) added — they show on the shop now 📷');
  loadInventory();
}
async function photoMain(id, n) { await api('/products/' + id + '/photos/' + n + '/main', { method: 'POST' }); toast('Main photo set'); loadInventory(); }
async function photoRemove(id, n) { if (!confirm('Remove this photo?')) return; await api('/products/' + id + '/photos/' + n, { method: 'DELETE' }); toast('Photo removed'); loadInventory(); }
function uploadImage(id, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { toast('Image too large (max 4MB)'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = await downscale(reader.result, 900);
    const res = await api('/products/' + id + '/image', { method: 'PUT', body: JSON.stringify({ imageUrl: dataUrl }) });
    if (res.ok) { toast('Image updated 📷'); loadInventory(); }
    else { const e = await res.json(); toast(e.error || 'Upload failed'); }
  };
  reader.readAsDataURL(file);
}
async function removeImage(id) {
  await api('/products/' + id + '/image', { method: 'DELETE' });
  toast('Image removed'); loadInventory();
}
// Downscale/compress an image in the browser to keep DB payload small.
function downscale(dataUrl, maxW) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---------- Customers ----------
let CUSTOMERS = [];
async function loadCustomers() {
  CUSTOMERS = await (await api('/users')).json();
  ensureCustomerToolbar();
  renderCustomers();
}
function ensureCustomerToolbar() {
  if (document.getElementById('custToolbar')) return;
  const body = document.getElementById('customersBody');
  const wrap = body.closest('.panel').querySelector('.table-wrap');
  const bar = document.createElement('div');
  bar.id = 'custToolbar'; bar.className = 'order-toolbar';
  bar.innerHTML = `<input id="custSearch" placeholder="🔎 Search name, phone, email or city" oninput="renderCustomers()">
    <button class="btn-sm btn-toggle" onclick="exportOrders()">⬇ Export orders CSV</button>`;
  wrap.parentNode.insertBefore(bar, wrap);
}
function renderCustomers() {
  const body = document.getElementById('customersBody');
  const q = (document.getElementById('custSearch')?.value || '').trim().toLowerCase();
  const users = q
    ? CUSTOMERS.filter((u) => [u.name, u.phone, u.email, u.city]
        .some((f) => String(f || '').toLowerCase().includes(q)))
    : CUSTOMERS;
  if (!users.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="em">👥</div>${q ? 'No customers match that search.' : 'No customers yet.'}</div></td></tr>`;
    return;
  }
  body.innerHTML = users.map((u) => `
    <tr>
      <td><b><a href="#" onclick="customerDetail('${esc(u.id)}','${esc((u.name||'').replace(/['\\]/g,''))}');return false" style="color:var(--brand)">${esc(u.name || '—')}</a></b></td>
      <td class="mono">${esc(u.phone || '')}${u.email ? `<br/><span class="muted" style="font-size:.8rem">${esc(u.email)}</span>` : ''}</td>
      <td>${u.city ? '📍 ' + esc(u.city) : '<span class="muted">—</span>'}</td>
      <td class="muted" style="max-width:240px">${esc(u.address || '—')}</td>
      <td class="mono">${u.orders || 0}</td>
      <td class="mono"><b>${RS(u.totalSpent || 0)}</b></td>
      <td class="muted" style="white-space:nowrap">${u.lastOrderAt ? fmtDate(u.lastOrderAt) : '—'}</td>
    </tr>`).join('');
}

// ---------- Init ----------
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('loginToken').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
if (TOKEN) {
  fetch(API_BASE + '/analytics', { credentials: 'include', headers: { 'x-admin-token': TOKEN } })
    .then((r) => { if (r.ok) showApp(); else logout(); }).catch(() => logout());
}

// ---------- Generic modal ----------
function showModal(html) {
  let m = document.getElementById('adminModal');
  if (!m) { m = document.createElement('div'); m.id = 'adminModal'; m.className = 'admin-modal';
    m.innerHTML = '<div class="am-inner"></div>'; m.onclick = (e) => { if (e.target === m) closeModal(); };
    document.body.appendChild(m); }
  m.querySelector('.am-inner').innerHTML = '<button class="am-close" onclick="closeModal()">×</button>' + html;
  m.classList.add('open');
}
function closeModal() { const m = document.getElementById('adminModal'); if (m) m.classList.remove('open'); }

// ---------- Settings ----------
async function loadSettings() {
  const el = document.getElementById('settingsBody'); if (!el) return;
  const s = await (await api('/settings')).json();
  const row = (label, input, hint) => `<div class="inv-row"><label style="width:210px">${label}</label>${input}</div>${hint ? `<div class="muted" style="font-size:.8rem;margin:-4px 0 10px 220px">${hint}</div>` : ''}`;
  const num = (id, v) => `<input type="number" id="${id}" value="${esc(v)}">`;
  const txt = (id, v, ph) => `<input id="${id}" value="${esc(v || '')}" placeholder="${esc(ph || '')}">`;
  el.innerHTML = `
    <div class="two-col">
    <div class="panel">
      <h3>🇵🇰 Pakistan — cash on delivery</h3>
      ${row('Delivery fee (Rs)', num('setFee', s.deliveryFee))}
      ${row('Free delivery over (Rs)', num('setFree', s.freeDeliveryOver), '0 means delivery is never free.')}
      ${row('Delivery time (days)', txt('setDaysPk', s.daysPk, '3–5'), 'Shown as “Delivered in 3–5 days”.')}
      <h3 style="margin-top:22px">🌍 Worldwide — prepaid</h3>
      ${row('Ship internationally', `<select id="setIntl"><option value="1" ${s.intlEnabled ? 'selected' : ''}>Yes</option><option value="0" ${!s.intlEnabled ? 'selected' : ''}>No — Pakistan only</option></select>`)}
      ${row('Shipping ($)', num('setIntlShip', s.intlShipping), 'Flat, per order.')}
      ${row('Free shipping over ($)', num('setIntlFree', s.intlFreeOver), '0 means shipping is never free.')}
      ${row('Shipping time (days)', txt('setDaysIntl', s.daysIntl, '7–14'))}
      ${row('Rupees per dollar', num('setRate', s.usdRate), 'Prices a colour with no $ price, and converts $ revenue on the dashboard.')}
      ${row('Payment link', txt('setPayLink', s.intlPaymentLink, 'https://paypal.me/yourname'), 'Shown to international customers after they order. Blank = you email them a link.')}
    </div>
    <div class="panel">
      <h3>🏷 The bundle deal</h3>
      ${row('Bandanas needed', num('setBQty', s.bundleQty), 'Any colours count.')}
      ${row('Discount (%)', num('setBPct', s.bundlePct), '0 turns the deal off everywhere on the site.')}
      <h3 style="margin-top:22px">🏪 Store</h3>
      ${row('Store open for orders', `<select id="setOpen"><option value="1" ${s.storeOpen ? 'selected' : ''}>Open</option><option value="0" ${!s.storeOpen ? 'selected' : ''}>Closed</option></select>`)}
      ${row('Announcement bar', txt('setAnn', s.announcement, 'Blank = automatic delivery & deal message'))}
      ${row('Instagram', txt('setIg', s.instagram, '@fudgio'))}
      ${row('WhatsApp number', txt('setWa', s.whatsapp, '923001234567'), 'With country code, digits only.')}
      <button class="btn-sm btn-save" style="margin-top:14px" onclick="saveSettings()">💾 Save settings</button>
    </div></div>
    <div class="panel" style="margin-top:20px">
      <h3>📸 Home page banner photo</h3>
      <div class="panel-sub">A photo of someone wearing a Fudgio bandana, shown at the top of the home page instead of the illustration. Portrait works best (about 5:6); it is cropped to an arch.</div>
      <div id="bannerBox" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap"></div>
    </div>`;
  loadBanner();
}
async function loadBanner() {
  const box = document.getElementById('bannerBox'); if (!box) return;
  const st = await (await fetch(API_BASE + '/storefront', { credentials: 'include' })).json().catch(() => ({}));
  box.innerHTML = (st.bannerUrl ? `<img src="${esc(IMGURL(st.bannerUrl))}" alt="" style="width:180px;aspect-ratio:5/6;object-fit:cover;border-radius:90px 90px 8px 8px">` : '<div class="muted">No photo yet — the illustration is showing.</div>')
    + `<label class="btn-sm btn-save upload-label">📷 ${st.bannerUrl ? 'Replace' : 'Upload'} photo<input type="file" accept="image/*" style="display:none" onchange="uploadBanner(this)"></label>`
    + (st.bannerUrl ? '<button class="btn-sm btn-toggle" onclick="removeBanner()">🗑 Remove</button>' : '');
}
async function uploadBanner(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
  const res = await api('/banner', { method: 'PUT', body: JSON.stringify({ imageUrl: await downscale(dataUrl, 1600) }) });
  toast(res.ok ? 'Banner photo is live ✓' : ((await res.json().catch(() => ({}))).error || 'Upload failed'));
  loadBanner();
}
async function removeBanner() { if (!confirm('Remove the banner photo? The illustration comes back.')) return; await api('/banner', { method: 'DELETE' }); toast('Banner photo removed'); loadBanner(); }
async function saveSettings() {
  const v = (id) => document.getElementById(id).value;
  const body = { deliveryFee: v('setFee'), freeDeliveryOver: v('setFree'), daysPk: v('setDaysPk'),
    intlEnabled: v('setIntl') === '1', intlShipping: v('setIntlShip'), intlFreeOver: v('setIntlFree'), daysIntl: v('setDaysIntl'),
    usdRate: v('setRate'), intlPaymentLink: v('setPayLink'), bundleQty: v('setBQty'), bundlePct: v('setBPct'),
    storeOpen: v('setOpen') === '1', announcement: v('setAnn'), instagram: v('setIg'), whatsapp: v('setWa') };
  const res = await api('/settings', { method: 'POST', body: JSON.stringify(body) });
  toast(res.ok ? 'Settings saved ✓' : 'Save failed');
  if (res.ok) loadSettings();
}

// ---------- Messages ----------
async function loadMessages() {
  const el = document.getElementById('messagesBody'); if (!el) return;
  const list = await (await api('/messages')).json();
  el.innerHTML = list.length ? list.map((m) => `
    <div class="msg ${m.status === 'new' ? 'is-new' : ''}">
      <div class="msg-head"><b>${esc(m.name)}</b> <span class="badge ${m.status === 'new' ? 'b-pending' : m.status === 'done' ? 'b-delivered' : 'b-confirmed'}">${esc(m.status)}</span>
        <span class="muted">${esc(m.topic)} · ${fmtDate(m.createdAt)}</span></div>
      <div class="muted" style="font-size:.85rem"><a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: your message to Fudgio')}">${esc(m.email)}</a>${m.phone ? ' · ' + esc(m.phone) : ''}</div>
      <p style="white-space:pre-wrap;margin:10px 0">${esc(m.body)}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <a class="mini" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: your message to Fudgio')}" onclick="setMsg('${esc(m.id)}','read')">✉️ Reply</a>
        ${m.status !== 'done' ? `<button class="mini" onclick="setMsg('${esc(m.id)}','done')">✅ Done</button>` : `<button class="mini" onclick="setMsg('${esc(m.id)}','new')">↩ Mark new</button>`}
        <button class="mini danger" onclick="delMsg('${esc(m.id)}')">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty-state"><div class="em">✉️</div>No messages yet.</div>';
}
async function setMsg(id, status) { await api('/messages/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) }); loadMessages(); loadDashboard(); }
async function delMsg(id) { if (!confirm('Delete this message?')) return; await api('/messages/' + encodeURIComponent(id), { method: 'DELETE' }); loadMessages(); loadDashboard(); }

// ---------- Subscribers ----------
async function loadSubscribers() {
  const el = document.getElementById('subscribersBody'); if (!el) return;
  const list = await (await api('/subscribers')).json();
  el.innerHTML = `<div class="order-toolbar"><span class="muted">${list.length} sign-up(s)</span>
      <button class="refresh-btn" onclick="window.location=API_BASE+'/export/subscribers?token='+encodeURIComponent(TOKEN)">⬇ Export CSV</button>
      <button class="refresh-btn" onclick="copyEmails()">📋 Copy all emails</button></div>
    <div class="table-wrap"><table><thead><tr><th>Email</th><th>Signed up on</th><th>When</th><th></th></tr></thead><tbody>
    ${list.length ? list.map((r) => `<tr><td class="mono">${esc(r.email)}</td><td class="muted">${esc(r.source)}</td><td class="muted">${fmtDate(r.createdAt)}</td>
      <td><button class="mini danger" onclick="delSub('${esc(r.email)}')">Remove</button></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state"><div class="em">📬</div>No sign-ups yet.</div></td></tr>'}
    </tbody></table></div>`;
  window._subs = list;
}
async function delSub(email) { if (!confirm('Remove ' + email + '?')) return; await api('/subscribers/' + encodeURIComponent(email), { method: 'DELETE' }); loadSubscribers(); }
function copyEmails() { const t = (window._subs || []).map((r) => r.email).join(', '); navigator.clipboard && navigator.clipboard.writeText(t).then(() => toast('Copied ' + (window._subs || []).length + ' emails')); }

// ---------- Product add / full edit ----------
// Every bandana is the same print; a product is a colour. Pick the ground
// colour and the colour the print is drawn in, and the shop draws it.
function productForm(p) {
  p = p || { name: '', tagline: '', description: '', stock: 30, color: '#FF6A13', ink: '#FFFFFF', sizes: [{ price: 4200, usd: 15 }], featured: true };
  const sz = (p.sizes && p.sizes[0]) || { price: p.price || 4200, usd: 15 };
  return `<h3 style="font-size:1.3rem;margin-bottom:14px">${p.id ? 'Edit' : 'Add a'} colour</h3>
    <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div id="pfPreview" style="width:150px;flex:none;box-shadow:0 18px 30px -16px rgba(0,0,0,.5)">${ART(p.color, p.ink)}</div>
      <div style="flex:1;min-width:260px">
        <div class="inv-row"><label style="width:120px">Name</label><input id="pfName" value="${esc(p.name)}" placeholder="e.g. Sky Blue"></div>
        <div class="inv-row"><label style="width:120px">Ground colour</label><input type="color" id="pfColor" value="${esc(p.color || '#FF6A13')}" oninput="pfRedraw()"></div>
        <div class="inv-row"><label style="width:120px">Print colour</label><input type="color" id="pfInk" value="${esc(p.ink || '#FFFFFF')}" oninput="pfRedraw()"></div>
      </div>
    </div>
    <div class="inv-row"><label style="width:120px">Tagline</label><input id="pfTag" value="${esc(p.tagline)}" placeholder="A few words"></div>
    <div class="inv-row"><label style="width:120px">Description</label><textarea id="pfDesc" rows="3" style="flex:1">${esc(p.description)}</textarea></div>
    <div class="inv-row"><label style="width:120px">Price (Rs)</label><input type="number" id="pfPrice" value="${sz.price}"></div>
    <div class="inv-row"><label style="width:120px">Price ($)</label><input type="number" id="pfUsd" value="${sz.usd || ''}" placeholder="auto from Rs"></div>
    <div class="inv-row"><label style="width:120px">Stock</label><input type="number" id="pfStock" value="${p.stock}"></div>
    <div class="inv-row"><label style="width:120px">Order in shop</label><input type="number" id="pfSort" value="${p.sort || 0}"></div>
    <button class="btn-sm btn-save" style="margin-top:10px" onclick="submitProduct('${p.id || ''}')">💾 Save</button>`;
}
function pfRedraw() { document.getElementById('pfPreview').innerHTML = ART(document.getElementById('pfColor').value, document.getElementById('pfInk').value); }
function addProduct() { showModal(productForm(null)); }
async function editProductDetails(id) { const p = (await (await api('/products')).json()).find((x) => x.id === id); showModal(productForm(p)); }
async function submitProduct(id) {
  const v = (x) => document.getElementById(x).value;
  if (!v('pfName').trim()) { toast('Give the colour a name'); return; }
  const size = { label: '55 cm square', pieces: 1, price: parseInt(v('pfPrice'), 10) || 0 };
  if (parseInt(v('pfUsd'), 10) > 0) size.usd = parseInt(v('pfUsd'), 10);
  const data = { name: v('pfName').trim(), tagline: v('pfTag'), description: v('pfDesc'), color: v('pfColor'), ink: v('pfInk'),
    price: size.price, stock: v('pfStock'), sort: parseInt(v('pfSort'), 10) || 0, sizes: [size], featured: true };
  const res = id ? await api('/products/' + id, { method: 'PATCH', body: JSON.stringify(data) })
                 : await api('/products', { method: 'POST', body: JSON.stringify(data) });
  if (res.ok) { toast('Saved ✓ — it shows in the shop straight away'); closeModal(); loadInventory(); loadDashboard(); } else toast('Save failed');
}

/* ================= EXTRA ADMIN FUNCTIONS ================= */

// --- 1. Print / packing slip for an order ---
function printOrder(id){
  var o=ORDERS.find(function(x){return x.id===id;}); if(!o) return;
  var rows=o.items.map(function(i){return '<tr><td>'+i.qty+'× '+esc(i.name)+' bandana'+(i.size?' ('+esc(i.size)+')':'')+'</td><td style="text-align:right">'+MON(o,i.lineTotal)+'</td></tr>';}).join('');
  if(o.discount) rows+='<tr><td>Bundle deal</td><td style="text-align:right">−'+MON(o,o.discount)+'</td></tr>';
  var w=window.open('','_blank','width=620,height=760');
  w.document.write('<html><head><title>'+esc(o.id)+' — Fudgio</title><style>'
    +'body{font-family:Arial,sans-serif;padding:28px;color:#222}h1{margin:0 0 4px;font-size:22px}'
    +'.muted{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;margin:16px 0}'
    +'td{padding:7px 0;border-bottom:1px solid #eee}.tot td{font-weight:800;border-top:2px solid #333;border-bottom:none}'
    +'.box{border:1px solid #ddd;border-radius:8px;padding:14px;margin-top:14px}</style></head><body>'
    +'<h1>FUDGIO — Packing Slip</h1><div class="muted">Order '+esc(o.id)+' · '+esc(fmtDate(o.createdAt))+' · '+esc(o.status)+'</div>'
    +'<div class="box"><b>'+esc(o.customer.name)+'</b><br>'+esc(o.customer.phone)+(o.customer.email?'<br>'+esc(o.customer.email):'')
    +'<br>'+esc(o.customer.address)+', '+esc(o.customer.city)+(o.customer.postcode?' '+esc(o.customer.postcode):'')+', '+esc(o.customer.countryName||'Pakistan')+(o.customer.notes?'<br><i>Note: '+esc(o.customer.notes)+'</i>':'')+'</div>'
    +'<table>'+rows+'<tr><td>'+(o.currency==='USD'?'Shipping':'Delivery')+'</td><td style="text-align:right">'+(o.deliveryFee===0?'FREE':MON(o,o.deliveryFee))+'</td></tr>'
    +'<tr class="tot"><td>TOTAL ('+(o.currency==='USD'?'Prepaid':'Cash on Delivery — collect this')+')</td><td style="text-align:right">'+MON(o,o.total)+'</td></tr></table>'
    +'<p class="muted">Thank you for wearing Fudgio.</p></body></html>');
  w.document.close(); w.print();
}

// --- 2. Call / WhatsApp / email the customer directly ---
function contactCustomer(id, how){
  var o=ORDERS.find(function(x){return x.id===id;}); if(!o) return;
  var phone=(o.customer.phone||'').replace(/\D/g,'');
  if(how==='call') location.href='tel:'+phone;
  else if(how==='wa'){
    var msg='Hi '+o.customer.name+', this is Fudgio about your order '+o.id+' ('+MON(o,o.total)+(o.currency==='USD'?(o.status==='Awaiting Payment'?'). Here is your payment link: ':'). '):', cash on delivery). ');
    var wa=phone.replace(/^0/,'92');
    window.open('https://wa.me/'+wa+'?text='+encodeURIComponent(msg),'_blank');
  } else if(how==='mail' && o.customer.email){
    location.href='mailto:'+o.customer.email+'?subject='+encodeURIComponent('Your Fudgio order '+o.id);
  }
}

// --- 3. Bulk-advance all pending orders ---
async function bulkAdvance(){
  var pend=ORDERS.filter(function(o){return o.status==='Pending';});
  if(!pend.length){ toast('No pending orders'); return; }
  if(!confirm('Mark all '+pend.length+' Pending order(s) as Confirmed?')) return;
  for(const o of pend){ await api('/orders/'+o.id,{method:'PATCH',body:JSON.stringify({status:'Confirmed'})}); o.status='Confirmed'; }
  toast(pend.length+' order(s) confirmed'); renderOrders(); loadDashboard();
}

// --- 4. Restock all low/out-of-stock products at once ---
async function restockAll(){
  var qty=prompt('Restock every product to how many units?','50');
  if(!qty) return;
  var products=await (await api('/products')).json();
  for(const p of products){ await api('/products/'+p.id,{method:'PATCH',body:JSON.stringify({stock:parseInt(qty,10)||0})}); }
  toast('All products restocked to '+qty); loadInventory(); loadDashboard();
}

// --- 5. Customer detail: full order history for one buyer ---
async function customerDetail(id,name){
  var orders=await (await api('/users/'+id+'/orders')).json();
  var rows=orders.length?orders.map(function(o){
    return '<tr><td><b>'+esc(o.id)+'</b></td><td>'+fmtDate(o.createdAt)+'</td><td>'+MON(o,o.total)+'</td><td><span class="badge '+STATUS_CLASS[o.status]+'">'+esc(o.status)+'</span></td></tr>';
  }).join(''):'<tr><td colspan="4" class="muted">No orders.</td></tr>';
  var spend=orders.filter(function(o){return o.status!=='Cancelled' && o.currency!=='USD';}).reduce(function(s,o){return s+o.total;},0);
  showModal('<h3 style="font-size:1.3rem;margin-bottom:4px">'+esc(name)+'</h3>'
    +'<div class="muted" style="margin-bottom:14px">'+orders.length+' order(s) · '+RS(spend)+' lifetime</div>'
    +'<table style="width:100%;border-collapse:collapse">'+rows+'</table>');
}

// --- 6. Revenue report by period ---
async function revenueReport(){
  var orders=ORDERS.filter(function(o){return o.status!=='Cancelled' && o.status!=='Awaiting Payment';});
  var now=Date.now(), day=864e5, rate=280;
  try{ rate=(await (await api('/settings')).json()).usdRate||280; }catch(e){}
  function sum(days){ var c=now-days*day; return orders.filter(function(o){return o.createdAt>=c;}).reduce(function(s,o){return s+(o.currency==='USD'?o.total*rate:o.total);},0); }
  function cnt(days){ var c=now-days*day; return orders.filter(function(o){return o.createdAt>=c;}).length; }
  var rows=[['Today',1],['Last 7 days',7],['Last 30 days',30],['Last 90 days',90],['All time',36500]]
    .map(function(r){ return '<tr><td>'+r[0]+'</td><td style="text-align:right">'+cnt(r[1])+'</td><td style="text-align:right"><b>'+RS(sum(r[1]))+'</b></td></tr>'; }).join('');
  showModal('<h3 style="font-size:1.3rem;margin-bottom:14px">💰 Revenue report</h3>'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<tr><th style="text-align:left">Period</th><th style="text-align:right">Orders</th><th style="text-align:right">Revenue</th></tr>'
    +rows+'</table><p class="muted" style="margin-top:12px;font-size:.82rem">In rupees; dollar orders converted at Rs '+rate+'. Cancelled and unpaid orders excluded.</p>');
}

// --- 7. Export customers to CSV ---
async function exportCustomers(){
  var users=await (await api('/users')).json();
  var csv='Name,Phone,Email,City,Address,Orders,Total Spent\n'+users.map(function(u){
    return [u.name,u.phone,u.email,u.city,u.address,u.orders,u.totalSpent]
      .map(function(x){return '"'+String(x==null?'':x).replace(/"/g,'""')+'"';}).join(',');
  }).join('\n');
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='fudgio-customers.csv'; a.click();
  toast('Customers exported');
}

// --- 8. Packing list: every bandana to pack right now, by colour ---
function kitchenList(){
  var live=ORDERS.filter(function(o){return ['Pending','Confirmed'].indexOf(o.status)>=0;});
  var tally={}, colour={};
  live.forEach(function(o){ o.items.forEach(function(i){ tally[i.name]=(tally[i.name]||0)+i.qty*(i.pieces||1); colour[i.name]=i.color; }); });
  var keys=Object.keys(tally).sort();
  var rows=keys.length?keys.map(function(k){return '<tr><td style="padding:6px 0">'+SWATCH(colour[k])+' '+esc(k)+'</td><td style="text-align:right"><b>'+tally[k]+'</b></td></tr>';}).join('')
    :'<tr><td colspan="2" class="muted">Nothing to pack right now.</td></tr>';
  showModal('<h3 style="font-size:1.3rem;margin-bottom:4px">📦 Packing list</h3>'
    +'<div class="muted" style="margin-bottom:14px">'+live.length+' order(s) in Pending / Confirmed. Unpaid international orders are left out.</div>'
    +'<table style="width:100%;border-collapse:collapse">'+rows+'</table>');
}

// --- 9. Toggle store open/closed from anywhere ---
async function quickToggleStore(){
  var s=await (await api('/settings')).json();
  var next=!s.storeOpen;
  if(!confirm(next?'Open the store for orders?':'Close the store? Customers will not be able to order.')) return;
  await api('/settings',{method:'POST',body:JSON.stringify({storeOpen:next})});
  toast(next?'Store is now OPEN':'Store is now CLOSED');
  loadSettings();
}

// --- 10. Edit the site slogan / announcement ---
async function editSlogan(){
  var s=await (await api('/settings')).json();
  var v=prompt('Announcement shown at the top of every page (leave blank for the automatic delivery & deal message):', s.announcement||'');
  if(v===null) return;
  await api('/settings',{method:'POST',body:JSON.stringify({announcement:v})});
  toast('Announcement updated');
}

// --- Wire the new buttons into the UI once the app is shown ---
function ensureQuickBar(){
  if(document.getElementById('quickBar')) return;
  var top=document.querySelector('.topbar');
  if(!top) return;
  var bar=document.createElement('div');
  bar.id='quickBar'; bar.className='order-toolbar'; bar.style.marginBottom='18px';
  bar.innerHTML='<button class="refresh-btn" onclick="kitchenList()">📦 Packing list</button>'
    +'<button class="refresh-btn" onclick="revenueReport()">💰 Revenue report</button>'
    +'<button class="refresh-btn" onclick="bulkAdvance()">✅ Confirm all pending</button>'
    +'<button class="refresh-btn" onclick="restockAll()">📦 Restock all</button>'
    +'<button class="refresh-btn" onclick="exportCustomers()">⬇ Export customers</button>'
    +'<button class="refresh-btn" onclick="editSlogan()">📣 Announcement</button>'
    +'<button class="refresh-btn" onclick="quickToggleStore()">🏪 Open/Close store</button>';
  top.parentNode.insertBefore(bar, top.nextSibling);
}
