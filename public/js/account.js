/* ===== Fudgio — account (login / register / profile) ===== */
(function () {
  const CUR = (window.FUDGIO && window.FUDGIO.currency) || 'Rs';
  const m = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');
  const root = document.getElementById('accountRoot');

  window.switchTab = function (tab) {
    document.querySelectorAll('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('loginForm').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('authErr').textContent = '';
  };

  const err = (msg) => { const e = document.getElementById('authErr'); if (e) e.textContent = msg || ''; };

  window.doLogin = async function () {
    err('');
    const body = { email: v('liEmail'), password: v('liPass') };
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return err(data.error);
    renderProfile(data.user);
  };
  window.doRegister = async function () {
    err('');
    const body = { name: v('rgName'), email: v('rgEmail'), phone: v('rgPhone'), password: v('rgPass') };
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return err(data.error);
    renderProfile(data.user);
  };
  window.doLogout = async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/account';
  };
  window.saveProfile = async function () {
    const body = { name: v('pfName'), phone: v('pfPhone'), city: v('pfCity'), address: v('pfAddress') };
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const note = document.getElementById('profileSaved');
    if (res.ok) { note.textContent = 'Saved ✓'; note.style.color = 'var(--ok)'; if (window.CURRENT_USER) Object.assign(window.CURRENT_USER, data.user); }
    else { note.textContent = data.error || 'Error'; note.style.color = 'var(--bad)'; }
  };
  const v = (id) => (document.getElementById(id)?.value || '').trim();

  const statusClass = (s) => ({ Pending: 'b-pending', Confirmed: 'b-confirmed', Baking: 'b-baking', 'Out for Delivery': 'b-out', Delivered: 'b-delivered', Cancelled: 'b-cancelled' }[s] || 'b-pending');
  const STEPS = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered'];

  function orderCard(o) {
    const idx = STEPS.indexOf(o.status);
    const timeline = o.status === 'Cancelled'
      ? `<div class="tl-step" style="color:var(--bad)"><span class="dot"></span> Cancelled</div>`
      : `<div class="timeline">${STEPS.map((s, i) => `<div class="tl-step ${i <= idx ? 'done' : ''}"><span class="dot"></span>${s}</div>`).join('')}</div>`;
    return `<div class="order-card">
      <div class="order-card-head"><span class="oid">${o.id}</span><span class="badge ${statusClass(o.status)}">${o.status}</span></div>
      ${o.items.map((i) => `<div class="order-line"><span class="em">${i.emoji}</span> ${i.qty}× ${i.name}${i.size ? ` · ${i.size}` : ''}</div>`).join('')}
      <div class="order-total"><span>💵 COD · ${new Date(o.createdAt).toLocaleDateString()}</span><span>${m(o.total)}</span></div>
      ${timeline}
    </div>`;
  }

  async function renderProfile(user) {
    window.CURRENT_USER = user;
    const orders = await (await fetch('/api/my/orders')).json();
    const initials = (user.name || 'F').trim().charAt(0).toUpperCase();
    root.innerHTML = `
      <div class="profile-head">
        <div class="avatar">${user.avatarUrl ? `<img src="${user.avatarUrl}" alt="">` : initials}</div>
        <div>
          <h1>Hi, ${user.name.split(' ')[0]} 👋</h1>
          <p>${user.email || user.phone || ''}</p>
        </div>
        <button class="btn btn-ghost" style="margin-left:auto" onclick="doLogout()">Log out</button>
      </div>
      <div class="profile-stats">
        <div class="pstat"><div class="n">${user.orders || 0}</div><div class="t">Orders</div></div>
        <div class="pstat"><div class="n">${m(user.totalSpent || 0)}</div><div class="t">Lifetime spend</div></div>
        <div class="pstat"><div class="n">${orders.filter((o) => o.status === 'Delivered').length}</div><div class="t">Delivered</div></div>
      </div>
      <div class="card-panel" style="margin-bottom:26px">
        <h3 style="font-family:var(--display);margin-bottom:14px">Saved details</h3>
        <div class="form-row">
          <div class="form-group"><label>Name</label><input id="pfName" value="${user.name || ''}"></div>
          <div class="form-group"><label>Phone</label><input id="pfPhone" value="${user.phone || ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>City</label><input id="pfCity" value="${user.city || ''}"></div>
          <div class="form-group"><label>Address</label><input id="pfAddress" value="${user.address || ''}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">Save details</button>
        <span id="profileSaved" style="margin-left:12px;font-weight:600"></span>
      </div>
      <h3 style="font-family:var(--display);font-size:1.4rem;margin-bottom:16px">Your orders</h3>
      ${orders.length ? orders.map(orderCard).join('') : '<div class="cart-empty"><div class="em">🍫</div>No orders yet. <a href="/shop" style="color:var(--accent)">Start shopping</a></div>'}`;
  }

  // Auto-login: if a session exists, show the profile immediately.
  (async function init() {
    try {
      const res = await fetch('/api/me'); const data = await res.json();
      if (data.user) renderProfile(data.user);
    } catch { /* stay on login form */ }
    const params = new URLSearchParams(location.search);
    if (params.get('error') === 'oauth') err('Google sign-in failed. Please try again.');
  })();
})();
