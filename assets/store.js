/* Fudgio shared storefront logic: catalog + cart (used by every page) */
var FUDGIO = { whatsapp:'', email:'faaz.saleem@fudgio.com', currency:'Rs', freeOver:2500, deliveryFee:150, city:'Lahore' };

var PRODUCTS = [
  { id:'chocolate', slug:'chocolate', name:'Classic Chocolate', emoji:'🍫',
    gradient:'linear-gradient(135deg,#5b3a29,#2b1a12)', featured:true, containsNuts:false,
    tagline:'The original, impossibly fudgy',
    desc:'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter. The one everyone comes back for.',
    sizes:[{label:'Single brownie',price:190},{label:'Box of 6',price:900},{label:'Box of 9',price:1290},{label:'Box of 12',price:1650}],
    allergens:['Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'nutty-delight', slug:'nutty-delight', name:'Nutty Delight', emoji:'🌰',
    gradient:'linear-gradient(135deg,#6d4c2f,#3a2417)', featured:true, containsNuts:true,
    tagline:'Loaded with toasted nuts',
    desc:'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe. For serious nut lovers.',
    sizes:[{label:'Single brownie',price:220},{label:'Box of 6',price:1050},{label:'Box of 9',price:1490},{label:'Box of 12',price:1920}],
    allergens:['Tree nuts (walnut, hazelnut)','Gluten (wheat)','Dairy','Eggs','Soy'] },
  { id:'salted-caramel', slug:'salted-caramel', name:'Salted Caramel', emoji:'🍯',
    gradient:'linear-gradient(135deg,#a06a34,#3b230f)', featured:true, containsNuts:false,
    tagline:'Sweet, salty, unforgettable',
    desc:'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe. The perfect balance of sweet and salty.',
    sizes:[{label:'Single brownie',price:220},{label:'Box of 6',price:1050},{label:'Box of 9',price:1490},{label:'Box of 12',price:1920}],
    allergens:['Gluten (wheat)','Dairy','Eggs','Soy'] }
];
function getProduct(slug){ for(var i=0;i<PRODUCTS.length;i++) if(PRODUCTS[i].slug===slug) return PRODUCTS[i]; return null; }
function fromPrice(p){ return Math.min.apply(null, p.sizes.map(function(s){return s.price;})); }

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
  else cart.push({key:key,id:product.id,name:product.name,emoji:product.emoji,gradient:product.gradient,size:sizeLabel||'',price:price,qty:qty});
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
  var s=p.sizes[0];
  addToCart(p, s.label, s.price, 1);
}

/* ---- Render a product card (shared by home & menu) ---- */
function productCardHTML(p){
  return '<a class="card" href="/product?b='+p.slug+'">'
    +'<div class="card-art" style="background:'+p.gradient+'">'
    +(p.featured?'<span class="fav">★ Signature</span>':'')
    +(p.containsNuts?'<span class="nut-tag">⚠️ Contains nuts</span>':'')
    +'<span>'+p.emoji+'</span>'
    +'<button class="quick-add" onclick="quickAdd(event,\''+p.slug+'\')">+ Quick add</button>'
    +'</div>'
    +'<div class="card-body"><h3>'+p.name+'</h3><div class="tagline">'+p.tagline+'</div>'
    +'<div class="card-foot"><div class="price">from '+money(fromPrice(p))+'</div><span class="card-btn">Choose →</span></div></div></a>';
}
