/* ===== Fudgio — track order ===== */
(function () {
  const CUR = (window.FUDGIO && window.FUDGIO.currency) || 'Rs';
  const m = (n) => CUR + ' ' + Number(n).toLocaleString('en-US');
  const STEPS = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered'];
  const statusClass = (s) => ({ Pending: 'b-pending', Confirmed: 'b-confirmed', Baking: 'b-baking', 'Out for Delivery': 'b-out', Delivered: 'b-delivered', Cancelled: 'b-cancelled' }[s] || 'b-pending');

  window.trackOrder = async function () {
    const err = document.getElementById('trackErr');
    const result = document.getElementById('trackResult');
    err.textContent = ''; result.innerHTML = '';
    const orderId = document.getElementById('trackId').value.trim();
    const phone = document.getElementById('trackPhone').value.trim();
    if (!orderId || !phone) { err.textContent = 'Enter your order number and phone.'; return; }
    let recaptchaToken;
    try {
      recaptchaToken = await window.getRecaptchaToken('TRACK_ORDER');
    } catch (error) {
      err.textContent = error.message;
      return;
    }
    const res = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, phone, recaptchaToken }) });
    const o = await res.json();
    if (!res.ok) { err.textContent = o.error || 'Not found.'; return; }
    const idx = STEPS.indexOf(o.status);
    const timeline = o.status === 'Cancelled'
      ? `<div class="tl-step" style="color:var(--bad)"><span class="dot"></span> Cancelled</div>`
      : `<div class="timeline">${STEPS.map((s, i) => `<div class="tl-step ${i <= idx ? 'done' : ''}"><span class="dot"></span>${s}</div>`).join('')}</div>`;
    result.innerHTML = `<div class="order-card">
      <div class="order-card-head"><span class="oid">${o.id}</span><span class="badge ${statusClass(o.status)}">${o.status}</span></div>
      ${o.items.map((i) => `<div class="order-line"><span class="em">${i.emoji}</span> ${i.qty}× ${i.name}${i.size ? ` · ${i.size}` : ''}</div>`).join('')}
      <div class="order-total"><span>💵 Cash on Delivery · to ${o.customer.city}</span><span>${m(o.total)}</span></div>
      ${timeline}
    </div>`;
  };
})();
