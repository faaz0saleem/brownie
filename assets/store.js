/* Fudgio storefront: catalogue, currency, bag, and everything shared by every
   page. Needs assets/art.js and assets/catalog.js loaded first.

   Also runs inside the page build (scripts/build.mjs) with no DOM, so the
   static HTML carries the same cards and product pages the browser draws —
   anything touching `document` is behind HAS_DOM. */
var HAS_DOM = typeof document !== 'undefined';

/* Shop-wide settings. Defaults for the moment before /api/storefront answers;
   the admin owns the real values and the server charges from them. */
var FUDGIO = {
  email: 'faaz.saleem@fudgio.com',
  deliveryFee: 250, freeOver: 8000,                    // Pakistan, rupees
  intlEnabled: true, intlShipping: 12, intlFreeOver: 0, // abroad, dollars
  usdRate: 280, intlPaymentLink: '',
  bundleQty: 3, bundlePct: 15,
  daysPk: '3–5', daysIntl: '7–14',
  instagram: '', whatsapp: '', announcement: '', storeOpen: true, sms: false
};
// The build writes the .env defaults next to the catalogue, so even the first
// paint quotes the shop's real prices and fees.
// What has arrived from the API so far (see the bottom of this file).
var _ready = { catalog: false, settings: false };
if (typeof FUDGIO_DEFAULTS !== 'undefined') for (var _k in FUDGIO_DEFAULTS) FUDGIO[_k] = FUDGIO_DEFAULTS[_k];

/* ---------------- catalogue ---------------- */
function makeProduct(c, isStatic){
  return { id: c.slug, slug: c.slug, name: c.name, color: c.color, ink: c.ink,
    tagline: c.tagline || '', desc: c.description || c.desc || '',
    image: c.imageUrl || '', sort: c.sort || 0, hidden: false, isStatic: !!isStatic,
    path: isStatic ? '/bandanas/' + c.slug : '/bandana?c=' + encodeURIComponent(c.slug),
    sizes: (c.sizes || []).map(function(s){ return { label: s.label, pieces: s.pieces || 1, price: +s.price, usd: +s.usd || 0 }; }),
    details: (c.details || []).slice() };
}
var PRODUCTS = (typeof FUDGIO_CATALOG !== 'undefined' ? FUDGIO_CATALOG : []).map(function(c){ return makeProduct(c, true); });
function visibleProducts(){ return PRODUCTS.filter(function(p){ return !p.hidden; }).sort(function(a,b){ return a.sort - b.sort; }); }
function getProduct(slug){ for(var i=0;i<PRODUCTS.length;i++) if(PRODUCTS[i].slug===slug) return PRODUCTS[i]; return null; }
function sizeOf(p){ return (p && p.sizes && p.sizes[0]) || { label: '55 cm square', pieces: 1, price: 4200, usd: 15 }; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

/* ---------------- region ----------------
   'PK': rupees, cash on delivery. 'INTL': dollars, paid before it ships.
   Remembered; a first visit is guessed from the time zone. */
var REGION = (function(){
  if (typeof FUDGIO_FORCE_REGION !== 'undefined') return FUDGIO_FORCE_REGION;
  try{ var r = localStorage.getItem('fudgio_region'); if(r==='PK' || r==='INTL') return r; }catch(e){}
  try{ if(Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Karachi') return 'PK'; }catch(e){}
  return 'INTL';
})();
function isPK(){ return REGION === 'PK'; }
function setRegion(r){
  if(r!=='PK' && r!=='INTL') return;
  if(r==='INTL' && !FUDGIO.intlEnabled) r = 'PK';
  if(r === REGION) return;
  REGION = r;
  try{ localStorage.setItem('fudgio_region', r); }catch(e){}
  emit();
}

/* ---------------- prices ----------------
   A colour's dollar price is the admin's; with none set, the rupee price is
   converted at the admin's rate and rounded up, exactly as size_usd() does. */
function sizeUsd(s){ return (s && +s.usd > 0) ? +s.usd : Math.max(1, Math.ceil(+(s && s.price || 0) / Math.max(1, FUDGIO.usdRate))); }
function unitPrice(p, region){ var s = sizeOf(p); return (region || REGION) === 'PK' ? +s.price : sizeUsd(s); }
function fromPrice(region){
  var list = visibleProducts(); if(!list.length) return 0;
  return Math.min.apply(null, list.map(function(p){ return unitPrice(p, region); }));
}
function money(n, region){
  var v = Math.round(+n || 0).toLocaleString('en-US');
  return (region || REGION) === 'PK' ? 'Rs ' + v : '$' + v;
}
function inStock(p, n){ return !p || p.stock === undefined || p.stock >= (n || 1); }

/* ---------------- change notifications ----------------
   One signal for "redraw": the live catalogue landed, settings landed, the
   currency changed or the bag changed. Every widget re-renders from state. */
var _subs = [];
function onChange(fn){ _subs.push(fn); }
function emit(){ _subs.slice().forEach(function(fn){ try{ fn(); }catch(e){ if(typeof console!=='undefined') console.error(e); } }); }

/* ---------------- art ---------------- */
function artHTML(p, opts){
  opts = opts || {};
  if(p && p.image) return '<img src="'+esc(p.image)+'" alt="'+(opts.alt ? esc(p.name+' bandana') : '')+'" loading="'+(opts.eager?'eager':'lazy')+'" decoding="async"/>';
  return '<div class="bn">'+bandanaSVG(p ? p.color : '', p ? p.ink : '', opts.alt && p ? { title: p.name + ' bandana' } : null)+'</div>';
}
function lineArt(i){
  var p = getProduct(i.id) || { name: i.name, color: i.color, ink: i.ink, image: i.image };
  return p.image ? '<img src="'+esc(p.image)+'" alt="" loading="lazy"/>' : '<div class="bn">'+bandanaSVG(p.color, p.ink)+'</div>';
}

/* ---------------- bag ---------------- */
/* Every bandana line carries its colours. A line without them was saved by
   the old brownie shop in a returning visitor's browser — it can't be bought
   any more and would show a brownie photo, so it is dropped on sight. */
function getCart(){
  try{
    var raw = JSON.parse(localStorage.getItem('fudgio_cart')||'[]');
    if(Object.prototype.toString.call(raw) !== '[object Array]') return [];
    var c = raw.filter(function(i){ return i && i.id && i.qty > 0 && i.color && i.key === i.id; });
    if(c.length !== raw.length) localStorage.setItem('fudgio_cart', JSON.stringify(c));
    return c;
  }catch(e){ return []; }
}
function saveCart(c){ try{ localStorage.setItem('fudgio_cart', JSON.stringify(c)); }catch(e){} emit(); }
function cartUnits(){ return getCart().reduce(function(s,i){ return s + i.qty * (i.pieces||1); }, 0); }
function qtyInBag(slug){ return getCart().reduce(function(s,i){ return i.id===slug ? s + i.qty : s; }, 0); }
function lineUnit(i, region){
  var p = getProduct(i.id);
  if(p) return unitPrice(p, region);
  return (region || REGION) === 'PK' ? +i.price : (+i.usd > 0 ? +i.usd : sizeUsd({ price: i.price }));
}
function cartSubtotal(region){ return getCart().reduce(function(s,i){ return s + lineUnit(i, region) * i.qty; }, 0); }
/* The buy-3 deal: mirrors bundle_discount() in api/catalog.php. */
function cartDiscount(region){
  var pct = Math.max(0, Math.min(90, FUDGIO.bundlePct|0)), sub = cartSubtotal(region);
  if(!pct || cartUnits() < Math.max(2, FUDGIO.bundleQty|0) || sub <= 0) return 0;
  return Math.round(sub * pct / 100);
}
function cartDelivery(region){
  var r = region || REGION, after = cartSubtotal(r) - cartDiscount(r);
  if(r === 'PK') return (FUDGIO.freeOver > 0 && after >= FUDGIO.freeOver) ? 0 : FUDGIO.deliveryFee;
  return (FUDGIO.intlFreeOver > 0 && after >= FUDGIO.intlFreeOver) ? 0 : FUDGIO.intlShipping;
}
function cartTotal(region){ return cartSubtotal(region) - cartDiscount(region) + cartDelivery(region); }
function dealLeft(){ return Math.max(0, Math.max(2, FUDGIO.bundleQty|0) - cartUnits()); }
function addToCart(p, qty){
  qty = Math.max(1, qty|0);
  var s = sizeOf(p), cart = getCart(), key = p.slug;
  var ex = cart.filter(function(i){ return i.key===key; })[0];
  var want = (ex ? ex.qty : 0) + qty;
  if(p.stock !== undefined && want > p.stock){ toast(p.stock > 0 ? 'Only '+p.stock+' '+p.name+' left' : p.name+' is sold out'); return false; }
  if(want > 20){ toast('For more than 20 of one colour, get in touch for a bulk order'); return false; }
  if(ex) ex.qty = want;
  else cart.push({ key:key, id:p.slug, name:p.name, color:p.color, ink:p.ink, image:p.image||'',
                   size:s.label, pieces:1, price:+s.price, usd:sizeUsd(s), qty:qty });
  saveCart(cart);
  return true;
}
function setQty(key, qty){
  var c = getCart(), it = c.filter(function(i){ return i.key===key; })[0]; if(!it) return;
  var p = getProduct(it.id);
  if(qty > it.qty && p && p.stock !== undefined && qty > p.stock){ toast('That is all the '+it.name+' we have'); return; }
  if(qty > 20) return;
  it.qty = qty;
  saveCart(qty <= 0 ? c.filter(function(i){ return i.key!==key; }) : c);
}
function shortOf(i){
  var p = getProduct(i.id);
  if(!p) return _ready.catalog;                     // gone from the shop entirely
  return !!(p.hidden || (p.stock !== undefined && i.qty > p.stock));
}

/* ---------------- words that depend on settings ---------------- */
function dealLine(){
  var q = Math.max(2, FUDGIO.bundleQty|0), pct = FUDGIO.bundlePct|0;
  if(!pct) return '';
  var n = cartUnits(), left = dealLeft();
  if(!n) return 'Buy any '+q+', save '+pct+'%';
  if(left) return 'Add '+left+' more to save '+pct+'%';
  return pct+'% bundle discount unlocked';
}
function shipLine(region){
  var r = region || REGION;
  if(r === 'PK') return 'Cash on delivery across Pakistan · '+(FUDGIO.deliveryFee ? money(FUDGIO.deliveryFee,'PK')+' delivery' : 'free delivery')
    +(FUDGIO.freeOver && FUDGIO.deliveryFee ? ', free over '+money(FUDGIO.freeOver,'PK') : '')+' · '+FUDGIO.daysPk+' days';
  return 'Ships worldwide · '+(FUDGIO.intlShipping ? money(FUDGIO.intlShipping,'INTL')+' flat' : 'free shipping')
    +(FUDGIO.intlFreeOver && FUDGIO.intlShipping ? ', free over '+money(FUDGIO.intlFreeOver,'INTL') : '')+' · '+FUDGIO.daysIntl+' days';
}

/* ---------------- templates (shared with the build) ---------------- */
function productCardHTML(p){
  var out = !inStock(p), n = HAS_DOM ? qtyInBag(p.slug) : 0;
  var flag = out ? '<span class="flag">Sold out</span>'
    : (p.stock !== undefined && p.stock <= 8 ? '<span class="flag pink">Only '+p.stock+' left</span>' : '');
  var btn = out ? '<button type="button" class="add-btn" disabled>Sold out</button>'
    : '<button type="button" class="add-btn'+(n?' in':'')+'" data-add="'+esc(p.slug)+'" aria-label="Add '+esc(p.name)+' to bag">'
      + (n ? 'In bag ('+n+')<span class="more"> · Add another</span><span class="plus" aria-hidden="true"> +</span>' : 'Add to bag') + '</button>';
  return '<article class="card'+(out?' is-sold-out':'')+'" data-slug="'+esc(p.slug)+'">'
    +'<div class="tile'+(p.image?' photo':'')+'">'+artHTML(p)+flag+'</div>'
    +'<div class="card-meta"><h3 class="card-name"><a href="'+p.path+'">'+esc(p.name)+'</a></h3>'
    +'<span class="card-price">'+money(unitPrice(p))+'</span></div>'
    +btn+'</article>';
}

function swatchesHTML(cur){
  return visibleProducts().map(function(p){
    var on = p.slug === cur.slug;
    return '<a class="sw'+(on?' on':'')+(inStock(p)?'':' out')+'" href="'+p.path+'" style="background:'+esc(p.color)+'" title="'+esc(p.name)+'" aria-label="'+esc(p.name)+(on?' (selected)':'')+'"'+(on?' aria-current="true"':'')+'></a>';
  }).join('');
}

/* The big picture on a product page: the photo if there is one, otherwise
   the drawing three ways — flat, folded into a triangle, and close up. */
function stageHTML(p){
  if(p.image) return artHTML(p, { alt: true, eager: true });
  var svg = bandanaSVG(p.color, p.ink, { title: p.name + ' bandana' });
  return '<div class="v v-flat"><div class="bn">'+svg+'</div></div>'
    +'<div class="v v-fold" aria-hidden="true"><div class="bn">'+bandanaSVG(p.color, p.ink)+'</div></div>'
    +'<div class="v v-zoom" aria-hidden="true"><div class="bn">'+bandanaSVG(p.color, p.ink)+'</div></div>';
}
function productPageHTML(p){
  var details = (p.details && p.details.length ? p.details : ['100% cotton','55 × 55 cm (22")','Hemmed edges','Colourfast print','Machine washable']);
  return '<div class="pd" data-pd="'+esc(p.slug)+'">'
    +'<div class="pd-gallery"><div class="pd-stage'+(p.image?' photo':'')+'" id="pdStage" data-view="flat">'+stageHTML(p)+'</div>'
    +(p.image ? '' : '<div class="pd-views" role="tablist" aria-label="Views">'
      +[['flat','Flat'],['fold','Folded'],['zoom','Close-up']].map(function(v, i){
        return '<button type="button" role="tab" class="view-btn'+(i?'':' on')+'" data-view="'+v[0]+'" aria-selected="'+(i?'false':'true')+'"><span class="vt v-'+v[0]+'"><span class="bn">'+bandanaSVG(p.color, p.ink)+'</span></span>'+v[1]+'</button>';
      }).join('')+'</div>')
    +'</div>'
    +'<div class="pd-info">'
      +'<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">/</span><a href="/shop">Shop</a><span class="sep">/</span><span>'+esc(p.name)+'</span></nav>'
      +'<div style="display:flex;flex-direction:column;gap:14px"><p class="eyebrow">Printed bandana · 55 cm square</p><h1 class="h1">'+esc(p.name)+'</h1></div>'
      +'<div class="pd-price" id="pdPrice">'+money(unitPrice(p))+' <small id="pdPay">'+(isPK()?'Cash on delivery':'Paid before it ships')+'</small></div>'
      +'<p class="pd-desc">'+esc(p.desc)+'</p>'
      +'<div class="swatch-row"><span class="lbl">Colour <b>'+esc(p.name)+'</b></span><div class="swatches" id="pdSw">'+swatchesHTML(p)+'</div></div>'
      +'<div class="stock-line" id="pdStock">In stock</div>'
      +'<div class="buy"><div class="stepper" role="group" aria-label="Quantity"><button type="button" id="pdMinus" aria-label="One fewer">−</button><span id="pdQty">1</span><button type="button" id="pdPlus" aria-label="One more">+</button></div>'
        +'<button type="button" class="btn btn-primary" id="pdAdd">Add to bag</button></div>'
      +'<button type="button" class="btn btn-outline btn-block" id="pdBuy">Buy it now</button>'
      +'<div class="deal-note" id="pdDeal"><span class="pct" data-pct-badge>'+(FUDGIO.bundlePct|0)+'%</span><div><b data-deal-line>Buy any '+FUDGIO.bundleQty+', save '+FUDGIO.bundlePct+'%.</b> Mix any colours — the discount is applied automatically in your bag.</div></div>'
      +'<div class="acc">'
        +'<details open><summary>Details</summary><div class="a"><ul>'+details.map(function(d){ return '<li>'+esc(d)+'</li>'; }).join('')+'</ul></div></details>'
        +'<details><summary>Delivery &amp; returns</summary><div class="a"><p data-ship-pk>Pakistan: cash on delivery, '+FUDGIO.daysPk+' working days.</p><p data-ship-intl>Worldwide: paid before it ships, '+FUDGIO.daysIntl+' working days.</p><p>Unworn and unwashed? Exchange it within 7 days. <a class="link" href="/shipping">Delivery &amp; returns</a></p></div></details>'
        +'<details><summary>How to wear it</summary><div class="a"><ul><li><b>Head:</b> fold into a triangle, tie at the back.</li><li><b>Neck:</b> fold to a band, loose knot at the front.</li><li><b>Wrist:</b> roll thin, wrap twice, tuck the ends.</li><li><b>Bag:</b> knot round the strap or handle.</li><li><b>Back pocket:</b> let one corner hang out.</li></ul><p><a class="link" href="/how-to-wear">Step-by-step guide</a></p></div></details>'
        +'<details><summary>Care</summary><div class="a"><p>Machine wash cold with similar colours, or hand wash. Line dry, iron warm. The first wash softens the cotton and may release a little colour, so wash it alone once.</p></div></details>'
      +'</div>'
    +'</div></div>';
}

function bagLinesHTML(){
  return getCart().map(function(i){
    var p = getProduct(i.id), short = shortOf(i), unit = lineUnit(i);
    var href = p ? p.path : '/shop';
    var note = (!p || p.hidden) && _ready.catalog ? 'No longer available — please remove'
      : (short ? (p.stock > 0 ? 'Only '+p.stock+' left' : 'Sold out — please remove') : (i.size || '55 cm square')+' · '+money(unit));
    return '<div class="bline'+(short?' short':'')+'"><a class="thumb'+(p&&p.image?' photo':'')+'" href="'+href+'" tabindex="-1" aria-hidden="true">'+lineArt(i)+'</a>'
      +'<div><h4><a href="'+href+'">'+esc(p ? p.name : i.name)+'</a></h4><div class="meta">'+esc(note)+'</div>'
      +'<div class="stepper" role="group" aria-label="Quantity of '+esc(i.name)+'"><button type="button" data-dec="'+esc(i.key)+'" aria-label="One fewer">−</button><span>'+i.qty+'</span><button type="button" data-inc="'+esc(i.key)+'" aria-label="One more">+</button></div></div>'
      +'<div class="right"><span class="price">'+money(unit*i.qty)+'</span><button type="button" class="rm" data-rm="'+esc(i.key)+'">Remove</button></div></div>';
  }).join('');
}
function totalsHTML(){
  var sub = cartSubtotal(), disc = cartDiscount(), ship = cartDelivery();
  var html = '<div class="srow"><span>Subtotal</span><b>'+money(sub)+'</b></div>';
  if(disc) html += '<div class="srow save"><span>Bundle deal ('+FUDGIO.bundlePct+'% off)</span><b>−'+money(disc)+'</b></div>';
  html += '<div class="srow"><span>'+(isPK()?'Delivery in Pakistan':'Shipping worldwide')+'</span><b>'+(ship===0?'Free':money(ship))+'</b></div>';
  html += '<div class="srow tot"><span>Total</span><b>'+money(sub-disc+ship)+'</b></div>';
  return html;
}
function nudgeText(){
  var after = cartSubtotal() - cartDiscount();
  if(dealLeft() && FUDGIO.bundlePct) return dealLine()+'. Mix any colours.';
  if(isPK() && FUDGIO.deliveryFee && FUDGIO.freeOver > after) return money(FUDGIO.freeOver - after)+' away from free delivery.';
  if(!isPK() && FUDGIO.intlShipping && FUDGIO.intlFreeOver > after) return money(FUDGIO.intlFreeOver - after)+' away from free shipping.';
  return '';
}
function dealMeterHTML(){
  var q = Math.max(2, FUDGIO.bundleQty|0), cart = getCart(), pips = '', i, k = 0;
  var swatch = [];
  cart.forEach(function(it){ for(var j=0;j<it.qty && swatch.length<q;j++) swatch.push(it); });
  for(i=0;i<q;i++){
    var it = swatch[i];
    pips += it ? '<span class="pip on">'+lineArt(it)+'</span>' : '<span class="pip"></span>';
    if(it) k++;
  }
  return '<div class="pips" aria-hidden="true">'+pips+'</div><div class="txt">'+esc(dealLine())+'<small>'
    +(dealLeft() ? 'Any colours. Taken off automatically in your bag.' : 'Applied to everything in your bag.')+'</small></div>'
    +(HAS_DOM && location.pathname.replace(/\/$/,'') === '/cart'
      ? (dealLeft() ? '<a class="btn btn-dark btn-sm" href="/shop">Add a colour</a>' : '')
      : '<a class="btn btn-dark btn-sm" href="/cart" data-open-bag>View bag</a>');
}

/* ---------------- everything below needs a page ---------------- */
var _tt;
function toast(msg, action){
  if(!HAS_DOM) return;
  var t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); document.body.appendChild(t); }
  t.innerHTML = '<span>'+esc(msg)+'</span>' + (action ? '<button type="button">'+esc(action.label)+'</button>' : '');
  if(action) t.querySelector('button').onclick = function(){ t.classList.remove('show'); action.fn(); };
  t.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(function(){ t.classList.remove('show'); }, 3200);
}
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test((e||'').trim()); }
function validPhone(p){ var d=(p||'').replace(/\D/g,''); return d.length>=7 && d.length<=15; }
function api(method, url, data, cb){
  var x = new XMLHttpRequest();
  x.open(method, url, true);
  x.setRequestHeader('Content-Type','application/json');
  x.timeout = 20000;
  x.onload = function(){ var d = {}; try{ d = JSON.parse(x.responseText)||{}; }catch(e){} cb(x.status>=200 && x.status<300, d); };
  x.onerror = x.ontimeout = function(){ cb(false, { error: 'Network error. Please check your connection and try again.' }); };
  x.send(data ? JSON.stringify(data) : null);
}

/* ---- bag drawer ---- */
var _lastFocus = null;
function openBag(){
  if(!HAS_DOM) return;
  var p = location.pathname.replace(/\/$/,'');
  if(p === '/cart' || p === '/checkout'){ location.href = '/cart'; return; }
  buildDrawer(); renderDrawer();
  _lastFocus = document.activeElement;
  document.body.classList.add('drawer-open','lock');
  document.getElementById('drawer').setAttribute('aria-hidden','false');
  setTimeout(function(){ var c = document.querySelector('#drawer .x-btn'); if(c) c.focus(); }, 60);
}
function closeBag(){
  document.body.classList.remove('drawer-open','lock');
  var d = document.getElementById('drawer'); if(d) d.setAttribute('aria-hidden','true');
  if(_lastFocus && _lastFocus.focus) _lastFocus.focus();
}
function buildDrawer(){
  if(document.getElementById('drawer')) return;
  var bg = document.createElement('div'); bg.className = 'drawer-bg'; bg.onclick = closeBag;
  var d = document.createElement('aside');
  d.id = 'drawer'; d.className = 'drawer'; d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.setAttribute('aria-labelledby','dwTitle'); d.setAttribute('aria-hidden','true');
  d.innerHTML = '<div class="drawer-head"><h2 id="dwTitle">Your bag</h2><button type="button" class="x-btn" aria-label="Close bag">×</button></div>'
    +'<div class="drawer-deal" id="dwDeal"></div><div class="drawer-body" id="dwBody"></div><div class="drawer-foot" id="dwFoot"></div>';
  d.querySelector('.x-btn').onclick = closeBag;
  bindLineButtons(d);
  document.body.appendChild(bg); document.body.appendChild(d);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeBag(); });
}
function renderDrawer(){
  var d = document.getElementById('drawer'); if(!d) return;
  var cart = getCart(), n = cartUnits();
  document.getElementById('dwTitle').innerHTML = 'Your bag <span class="mono" style="font-weight:400;font-size:1rem;color:var(--muted)">('+n+')</span>';
  var deal = document.getElementById('dwDeal');
  if(!cart.length || !FUDGIO.bundlePct){ deal.style.display = 'none'; }
  else {
    var q = Math.max(2, FUDGIO.bundleQty|0);
    deal.style.display = '';
    deal.innerHTML = '<b>'+esc(dealLine())+'</b><div class="bar"><i style="width:'+Math.min(100, n/q*100)+'%"></i></div>';
  }
  if(!cart.length){
    document.getElementById('dwBody').innerHTML = '<div class="drawer-empty"><div class="bn">'+bandanaSVG('#FF6A13','#FFFFFF')+'</div><p>Your bag is empty.</p><a class="btn btn-dark btn-sm" href="/shop">Shop all colours</a></div>';
    document.getElementById('dwFoot').innerHTML = '';
    return;
  }
  var left = FUDGIO.bundlePct ? dealLeft() : 0, upsell = '';
  if(left){
    var inBag = {}; cart.forEach(function(i){ inBag[i.id] = 1; });
    var ideas = visibleProducts().filter(function(p){ return !inBag[p.slug] && inStock(p); }).slice(0, 4);
    if(ideas.length) upsell = '<div class="upsell"><p class="lbl">Add '+left+' more to save '+FUDGIO.bundlePct+'%</p><div class="ideas">'
      + ideas.map(function(p){ return '<button type="button" class="idea" data-add="'+esc(p.slug)+'" aria-label="Add '+esc(p.name)+'"><span class="bn">'+bandanaSVG(p.color, p.ink)+'</span><span>'+esc(p.name)+'</span><b aria-hidden="true">+</b></button>'; }).join('')
      + '</div></div>';
  }
  document.getElementById('dwBody').innerHTML = bagLinesHTML() + upsell;
  var blocked = cart.some(shortOf), nudge = nudgeText();
  document.getElementById('dwFoot').innerHTML = totalsHTML()
    + (nudge ? '<p class="pay-note" style="color:var(--pink-2)">'+esc(nudge)+'</p>' : '')
    + (blocked ? '<button class="btn btn-primary btn-block" disabled>Checkout</button>'
               : '<a class="btn btn-primary btn-block" href="/checkout">Checkout <svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>')
    + '<p class="pay-note">'+(isPK() ? 'Cash on delivery · pay when it arrives' : 'Prices in USD · paid before it ships')+'</p>';
}
function bindLineButtons(root){
  root.addEventListener('click', function(e){
    var b = e.target.closest('[data-inc],[data-dec],[data-rm]'); if(!b) return;
    var c = getCart(), key = b.getAttribute('data-inc') || b.getAttribute('data-dec') || b.getAttribute('data-rm');
    var it = c.filter(function(i){ return i.key === key; })[0]; if(!it) return;
    if(b.hasAttribute('data-rm')){ setQty(key, 0); toast(it.name+' removed'); }
    else setQty(key, it.qty + (b.hasAttribute('data-inc') ? 1 : -1));
  });
}

/* ---- the live catalogue and settings ---- */
function mergeLive(rows){
  if(Object.prototype.toString.call(rows) !== '[object Array]' || !rows.length) return;
  var seen = {};
  rows.forEach(function(r){
    if(!r || !r.slug) return;
    seen[r.slug] = true;
    var p = getProduct(r.slug);
    if(!p){ p = makeProduct(r, false); PRODUCTS.push(p); }   // a colour added in the admin
    p.hidden = r.active === false;
    if(r.name) p.name = r.name;
    if(r.tagline !== undefined) p.tagline = r.tagline;
    if(r.description) p.desc = r.description;
    if(r.color) p.color = r.color;
    if(r.ink) p.ink = r.ink;
    if(r.sizes && r.sizes.length) p.sizes = r.sizes;
    if(r.details && r.details.length) p.details = r.details;
    if(typeof r.sort === 'number') p.sort = r.sort;
    p.image = r.imageUrl || '';
    if(r.stock !== undefined && r.stock !== null && !isNaN(+r.stock)) p.stock = +r.stock;
  });
  // A colour the shop no longer lists is hidden from the grid.
  PRODUCTS.forEach(function(p){ if(!seen[p.slug]) p.hidden = true; });
}
function applySettings(d){
  if(!d) return;
  var n = function(v, def){ return typeof v === 'number' && !isNaN(v) ? v : def; };
  FUDGIO.deliveryFee  = n(d.deliveryFee, FUDGIO.deliveryFee);
  FUDGIO.freeOver     = n(d.freeDeliveryOver, FUDGIO.freeOver);
  FUDGIO.intlShipping = n(d.intlShipping, FUDGIO.intlShipping);
  FUDGIO.intlFreeOver = n(d.intlFreeOver, FUDGIO.intlFreeOver);
  FUDGIO.usdRate      = Math.max(1, n(d.usdRate, FUDGIO.usdRate));
  FUDGIO.bundleQty    = n(d.bundleQty, FUDGIO.bundleQty);
  FUDGIO.bundlePct    = n(d.bundlePct, FUDGIO.bundlePct);
  ['daysPk','daysIntl','instagram','whatsapp','announcement','intlPaymentLink'].forEach(function(k){ if(typeof d[k] === 'string' && (d[k] || k==='announcement' || k==='instagram' || k==='whatsapp' || k==='intlPaymentLink')) FUDGIO[k] = d[k]; });
  if(typeof d.intlEnabled === 'boolean') FUDGIO.intlEnabled = d.intlEnabled;
  FUDGIO.storeOpen = d.storeOpen !== false;
  FUDGIO.sms = !!d.smsVerification;
  if(!FUDGIO.intlEnabled && REGION === 'INTL'){ REGION = 'PK'; }
}
function whenLive(fn){ if(_ready.catalog && _ready.settings) fn(); else onChange(function once(){ if(_ready.catalog && _ready.settings && !once.done){ once.done = true; fn(); } }); }

/* ---- the bar at the very top: the admin's message, or a few that take turns ---- */
var ANN = [], _annI = 0;
function announcements(){
  if(FUDGIO.announcement) return [FUDGIO.announcement];
  var list = [];
  if(isPK()){
    list.push(FUDGIO.deliveryFee && FUDGIO.freeOver ? 'Free delivery in Pakistan over '+money(FUDGIO.freeOver,'PK') : 'Free delivery across Pakistan');
    list.push('Cash on delivery · pay when it arrives');
  } else {
    list.push(FUDGIO.intlShipping ? 'Shipping worldwide · '+money(FUDGIO.intlShipping,'INTL')+' flat' : 'Free shipping worldwide');
  }
  if(FUDGIO.bundlePct) list.push('Buy any '+FUDGIO.bundleQty+', save '+FUDGIO.bundlePct+'% · mix any colours');
  list.push('100% cotton · 55 cm square · '+(isPK() ? FUDGIO.daysPk : FUDGIO.daysIntl)+' day delivery');
  return list;
}
function showAnnouncement(a, fade){
  if(!ANN.length) return;
  var t = ANN[_annI % ANN.length];
  if(a.textContent === t) return;
  if(!fade || REDUCE){ a.textContent = t; return; }
  a.classList.add('swap-out');
  setTimeout(function(){ a.textContent = t; a.classList.remove('swap-out'); }, 280);
}

/* ---- "pick your three": fill the slots, add them all at once ---- */
var PICKS = [], _pickNew = -1;
function builderHTML(){
  var q = Math.max(2, FUDGIO.bundleQty|0), n = PICKS.length, slots = '';
  for(var i=0;i<q;i++){
    var p = PICKS[i] && getProduct(PICKS[i]);
    slots += p ? '<button type="button" class="slot on'+(i===_pickNew?' pop':'')+'" data-unpick="'+i+'" aria-label="Remove '+esc(p.name)+'"><div class="bn">'+bandanaSVG(p.color, p.ink)+'</div><span class="x" aria-hidden="true">×</span></button>'
               : '<span class="slot" aria-hidden="true"><b>'+(i+1)+'</b></span>';
  }
  var sws = visibleProducts().filter(function(p){ return inStock(p, PICKS.filter(function(x){ return x===p.slug; }).length + 1); }).map(function(p){
    return '<button type="button" class="sw-b" data-pick="'+esc(p.slug)+'" style="background:'+esc(p.color)+'" title="'+esc(p.name)+'" aria-label="Add '+esc(p.name)+' to your three"'+(n>=q?' disabled':'')+'></button>';
  }).join('');
  var sum = 0; PICKS.forEach(function(sl){ var p = getProduct(sl); if(p) sum += unitPrice(p); });
  var off = n >= q ? Math.round(sum * FUDGIO.bundlePct / 100) : 0;
  var line = !n ? 'Tap a colour to fill a slot. Repeats are fine.'
    : (n < q ? (q-n)+' more to go · '+money(sum)+' so far'
             : '<s>'+money(sum)+'</s> <b>'+money(sum-off)+'</b> · you save '+money(off)+'<br><span class="hint">Tap a bandana to swap it.</span>');
  // Once every slot is full the colour dots step aside; tap a slot to swap one out.
  return '<div class="slots">'+slots+'</div>'+(n < q ? '<div class="pick" role="group" aria-label="Colours">'+sws+'</div>' : '')
    +'<p class="sum" aria-live="polite">'+line+'</p>'
    +(n >= q ? '<button type="button" class="btn btn-dark" data-pick-add>Add all '+q+' to bag <svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>'
             : '<a class="btn btn-dark" href="/shop">Or browse every colour</a>');
}

/* ---- page widgets: every one redraws from state on emit() ---- */
function paintHeader(){
  var c = document.getElementById('cartCount');
  if(c){ var n = cartUnits(); if(c.textContent !== String(n)){ c.textContent = n; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } c.classList.toggle('has', n > 0); }
  var b = document.getElementById('curBtn');
  if(b){ b.hidden = !FUDGIO.intlEnabled; b.textContent = isPK() ? 'PKR ₨' : 'USD $'; b.title = isPK() ? 'Prices in rupees. Switch to US dollars' : 'Prices in US dollars. Switch to rupees'; }
  var a = document.getElementById('announce');
  if(a){ ANN = announcements(); showAnnouncement(a, false); }
  var cl = document.getElementById('closedNote');
  if(!FUDGIO.storeOpen && !cl && a){ cl = document.createElement('div'); cl.id='closedNote'; cl.className='closed-note'; cl.textContent='We are not taking orders right now — browse away, and check back soon.'; a.parentNode.insertBefore(cl, a.nextSibling); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-ig]'), function(el){
    if(FUDGIO.instagram){ el.hidden = false; el.href = 'https://instagram.com/'+encodeURIComponent(FUDGIO.instagram); if(el.hasAttribute('data-ig-handle')) el.textContent = '@'+FUDGIO.instagram; } else el.hidden = true;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function(el){
    if(FUDGIO.whatsapp){ el.hidden = false; el.href = 'https://wa.me/'+FUDGIO.whatsapp; } else el.hidden = true;
  });
}
function paintBits(){
  var set = function(sel, fn){ Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  set('[data-from]', function(el){ el.textContent = 'From '+money(fromPrice()); });
  // "8 colours" stays true when the admin adds or hides one.
  var n = visibleProducts().length;
  var WORDS = ['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  set('[data-count]', function(el){ el.textContent = n; });
  set('[data-count-word]', function(el){ el.textContent = WORDS[n] || n; });
  set('[data-price-one]', function(el){ el.textContent = money(fromPrice()); });
  set('[data-pct]', function(el){ el.textContent = FUDGIO.bundlePct; });
  set('[data-qty]', function(el){ el.textContent = FUDGIO.bundleQty; });
  set('[data-days]', function(el){ el.textContent = isPK() ? FUDGIO.daysPk : FUDGIO.daysIntl; });
  set('[data-days-pk]', function(el){ el.textContent = FUDGIO.daysPk; });
  set('[data-days-intl]', function(el){ el.textContent = FUDGIO.daysIntl; });
  set('[data-ship]', function(el){ el.textContent = shipLine(); });
  set('[data-s]', function(el){
    var k = el.getAttribute('data-s'), v = FUDGIO[k];
    if(k==='deliveryFee'||k==='freeOver') v = money(v,'PK');
    if(k==='intlShipping'||k==='intlFreeOver') v = money(v,'INTL');
    el.textContent = v;
  });
  set('[data-only]', function(el){ el.hidden = el.getAttribute('data-only') !== REGION; });
  set('[data-bundle-sum]', function(el){
    var q = Math.max(2, FUDGIO.bundleQty|0), one = fromPrice(), full = one*q, off = Math.round(full*FUDGIO.bundlePct/100);
    el.innerHTML = q+' × '+money(one)+' = <s>'+money(full)+'</s> '+money(full-off);
  });
  set('[data-trio]', function(el){
    var v = visibleProducts(), pick = [v[0], v[2], v[4]].filter(Boolean);
    el.innerHTML = pick.map(function(p){ return '<div class="bn">'+bandanaSVG(p.color, p.ink)+'</div>'; }).join('');
  });
  set('[data-builder]', function(el){ el.innerHTML = builderHTML(); _pickNew = -1; });
  set('[data-sticker]', function(el){ var t = 'Buy any '+FUDGIO.bundleQty+' · save '+FUDGIO.bundlePct+'% · '; el.textContent = t+t; });
  set('[data-sticker-wrap]', function(el){ el.hidden = !FUDGIO.bundlePct; });
  set('[data-deal-meter]', function(el){
    var n = cartUnits();
    el.hidden = !n || !FUDGIO.bundlePct;
    if(!el.hidden) el.innerHTML = dealMeterHTML();
  });
  set('[data-grid]', function(el){
    var ex = el.getAttribute('data-exclude'), lim = +el.getAttribute('data-limit') || 0;
    var list = visibleProducts().filter(function(p){ return p.slug !== ex; });
    if(lim) list = list.slice(0, lim);
    el.innerHTML = list.map(productCardHTML).join('');
    revealIn(el);
  });
  if(document.getElementById('drawer')) renderDrawer();
}

/* ---- the product page ---- */
var PD = null;
function initProduct(slug){
  var root = document.querySelector('[data-pd-root]'); if(!root) return;
  PD = { slug: slug, qty: 1 };
  if(!root.querySelector('.pd') && getProduct(slug)) root.innerHTML = productPageHTML(getProduct(slug));
  root.addEventListener('click', function(e){
    var t = e.target.closest('button'); if(!t || !PD) return;
    var p = getProduct(PD.slug); if(!p) return;
    if(t.classList.contains('view-btn')){
      var v = t.getAttribute('data-view');
      document.getElementById('pdStage').setAttribute('data-view', v);
      Array.prototype.forEach.call(root.querySelectorAll('.view-btn'), function(b){ var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      return;
    }
    if(t.id === 'pdMinus'){ PD.qty = Math.max(1, PD.qty - 1); paintProduct(); }
    if(t.id === 'pdPlus'){ var max = Math.min(20, p.stock === undefined ? 20 : p.stock); if(PD.qty >= max){ toast('That is all we have of this colour'); return; } PD.qty++; paintProduct(); }
    if(t.id === 'pdAdd'){ var b0 = cartUnits(); if(addToCart(p, PD.qty)){ PD.qty = 1; celebrateIfUnlocked(b0); openBag(); } }
    if(t.id === 'pdBuy'){ if(addToCart(p, PD.qty)) location.href = '/checkout'; }
  });
  var bar = document.createElement('div');
  bar.className = 'buy-bar'; bar.id = 'buyBar';
  bar.innerHTML = '<div class="bb-name"><b></b><span></span></div><button type="button" class="btn btn-primary">Add to bag</button>';
  bar.querySelector('button').onclick = function(){ var p = getProduct(PD.slug); if(p && addToCart(p, 1)) openBag(); };
  document.body.appendChild(bar); document.body.classList.add('has-buy-bar');
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){ es.forEach(function(e){ bar.classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top < 0); }); }).observe(document.getElementById('pdAdd') || root);
  }
  onChange(paintProduct);
  paintProduct();
}
function paintProduct(){
  var root = document.querySelector('[data-pd-root]'); if(!root || !PD) return;
  var p = getProduct(PD.slug);
  if(!p || (p.hidden && _ready.catalog)){
    if(_ready.catalog) root.innerHTML = '<div class="empty" style="padding:96px 0"><h1 class="h2">This colour is not available</h1><p class="lede">It may have sold out for good. Every other colour is in the shop.</p><a class="btn btn-primary" href="/shop">Shop all colours</a></div>';
    return;
  }
  if(!root.querySelector('.pd')) root.innerHTML = productPageHTML(p);
  if(!p.isStatic) document.title = p.name + ' Bandana — 100% Cotton, 55 cm | Fudgio';
  var $ = function(id){ return document.getElementById(id); };
  var stage = $('pdStage');
  var hasPhoto = !!p.image, showsPhoto = !!stage.querySelector('img');
  if(hasPhoto !== showsPhoto || (hasPhoto && stage.querySelector('img').getAttribute('src') !== p.image)){
    stage.className = 'pd-stage'+(hasPhoto?' photo':''); stage.innerHTML = stageHTML(p);
    var vw = root.querySelector('.pd-views'); if(vw) vw.hidden = hasPhoto;
  }
  var unit = unitPrice(p), out = !inStock(p);
  $('pdPrice').innerHTML = money(unit)+' <small>'+(isPK() ? 'Cash on delivery' : 'Paid before it ships · USD')+'</small>';
  var swh = swatchesHTML(p); if(PD.sw !== swh){ PD.sw = swh; $('pdSw').innerHTML = swh; }   // only redraw on a real change, so the pop-in plays once
  var st = $('pdStock');
  st.className = 'stock-line'+(out ? ' out' : (p.stock !== undefined && p.stock <= 8 ? ' low' : ''));
  st.textContent = out ? 'Sold out — back soon' : (p.stock !== undefined && p.stock <= 8 ? 'Only '+p.stock+' left' : 'In stock')
    + (out ? '' : ' · '+(isPK() ? 'delivered in '+FUDGIO.daysPk+' days across Pakistan' : 'ships worldwide in '+FUDGIO.daysIntl+' days'));
  $('pdQty').textContent = PD.qty;
  $('pdAdd').disabled = out; $('pdBuy').disabled = out;
  $('pdAdd').textContent = out ? 'Sold out' : 'Add to bag — '+money(unit*PD.qty);
  var dl = root.querySelector('[data-deal-line]');
  var deal = $('pdDeal');
  deal.hidden = !FUDGIO.bundlePct;
  if(dl){
    var inBag = qtyInBag(p.slug), left = dealLeft();
    dl.textContent = !cartUnits() ? 'Buy any '+FUDGIO.bundleQty+', save '+FUDGIO.bundlePct+'%.' : (left ? 'Add '+left+' more to save '+FUDGIO.bundlePct+'%.' : FUDGIO.bundlePct+'% off is unlocked.');
    root.querySelector('[data-pct-badge]').textContent = FUDGIO.bundlePct+'%';
  }
  var sp = root.querySelector('[data-ship-pk]'), si = root.querySelector('[data-ship-intl]');
  if(sp) sp.textContent = 'Pakistan: cash on delivery, '+(FUDGIO.deliveryFee ? money(FUDGIO.deliveryFee,'PK')+(FUDGIO.freeOver ? ' (free over '+money(FUDGIO.freeOver,'PK')+')' : '') : 'free')+', '+FUDGIO.daysPk+' working days.';
  if(si) si.textContent = 'Worldwide: '+(FUDGIO.intlShipping ? money(FUDGIO.intlShipping,'INTL')+' flat' : 'free shipping')+', paid before it ships, '+FUDGIO.daysIntl+' working days.';
  var bar = $('buyBar');
  if(bar){ bar.querySelector('b').textContent = p.name; bar.querySelector('span').textContent = money(unit); bar.querySelector('button').disabled = out; }
}

/* ---- little moments ---- */
var REDUCE = HAS_DOM && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A copy of the bandana flies from the card into the bag button. */
function flyToBag(from){
  var bag = document.getElementById('bagBtn');
  if(REDUCE || !from || !bag || !from.animate) return;
  var a = from.getBoundingClientRect(), b = bag.getBoundingClientRect();
  if(!a.width) return;
  var g = from.cloneNode(true);
  g.className = (from.tagName === 'IMG' ? '' : 'bn ') + 'fly';
  g.style.cssText = 'position:fixed;left:'+a.left+'px;top:'+a.top+'px;width:'+a.width+'px;height:'+a.height+'px;z-index:150;pointer-events:none;margin:0';
  document.body.appendChild(g);
  var dx = b.left + b.width/2 - (a.left + a.width/2), dy = b.top + b.height/2 - (a.top + a.height/2);
  g.animate([
    { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
    { transform: 'translate('+dx*.5+'px,'+(dy*.5-80)+'px) rotate(-120deg) scale(.55)', opacity: 1, offset: .55 },
    { transform: 'translate('+dx+'px,'+dy+'px) rotate(-260deg) scale(.08)', opacity: .4 }
  ], { duration: 820, easing: 'cubic-bezier(.5,0,.2,1)' }).onfinish = function(){ g.remove(); };
}
/** Confetti of tiny bandanas the moment the bag reaches the deal. */
function celebrateIfUnlocked(before){
  var q = Math.max(2, FUDGIO.bundleQty|0);
  if(!FUDGIO.bundlePct || before >= q || cartUnits() < q || REDUCE || !document.body.animate) return;
  var cols = ['#FF6A13','#FF2E88','#FFFFFF','#C3201B','#1D2B5C','#D9A21B'];
  var bag = document.getElementById('bagBtn'), r = bag ? bag.getBoundingClientRect() : { left: innerWidth/2, top: innerHeight/2, width: 0, height: 0 };
  var ox = r.left + r.width/2, oy = r.top + r.height/2;
  for(var i=0;i<28;i++){
    var c = document.createElement('i');
    var sz = 7 + Math.random()*9;
    c.style.cssText = 'position:fixed;left:'+ox+'px;top:'+oy+'px;width:'+sz+'px;height:'+sz+'px;background:'+cols[i%cols.length]+';border-radius:2px;z-index:160;pointer-events:none';
    document.body.appendChild(c);
    var ang = Math.PI*(0.15 + Math.random()*0.7), dist = 120 + Math.random()*220;
    var dx = -Math.cos(ang)*dist*(Math.random()<.5?1:-1), dy = Math.sin(ang)*dist;
    c.animate([
      { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
      { transform: 'translate('+dx+'px,'+(dy*.6)+'px) rotate('+(Math.random()*540)+'deg)', opacity: 1, offset: .6 },
      { transform: 'translate('+dx*1.1+'px,'+(dy+160)+'px) rotate('+(Math.random()*900)+'deg)', opacity: 0 }
    ], { duration: 1100 + Math.random()*500, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = (function(el){ return function(){ el.remove(); }; })(c);
  }
}

/* ---- entrance animations: opt-in per element, re-runnable ---- */
var _io = null, _seen = 0;
var REVEAL = '.card,.way,.perk,.box,.reveal-me,.faq details';
function revealIn(root){
  if(!_io) return;
  Array.prototype.forEach.call((root || document).querySelectorAll(REVEAL), function(t){
    if(t.getAttribute('data-rv')) return;
    t.setAttribute('data-rv','1');
    var r = t.getBoundingClientRect();
    if(r.top < innerHeight && r.bottom > 0) return;           // already on screen: leave it be
    t.style.animationDelay = ((_seen++ % 4) * 70) + 'ms';
    t.classList.add('fu-hidden'); _io.observe(t);
  });
}

if(HAS_DOM) (function(){
  function ready(fn){ if(document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduce && 'IntersectionObserver' in window){
    _io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('reveal'); _io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -40px 0px' });
  }
  onChange(paintHeader);
  onChange(paintBits);
  // Another tab changed the bag.
  window.addEventListener('storage', function(e){ if(e.key === 'fudgio_cart' || e.key === 'fudgio_region') emit(); });

  ready(function(){
    // header: menu, currency, bag
    var hdr = document.querySelector('.site-header');
    var mb = document.getElementById('menuBtn');
    if(mb) mb.onclick = function(){ var o = document.body.classList.toggle('menu-open'); mb.setAttribute('aria-expanded', o); document.body.classList.toggle('lock', o); };
    Array.prototype.forEach.call(document.querySelectorAll('.nav-links a'), function(a){ a.addEventListener('click', function(){ document.body.classList.remove('menu-open','lock'); }); });
    var cb = document.getElementById('curBtn');
    if(cb) cb.onclick = function(){ setRegion(isPK() ? 'INTL' : 'PK'); toast(isPK() ? 'Prices in rupees · cash on delivery in Pakistan' : 'Prices in US dollars · shipping worldwide'); };
    document.addEventListener('click', function(e){
      var b = e.target.closest('#bagBtn,[data-open-bag]');
      if(b){ var p = location.pathname.replace(/\/$/,''); if(p !== '/cart' && p !== '/checkout'){ e.preventDefault(); openBag(); } return; }
      var pk = e.target.closest('[data-pick],[data-unpick],[data-pick-add]');
      if(pk){
        var q = Math.max(2, FUDGIO.bundleQty|0);
        if(pk.hasAttribute('data-pick') && PICKS.length < q){ PICKS.push(pk.getAttribute('data-pick')); _pickNew = PICKS.length - 1; }
        if(pk.hasAttribute('data-unpick')) PICKS.splice(+pk.getAttribute('data-unpick'), 1);
        if(pk.hasAttribute('data-pick-add')){
          var before0 = cartUnits(), ok = true;
          PICKS.forEach(function(sl){ var pp = getProduct(sl); if(pp && !addToCart(pp, 1)) ok = false; });
          if(ok){ PICKS = []; celebrateIfUnlocked(before0); openBag(); }
        }
        emit();
        return;
      }
      var add = e.target.closest('[data-add]');
      if(add){
        var pr = getProduct(add.getAttribute('data-add'));
        var before = cartUnits();
        if(pr && addToCart(pr, 1)){
          var card = add.closest('.card');
          flyToBag(card && card.querySelector('.tile .bn, .tile img'));
          celebrateIfUnlocked(before);
          var left = dealLeft();
          toast(pr.name+' added'+(FUDGIO.bundlePct ? (left ? ' — '+left+' more for '+FUDGIO.bundlePct+'% off' : ' — '+FUDGIO.bundlePct+'% off unlocked') : ''), { label: 'View bag', fn: openBag });
        }
      }
    });
    if(hdr){ var onScroll = function(){ hdr.classList.toggle('scrolled', scrollY > 8); }; addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
    var here = location.pathname.replace(/\/$/,'') || '/';
    Array.prototype.forEach.call(document.querySelectorAll('.nav-link'), function(a){
      var h = (a.getAttribute('href')||'').replace(/\/$/,'');
      if(h === here || (h === '/shop' && (here.indexOf('/bandanas/') === 0 || here === '/bandana'))) a.classList.add('on');
    });
    var yr = document.getElementById('yr'); if(yr) yr.textContent = new Date().getFullYear();

    // the hero bandanas lean towards the pointer
    var art = document.querySelector('.hero-art');
    if(art && !reduce && matchMedia('(hover:hover)').matches){
      art.addEventListener('pointermove', function(e){
        var r = art.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        Array.prototype.forEach.call(art.querySelectorAll('.float .bn'), function(b, i){ var k = (i + 1) * 9; b.style.setProperty('--px', (x * k)+'px'); b.style.setProperty('--py', (y * k)+'px'); });
      });
      art.addEventListener('pointerleave', function(){ Array.prototype.forEach.call(art.querySelectorAll('.float .bn'), function(b){ b.style.setProperty('--px','0px'); b.style.setProperty('--py','0px'); }); });
    }

    // newsletter
    Array.prototype.forEach.call(document.querySelectorAll('form[data-news]'), function(f){
      f.addEventListener('submit', function(e){
        e.preventDefault();
        var inp = f.querySelector('input[type=email]'), msg = f.querySelector('.news-msg'), btn = f.querySelector('button');
        if(!validEmail(inp.value)){ msg.className = 'news-msg bad'; msg.textContent = 'Please enter a valid email address.'; inp.focus(); return; }
        btn.disabled = true;
        api('POST', '/api/subscribe', { email: inp.value.trim(), source: location.pathname, website: (f.querySelector('.hp')||{}).value || '' }, function(ok, d){
          btn.disabled = false;
          msg.className = 'news-msg ' + (ok ? 'ok' : 'bad');
          msg.textContent = ok ? 'You’re on the list. We’ll email you when new colours drop.' : (d.error || 'That did not work. Please try again.');
          if(ok) inp.value = '';
        });
      });
    });

    // the announcement bar takes turns between its messages
    var annEl = document.getElementById('announce');
    if(annEl && !REDUCE) setInterval(function(){ if(document.hidden || ANN.length < 2) return; _annI++; showAnnouncement(annEl, true); }, 4200);

    // the hero's front bandana tries on every colour, until you pick one
    var front = document.querySelector('.f3 .bn'), heroSw = document.querySelector('[data-hero-sw]');
    if(front && heroSw){
      var cycle = null, ci = 0;
      var wear = function(p){
        if(!p) return;
        front.classList.remove('swap'); void front.offsetWidth;
        front.innerHTML = bandanaSVG(p.color, p.ink); front.classList.add('swap');
        Array.prototype.forEach.call(heroSw.querySelectorAll('button'), function(b){ b.classList.toggle('on', b.getAttribute('data-c') === p.slug); });
        var nm = document.querySelector('[data-hero-name]'); if(nm) nm.textContent = p.name;
      };
      var paintSw = function(){
        heroSw.innerHTML = visibleProducts().map(function(p){ return '<button type="button" data-c="'+esc(p.slug)+'" style="background:'+esc(p.color)+'" aria-label="Show '+esc(p.name)+'" title="'+esc(p.name)+'"></button>'; }).join('');
        var cur = visibleProducts()[ci % Math.max(1, visibleProducts().length)];
        if(cur){ var b = heroSw.querySelector('[data-c="'+cur.slug+'"]'); if(b) b.classList.add('on'); }
      };
      paintSw(); onChange(paintSw);
      heroSw.addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; clearInterval(cycle); cycle = null; wear(getProduct(b.getAttribute('data-c'))); });
      heroSw.addEventListener('mouseover', function(e){ var b = e.target.closest('button'); if(!b) return; clearInterval(cycle); cycle = null; wear(getProduct(b.getAttribute('data-c'))); });
      if(!REDUCE) cycle = setInterval(function(){ if(document.hidden) return; var v = visibleProducts(); if(!v.length) return; ci = (ci + 1) % v.length; wear(v[ci]); }, 3200);
    }

    // a thin progress line under the header as you scroll
    var prog = document.createElement('div'); prog.className = 'scroll-prog'; prog.setAttribute('aria-hidden','true');
    if(hdr){ hdr.appendChild(prog); addEventListener('scroll', function(){ var h = document.documentElement; prog.style.transform = 'scaleX('+Math.min(1, scrollY / Math.max(1, h.scrollHeight - innerHeight))+')'; }, { passive: true }); }

    // cards lean towards the pointer
    if(!reduce && matchMedia('(hover:hover)').matches){
      document.addEventListener('pointermove', function(e){
        var t = e.target.closest && e.target.closest('.tile'); if(!t) return;
        var r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        t.style.setProperty('--tx', (x * 10).toFixed(2)+'deg'); t.style.setProperty('--ty', (-y * 10).toFixed(2)+'deg');
      });
      document.addEventListener('pointerout', function(e){ var t = e.target.closest && e.target.closest('.tile'); if(t && !t.contains(e.relatedTarget)){ t.style.removeProperty('--tx'); t.style.removeProperty('--ty'); } });
    }

    var pd = document.querySelector('[data-pd-root]');
    if(pd){
      var slug = pd.getAttribute('data-pd-root') || new URLSearchParams(location.search).get('c') || '';
      initProduct(slug);
    }
    emit();
    revealIn(document);

    // live data
    api('GET', '/api/products', null, function(ok, rows){ if(ok) mergeLive(rows); _ready.catalog = true; emit(); });
    api('GET', '/api/storefront', null, function(ok, d){ if(ok) applySettings(d); _ready.settings = true; emit(); });
    try{
      var vid = localStorage.getItem('fud_vid');
      if(!vid){ vid = Date.now().toString(36) + Math.random().toString(36).slice(2,8); localStorage.setItem('fud_vid', vid); }
      api('POST', '/api/visit', { page: location.pathname || '/', visitor: vid }, function(){});
    }catch(e){}
  });
})();
