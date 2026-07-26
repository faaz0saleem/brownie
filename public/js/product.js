/* ===== Fudgio — product detail interactions ===== */
(function () {
  const P = window.__PRODUCT__;
  if (!P) return;
  const CUR = (window.FUDGIO && window.FUDGIO.currency) || 'Rs';
  const m = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');

  let size = P.sizes[0].label;
  let unitPrice = P.sizes[0].price;
  let qty = 1;
  const maxQty = Math.max(1, P.stock || 1);

  const input = document.getElementById('qtyInput');
  const btnTotal = document.getElementById('btnTotal');
  const pdPrice = document.getElementById('pdPrice');

  function sync() {
    btnTotal.textContent = m(unitPrice * qty);
    pdPrice.textContent = m(unitPrice);
  }
  const clamp = (v) => Math.max(1, Math.min(maxQty, v));

  document.querySelectorAll('#sizeChoices .choice').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#sizeChoices .choice').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
      size = el.dataset.label;
      unitPrice = Number(el.dataset.price);
      sync();
    });
  });

  document.getElementById('qtyMinus').addEventListener('click', () => { qty = clamp(qty - 1); input.value = qty; sync(); });
  document.getElementById('qtyPlus').addEventListener('click', () => { qty = clamp(qty + 1); input.value = qty; sync(); });
  input.addEventListener('input', () => { qty = clamp(parseInt(input.value, 10) || 1); input.value = qty; sync(); });

  const addBtn = document.getElementById('addBtn');
  if (P.stock > 0) {
    addBtn.addEventListener('click', () => {
      addToCart({ id: P.id, name: P.name, emoji: P.emoji, gradient: P.gradient, imageUrl: P.imageUrl }, size, unitPrice, qty);
    });
  }
  sync();
})();
