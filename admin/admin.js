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
  customers: ['Customers', 'Your buyers and their locations']
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
async function loadOrders() {
  const orders = await (await api('/orders')).json();
  const body = document.getElementById('ordersBody');
  if (!orders.length) { body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="em">🧾</div>No orders yet. Share your shop link to get selling!</div></td></tr>`; return; }
  body.innerHTML = orders.map((o) => `
    <tr>
      <td class="mono"><b>${o.id}</b></td>
      <td><b>${o.customer.name}</b><br/><span class="muted">${o.customer.phone}</span></td>
      <td>${o.customer.city}<br/><span class="muted" style="font-size:.8rem">${o.customer.address}</span></td>
      <td class="order-items">${o.items.map((i) => `<span class="oi">${i.emoji} ${i.qty}× ${i.name}${i.size ? ` <span class="muted">(${i.size})</span>` : ''}</span>`).join('<br/>')}</td>
      <td class="mono"><b>${RS(o.total)}</b></td>
      <td><span class="pill-cod">💵 COD</span></td>
      <td class="muted" style="white-space:nowrap">${fmtDate(o.createdAt)}</td>
      <td>
        <span class="badge ${STATUS_CLASS[o.status]}" style="margin-bottom:6px;display:inline-flex">${o.status}</span><br/>
        <select class="status-select" onchange="setStatus('${o.id}', this.value)">
          ${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
}
async function setStatus(id, status) {
  await api('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
  toast(`Order ${id} → ${status}`);
  loadOrders(); loadDashboard(); loadInventory();
}

// ---------- Inventory ----------
function stockChip(stock) {
  if (stock === 0) return `<span class="stock-chip sc-out">Out of stock</span>`;
  if (stock <= 10) return `<span class="stock-chip sc-low">Low · ${stock}</span>`;
  return `<span class="stock-chip sc-in">${stock} in stock</span>`;
}
async function loadInventory() {
  const products = await (await api('/products')).json();
  document.getElementById('invGrid').innerHTML = products.map((p) => `
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
