/* ===== Fudgio — shared storefront logic ===== */
const CUR = (window.FUDGIO && window.FUDGIO.currency) || 'Rs';
const FREE_OVER = (window.FUDGIO && window.FUDGIO.freeDeliveryOver) || 2500;
const DELIVERY = (window.FUDGIO && window.FUDGIO.deliveryFee) || 150;
const money = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');

// ---------- cart ----------
function getCart() { try { return JSON.parse(localStorage.getItem('fud_cart') || '[]'); } catch { return []; } }
function setCart(cart) { localStorage.setItem('fud_cart', JSON.stringify(cart)); updateCartCount(); renderCart(); }
function cartQty() { return getCart().reduce((s, i) => s + i.qty, 0); }
function updateCartCount() { document.querySelectorAll('#cartCount').forEach((el) => (el.textContent = cartQty())); }

function addToCart(product, size, unitPrice, qty) {
  const cart = getCart();
  const key = product.id + '::' + (size || '');
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.qty += qty;
  else cart.push({ key, productId: product.id, name: product.name, emoji: product.emoji,
    gradient: product.gradient, imageUrl: product.imageUrl || null, size: size || '', price: unitPrice, qty });
  setCart(cart);
  showToast(`${qty} × ${product.name} added 🎉`);
}
function changeQty(key, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) return setCart(cart.filter((i) => i.key !== key));
  setCart(cart);
}
function removeItem(key) { setCart(getCart().filter((i) => i.key !== key)); }

// ---------- toast ----------
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- cart drawer ----------
function openCart() { renderCart(); document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); }
function closeCart() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
function artHtml(i, cls) {
  return i.imageUrl ? `<div class="${cls}" style="background:${i.gradient}"><img src="${i.imageUrl}" alt=""></div>`
    : `<div class="${cls}" style="background:${i.gradient}">${i.emoji}</div>`;
}
function renderCart() {
  const body = document.getElementById('cartBody'); const foot = document.getElementById('cartFoot');
  if (!body || !foot) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><div class="em">🛒</div>Your cart is empty.<br/>Go grab a brownie!</div>`;
    foot.innerHTML = ''; return;
  }
  body.innerHTML = cart.map((i) => `
    <div class="cart-item">
      ${artHtml(i, 'ci-art')}
      <div class="ci-info">
        <h5>${i.name}</h5>
        ${i.size ? `<div class="ci-flavor">${i.size}</div>` : ''}
        <div class="ci-controls">
          <button onclick="changeQty('${i.key}',-1)" aria-label="Less">−</button>
          <span>${i.qty}</span>
          <button onclick="changeQty('${i.key}',1)" aria-label="More">+</button>
          <button class="ci-remove" onclick="removeItem('${i.key}')">Remove</button>
        </div>
      </div>
      <div class="ci-price">${money(i.price * i.qty)}</div>
    </div>`).join('');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal >= FREE_OVER ? 0 : DELIVERY;
  foot.innerHTML = `
    <div class="cod-banner">💵 Cash on Delivery only</div>
    <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? 'FREE' : money(delivery)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(subtotal + delivery)}</span></div>
    <button class="btn btn-primary btn-block" onclick="openCheckout()">Checkout with COD →</button>`;
}

// ---------- checkout ----------
let CURRENT_USER = null;
function openCheckout() {
  const cart = getCart();
  if (!cart.length) return showToast('Your cart is empty 🛒');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal >= FREE_OVER ? 0 : DELIVERY;
  const u = CURRENT_USER || {};
  const inner = document.getElementById('checkoutInner');
  inner.innerHTML = `
    <h3>Checkout</h3>
    <div class="sub">${cartQty()} item(s) · Total <b style="color:var(--accent)">${money(subtotal + delivery)}</b></div>
    <div class="pay-method"><div class="ico">💵</div><div><b>Cash on Delivery</b><small>Pay in cash when your brownies arrive. No online payment.</small></div></div>
    <div class="form-error" id="formError"></div>
    <div class="form-group"><label>Full name *</label><input id="cName" value="${u.name || ''}" placeholder="e.g. Ayesha Khan" /></div>
    <div class="form-row">
      <div class="form-group"><label>Phone *</label><input id="cPhone" value="${u.phone || ''}" placeholder="03xx-xxxxxxx" /></div>
      <div class="form-group"><label>City *</label><input id="cCity" value="${u.city || ''}" placeholder="e.g. Karachi" /></div>
    </div>
    <div class="form-group"><label>Delivery address *</label><textarea id="cAddress" rows="2" placeholder="House #, street, area">${u.address || ''}</textarea></div>
    <div class="form-group"><label>Notes (optional)</label><input id="cNotes" placeholder="Landmark, delivery time, etc." /></div>
    <button class="btn btn-primary btn-block" id="placeBtn" onclick="placeOrder()">Place Order (COD) 🍫</button>`;
  document.getElementById('checkoutModal').classList.add('open');
  closeCart();
}
function closeCheckout() { document.getElementById('checkoutModal').classList.remove('open'); }

async function placeOrder() {
  const err = document.getElementById('formError'); const btn = document.getElementById('placeBtn');
  const customer = {
    name: val('cName'), phone: val('cPhone'), city: val('cCity'),
    address: val('cAddress'), notes: val('cNotes')
  };
  if (!customer.name || !customer.phone || !customer.city || !customer.address) {
    err.textContent = 'Please fill in name, phone, city and address.'; return;
  }
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Placing order…';
  const items = getCart().map((i) => ({ productId: i.productId, size: i.size, qty: i.qty }));
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, customer }) });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Something went wrong.'; btn.disabled = false; btn.textContent = 'Place Order (COD) 🍫'; return; }
    localStorage.removeItem('fud_cart'); updateCartCount();
    const o = data.order;
    document.getElementById('checkoutInner').innerHTML = `
      <div class="success">
        <div class="check">✓</div>
        <h3>Order placed! 🎉</h3>
        <div class="order-id">${o.id}</div>
        <p>Thanks, <b>${o.customer.name}</b>! Your brownies are being baked.<br/>
        You'll pay <b style="color:var(--accent)">${money(o.total)}</b> in cash on delivery to <b>${o.customer.city}</b>.</p>
        <div class="center" style="margin-top:22px">
          <a href="/track" class="btn btn-ghost">Track order</a>
          <button class="btn btn-primary" onclick="closeCheckout(); location.href='/shop'">Order more</button>
        </div>
      </div>`;
  } catch (e) {
    err.textContent = 'Network error. Please try again.'; btn.disabled = false; btn.textContent = 'Place Order (COD) 🍫';
  }
}
const val = (id) => (document.getElementById(id)?.value || '').trim();

// ---------- nav + account state ----------
function toggleMobileNav() { document.getElementById('mobileNav').classList.toggle('open'); }
async function loadUser() {
  try {
    const res = await fetch('/api/me'); const data = await res.json();
    CURRENT_USER = data.user;
    const label = document.getElementById('accLabel');
    if (label && CURRENT_USER) label.textContent = CURRENT_USER.name.split(' ')[0];
  } catch { /* ignore */ }
}

// ---------- contact (client-side acknowledgement) ----------
function submitContact() {
  const name = val('cfName'), email = val('cfEmail'), body = val('cfBody');
  const msg = document.getElementById('contactMsg');
  if (!name || !email || !body) { msg.style.color = 'var(--bad)'; msg.textContent = 'Please fill in all fields.'; return; }
  msg.style.color = 'var(--ok)';
  msg.textContent = 'Thanks! Your message has been noted — we\'ll reply by email shortly.';
  document.getElementById('cfName').value = ''; document.getElementById('cfEmail').value = ''; document.getElementById('cfBody').value = '';
}

document.addEventListener('click', (e) => { if (e.target.id === 'checkoutModal') closeCheckout(); });

// ---------- init ----------
updateCartCount(); renderCart(); loadUser();
