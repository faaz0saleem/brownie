/* Fudgio shared storefront logic: catalog + cart (used by every page) */
var FUDGIO = { whatsapp:'', email:'faaz.saleem@fudgio.com', currency:'Rs', freeOver:2500, deliveryFee:150, city:'Lahore' };

/* Three flavours, and exactly three ways to buy each one: a single brownie to
   try it, a box of 6, or a box of 9. Keep this list in step with db_seed() in
   api/db.php — the API is the source of truth once the site is live, and
   loadLiveStock() below overwrites these prices with whatever the admin has
   set. This copy exists so the page is never blank while that request runs. */
var PRODUCTS = [
  { id:'chocolate', slug:'chocolate', path:'/brownies/classic-chocolate', image:'/assets/brownie-chocolate.svg', name:'Classic Chocolate', emoji:'🍫',
    gradient:'linear-gradient(135deg,#0b0a0a,#ff6a13)', featured:true, containsNuts:false,
    tagline:'The original, impossibly fudgy',
    desc:'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter. The one everyone comes back for.',
    sizes:[{label:'Single brownie',pieces:1,price:190},{label:'Box of 6',pieces:6,price:900},{label:'Box of 9',pieces:9,price:1290}],
    allergens:['Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'nutty-delight', slug:'nutty-delight', path:'/brownies/nutty-delight', image:'/assets/brownie-nutty.svg', name:'Nutty Delight', emoji:'🌰',
    gradient:'linear-gradient(135deg,#ff6a13,#ff2e88)', featured:true, containsNuts:true,
    tagline:'Loaded with toasted nuts',
    desc:'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe. For serious nut lovers.',
    sizes:[{label:'Single brownie',pieces:1,price:220},{label:'Box of 6',pieces:6,price:1050},{label:'Box of 9',pieces:9,price:1490}],
    allergens:['Tree nuts (walnut, hazelnut)','Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'salted-caramel', slug:'salted-caramel', path:'/brownies/salted-caramel', image:'/assets/brownie-caramel.svg', name:'Salted Caramel', emoji:'🍯',
    gradient:'linear-gradient(135deg,#ff2e88,#0b0a0a)', featured:true, containsNuts:false,
    tagline:'Sweet, salty, unforgettable',
    desc:'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe. The perfect balance of sweet and salty.',
    sizes:[{label:'Single brownie',pieces:1,price:220},{label:'Box of 6',pieces:6,price:1050},{label:'Box of 9',pieces:9,price:1490}],
    allergens:['Gluten (wheat)','Dairy','Eggs','Soy'] }
];
function getProduct(slug){ for(var i=0;i<PRODUCTS.length;i++) if(PRODUCTS[i].slug===slug) return PRODUCTS[i]; return null; }
function fromPrice(p){ return Math.min.apply(null, p.sizes.map(function(s){return s.price;})); }

/* ---- Live stock & prices from the admin ----------------------------------
   The catalog above renders instantly so the page is never blank, then this
   layers the real numbers on top. Without it the admin's "out of stock" switch
   would have no effect on the shop and a customer could reach checkout with a
   brownie we cannot bake. `stock` is undefined until this resolves, and
   inStock() treats undefined as available so nothing is hidden by mistake. */
function inStock(p){ return !p || p.stock === undefined || p.stock > 0; }
function loadLiveStock(done){
  var finish = function(){ if(done) done(); };
  try{
    var x = new XMLHttpRequest();
    x.open('GET','/api/products',true);
    x.timeout = 6000;
    x.onload = function(){
      try{
        var rows = JSON.parse(x.responseText);
        // Only trust a well-formed, non-empty catalog. Anything else is left
        // alone: showing the brownies we know about beats greying out the whole
        // menu because one response came back odd.
        if(Object.prototype.toString.call(rows) !== '[object Array]' || !rows.length) return finish();
        var live = {}, matched = 0;
        rows.forEach(function(r){ if(r && r.slug) live[r.slug] = r; });
        PRODUCTS.forEach(function(p){ if(live[p.slug]) matched++; });
        if(!matched) return finish();      // slugs don't line up — don't guess
        PRODUCTS.forEach(function(p){
          var r = live[p.slug];
          if(!r) return;                                       // leave as-is
          if(r.active === false){ p.stock = 0; return; }        // hidden by the admin
          if(r.stock !== undefined && r.stock !== null && !isNaN(Number(r.stock))) p.stock = Number(r.stock);
          if(r.sizes && r.sizes.length) p.sizes = r.sizes;
          // A real photo uploaded in the admin always beats the drawn default.
          if(r.imageUrl) p.image = r.imageUrl;
        });
      }catch(e){}
      finish();
    };
    x.onerror = finish; x.ontimeout = finish;
    x.send();
  }catch(e){ finish(); }
}


/* The art for a product: its photo if one has been uploaded, otherwise the
   drawn brownie, otherwise the emoji. Images are decorative here — the name
   sits next to them in text — so alt stays empty for screen readers. */
function productArtHTML(p, cls){
  if(p.image) return '<img class="'+(cls||'art-img')+'" src="'+p.image+'" alt="" loading="lazy" decoding="async"/>';
  return '<span>'+p.emoji+'</span>';
}

function money(n){ return FUDGIO.currency + ' ' + Number(n).toLocaleString('en-US'); }
function getCart(){ try{ return JSON.parse(localStorage.getItem('fudgio_cart')||'[]'); }catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('fudgio_cart', JSON.stringify(c)); updateCount(); }
function cartQty(){ return getCart().reduce(function(s,i){return s+i.qty;},0); }
function updateCount(){ var el=document.getElementById('cartCount'); if(el) el.textContent=cartQty(); }
function cartSubtotal(){ return getCart().reduce(function(s,i){return s+i.price*i.qty;},0); }
function cartDelivery(){ return cartSubtotal()>=FUDGIO.freeOver?0:FUDGIO.deliveryFee; }
function cartTotal(){ return cartSubtotal()+cartDelivery(); }
function addToCart(product, sizeLabel, price, qty){
  var cart=getCart(), key=product.id+'::'+(sizeLabel||'');
  var ex=cart.filter(function(i){return i.key===key;})[0];
  if(ex) ex.qty+=qty;
  else cart.push({key:key,id:product.id,name:product.name,emoji:product.emoji,image:product.image||'',gradient:product.gradient,size:sizeLabel||'',price:price,qty:qty});
  saveCart(cart); toast(qty+' × '+product.name+' added 🎉');
}
var _tt;
function toast(m){ var t=document.getElementById('toast'); if(!t)return; t.textContent=m; t.classList.add('show'); clearTimeout(_tt); _tt=setTimeout(function(){t.classList.remove('show');},2000); }

/* mobile hamburger + active nav (runs on every page) */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    var nav=document.querySelector('.site-header .nav'); if(!nav) return;
    var links=nav.querySelector('.nav-links'); var cart=nav.querySelector('.cart-btn');
    if(links && cart){
      var b=document.createElement('button'); b.className='menu-toggle'; b.setAttribute('aria-label','Menu'); b.innerHTML='☰';
      b.onclick=function(){ links.classList.toggle('open'); };
      nav.insertBefore(b, cart);
    }
    // highlight the current page in the nav
    var here=location.pathname.replace(/\/$/,'')||'/';
    (links?links.querySelectorAll('a'):[]).forEach(function(a){
      var href=a.getAttribute('href')||''; var path=href.split('#')[0].replace(/\/$/,'')||'/';
      if((here==='/'&&href.indexOf('#')===0)) return;
      if(path===here && !(here==='/' && href.charAt(0)==='#')) a.classList.add('active');
    });
    // Footer bits that appear on every page, filled here so each page does not
    // need its own copy of the same two lines.
    var yr=document.getElementById('yr'); if(yr) yr.textContent=new Date().getFullYear();
    var mail=document.getElementById('mail');
    if(mail && FUDGIO.email){ mail.href='mailto:'+FUDGIO.email; if(!mail.textContent.trim()) mail.textContent=FUDGIO.email; }
    updateCount();
  });
})();

/* validation helpers */
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test((e||'').trim()); }
function validPhone(p){ var d=(p||'').replace(/\D/g,''); return d.length>=10 && d.length<=15; }

/* anonymous visit tracking → admin analytics (fire-and-forget) */
(function(){
  try{
    var vid=localStorage.getItem('fud_vid');
    if(!vid){ vid=Date.now().toString(36)+Math.random().toString(36).slice(2,8); localStorage.setItem('fud_vid',vid); }
    var x=new XMLHttpRequest(); x.open('POST','/api/visit',true); x.setRequestHeader('Content-Type','application/json');
    x.send(JSON.stringify({page:location.pathname||'/', visitor:vid}));
  }catch(e){}
})();

/* ---- Store settings: announcement bar, delivery pricing, open/closed ----
   The admin owns the delivery fee and the free-delivery threshold, and the
   server charges from those values. Fetching them here keeps the cart's
   arithmetic identical to the server's instead of quoting from a stale
   hardcoded copy. The defaults in FUDGIO above are only what shows for the
   fraction of a second before this resolves. ---- */
var FUDGIO_SLOGAN = 'Life is short. Eat the brownie. 🍫 Handcrafted brownies, delivered fresh across Lahore — Cash on Delivery.';
var STORE_OPEN = true;
var _settingsWaiters = [];
/** Runs fn once store settings have loaded (or immediately if already done). */
function onStoreSettings(fn){ _settingsWaiters ? _settingsWaiters.push(fn) : fn(); }

(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }

  function applySettings(d){
    if(!d) return;
    if(typeof d.deliveryFee === 'number') FUDGIO.deliveryFee = d.deliveryFee;
    if(typeof d.freeDeliveryOver === 'number') FUDGIO.freeOver = d.freeDeliveryOver;
    if(d.currency) FUDGIO.currency = d.currency;
    if(d.storeOpen === false) STORE_OPEN = false;
  }

  function finish(){
    var q=_settingsWaiters; _settingsWaiters=null;
    if(q) q.forEach(function(fn){ try{ fn(); }catch(e){} });
  }

  ready(function(){
    var bar=document.getElementById('sloganBar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='sloganBar'; bar.className='slogan-bar';
      bar.innerHTML='<div class="wrap slogan-inner"><span class="slogan-text">'+FUDGIO_SLOGAN+'</span></div>';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    try{
      var x=new XMLHttpRequest(); x.open('GET','/api/storefront',true); x.timeout=6000;
      x.onload=function(){
        try{
          var d=JSON.parse(x.responseText);
          applySettings(d);
          if(d && d.announcement){ bar.querySelector('.slogan-text').textContent=d.announcement; }
          if(!STORE_OPEN) showClosedNotice();
        }catch(e){}
        finish();
      };
      x.onerror=finish; x.ontimeout=finish;
      x.send();
    }catch(e){ finish(); }
  });

  /* When the admin closes the store, say so at the top of every page rather
     than letting someone fill in a whole checkout and be refused at the end. */
  function showClosedNotice(){
    if(document.getElementById('closedNotice')) return;
    var n=document.createElement('div');
    n.id='closedNotice'; n.className='closed-notice';
    n.innerHTML='<div class="wrap">😴 <strong>We’re not taking orders right now.</strong> '
      +'You can still browse the menu — please check back soon.</div>';
    var bar=document.getElementById('sloganBar');
    if(bar && bar.nextSibling) document.body.insertBefore(n, bar.nextSibling);
    else document.body.insertBefore(n, document.body.firstChild);
  }
})();

/* ---- Entrance animations ------------------------------------------------
   Purely decorative, and deliberately opt-in per element: `.fu-hidden` (the
   class that sets opacity:0) is only ever added here, immediately before the
   element is handed to the observer. Anything the observer never sees stays
   visible.

   revealIn() is re-runnable and skips elements it has already handled, so
   code that injects markup later — the menu grid re-rendering with live
   stock, a product page building itself — just calls it again. Doing this
   with a plain CSS rule instead would blank out every re-rendered card,
   because the replacements are new nodes that nothing is observing. ---- */
var _fuIO = null, _fuSeen = 0;
var FU_REVEAL_SELECTOR = '.section-head,.card,.feature,.step,.quote,.cta-band,.panel,.pd-art,.pd-info';
function revealIn(root){
  if(!_fuIO) return;                                  // disabled: nothing to do
  var scope = root || document;
  var targets = scope.querySelectorAll(FU_REVEAL_SELECTOR);
  Array.prototype.forEach.call(targets, function(t){
    if(t.getAttribute('data-fu-reveal')) return;      // already being watched
    t.setAttribute('data-fu-reveal','1');
    t.style.animationDelay = Math.min((_fuSeen++ % 4) * 60, 180) + 'ms';
    t.classList.add('fu-hidden');
    _fuIO.observe(t);
  });
}
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || !('IntersectionObserver' in window)) return;   // _fuIO stays null
  _fuIO = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('reveal'); _fuIO.unobserve(e.target); } });
  },{rootMargin:'0px 0px -40px 0px',threshold:0});
  ready(function(){ revealIn(document); });
})();

/* ---- Quick-add straight from a product card ---- */
function quickAdd(ev, slug){
  ev.preventDefault(); ev.stopPropagation();
  var p=getProduct(slug); if(!p) return;
  if(!inStock(p)){ toast(p.name+' is sold out right now'); return; }
  var s=p.sizes[0];
  addToCart(p, s.label, s.price, 1);
}

/* ---- Render a product card (shared by home & menu) ---- */
function productCardHTML(p){
  var out = !inStock(p);
  return '<a class="card'+(out?' is-sold-out':'')+'" href="'+(p.path||('/product?b='+p.slug))+'">'
    +'<div class="card-art" style="background:'+p.gradient+'">'
    +(p.featured?'<span class="fav">★ Signature</span>':'')
    +(p.containsNuts?'<span class="nut-tag">⚠️ Contains nuts</span>':'')
    + productArtHTML(p)
    +(out?'<span class="sold-out-flag">Sold out</span>'
         :'<button class="quick-add" onclick="quickAdd(event,\''+p.slug+'\')">+ Quick add</button>')
    +'</div>'
    +'<div class="card-body"><h3>'+p.name+'</h3><div class="tagline">'+p.tagline+'</div>'
    +'<div class="card-foot"><div class="price">'+(out?'Sold out':'from '+money(fromPrice(p)))+'</div>'
    +'<span class="card-btn">'+(out?'See details →':'Choose →')+'</span></div></div></a>';
}

/* Render the grid now, then re-render once real stock arrives. Each paint
   replaces every card node, so the reveal observer has to be pointed at the
   new ones or they would sit at opacity:0 forever. */
function renderGrid(id){
  var el=document.getElementById(id); if(!el) return;
  var paint=function(){ el.innerHTML = PRODUCTS.map(productCardHTML).join(''); revealIn(el); };
  paint();
  loadLiveStock(paint);
}

/* ---- Product detail page renderer -------------------------------------
   Shared by every brownie page so each flavour can live at its own real URL
   (/brownies/classic-chocolate) with its own title, description and schema,
   instead of three products sharing one query-string page. ---- */
function renderProductDetail(slug){
  var root=document.getElementById('root');
  if(!root) return;
  if(!getProduct(slug)){ root.innerHTML='<div class="empty"><div class="em">🤔</div><p>Brownie not found.</p><a href="/menu" class="btn btn-primary" style="margin-top:16px">See the menu</a></div>'; return; }

  // Survives a repaint so the shopper does not lose their selection when the
  // live catalogue lands a moment after first paint.
  var state=null;

  /* Builds the whole page from the current catalogue entry. Called once
     immediately (so nothing is blank) and again when loadLiveStock resolves.
     It has to redraw everything, not just the stock line: the admin can
     change the photo, the prices and the sizes, and a page that only
     refreshed its stock note would keep showing the old ones — and quote a
     price the server will not honour at checkout. */
  function paint(){
    var p=getProduct(slug);
    var sizes=(p.sizes && p.sizes.length) ? p.sizes : [{label:'Standard',price:p.price||0}];

    // Keep the chosen size across a repaint when it still exists.
    var keep=state && sizes.filter(function(s){ return s.label===state.size; })[0];
    var base=keep || sizes[0];
    state={ size:base.label, price:Number(base.price), qty:(state?state.qty:1) };

    var crumb=document.getElementById('crumbName'); if(crumb) crumb.textContent=p.name;

    var out=!inStock(p);
    var note=out
      ? '<div class="stock-note out">😔 <strong>Out of stock</strong> — this one has sold out. It will be back soon.</div>'
      : (p.stock!==undefined && p.stock<=10
          ? '<div class="stock-note low">🔥 <strong>Only '+p.stock+' left</strong> — baked fresh to order</div>'
          : '<div class="stock-note in">✅ In stock &amp; baked fresh to order</div>');
    var nut=p.containsNuts?'<div class="nut-warning">⚠️ <div><strong>Allergy warning:</strong> This brownie contains <strong>nuts</strong>. If you have a nut allergy, please do not eat it.</div></div>':'';

    root.innerHTML='<div class="pd"><div class="pd-art" style="background:'+p.gradient+'">'+productArtHTML(p,'pd-img')+'</div>'
      +'<div class="pd-info"><h1>'+p.name+'</h1><div class="tagline">'+p.tagline+'</div><div class="desc">'+p.desc+'</div>'
      +'<div class="pd-price" id="price">'+money(state.price)+'</div>'
      +note
      +nut
      +'<div class="field-label">Choose your size</div><div class="choices" id="sizes">'
      +sizes.map(function(s){return '<div class="choice'+(s.label===state.size?' active':'')+'" data-p="'+s.price+'" data-l="'+s.label+'">'+s.label+'<small>'+money(s.price)+'</small></div>';}).join('')
      +'</div><div class="field-label">Quantity</div>'
      +'<div class="stepper"><button id="qm" aria-label="Decrease quantity">−</button><span id="qv">'+state.qty+'</span><button id="qp" aria-label="Increase quantity">+</button></div>'
      +'<div class="pd-actions">'
      +'<button class="btn btn-ghost" id="add"'+(out?' disabled':'')+'>🛒 Add to cart · <span id="bt">'+money(state.price*state.qty)+'</span></button>'
      +'<button class="btn btn-primary" id="buy"'+(out?' disabled':'')+'>⚡ Buy now</button></div>'
      +'<div style="margin-top:10px"><a href="/cart" style="color:var(--orange);font-weight:700;font-size:.9rem">View cart →</a></div>'
      +'<div class="allergen-box"><h4>🥜 Allergen information</h4><div class="allergen-list">'+(p.allergens||[]).map(function(a){return '<span>'+a+'</span>';}).join('')+'</div></div>'
      +'<div class="cod" style="margin-top:16px">💵 Cash on Delivery only — pay when it arrives</div>'
      +'<a href="/menu" class="back-link">← Back to menu</a>'
      +'</div></div>';

    // The sticky mobile bar lives on <body>, so reuse it instead of appending
    // a second one on every repaint.
    var bb=document.querySelector('.buy-bar');
    if(!bb){
      bb=document.createElement('div'); bb.className='buy-bar';
      bb.innerHTML='<span class="bb-price" id="bbPrice"></span>'
        +'<button class="btn btn-ghost" id="bbAdd">Add</button>'
        +'<button class="btn btn-primary" id="bbBuy">⚡ Buy now</button>';
      document.body.appendChild(bb);
      document.body.classList.add('has-buy-bar');
    }

    function sync(){
      document.getElementById('bt').textContent=money(state.price*state.qty);
      document.getElementById('price').textContent=money(state.price);
      document.getElementById('qv').textContent=state.qty;
      var e=document.getElementById('bbPrice'); if(e) e.textContent=money(state.price*state.qty);
    }
    var choices=root.querySelectorAll('#sizes .choice');
    Array.prototype.forEach.call(choices,function(el){
      el.onclick=function(){
        Array.prototype.forEach.call(choices,function(e){e.classList.remove('active');});
        el.classList.add('active');
        state.size=el.getAttribute('data-l'); state.price=Number(el.getAttribute('data-p')); sync();
      };
    });
    document.getElementById('qm').onclick=function(){ state.qty=Math.max(1,state.qty-1); sync(); };
    document.getElementById('qp').onclick=function(){ state.qty=Math.min(20,state.qty+1); sync(); };

    var add=function(){ addToCart(getProduct(slug),state.size,state.price,state.qty); };
    var buy=function(){ add(); location.href='/checkout'; };
    document.getElementById('add').onclick=add;
    document.getElementById('buy').onclick=buy;
    var bbAdd=document.getElementById('bbAdd'), bbBuy=document.getElementById('bbBuy');
    bbAdd.onclick=add; bbBuy.onclick=buy;
    bbAdd.disabled=out; bbBuy.disabled=out;
    if(out){ document.getElementById('add').innerHTML='Out of stock'; document.getElementById('buy').innerHTML='Out of stock'; }

    sync();
    revealIn(root);
  }

  paint();
  loadLiveStock(paint);
  updateCount();
}
