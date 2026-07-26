/* Fudgio shared cart logic for cart.html & checkout.html */
var FUDGIO = { whatsapp:'', email:'dev@solutioninn.com', currency:'Rs', freeOver:2500, deliveryFee:150 };
function money(n){ return FUDGIO.currency + ' ' + Number(n).toLocaleString('en-US'); }
function getCart(){ try{ return JSON.parse(localStorage.getItem('fudgio_cart')||'[]'); }catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('fudgio_cart', JSON.stringify(c)); updateCount(); }
function cartQty(){ return getCart().reduce(function(s,i){return s+i.qty;},0); }
function updateCount(){ var e=document.getElementById('cartCount'); if(e) e.textContent=cartQty(); }
function cartSubtotal(){ return getCart().reduce(function(s,i){return s+i.price*i.qty;},0); }
function cartDelivery(){ return cartSubtotal()>=FUDGIO.freeOver?0:FUDGIO.deliveryFee; }
function cartTotal(){ return cartSubtotal()+cartDelivery(); }
var _tt;
function toast(m){ var t=document.getElementById('toast'); if(!t)return; t.textContent=m; t.classList.add('show'); clearTimeout(_tt); _tt=setTimeout(function(){t.classList.remove('show');},2200); }
