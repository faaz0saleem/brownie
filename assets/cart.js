/* The bag page. Lines and totals come from store.js, so they match the
   drawer and the checkout to the rupee. */
(function(){
  var root = document.getElementById('bagRoot');
  if(!root) return;
  bindLineButtons(root);
  function render(){
    var cart = getCart();
    if(!cart.length){
      root.innerHTML = '<div class="empty">'+cutHTML(visibleProducts()[0] || {})+'<h2>Your bag is empty.</h2><p>Eight colours, one great print. Any '+FUDGIO.bundleQty+' take '+FUDGIO.bundlePct+'% off.</p><a href="/shop" class="btn btn-primary">Shop all colours</a></div>';
      return;
    }
    var blocked = cart.some(shortOf), nudge = nudgeText();
    root.innerHTML = '<div class="deal-meter" data-deal-meter>'+dealMeterHTML()+'</div>'
      +'<div class="split"><div class="panel"><h2>'+cartUnits()+' bandana'+(cartUnits()===1?'':'s')+'</h2>'+bagLinesHTML()+'</div>'
      +'<div class="panel summary"><h2>Summary</h2>'+arrivalHTML()+totalsHTML()+couponFormHTML()
      +(nudge ? '<p class="pay-note" style="color:var(--pink-2)">'+esc(nudge)+'</p>' : '')
      +(blocked ? '<p class="err" style="margin-top:12px">Please remove or reduce the items marked above.</p><button class="btn btn-primary btn-block" style="margin-top:14px" disabled>Checkout</button>'
                : '<a href="/checkout" class="btn btn-primary btn-block" style="margin-top:18px">Checkout</a>')
      +'<a href="/shop" class="btn btn-ghost btn-block" style="margin-top:10px">Keep shopping</a>'
      +'<p class="pay-note">'+(isPK() ? 'Cash on delivery across Pakistan' : 'Shipping worldwide · prices in USD')+' · <button type="button" class="link-btn" id="swapRegion">'+(isPK() ? 'Shipping abroad?' : 'In Pakistan?')+'</button></p>'
      +'</div></div>';
    var meter = root.querySelector('[data-deal-meter]'); if(meter) meter.hidden = !FUDGIO.bundlePct;
    var sw = document.getElementById('swapRegion'); if(sw) sw.onclick = function(){ setRegion(isPK() ? 'INTL' : 'PK'); };
  }
  onChange(render);
  render();
})();
