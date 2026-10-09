/* Order tracking: order number + phone, so nobody can browse other orders. */
(function(){
  var f = document.getElementById('trackForm'); if(!f) return;
  var out = document.getElementById('tOut'), errEl = document.getElementById('tErr');
  var q = new URLSearchParams(location.search);
  if(q.get('id')) document.getElementById('tId').value = q.get('id');
  if(q.get('phone')) document.getElementById('tPhone').value = q.get('phone');
  function when(ms){ try{ return new Date(ms).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }catch(e){ return ''; } }
  function steps(o){
    var intl = o.currency === 'USD';
    return intl ? ['Awaiting Payment','Confirmed','Packed','Shipped','Delivered'] : ['Pending','Confirmed','Packed','Out for Delivery','Delivered'];
  }
  function show(o){
    var reg = o.currency === 'USD' ? 'INTL' : 'PK', list = steps(o), hist = {};
    (o.statusHistory||[]).forEach(function(h){ hist[h.status] = h.at; });
    var idx = list.indexOf(o.status);
    // Shipped and Out for Delivery are the same point in the journey.
    if(idx < 0 && (o.status === 'Shipped' || o.status === 'Out for Delivery')) idx = 3;
    var tl = o.status === 'Cancelled' ? '<p class="err">This order was cancelled. Questions? <a class="link" href="/contact">Contact us</a>.</p>'
      : '<ol class="timeline">'+list.map(function(s, i){
          var label = { 'Awaiting Payment':'Order placed — awaiting payment', 'Pending':'Order placed', 'Confirmed':'Confirmed', 'Packed':'Packed', 'Shipped':'Shipped', 'Out for Delivery':'Out for delivery', 'Delivered':'Delivered' }[s] || s;
          return '<li class="'+(i<=idx?'done':'')+(i===idx?' now':'')+'"><div><b>'+esc(label)+'</b>'+(hist[s] ? '<small>'+esc(when(hist[s]))+'</small>' : '')+'</div></li>';
        }).join('')+'</ol>';
    var items = (o.items||[]).map(function(li){
      var art = li.color ? '<div class="bn">'+bandanaSVG(li.color, li.ink)+'</div>' : '';
      return '<div class="sum-line"><span class="t">'+art+'<span class="q">'+(+li.qty)+'</span></span><span class="nm">'+esc(li.name)+'</span><span class="p">'+money(li.lineTotal, reg)+'</span></div>';
    }).join('');
    var c = o.customer || {};
    out.innerHTML = '<div class="split"><div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px"><h2 style="margin:0">'+esc(o.id)+'</h2><span class="status-pill '+esc(String(o.status).split(' ')[0])+'">'+esc(o.status)+'</span></div>'+tl+'</div>'
      +'<div class="panel"><h2>Order</h2>'+items
      +'<div class="srow" style="border-top:1px solid var(--line);margin-top:8px;padding-top:12px"><span>Subtotal</span><b>'+money(o.subtotal, reg)+'</b></div>'
      +(o.discount ? '<div class="srow save"><span>Bundle deal</span><b>−'+money(o.discount, reg)+'</b></div>' : '')
      +'<div class="srow"><span>'+(reg==='PK'?'Delivery':'Shipping')+'</span><b>'+(o.deliveryFee ? money(o.deliveryFee, reg) : 'Free')+'</b></div>'
      +'<div class="srow tot"><span>Total</span><b>'+money(o.total, reg)+'</b></div>'
      +'<p class="pay-note">'+(reg==='PK' ? 'Cash on delivery' : 'Prepaid by payment link')+' · to '+esc(c.city || '')+(c.countryName ? ', '+esc(c.countryName) : '')+'</p>'
      +(o.status==='Awaiting Payment' && FUDGIO.intlPaymentLink ? '<a class="btn btn-primary btn-block" style="margin-top:14px" target="_blank" rel="noopener" href="'+esc(FUDGIO.intlPaymentLink)+'">Pay '+money(o.total, reg)+' now</a><p class="pay-note">Put '+esc(o.id)+' in the payment note.</p>' : '')
      +'</div></div>';
  }
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var id = document.getElementById('tId').value.trim().toUpperCase(), ph = document.getElementById('tPhone').value.trim();
    errEl.textContent = '';
    if(!/^FUD-\d+$/.test(id)){ errEl.textContent = 'Order numbers look like FUD-1001.'; return; }
    if(!validPhone(ph)){ errEl.textContent = 'Please enter the phone number you ordered with.'; return; }
    var b = f.querySelector('button'); b.disabled = true;
    api('POST', '/api/track', { orderId: id, phone: ph }, function(ok, d){
      b.disabled = false;
      if(!ok){ out.innerHTML = ''; errEl.textContent = d.error || 'No order found with that number and phone.'; return; }
      show(d);
    });
  });
  if(q.get('id') && q.get('phone')) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit'));
})();
