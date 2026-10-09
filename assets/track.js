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
      var art = li.color ? lineArt({ id: li.slug || '', name: li.name, color: li.color, ink: li.ink }) : '';
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
      +'</div></div>'
      +reviewFormHTML(o);
    bindReviews(o);
  }
  /* Once it is on its way, each colour in the order can be reviewed. */
  function reviewFormHTML(o){
    if(['Shipped','Out for Delivery','Delivered'].indexOf(o.status) < 0) return '';
    var seen = {}, items = (o.items||[]).filter(function(li){ var k = li.slug || li.productId; if(!k || seen[k]) return false; seen[k] = 1; return true; });
    if(!items.length) return '';
    return '<div class="panel" style="margin-top:24px" id="rvPanel"><h2>How are they?</h2><p style="color:var(--soft);margin-bottom:18px">Tell other people what you think. Reviews show on the shop after a quick check.</p>'
      + items.map(function(li){
        var k = li.slug || '';
        return '<form class="rv-form" data-slug="'+esc(k)+'"><div class="rv-head">'+'<span class="t">'+lineArt({ id: k, name: li.name, color: li.color, ink: li.ink })+'</span><b>'+esc(li.name)+'</b></div>'
          +'<div class="rv-stars" role="radiogroup" aria-label="Rating for '+esc(li.name)+'">'+[1,2,3,4,5].map(function(n){ return '<button type="button" role="radio" aria-checked="false" data-star="'+n+'" aria-label="'+n+' star'+(n>1?'s':'')+'">★</button>'; }).join('')+'</div>'
          +'<div class="field"><label>Your review</label><textarea name="body" maxlength="1200" placeholder="How does it look, feel, wash?"></textarea></div>'
          +'<div class="err" role="alert"></div><button type="submit" class="btn btn-dark btn-sm">Post review</button></form>';
      }).join('') + '</div>';
  }
  function bindReviews(o){
    Array.prototype.forEach.call(document.querySelectorAll('.rv-form'), function(f){
      var rating = 0;
      f.addEventListener('click', function(e){
        var b = e.target.closest('[data-star]'); if(!b) return;
        rating = +b.getAttribute('data-star');
        Array.prototype.forEach.call(f.querySelectorAll('[data-star]'), function(x){ var on = +x.getAttribute('data-star') <= rating; x.classList.toggle('on', on); x.setAttribute('aria-checked', +x.getAttribute('data-star') === rating); });
      });
      f.addEventListener('submit', function(e){
        e.preventDefault();
        var err = f.querySelector('.err'), body = f.elements.body.value.trim();
        if(!rating){ err.textContent = 'Tap a star to rate it.'; return; }
        if(body.length < 3){ err.textContent = 'Please write a few words.'; return; }
        var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
        api('POST', '/api/reviews', { orderId: o.id, phone: document.getElementById('tPhone').value.trim(), slug: f.getAttribute('data-slug'), rating: rating, body: body }, function(ok, d){
          btn.disabled = false;
          if(!ok){ err.textContent = d.error || 'That did not go through. Please try again.'; return; }
          f.innerHTML = '<p class="ok-msg">Thank you! Your review will show on the shop shortly.</p>';
        });
      });
    });
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
