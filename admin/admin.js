/* ===== Fudgio — Admin dashboard logic ===== */
let CUR = 'Rs';
const RS = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');
let TOKEN = localStorage.getItem('fud_admin_token') || '';
let STATUSES = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered', 'Cancelled'];
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
  settings: ['Settings', 'Delivery, store availability & more']
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
    { ico: '💰', label: 'Revenue', value: RS(t.revenue), foot: `${t.activeOrders} active orders` },
    { ico: '🧾', label: 'Total orders', value: t.orders, foot: `${t.pendingOrders} in progress · ${t.deliveredOrders} delivered` },
    { ico: '🍫', label: 'Brownies sold', value: t.unitsSold, foot: 'boxes delivered/pending' },
    { ico: '👥', label: 'Customers', value: t.customers, foot: 'unique buyers' },
    { ico: '📊', label: 'Avg order value', value: RS(t.avgOrderValue), foot: 'per order' },
    { ico: '📦', label: 'Out of stock', value: t.outOfStock, foot: `${t.products} active products` }
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map((k) => `
    <div class="kpi"><span class="ico">${k.ico}</span><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="foot">${k.foot}</div></div>`).join('');

  const alertEl = document.getElementById('lowStockAlert');
  alertEl.innerHTML = a.lowStock.length
    ? `<div class="alert-strip">⚠️ Low / out of stock: ${a.lowStock.map((p) => `${p.emoji} ${p.name} (${p.stock})`).join(' · ')}</div>` : '';

  const maxRev = Math.max(1, ...a.salesByDay.map((d) => d.revenue));
  document.getElementById('salesChart').innerHTML = a.salesByDay.map((d) => `
    <div class="bar-col"><div class="bar-val">${d.revenue ? RS(d.revenue) : ''}</div>
      <div class="bar" style="height:${(d.revenue / maxRev) * 100}%" title="${d.label}: ${RS(d.revenue)} (${d.orders} orders)"></div>
      <div class="bar-label">${d.label}</div></div>`).join('');

  const maxUnits = Math.max(1, ...a.topProducts.map((p) => p.units));
  document.getElementById('topProducts').innerHTML = a.topProducts.length ? a.topProducts.map((p) => `
    <div class="rank-item"><div class="r-emoji">${p.emoji}</div><div class="r-body">
      <div class="r-name"><span>${p.name}</span><span>${p.units} sold</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(p.units / maxUnits) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">🍫</div>No sales yet.</div>';

  const maxCity = Math.max(1, ...a.cityBreakdown.map((c) => c.count));
  document.getElementById('cityBreakdown').innerHTML = a.cityBreakdown.length ? a.cityBreakdown.map((c) => `
    <div class="rank-item"><div class="r-emoji">📍</div><div class="r-body">
      <div class="r-name"><span>${c.city}</span><span>${c.count} order(s)</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(c.count / maxCity) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">📍</div>No orders yet.</div>';

  const statusEmoji = { Pending: '🕒', Confirmed: '✅', Baking: '👩‍🍳', 'Out for Delivery': '🚚', Delivered: '📦', Cancelled: '❌' };
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
      <div class="r-name"><span>${p.page}</span><span>${p.views}</span></div>
      <div class="r-track"><div class="r-fill" style="width:${(p.views / maxP) * 100}%"></div></div></div></div>`).join('')
    : '<div class="empty-state"><div class="em">👀</div>No visits recorded yet.</div>';
}

// ---------- Orders ----------
const STATUS_CLASS = { Pending: 'b-pending', Confirmed: 'b-confirmed', Baking: 'b-confirmed', 'Out for Delivery': 'b-out', Delivered: 'b-delivered', Cancelled: 'b-cancelled' };
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
      <td class="mono"><b>${o.id}</b></td>
      <td><b>${o.customer.name}</b><br/><span class="muted">${o.customer.phone}</span>${o.customer.email ? `<br/><span class="muted" style="font-size:.76rem">${o.customer.email}</span>` : ''}</td>
      <td>${o.customer.city}<br/><span class="muted" style="font-size:.8rem">${o.customer.address}</span></td>
      <td class="order-items">${o.items.map((i) => `<span class="oi">${i.emoji} ${i.qty}× ${i.name}${i.size ? ` <span class="muted">(${i.size})</span>` : ''}</span>`).join('<br/>')}</td>
      <td class="mono"><b>${RS(o.total)}</b></td>
      <td><span class="pill-cod">💵 COD</span></td>
      <td class="muted" style="white-space:nowrap">${fmtDate(o.createdAt)}</td>
      <td>
        <span class="badge ${STATUS_CLASS[o.status]}" style="margin-bottom:6px;display:inline-flex">${o.status}</span><br/>
        <select class="status-select" onchange="setStatus('${o.id}', this.value)">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="mini" onclick="orderDetail('${o.id}')">Details</button>
          <button class="mini" onclick="printOrder('${o.id}')" title="Print packing slip">🖨</button>
          <button class="mini" onclick="contactCustomer('${o.id}','wa')" title="WhatsApp customer">💬</button>
          <button class="mini" onclick="contactCustomer('${o.id}','call')" title="Call customer">📞</button>
          <button class="mini danger" onclick="deleteOrder('${o.id}')">Delete</button>
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
  const steps = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered'];
  const idx = steps.indexOf(o.status);
  const tl = o.status === 'Cancelled' ? '<div style="color:var(--bad);font-weight:700">✖ Cancelled</div>'
    : steps.map((s, i) => `<div style="color:${i <= idx ? 'var(--ok)' : 'var(--dim)'};font-weight:600">${i <= idx ? '●' : '○'} ${s}</div>`).join('');
  showModal(`<h3 style="font-size:1.3rem;margin-bottom:6px">${o.id}</h3>
    <span class="badge ${STATUS_CLASS[o.status]}">${o.status}</span>
    <p style="margin:12px 0"><b>${o.customer.name}</b> · ${o.customer.phone}${o.customer.email ? ' · ' + o.customer.email : ''}<br>📍 ${o.customer.address}, ${o.customer.city}${o.customer.notes ? '<br><i>Note: ' + o.customer.notes + '</i>' : ''}</p>
    <table style="width:100%;border-collapse:collapse">${o.items.map((i) => `<tr><td style="padding:6px 0">${i.emoji} ${i.qty}× ${i.name}${i.size ? ' (' + i.size + ')' : ''}</td><td style="text-align:right">${RS(i.lineTotal)}</td></tr>`).join('')}
      <tr><td style="padding:8px 0;border-top:1px solid var(--line);font-weight:800">Total</td><td style="text-align:right;border-top:1px solid var(--line);font-weight:800">${RS(o.total)} (COD)</td></tr></table>
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
  const products = await (await api('/products')).json();
  const grid = document.getElementById('invGrid');
  const addBar = document.getElementById('invAddBar');
  if (!addBar) {
    const bar = document.createElement('div'); bar.id = 'invAddBar'; bar.style.marginBottom = '16px';
    bar.innerHTML = '<button class="btn-sm btn-save" style="max-width:180px" onclick="addProduct()">➕ Add new product</button>';
    grid.parentNode.insertBefore(bar, grid);
  }
  grid.innerHTML = products.map((p) => `
    <div class="inv-card">
      <div class="inv-top" style="background:${p.gradient}">
        ${!p.active ? '<span class="inactive-flag">Hidden</span>' : ''}
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="inv-img">` : `<span class="inv-emoji">${p.emoji}</span>`}
      </div>
      <div class="inv-body">
        <h4>${p.name} ${stockChip(p.stock)}</h4>
        <div class="inv-meta">${p.containsNuts ? '🥜 Contains nuts · ' : ''}${(p.allergens || []).join(', ') || '—'}</div>
        <div class="inv-stats">
          <div><div class="n">${p.sold || 0}</div><div class="t">Sold</div></div>
          <div><div class="n">${p.stock}</div><div class="t">In stock</div></div>
          <div><div class="n">${RS((p.sold || 0) * p.price).replace(CUR + ' ', '')}</div><div class="t">Revenue</div></div>
        </div>
        <div class="inv-row"><label>Price</label><input type="number" id="price-${p.id}" value="${p.price}" /></div>
        <div class="inv-row"><label>Stock</label><input type="number" id="stock-${p.id}" value="${p.stock}" /></div>
        <div class="inv-actions">
          <button class="btn-sm btn-save" onclick="saveProduct('${p.id}')">💾 Save</button>
          <button class="btn-sm btn-toggle" onclick="editProductDetails('${p.id}')">✏️ Edit</button>
          <button class="btn-sm btn-toggle" onclick="toggleActive('${p.id}', ${p.active})">${p.active ? '🚫 Hide' : '✅ Show'}</button>
        </div>
        <div class="inv-actions" style="margin-top:8px">
          <label class="btn-sm btn-toggle upload-label">📷 ${p.imageUrl ? 'Replace' : 'Add'} image
            <input type="file" accept="image/*" style="display:none" onchange="uploadImage('${p.id}', this)">
          </label>
          ${p.imageUrl ? `<button class="btn-sm btn-toggle" onclick="removeImage('${p.id}')">🗑 Remove</button>` : `<button class="btn-sm btn-toggle" onclick="markOutOfStock('${p.id}')">Out of stock</button>`}
        </div>
      </div>
    </div>`).join('');
}
async function saveProduct(id) {
  const price = document.getElementById('price-' + id).value;
  const stock = document.getElementById('stock-' + id).value;
  await api('/products/' + id, { method: 'PATCH', body: JSON.stringify({ price, stock }) });
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
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---------- Customers ----------
async function loadCustomers() {
  const users = await (await api('/users')).json();
  const body = document.getElementById('customersBody');
  if (!users.length) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="em">👥</div>No customers yet.</div></td></tr>`; return; }
  body.innerHTML = users.map((u) => `
    <tr>
      <td><b><a href="#" onclick="customerDetail('${u.id}','${(u.name||'').replace(/'/g,'')}');return false" style="color:var(--brand)">${u.name || '—'}</a></b></td>
      <td class="mono">${u.phone || ''}${u.email ? `<br/><span class="muted" style="font-size:.8rem">${u.email}</span>` : ''}</td>
      <td>${u.city ? '📍 ' + u.city : '<span class="muted">—</span>'}</td>
      <td class="muted" style="max-width:240px">${u.address || '—'}</td>
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
  el.innerHTML = `
    <div class="panel" style="max-width:560px">
      <h3>🏪 Store settings</h3>
      <div class="inv-row"><label style="width:170px">Delivery fee (${CUR})</label><input type="number" id="setFee" value="${s.deliveryFee}"></div>
      <div class="inv-row"><label style="width:170px">Free delivery over (${CUR})</label><input type="number" id="setFree" value="${s.freeDeliveryOver}"></div>
      <div class="inv-row"><label style="width:170px">Store open for orders</label>
        <select id="setOpen"><option value="1" ${s.storeOpen ? 'selected' : ''}>Open</option><option value="0" ${!s.storeOpen ? 'selected' : ''}>Closed</option></select></div>
      <div class="inv-row"><label style="width:170px">Announcement</label><input id="setAnn" value="${(s.announcement || '').replace(/"/g, '&quot;')}" placeholder="Optional banner text"></div>
      <button class="btn-sm btn-save" style="margin-top:10px" onclick="saveSettings()">💾 Save settings</button>
    </div>`;
}
async function saveSettings() {
  const body = { deliveryFee: document.getElementById('setFee').value, freeDeliveryOver: document.getElementById('setFree').value,
    storeOpen: document.getElementById('setOpen').value === '1', announcement: document.getElementById('setAnn').value };
  const res = await api('/settings', { method: 'POST', body: JSON.stringify(body) });
  toast(res.ok ? 'Settings saved ✓' : 'Save failed');
}

// ---------- Product add / full edit ----------
function productForm(p) {
  p = p || { name: '', tagline: '', description: '', price: 900, stock: 30, emoji: '🍫', gradient: 'linear-gradient(135deg,#5b3a29,#2b1a12)', flavors: [], allergens: [], sizes: [], containsNuts: false, featured: false };
  const sizes = (p.sizes && p.sizes.length ? p.sizes : [{ label: 'Box of 6', price: p.price }]).map((s) => `${s.label}:${s.price}`).join(', ');
  return `<h3 style="font-size:1.3rem;margin-bottom:14px">${p.id ? 'Edit' : 'Add'} product</h3>
    <div class="inv-row"><label style="width:120px">Name</label><input id="pfName" value="${(p.name || '').replace(/"/g, '&quot;')}"></div>
    <div class="inv-row"><label style="width:120px">Tagline</label><input id="pfTag" value="${(p.tagline || '').replace(/"/g, '&quot;')}"></div>
    <div class="inv-row"><label style="width:120px">Description</label><input id="pfDesc" value="${(p.description || '').replace(/"/g, '&quot;')}"></div>
    <div class="inv-row"><label style="width:120px">Emoji</label><input id="pfEmoji" value="${p.emoji || '🍫'}" style="max-width:90px"></div>
    <div class="inv-row"><label style="width:120px">Base price</label><input type="number" id="pfPrice" value="${p.price}"></div>
    <div class="inv-row"><label style="width:120px">Stock</label><input type="number" id="pfStock" value="${p.stock}"></div>
    <div class="inv-row"><label style="width:120px">Sizes</label><input id="pfSizes" value="${sizes}" placeholder="Box of 6:900, Box of 12:1650"></div>
    <div class="inv-row"><label style="width:120px">Flavours</label><input id="pfFlav" value="${(p.flavors || []).join(', ')}"></div>
    <div class="inv-row"><label style="width:120px">Allergens</label><input id="pfAll" value="${(p.allergens || []).join(', ')}"></div>
    <div class="inv-row"><label style="width:120px">Contains nuts</label><select id="pfNuts"><option value="0" ${!p.containsNuts ? 'selected' : ''}>No</option><option value="1" ${p.containsNuts ? 'selected' : ''}>Yes</option></select></div>
    <div class="inv-row"><label style="width:120px">Featured</label><select id="pfFeat"><option value="0" ${!p.featured ? 'selected' : ''}>No</option><option value="1" ${p.featured ? 'selected' : ''}>Yes</option></select></div>
    <button class="btn-sm btn-save" style="margin-top:10px" onclick="submitProduct('${p.id || ''}')">💾 Save</button>`;
}
function parseSizes(str) {
  return str.split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const idx = pair.lastIndexOf(':'); return { label: pair.slice(0, idx).trim() || 'Box', price: parseInt(pair.slice(idx + 1), 10) || 0 };
  });
}
function addProduct() { showModal(productForm(null)); }
async function editProductDetails(id) { const p = (await (await api('/products')).json()).find((x) => x.id === id); showModal(productForm(p)); }
async function submitProduct(id) {
  const v = (x) => document.getElementById(x).value;
  const data = { name: v('pfName'), tagline: v('pfTag'), description: v('pfDesc'), emoji: v('pfEmoji'),
    price: v('pfPrice'), stock: v('pfStock'), sizes: parseSizes(v('pfSizes')),
    flavors: v('pfFlav').split(',').map((s) => s.trim()).filter(Boolean),
    allergens: v('pfAll').split(',').map((s) => s.trim()).filter(Boolean),
    containsNuts: v('pfNuts') === '1', featured: v('pfFeat') === '1' };
  const res = id ? await api('/products/' + id, { method: 'PATCH', body: JSON.stringify(data) })
                 : await api('/products', { method: 'POST', body: JSON.stringify(data) });
  if (res.ok) { toast('Product saved ✓'); closeModal(); loadInventory(); loadDashboard(); } else toast('Save failed');
}

/* ================= EXTRA ADMIN FUNCTIONS ================= */

// --- 1. Print / packing slip for an order ---
function printOrder(id){
  var o=ORDERS.find(function(x){return x.id===id;}); if(!o) return;
  var rows=o.items.map(function(i){return '<tr><td>'+i.qty+'× '+i.name+(i.size?' ('+i.size+')':'')+'</td><td style="text-align:right">'+RS(i.lineTotal)+'</td></tr>';}).join('');
  var w=window.open('','_blank','width=620,height=760');
  w.document.write('<html><head><title>'+o.id+' — Fudgio</title><style>'
    +'body{font-family:Arial,sans-serif;padding:28px;color:#222}h1{margin:0 0 4px;font-size:22px}'
    +'.muted{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;margin:16px 0}'
    +'td{padding:7px 0;border-bottom:1px solid #eee}.tot td{font-weight:800;border-top:2px solid #333;border-bottom:none}'
    +'.box{border:1px solid #ddd;border-radius:8px;padding:14px;margin-top:14px}</style></head><body>'
    +'<h1>🍫 Fudgio — Packing Slip</h1><div class="muted">Order '+o.id+' · '+fmtDate(o.createdAt)+' · '+o.status+'</div>'
    +'<div class="box"><b>'+o.customer.name+'</b><br>'+o.customer.phone+(o.customer.email?'<br>'+o.customer.email:'')
    +'<br>'+o.customer.address+', '+o.customer.city+(o.customer.notes?'<br><i>Note: '+o.customer.notes+'</i>':'')+'</div>'
    +'<table>'+rows+'<tr><td>Delivery</td><td style="text-align:right">'+(o.deliveryFee===0?'FREE':RS(o.deliveryFee))+'</td></tr>'
    +'<tr class="tot"><td>TOTAL (Cash on Delivery)</td><td style="text-align:right">'+RS(o.total)+'</td></tr></table>'
    +'<p class="muted">Thank you for ordering from Fudgio 💛</p></body></html>');
  w.document.close(); w.print();
}

// --- 2. Call / WhatsApp / email the customer directly ---
function contactCustomer(id, how){
  var o=ORDERS.find(function(x){return x.id===id;}); if(!o) return;
  var phone=(o.customer.phone||'').replace(/\D/g,'');
  if(how==='call') location.href='tel:'+phone;
  else if(how==='wa'){
    var msg='Hi '+o.customer.name+', this is Fudgio about your order '+o.id+' ('+RS(o.total)+', Cash on Delivery). ';
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
    return '<tr><td><b>'+o.id+'</b></td><td>'+fmtDate(o.createdAt)+'</td><td>'+RS(o.total)+'</td><td><span class="badge '+STATUS_CLASS[o.status]+'">'+o.status+'</span></td></tr>';
  }).join(''):'<tr><td colspan="4" class="muted">No orders.</td></tr>';
  var spend=orders.filter(function(o){return o.status!=='Cancelled';}).reduce(function(s,o){return s+o.total;},0);
  showModal('<h3 style="font-size:1.3rem;margin-bottom:4px">'+name+'</h3>'
    +'<div class="muted" style="margin-bottom:14px">'+orders.length+' order(s) · '+RS(spend)+' lifetime</div>'
    +'<table style="width:100%;border-collapse:collapse">'+rows+'</table>');
}

// --- 6. Revenue report by period ---
async function revenueReport(){
  var orders=ORDERS.filter(function(o){return o.status!=='Cancelled';});
  var now=Date.now(), day=864e5;
  function sum(days){ var c=now-days*day; return orders.filter(function(o){return o.createdAt>=c;}).reduce(function(s,o){return s+o.total;},0); }
  function cnt(days){ var c=now-days*day; return orders.filter(function(o){return o.createdAt>=c;}).length; }
  var rows=[['Today',1],['Last 7 days',7],['Last 30 days',30],['Last 90 days',90],['All time',36500]]
    .map(function(r){ return '<tr><td>'+r[0]+'</td><td style="text-align:right">'+cnt(r[1])+'</td><td style="text-align:right"><b>'+RS(sum(r[1]))+'</b></td></tr>'; }).join('');
  showModal('<h3 style="font-size:1.3rem;margin-bottom:14px">💰 Revenue report</h3>'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<tr><th style="text-align:left">Period</th><th style="text-align:right">Orders</th><th style="text-align:right">Revenue</th></tr>'
    +rows+'</table><p class="muted" style="margin-top:12px;font-size:.82rem">Cancelled orders excluded.</p>');
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

// --- 8. Today's kitchen list (what to bake) ---
function kitchenList(){
  var todayStart=new Date(); todayStart.setHours(0,0,0,0);
  var live=ORDERS.filter(function(o){return ['Pending','Confirmed','Baking'].indexOf(o.status)>=0;});
  var tally={};
  live.forEach(function(o){ o.items.forEach(function(i){
    var k=i.name+(i.size?' — '+i.size:''); tally[k]=(tally[k]||0)+i.qty; }); });
  var keys=Object.keys(tally).sort();
  var rows=keys.length?keys.map(function(k){return '<tr><td>'+k+'</td><td style="text-align:right"><b>'+tally[k]+'</b></td></tr>';}).join('')
    :'<tr><td colspan="2" class="muted">Nothing to bake right now.</td></tr>';
  showModal('<h3 style="font-size:1.3rem;margin-bottom:4px">👩‍🍳 Kitchen list</h3>'
    +'<div class="muted" style="margin-bottom:14px">Everything in Pending / Confirmed / Baking</div>'
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
  var v=prompt('Slogan shown at the top of every page (leave blank for the default):', s.announcement||'');
  if(v===null) return;
  await api('/settings',{method:'POST',body:JSON.stringify({announcement:v})});
  toast('Slogan updated');
}

// --- Wire the new buttons into the UI once the app is shown ---
function ensureQuickBar(){
  if(document.getElementById('quickBar')) return;
  var top=document.querySelector('.topbar');
  if(!top) return;
  var bar=document.createElement('div');
  bar.id='quickBar'; bar.className='order-toolbar'; bar.style.marginBottom='18px';
  bar.innerHTML='<button class="refresh-btn" onclick="kitchenList()">👩‍🍳 Kitchen list</button>'
    +'<button class="refresh-btn" onclick="revenueReport()">💰 Revenue report</button>'
    +'<button class="refresh-btn" onclick="bulkAdvance()">✅ Confirm all pending</button>'
    +'<button class="refresh-btn" onclick="restockAll()">📦 Restock all</button>'
    +'<button class="refresh-btn" onclick="exportCustomers()">⬇ Export customers</button>'
    +'<button class="refresh-btn" onclick="editSlogan()">📣 Edit slogan</button>'
    +'<button class="refresh-btn" onclick="quickToggleStore()">🏪 Open/Close store</button>';
  top.parentNode.insertBefore(bar, top.nextSibling);
}
