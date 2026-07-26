/* ===== Brownie Bliss — shop front-end logic ===== */
const RS = (n) => 'Rs ' + Number(n).toLocaleString('en-PK');
const DELIVERY_FREE_OVER = 2000;
const DELIVERY_FEE = 150;

// ---------- Cart (localStorage) ----------
function getCart() {
  try { return JSON.parse(localStorage.getItem('bb_cart') || '[]'); }
  catch { return []; }
}
function setCart(cart) {
  localStorage.setItem('bb_cart', JSON.stringify(cart));
  updateCartCount();
  renderCart();
}
function cartQty() { return getCart().reduce((s, i) => s + i.qty, 0); }
function updateCartCount() {
  document.querySelectorAll('#cartCount').forEach((el) => (el.textContent = cartQty()));
}
function addToCart(product, flavor, qty) {
  const cart = getCart();
  const key = product.id + '::' + flavor;
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.qty += qty;
  else cart.push({ key, productId: product.id, name: product.name, emoji: product.emoji, gradient: product.gradient, flavor, price: product.price, qty });
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

// ---------- Toast ----------
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Cart drawer ----------
function openCart() {
  renderCart();
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeCart() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}
function renderCart() {
  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  if (!body || !foot) return;
  const cart = getCart();
  if (cart.length === 0) {
    body.innerHTML = `<div class="cart-empty"><div class="em">🛒</div>Your cart is empty.<br/>Go grab a brownie!</div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = cart.map((i) => `
    <div class="cart-item">
      <div class="ci-art" style="background:${i.gradient}">${i.emoji}</div>
      <div class="ci-info">
        <h5>${i.name}</h5>
        <div class="ci-flavor">${i.flavor}</div>
        <div class="ci-controls">
          <button onclick="changeQty('${i.key}',-1)">−</button>
          <span>${i.qty}</span>
          <button onclick="changeQty('${i.key}',1)">+</button>
          <button class="ci-remove" onclick="removeItem('${i.key}')">Remove</button>
        </div>
      </div>
      <div class="ci-price">${RS(i.price * i.qty)}</div>
    </div>`).join('');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal >= DELIVERY_FREE_OVER ? 0 : DELIVERY_FEE;
  foot.innerHTML = `
    <div class="cod-banner">💵 Cash on Delivery only</div>
    <div class="summary-row"><span>Subtotal</span><span>${RS(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? 'FREE' : RS(delivery)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${RS(subtotal + delivery)}</span></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="openCheckout()">Checkout with COD →</button>`;
}

// ---------- Product grid (home) ----------
function stockTag(stock) {
  if (stock === 0) return `<span class="stock-tag out">Sold out</span>`;
  if (stock <= 10) return `<span class="stock-tag low">Only ${stock} left</span>`;
  return `<span class="stock-tag in">In stock</span>`;
}
async function loadProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    grid.innerHTML = products.map((p) => `
      <div class="card">
        <a href="/product/${p.id}" class="card-art" style="background:${p.gradient}">
          ${p.featured ? '<span class="fav">★ Popular</span>' : ''}
          ${stockTag(p.stock)}
          <span>${p.emoji}</span>
        </a>
        <div class="card-body">
          <h3>${p.name}</h3>
          <div class="tagline">${p.tagline || ''}</div>
          <div class="card-flavors">${p.flavors.slice(0, 3).map((f) => `<span class="flavor-pill">${f}</span>`).join('')}</div>
          <div class="card-foot">
            <div class="price">${RS(p.price)} <small>/ box</small></div>
            <a href="/product/${p.id}" class="card-btn">Choose →</a>
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    grid.innerHTML = `<div class="cart-empty">Couldn't load brownies. Is the server running?</div>`;
  }
}

// ---------- Product detail page ----------
async function renderProductPage() {
  const root = document.getElementById('pdRoot');
  const id = location.pathname.split('/').pop();
  try {
    const res = await fetch('/api/products/' + id);
    if (!res.ok) throw new Error('not found');
    const p = await res.json();
    document.title = `${p.name} — Brownie Bliss`;
    let flavor = p.flavors[0];
    let qty = 1;
    const maxNote = p.stock === 0
      ? `<div class="stock-note out">😔 Currently sold out</div>`
      : p.stock <= 10
        ? `<div class="stock-note low">🔥 Hurry — only ${p.stock} left in stock</div>`
        : `<div class="stock-note in">✅ In stock &amp; baked fresh</div>`;

    root.innerHTML = `
      <div class="pd">
        <div class="pd-art" style="background:${p.gradient}">${p.emoji}</div>
        <div class="pd-info">
          <h1>${p.name}</h1>
          <div class="tagline">${p.tagline || ''}</div>
          <div class="desc">${p.description || ''}</div>
          <div class="pd-price">${RS(p.price)} <small style="font-size:.9rem;color:var(--cream-dim);font-family:var(--font)">per box</small></div>
          ${maxNote}
          <div class="field-label">Choose your flavour</div>
          <div class="flavor-choices" id="flavorChoices">
            ${p.flavors.map((f, idx) => `<div class="flavor-choice ${idx === 0 ? 'active' : ''}" data-flavor="${f}">${f}</div>`).join('')}
          </div>
          <div class="field-label">Quantity</div>
          <div class="qty-row">
            <div class="qty-stepper">
              <button id="qtyMinus">−</button>
              <input id="qtyInput" value="1" inputmode="numeric" />
              <button id="qtyPlus">+</button>
            </div>
            <div style="color:var(--cream-dim);font-size:.9rem">boxes</div>
          </div>
          <div class="pd-actions">
            <button class="btn btn-primary" id="addBtn" ${p.stock === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
              🛒 Add to cart · <span id="btnTotal">${RS(p.price)}</span>
            </button>
            <button class="btn btn-ghost" onclick="openCart()">View cart</button>
          </div>
          <div class="cod-banner" style="margin-top:22px">💵 Cash on Delivery only — pay when it arrives</div>
        </div>
      </div>`;

    const flavorEls = root.querySelectorAll('.flavor-choice');
    flavorEls.forEach((el) => el.addEventListener('click', () => {
      flavorEls.forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
      flavor = el.dataset.flavor;
    }));

    const input = root.querySelector('#qtyInput');
    const btnTotal = root.querySelector('#btnTotal');
    const syncTotal = () => { btnTotal.textContent = RS(p.price * qty); };
    const clamp = (v) => Math.max(1, Math.min(p.stock || 1, v));
    root.querySelector('#qtyMinus').addEventListener('click', () => { qty = clamp(qty - 1); input.value = qty; syncTotal(); });
    root.querySelector('#qtyPlus').addEventListener('click', () => { qty = clamp(qty + 1); input.value = qty; syncTotal(); });
    input.addEventListener('input', () => { qty = clamp(parseInt(input.value, 10) || 1); input.value = qty; syncTotal(); });

    const addBtn = root.querySelector('#addBtn');
    if (p.stock > 0) addBtn.addEventListener('click', () => addToCart(p, flavor, qty));
  } catch (e) {
    root.innerHTML = `<div class="cart-empty"><div class="em">🤔</div>Brownie not found. <a href="/#menu" style="color:var(--accent)">Back to menu</a></div>`;
  }
}

// ---------- Checkout ----------
function openCheckout() {
  const cart = getCart();
  if (cart.length === 0) return showToast('Your cart is empty 🛒');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal >= DELIVERY_FREE_OVER ? 0 : DELIVERY_FEE;
  const inner = document.getElementById('checkoutInner');
  inner.innerHTML = `
    <h3>Checkout</h3>
    <div class="sub">${cartQty()} item(s) · Total <b style="color:var(--accent)">${RS(subtotal + delivery)}</b></div>
    <div class="pay-method">
      <div class="ico">💵</div>
      <div><b>Cash on Delivery</b><small>Pay in cash when your brownies arrive. No online payment.</small></div>
    </div>
    <div class="form-error" id="formError"></div>
    <div class="form-group"><label>Full name *</label><input id="cName" placeholder="e.g. Ayesha Khan" /></div>
    <div class="form-row">
      <div class="form-group"><label>Phone *</label><input id="cPhone" placeholder="03xx-xxxxxxx" /></div>
      <div class="form-group"><label>City *</label><input id="cCity" placeholder="e.g. Karachi" /></div>
    </div>
    <div class="form-group"><label>Delivery address *</label><textarea id="cAddress" rows="2" placeholder="House #, street, area"></textarea></div>
    <div class="form-group"><label>Notes (optional)</label><input id="cNotes" placeholder="Landmark, delivery time, etc." /></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" id="placeBtn">Place Order (COD) 🍫</button>`;
  document.getElementById('checkoutModal').classList.add('open');
  closeCart();
  inner.querySelector('#placeBtn').addEventListener('click', placeOrder);
}
function closeCheckout() { document.getElementById('checkoutModal').classList.remove('open'); }

async function placeOrder() {
  const err = document.getElementById('formError');
  const btn = document.getElementById('placeBtn');
  const customer = {
    name: document.getElementById('cName').value.trim(),
    phone: document.getElementById('cPhone').value.trim(),
    city: document.getElementById('cCity').value.trim(),
    address: document.getElementById('cAddress').value.trim(),
    notes: document.getElementById('cNotes').value.trim()
  };
  if (!customer.name || !customer.phone || !customer.city || !customer.address) {
    err.textContent = 'Please fill in name, phone, city and address.';
    return;
  }
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Placing order…';
  const items = getCart().map((i) => ({ productId: i.productId, flavor: i.flavor, qty: i.qty }));
  try {
    const res = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customer })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Something went wrong.'; btn.disabled = false; btn.textContent = 'Place Order (COD) 🍫'; return; }
    localStorage.removeItem('bb_cart');
    updateCartCount();
    const o = data.order;
    document.getElementById('checkoutInner').innerHTML = `
      <div class="success">
        <div class="check">✓</div>
        <h3>Order placed! 🎉</h3>
        <div class="order-id">${o.id}</div>
        <p>Thanks, <b>${o.customer.name}</b>! Your brownies are being baked.<br/>
        You'll pay <b style="color:var(--accent)">${RS(o.total)}</b> in cash on delivery to <b>${o.customer.city}</b>.</p>
        <button class="btn btn-primary" style="margin-top:22px;justify-content:center" onclick="closeCheckout(); location.href='/'">Back to shopping</button>
      </div>`;
  } catch (e) {
    err.textContent = 'Network error. Please try again.';
    btn.disabled = false; btn.textContent = 'Place Order (COD) 🍫';
  }
}

// close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'checkoutModal') closeCheckout();
});

// ---------- init ----------
updateCartCount();
renderCart();
loadProducts();
