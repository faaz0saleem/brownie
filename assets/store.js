/* Fudgio shared storefront logic: catalog + cart (used by every page) */
var FUDGIO = { whatsapp:'', email:'faaz.saleem@fudgio.com', currency:'Rs', freeOver:2500, deliveryFee:150, city:'Lahore' };

var PRODUCTS = [
  { id:'chocolate', slug:'chocolate', path:'/brownies/classic-chocolate', image:'/assets/brownie-chocolate.svg', name:'Classic Chocolate', emoji:'🍫',
    gradient:'linear-gradient(135deg,#5b3a29,#2b1a12)', featured:true, containsNuts:false,
    tagline:'The original, impossibly fudgy',
    desc:'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter. The one everyone comes back for.',
    sizes:[{label:'Single brownie',price:190},{label:'Box of 6',price:900},{label:'Box of 9',price:1290},{label:'Box of 12',price:1650}],
    allergens:['Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'nutty-delight', slug:'nutty-delight', path:'/brownies/nutty-delight', image:'/assets/brownie-nutty.svg', name:'Nutty Delight', emoji:'🌰',
    gradient:'linear-gradient(135deg,#6d4c2f,#3a2417)', featured:true, containsNuts:true,
    tagline:'Loaded with toasted nuts',
    desc:'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe. For serious nut lovers.',
    sizes:[{label:'Single brownie',price:220},{label:'Box of 6',price:1050},{label:'Box of 9',price:1490},{label:'Box of 12',price:1920}],
    allergens:['Tree nuts (walnut, hazelnut)','Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'salted-caramel', slug:'salted-caramel', path:'/brownies/salted-caramel', image:'/assets/brownie-caramel.svg', name:'Salted Caramel', emoji:'🍯',
    gradient:'linear-gradient(135deg,#a06a34,#3b230f)', featured:true, containsNuts:false,
    tagline:'Sweet, salty, unforgettable',
    desc:'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe. The perfect balance of sweet and salty.',
    sizes:[{label:'Single brownie',price:220},{label:'Box of 6',price:1050},{label:'Box of 9',price:1490},{label:'Box of 12',price:1920}],
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

/* ---- Slogan / announcement bar (shown on every page, editable in admin) ---- */
var FUDGIO_SLOGAN = 'Life is short. Eat the brownie. 🍫 Handcrafted brownies, delivered fresh across Lahore — Cash on Delivery.';
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    if(document.getElementById('sloganBar')) return;
    var bar=document.createElement('div');
    bar.id='sloganBar'; bar.className='slogan-bar';
    bar.innerHTML='<div class="wrap slogan-inner"><span class="slogan-text">'+FUDGIO_SLOGAN+'</span></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    // Let the admin override the slogan from Settings → Announcement
    try{
      var x=new XMLHttpRequest(); x.open('GET','/api/announcement',true);
      x.onload=function(){ try{ var d=JSON.parse(x.responseText);
        if(d && d.announcement){ bar.querySelector('.slogan-text').textContent=d.announcement; } }catch(e){} };
      x.send();
    }catch(e){}
  });
})();

/* ---- Subtle entrance animation. Purely decorative: it only animates a
   transform, so content is visible at all times regardless of JS. ---- */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js-reveal');
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('reveal'); io.unobserve(e.target); } });
    },{rootMargin:'0px 0px -40px 0px',threshold:0});
    document.querySelectorAll('.section-head,.card,.feature,.step,.quote,.cta-band').forEach(function(t,i){
      t.style.animationDelay=Math.min((i%4)*60,180)+'ms';
      io.observe(t);
    });
  });
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

/* Render the grid now, then re-render once real stock arrives. */
function renderGrid(id){
  var el=document.getElementById(id); if(!el) return;
  var paint=function(){ el.innerHTML = PRODUCTS.map(productCardHTML).join(''); };
  paint();
  loadLiveStock(paint);
}

/* ---- Product detail page renderer -------------------------------------
   Shared by every brownie page so each flavour can live at its own real URL
   (/brownies/classic-chocolate) with its own title, description and schema,
   instead of three products sharing one query-string page. ---- */
function renderProductDetail(slug){
  var p=getProduct(slug), root=document.getElementById('root');
  if(!root) return;
  if(!p){ root.innerHTML='<div class="empty"><div class="em">🤔</div><p>Brownie not found.</p><a href="/menu" class="btn btn-primary" style="margin-top:16px">See the menu</a></div>'; return; }
  var crumb=document.getElementById('crumbName'); if(crumb) crumb.textContent=p.name;
  var state={size:p.sizes[0].label,price:p.sizes[0].price,qty:1};
  var nut=p.containsNuts?'<div class="nut-warning">⚠️ <div><strong>Allergy warning:</strong> This brownie contains <strong>nuts</strong>. If you have a nut allergy, please do not eat it.</div></div>':'';
  root.innerHTML='<div class="pd"><div class="pd-art" style="background:'+p.gradient+'">'+productArtHTML(p,'pd-img')+'</div>'
    +'<div class="pd-info"><h1>'+p.name+'</h1><div class="tagline">'+p.tagline+'</div><div class="desc">'+p.desc+'</div>'
    +'<div class="pd-price" id="price">from '+money(fromPrice(p))+'</div>'
    +'<div class="stock-note in">✅ In stock &amp; baked fresh to order</div>'
    +nut
    +'<div class="field-label">Choose your box size</div><div class="choices" id="sizes">'
    +p.sizes.map(function(s,i){return '<div class="choice'+(i===0?' active':'')+'" data-p="'+s.price+'" data-l="'+s.label+'">'+s.label+'<small>'+money(s.price)+'</small></div>';}).join('')
    +'</div><div class="field-label">Quantity</div>'
    +'<div class="stepper"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px">'
    +'<button class="btn btn-ghost" id="add">🛒 Add to cart · <span id="bt">'+money(p.sizes[0].price)+'</span></button>'
    +'<button class="btn btn-primary" id="buy">⚡ Buy now</button></div>'
    +'<div style="margin-top:10px"><a href="/cart" style="color:var(--accent);font-weight:600;font-size:.9rem">View cart →</a></div>'
    +'<div class="allergen-box"><h4>🥜 Allergen information</h4><div class="allergen-list">'+p.allergens.map(function(a){return '<span>'+a+'</span>';}).join('')+'</div></div>'
    +'<div class="cod" style="margin-top:16px">💵 Cash on Delivery only — pay when it arrives</div>'
    +'<a href="/menu" class="back-link">← Back to menu</a>'
    +'</div></div>';
  function sync(){ document.getElementById('bt').textContent=money(state.price*state.qty); document.getElementById('price').textContent=money(state.price); document.getElementById('qv').textContent=state.qty;
    var e=document.getElementById('bbPrice'); if(e) e.textContent=money(state.price*state.qty); }
  var sizes=document.querySelectorAll('#sizes .choice');
  Array.prototype.forEach.call(sizes,function(el){ el.onclick=function(){ Array.prototype.forEach.call(sizes,function(e){e.classList.remove('active');}); el.classList.add('active'); state.size=el.getAttribute('data-l'); state.price=Number(el.getAttribute('data-p')); sync(); }; });
  document.getElementById('qm').onclick=function(){ state.qty=Math.max(1,state.qty-1); sync(); };
  document.getElementById('qp').onclick=function(){ state.qty=Math.min(20,state.qty+1); sync(); };
  document.getElementById('add').onclick=function(){ addToCart(p,state.size,state.price,state.qty); };
  document.getElementById('buy').onclick=function(){ addToCart(p,state.size,state.price,state.qty); location.href='/checkout'; };

  var bb=document.createElement('div');
  bb.className='buy-bar';
  bb.innerHTML='<span class="bb-price" id="bbPrice">'+money(p.sizes[0].price)+'</span>'
    +'<button class="btn btn-ghost" id="bbAdd">Add</button>'
    +'<button class="btn btn-primary" id="bbBuy">⚡ Buy now</button>';
  document.body.appendChild(bb);
  document.getElementById('bbAdd').onclick=function(){ addToCart(p,state.size,state.price,state.qty); };
  document.getElementById('bbBuy').onclick=function(){ addToCart(p,state.size,state.price,state.qty); location.href='/checkout'; };

  loadLiveStock(function(){
    var live=getProduct(slug); if(!live) return;
    var note=document.querySelector('.stock-note');
    if(!inStock(live)){
      if(note){ note.className='stock-note out'; note.innerHTML='😔 <strong>Out of stock</strong> — this one has sold out. It will be back soon.'; }
      ['add','buy','bbAdd','bbBuy'].forEach(function(id){ var el=document.getElementById(id); if(el){ el.disabled=true; el.title='Out of stock'; } });
      document.getElementById('add').innerHTML='Out of stock';
      document.getElementById('buy').innerHTML='Out of stock';
    } else if(note && live.stock !== undefined && live.stock <= 10){
      note.innerHTML='🔥 <strong>Only '+live.stock+' left</strong> — baked fresh to order';
    }
  });
  updateCount();
}
