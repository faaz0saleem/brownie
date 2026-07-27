/* ===== Fudgio — Admin dashboard logic ===== */
let CUR = 'Rs';
const RS = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');
let TOKEN = localStorage.getItem('fud_admin_token') || '';
let STATUSES = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered', 'Cancelled'];

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
    const res = await fetch(API_BASE + '/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!res.ok) { err.textContent = 'Wrong password. Try again.'; return; }
    TOKEN = token; localStorage.setItem('fud_admin_token', token); showApp();
  } catch (e) { err.textContent = 'Network error.'; }
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
      <td><b>${u.name || '—'}</b></td>
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
