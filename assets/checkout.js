/* ---------- checkout ------------------------------------------------------
   Where the order is going decides how it is paid:

   Pakistan  rupees, cash on delivery. If an SMS gateway is configured the
             customer confirms a code texted to their phone on a second step —
             that is what stops fake COD orders, where we ship and nobody pays.
   Elsewhere dollars, paid up front. No courier abroad can collect cash for us,
             so the order is placed as "Awaiting Payment" and only ships once
             paid; there is nothing to fake, so there is no SMS step.

   Both are gated by the image CAPTCHA. With SMS on, the CAPTCHA guards the
   send (texting costs money); otherwise it guards the order itself.
   ------------------------------------------------------------------------ */
var COUNTRIES = [["AF","Afghanistan"],["AX","Åland Islands"],["AL","Albania"],["DZ","Algeria"],["AS","American Samoa"],["AD","Andorra"],["AO","Angola"],["AI","Anguilla"],["AG","Antigua & Barbuda"],["AR","Argentina"],["AM","Armenia"],["AW","Aruba"],["AU","Australia"],["AT","Austria"],["AZ","Azerbaijan"],["BS","Bahamas"],["BH","Bahrain"],["BD","Bangladesh"],["BB","Barbados"],["BY","Belarus"],["BE","Belgium"],["BZ","Belize"],["BJ","Benin"],["BM","Bermuda"],["BT","Bhutan"],["BO","Bolivia"],["BA","Bosnia & Herzegovina"],["BW","Botswana"],["BR","Brazil"],["IO","British Indian Ocean Territory"],["VG","British Virgin Islands"],["BN","Brunei"],["BG","Bulgaria"],["BF","Burkina Faso"],["BI","Burundi"],["KH","Cambodia"],["CM","Cameroon"],["CA","Canada"],["CV","Cape Verde"],["BQ","Caribbean Netherlands"],["KY","Cayman Islands"],["CF","Central African Republic"],["TD","Chad"],["CL","Chile"],["CN","China"],["CX","Christmas Island"],["CC","Cocos (Keeling) Islands"],["CO","Colombia"],["KM","Comoros"],["CG","Congo - Brazzaville"],["CD","Congo - Kinshasa"],["CK","Cook Islands"],["CR","Costa Rica"],["CI","Côte d’Ivoire"],["HR","Croatia"],["CU","Cuba"],["CW","Curaçao"],["CY","Cyprus"],["CZ","Czechia"],["DK","Denmark"],["DJ","Djibouti"],["DM","Dominica"],["DO","Dominican Republic"],["EC","Ecuador"],["EG","Egypt"],["SV","El Salvador"],["GQ","Equatorial Guinea"],["ER","Eritrea"],["EE","Estonia"],["SZ","Eswatini"],["ET","Ethiopia"],["FK","Falkland Islands"],["FO","Faroe Islands"],["FJ","Fiji"],["FI","Finland"],["FR","France"],["GF","French Guiana"],["PF","French Polynesia"],["GA","Gabon"],["GM","Gambia"],["GE","Georgia"],["DE","Germany"],["GH","Ghana"],["GI","Gibraltar"],["GR","Greece"],["GL","Greenland"],["GD","Grenada"],["GP","Guadeloupe"],["GU","Guam"],["GT","Guatemala"],["GG","Guernsey"],["GN","Guinea"],["GW","Guinea-Bissau"],["GY","Guyana"],["HT","Haiti"],["HN","Honduras"],["HK","Hong Kong SAR China"],["HU","Hungary"],["IS","Iceland"],["IN","India"],["ID","Indonesia"],["IR","Iran"],["IQ","Iraq"],["IE","Ireland"],["IM","Isle of Man"],["IL","Israel"],["IT","Italy"],["JM","Jamaica"],["JP","Japan"],["JE","Jersey"],["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],["KI","Kiribati"],["KW","Kuwait"],["KG","Kyrgyzstan"],["LA","Laos"],["LV","Latvia"],["LB","Lebanon"],["LS","Lesotho"],["LR","Liberia"],["LY","Libya"],["LI","Liechtenstein"],["LT","Lithuania"],["LU","Luxembourg"],["MO","Macao SAR China"],["MG","Madagascar"],["MW","Malawi"],["MY","Malaysia"],["MV","Maldives"],["ML","Mali"],["MT","Malta"],["MH","Marshall Islands"],["MQ","Martinique"],["MR","Mauritania"],["MU","Mauritius"],["YT","Mayotte"],["MX","Mexico"],["FM","Micronesia"],["MD","Moldova"],["MC","Monaco"],["MN","Mongolia"],["ME","Montenegro"],["MS","Montserrat"],["MA","Morocco"],["MZ","Mozambique"],["MM","Myanmar (Burma)"],["NA","Namibia"],["NR","Nauru"],["NP","Nepal"],["NL","Netherlands"],["NC","New Caledonia"],["NZ","New Zealand"],["NI","Nicaragua"],["NE","Niger"],["NG","Nigeria"],["NU","Niue"],["NF","Norfolk Island"],["MK","North Macedonia"],["MP","Northern Mariana Islands"],["NO","Norway"],["OM","Oman"],["PK","Pakistan"],["PW","Palau"],["PS","Palestinian Territories"],["PA","Panama"],["PG","Papua New Guinea"],["PY","Paraguay"],["PE","Peru"],["PH","Philippines"],["PN","Pitcairn Islands"],["PL","Poland"],["PT","Portugal"],["PR","Puerto Rico"],["QA","Qatar"],["RE","Réunion"],["RO","Romania"],["RU","Russia"],["RW","Rwanda"],["WS","Samoa"],["SM","San Marino"],["ST","São Tomé & Príncipe"],["SA","Saudi Arabia"],["SN","Senegal"],["RS","Serbia"],["SC","Seychelles"],["SL","Sierra Leone"],["SG","Singapore"],["SX","Sint Maarten"],["SK","Slovakia"],["SI","Slovenia"],["SB","Solomon Islands"],["SO","Somalia"],["ZA","South Africa"],["KR","South Korea"],["SS","South Sudan"],["ES","Spain"],["LK","Sri Lanka"],["BL","St. Barthélemy"],["SH","St. Helena"],["KN","St. Kitts & Nevis"],["LC","St. Lucia"],["MF","St. Martin"],["PM","St. Pierre & Miquelon"],["VC","St. Vincent & Grenadines"],["SD","Sudan"],["SR","Suriname"],["SJ","Svalbard & Jan Mayen"],["SE","Sweden"],["CH","Switzerland"],["SY","Syria"],["TW","Taiwan"],["TJ","Tajikistan"],["TZ","Tanzania"],["TH","Thailand"],["TL","Timor-Leste"],["TG","Togo"],["TK","Tokelau"],["TO","Tonga"],["TT","Trinidad & Tobago"],["TN","Tunisia"],["TR","Türkiye"],["TM","Turkmenistan"],["TC","Turks & Caicos Islands"],["TV","Tuvalu"],["VI","U.S. Virgin Islands"],["UG","Uganda"],["UA","Ukraine"],["AE","United Arab Emirates"],["GB","United Kingdom"],["US","United States"],["UY","Uruguay"],["UZ","Uzbekistan"],["VU","Vanuatu"],["VA","Vatican City"],["VE","Venezuela"],["VN","Vietnam"],["WF","Wallis & Futuna"],["EH","Western Sahara"],["YE","Yemen"],["ZM","Zambia"],["ZW","Zimbabwe"]];   // [code, English name], sorted by name
var CAPTCHA_ID = '';
var DETAILS    = null;    // the delivery form, kept while on the verify step
var DONE       = false;   // the order has been placed; stop redrawing the form
var resendTimer = null;

function countryName(code){ for(var i=0;i<COUNTRIES.length;i++) if(COUNTRIES[i][0]===code) return COUNTRIES[i][1]; return ''; }
/** The country to preselect: Pakistan for PKR shoppers, otherwise the one in the browser's locale. */
function guessCountry(){
  if(isPK()) return 'PK';
  var loc=(navigator.language||'').split('-')[1];
  loc=loc?loc.toUpperCase():'';
  return (loc && loc!=='PK' && countryName(loc)) ? loc : '';
}
function selectedCountry(){ var el=document.getElementById('fCountry'); return el ? el.value : (DETAILS ? DETAILS.country : ''); }
function domestic(){ return (selectedCountry() || (isPK() ? 'PK' : '')) === 'PK'; }
function needsSms(){ return FUDGIO.sms && domestic(); }
function showErr(msg){ var e = document.getElementById('err'); if(e) e.textContent = msg || ''; }

/* ---- summary ---- */
function summaryHtml(){
  var rows = getCart().map(function(i){
    var p = getProduct(i.id);
    return '<div class="sum-line"><span class="t'+(p&&p.image?' photo':'')+'">'+lineArt(i)+'<span class="q">'+i.qty+'</span></span>'
      +'<span class="nm">'+esc(p ? p.name : i.name)+'</span><span class="p">'+money(lineUnit(i)*i.qty)+'</span></div>';
  }).join('');
  var nudge = nudgeText();
  return '<div class="panel summary"><h2>Your order</h2>'+rows
    +'<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px">'+totalsHTML()+couponFormHTML()+'</div>'
    +arrivalHTML()
    +(nudge ? '<p class="pay-note" style="color:var(--pink-2)">'+esc(nudge)+' <a class="link" href="/shop">Add more</a></p>' : '')
    +'<p class="pay-note">'+(isPK() ? 'Cash on delivery — pay when it arrives' : 'Paid before it ships · prices in USD')+'</p></div>';
}
function refreshSummary(){ var w=document.getElementById('sumWrap'); if(w) w.innerHTML=summaryHtml(); }

/* ---- step indicator ---- */
function renderSteps(active){
  var bar = document.getElementById('stepsBar'); if(!bar) return;
  var steps = needsSms() ? ['Bag','Details','Verify','Done'] : ['Bag','Details','Done'];
  bar.innerHTML = steps.map(function(label, i){
    return '<div class="s'+(i<=active?' on':'')+'"><span class="b">'+(i+1)+'</span>'+label+'</div>';
  }).join('<div class="sep"></div>');
}

/* ---- CAPTCHA ---- */
function captchaHTML(){
  return '<div class="field"><label for="fCaptcha">Security check</label>'
    +'<div class="captcha-row"><img id="capImg" class="captcha-img" width="220" height="70" alt="Characters to type into the box below"/>'
      +'<button type="button" class="captcha-refresh" onclick="loadCaptcha()" title="Show a different image" aria-label="Show a different image">↻</button></div>'
    +'<input id="fCaptcha" class="code-input" maxlength="5" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="ABCDE"/>'
    +'<span class="hint">Type the 5 characters from the image. It keeps automated orders off the shop.</span></div>';
}
function loadCaptcha(){
  var img = document.getElementById('capImg'), box = document.getElementById('fCaptcha');
  if(!img) return;
  CAPTCHA_ID = ''; img.removeAttribute('src'); img.alt = 'Loading the security image…';
  if(box) box.value = '';
  api('GET','/api/captcha',null,function(ok,d){
    if(!ok || !d.id){ img.alt = 'The security image could not be loaded.'; showErr(d.error || 'Could not load the security check. Please refresh the page.'); return; }
    CAPTCHA_ID = d.id; img.src = d.image; img.alt = 'Characters to type into the box below';
  });
}

/* ---- step 1: delivery details ---- */
function countryOptions(sel){
  var opts='<option value="">Choose a country…</option><option value="PK"'+(sel==='PK'?' selected':'')+'>Pakistan — cash on delivery</option>';
  if(FUDGIO.intlEnabled){
    opts+='<option disabled>──────────</option>';
    COUNTRIES.forEach(function(c){ if(c[0]!=='PK') opts+='<option value="'+c[0]+'"'+(sel===c[0]?' selected':'')+'>'+esc(c[1])+'</option>'; });
  }
  return opts;
}
function payBoxHTML(){
  if(domestic()) return '<div class="pay-box" id="payBox"><span class="ico">COD</span><div><b>Cash on delivery</b><small>Pay the rider in cash when your bandanas arrive. Nothing to pay now.</small></div></div>';
  return '<div class="pay-box intl" id="payBox"><span class="ico">$</span><div><b>Pay before it ships</b><small>After you order we send a secure payment link to your email and WhatsApp. Your bandanas are packed and shipped as soon as it is paid. Prices are in US dollars.</small></div></div>';
}
function detailsHTML(){
  var d = DETAILS || {}, country = d.country || guessCountry();
  return '<div class="panel"><h2>Where should we send it?</h2>'+payBoxHTML()
    +'<div class="form">'
    +'<div class="field"><label for="fCountry">Country</label><select id="fCountry" onchange="countryChanged()" autocomplete="country">'+countryOptions(country)+'</select></div>'
    +'<div class="field"><label for="fName">Full name</label><input id="fName" value="'+esc(d.name||'')+'" autocomplete="name" placeholder="e.g. Ayesha Khan"/></div>'
    +'<div class="row2">'
      +'<div class="field"><label for="fPhone">Phone / WhatsApp</label><input id="fPhone" type="tel" autocomplete="tel" value="'+esc(d.phone||'')+'" placeholder="0300 1234567"/><span class="hint" id="phoneNote"></span></div>'
      +'<div class="field"><label for="fEmail">Email</label><input id="fEmail" type="email" autocomplete="email" value="'+esc(d.email||'')+'" placeholder="you@email.com"/><span class="hint" id="emailNote"></span></div>'
    +'</div>'
    +'<div class="field"><label for="fAddr">Address</label><textarea id="fAddr" rows="2" style="min-height:80px" autocomplete="street-address" placeholder="House / flat, street, area">'+esc(d.address||'')+'</textarea></div>'
    +'<div class="row2">'
      +'<div class="field"><label for="fCity">City</label><input id="fCity" value="'+esc(d.city||'')+'" autocomplete="address-level2" placeholder="e.g. Lahore"/></div>'
      +'<div class="field"><label for="fPost">Postcode</label><input id="fPost" value="'+esc(d.postcode||'')+'" autocomplete="postal-code" placeholder="Optional in Pakistan"/></div>'
    +'</div>'
    +'<div class="field"><label for="fNotes">Notes for delivery (optional)</label><input id="fNotes" value="'+esc(d.notes||'')+'" placeholder="Landmark, best time to call…"/></div>'
    +'<label class="check"><input type="checkbox" id="fGift"'+(d.gift?' checked':'')+' onchange="document.getElementById(\'giftBox\').hidden=!this.checked"/><span><b>This is a gift</b> — we leave the prices out of the parcel</span></label>'
    +'<div class="field" id="giftBox"'+(d.gift?'':' hidden')+'><label for="fGiftNote">Gift message (optional)</label><input id="fGiftNote" maxlength="200" value="'+esc(d.giftNote||'')+'" placeholder="Happy birthday! Love, Sara"/><span class="hint">We write it on a card in the parcel.</span></div>'
    + captchaHTML()
    +'<div class="err" id="err" role="alert"></div>'
    +'<button type="button" class="btn btn-primary btn-block" id="place" onclick="primaryAction()"></button>'
    +'<p class="secure-note">'+ICONS.lock+'Your details are only used to deliver this order. No account, no spam.</p>'
    +'</div></div>';
}
/** Re-labels everything that depends on the destination, without wiping what was typed. */
function applyCountry(){
  var c = selectedCountry();
  if(c) setRegion(c==='PK' ? 'PK' : 'INTL');
  var pb=document.getElementById('payBox'); if(pb) pb.outerHTML=payBoxHTML();
  var pn=document.getElementById('phoneNote');
  if(pn) pn.textContent = !c ? '' : (c==='PK' ? (FUDGIO.sms ? 'We text a code to this number to confirm your order.' : 'The rider will call this number.') : 'Include your country code. Used for delivery updates.');
  var en=document.getElementById('emailNote');
  if(en) en.textContent = c && c!=='PK' ? 'Your payment link is sent here.' : 'For your order confirmation.';
  var ph=document.getElementById('fPhone'); if(ph) ph.placeholder = (c==='PK'||!c) ? '0300 1234567' : '+44 7700 900123';
  labelPlace();
  renderSteps(1);
  refreshSummary();
}
/* The total on the button itself: on a phone the summary is below the form. */
function labelPlace(){
  var btn=document.getElementById('place'); if(!btn || btn.getAttribute('aria-busy')) return;
  btn.textContent = needsSms() ? 'Continue · '+money(cartTotal()) : (domestic() ? 'Place order · '+money(cartTotal())+' on delivery' : 'Place order · '+money(cartTotal())+' by payment link');
}
function countryChanged(){ showErr(''); applyCountry(); }
function primaryAction(){ needsSms() ? continueToVerify() : place(); }
function showDetails(){ document.getElementById('stepPanel').innerHTML = blockerHTML() + detailsHTML(); loadCaptcha(); applyCountry(); paintBlocker(); }
/* Say up front if the order can't go through — a sold-out colour in the bag,
   or the shop closed — instead of after the whole form is filled in. */
function blocker(){
  if(!FUDGIO.storeOpen) return 'We’re not taking orders right now. Your bag is saved — please check back soon.';
  if(getCart().some(shortOf)) return 'Something in your bag has sold out or is no longer available. Fix your bag, then come back to finish.';
  return '';
}
function blockerHTML(){ return '<div class="notice orange-n" id="blocker" style="margin-bottom:18px" hidden><span class="ico">!</span><div><b>Hold on.</b> <span class="msg"></span> <a class="link" href="/cart">Go to your bag</a></div></div>'; }
function paintBlocker(){
  var b = document.getElementById('blocker'), msg = blocker(); if(!b) return;
  b.hidden = !msg; b.querySelector('.msg').textContent = msg;
  var btn = document.getElementById('place'); if(btn) btn.disabled = !!msg;
}

/** Reads and validates the form. Returns the details, or null after showing why. */
function readDetails(){
  var v = function(id){ var el=document.getElementById(id); return el ? (el.value||'').trim() : ''; };
  var d = { country:v('fCountry'), name:v('fName'), phone:v('fPhone'), email:v('fEmail'), city:v('fCity'), postcode:v('fPost'), address:v('fAddr'), notes:v('fNotes'),
            gift: !!(document.getElementById('fGift') && document.getElementById('fGift').checked), giftNote: v('fGiftNote') };
  if(!d.country){ showErr('Please choose the country we should ship to.'); document.getElementById('fCountry').focus(); return null; }
  if(!d.name||!d.phone||!d.email||!d.city||!d.address){ showErr('Please fill in your name, phone, email, address and city.'); return null; }
  if(!validPhone(d.phone)){ showErr(d.country==='PK' ? 'Please enter a valid mobile number, like 0300 1234567.' : 'Please enter a valid phone number, with your country code.'); return null; }
  if(!validEmail(d.email)){ showErr('Please enter a valid email address.'); return null; }
  showErr('');
  return d;
}
function readCaptcha(){
  var answer=(document.getElementById('fCaptcha').value||'').trim();
  if(!CAPTCHA_ID){ showErr('The security check is still loading. Please wait a moment and try again.'); loadCaptcha(); return null; }
  if(!answer){ showErr('Please type the characters from the security image.'); document.getElementById('fCaptcha').focus(); return null; }
  return answer;
}

/* ---- step 2 (Pakistan, SMS on): confirm the code ---- */
function continueToVerify(){
  var d = readDetails(); if(!d) return;
  var answer = readCaptcha(); if(answer===null) return;
  var btn=document.getElementById('place'); btn.disabled=true; btn.setAttribute('aria-busy','true'); btn.textContent='Sending code…';
  api('POST','/api/verify/phone/send',{phone:d.phone, captchaId:CAPTCHA_ID, captchaAnswer:answer}, function(ok, r){
    btn.disabled=false; btn.removeAttribute('aria-busy'); labelPlace();
    if(!ok){ showErr(r.error || 'Could not send the code. Please try again.'); loadCaptcha(); return; }
    DETAILS = d; showVerify();
  });
}
function verifyHTML(){
  return '<div class="panel"><h2>Confirm your number</h2>'
    +'<p style="color:var(--soft);margin-bottom:18px">We sent a 5-digit code by SMS to <strong>'+esc(DETAILS.phone)+'</strong>. Enter it to place your order.</p>'
    +'<div class="form"><div class="field"><label for="fCode">5-digit code</label><input id="fCode" class="code-input" inputmode="numeric" maxlength="5" autocomplete="one-time-code" placeholder="00000"/></div>'
    +'<div class="err" id="err" role="alert"></div>'
    +'<button type="button" class="btn btn-primary btn-block" id="confirmBtn" onclick="confirmAndPlace()">Confirm &amp; place order</button>'
    +'<div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap">'
      +'<button type="button" class="link-btn" onclick="backToDetails()">← Change details</button>'
      +'<button type="button" class="link-btn" id="resendBtn" onclick="resendCode()">Send the code again</button></div></div></div>';
}
function showVerify(){
  document.getElementById('stepPanel').innerHTML = verifyHTML();
  renderSteps(2);
  var box=document.getElementById('fCode'); if(box) box.focus();
  startResendCooldown(60);
}
function backToDetails(){ clearInterval(resendTimer); showDetails(); }
function startResendCooldown(secs){
  var btn=document.getElementById('resendBtn'); if(!btn) return;
  clearInterval(resendTimer);
  btn.disabled=true; btn.textContent='Send the code again ('+secs+'s)';
  resendTimer=setInterval(function(){
    secs--;
    if(secs<=0){ clearInterval(resendTimer); btn.disabled=false; btn.textContent='Send the code again'; }
    else btn.textContent='Send the code again ('+secs+'s)';
  },1000);
}
/* A resend needs a fresh CAPTCHA, since the first one was spent getting here. */
function resendCode(){
  backToDetails();
  showErr('Type the new security code and press Continue to get another SMS.');
  var box=document.getElementById('fCaptcha'); if(box) box.focus();
}
function confirmAndPlace(){
  var code=(document.getElementById('fCode').value||'').replace(/\D/g,'');
  if(code.length!==5){ showErr('Please enter the 5-digit code from the SMS.'); return; }
  showErr('');
  var btn=document.getElementById('confirmBtn'); btn.disabled=true; btn.textContent='Checking…';
  api('POST','/api/verify/phone/check',{phone:DETAILS.phone, code:code}, function(ok, r){
    if(!ok){ btn.disabled=false; btn.textContent='Confirm & place order'; showErr(r.error||'That code is not correct.'); return; }
    clearInterval(resendTimer); btn.textContent='Placing order…'; place();
  });
}

/* ---- placing the order ---- */
function place(){
  var viaSms = !!DETAILS && needsSms();
  var d = viaSms ? DETAILS : readDetails();
  if(!d) return;
  if(blocker()){ showErr(blocker()); return; }
  var body = { items: getCart().map(function(i){ return {productId:i.id, size:i.size, qty:i.qty}; }), customer: d, coupon: (getCoupon() || {}).code || '' };
  if(!viaSms){ var answer = readCaptcha(); if(answer===null) return; body.captchaId = CAPTCHA_ID; body.captchaAnswer = answer; }
  var btn = document.getElementById(viaSms ? 'confirmBtn' : 'place'), label = btn ? btn.textContent : '';
  if(btn){ btn.disabled=true; btn.setAttribute('aria-busy','true'); btn.textContent='Placing order…'; }
  api('POST','/api/orders', body, function(ok, r){
    if(!ok){
      showErr(r.error || 'Could not place the order. Please try again.');
      // A code that no longer works comes out of the bag, so the next try goes through.
      if(r.error && /code/i.test(r.error) && getCoupon()){ setCoupon(null); showErr(r.error + ' We have taken it off — your new total is ' + money(cartTotal()) + '.'); }
      if(btn){ btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=label; }
      if(!viaSms) loadCaptcha();   // that attempt used up the challenge
      return;
    }
    DONE = true;
    try{ localStorage.removeItem('fudgio_cart'); localStorage.removeItem('fudgio_coupon'); }catch(e){}
    CAPTCHA_ID=''; DETAILS=null;
    orderDone(r.order || {}, d);
    emit();
  });
}
function orderDone(o, d){
  var intl = (o.currency || (d.country==='PK'?'PKR':'USD')) === 'USD', region = intl ? 'INTL' : 'PK';
  renderSteps(needsSms() ? 3 : 2);
  var trackUrl='/track?id='+encodeURIComponent(o.id||'')+'&phone='+encodeURIComponent(d.phone);
  var pay = '';
  if(intl){
    pay = '<div class="panel" style="text-align:left;width:100%;margin-top:10px"><h2>One step left: payment</h2>'
      +'<p style="color:var(--soft);margin-bottom:14px">Your order is reserved. It ships as soon as the <strong>'+money(o.total, region)+'</strong> is paid.</p>'
      +(FUDGIO.intlPaymentLink
        ? '<a class="btn btn-primary btn-block" href="'+esc(FUDGIO.intlPaymentLink)+'" target="_blank" rel="noopener">Pay '+money(o.total, region)+' now</a><p class="pay-note">Please put <strong>'+esc(o.id||'')+'</strong> in the payment note so we can match it to your order.</p>'
        : '<p>We’ll send a secure payment link to <strong>'+esc(d.email)+'</strong> and to your WhatsApp, usually within 24 hours. Nothing is charged until you use it.</p>')
      +'</div>';
  }
  var h = document.querySelector('.sec-head h1'); if(h) h.textContent = intl ? 'Reserved for you.' : 'It’s on its way.';
  var sl = document.querySelector('.sec-head [data-ship]'); if(sl) sl.hidden = true;
  var art = (o.items||[]).slice(0,3).map(function(li){ return '<div style="width:84px">'+lineArt({ id: li.slug || li.productId, name: li.name, color: li.color, ink: li.ink })+'</div>'; }).join('');
  document.getElementById('root').innerHTML = '<div class="done"><div class="trio" style="display:flex;margin-bottom:8px">'+art+'</div>'
    +'<p class="eyebrow">'+(intl ? 'Order received' : 'Order placed')+'</p><h2 class="h2">Thank you, '+esc(d.name.split(' ')[0])+'.</h2>'
    +'<p style="color:var(--soft)">Your order number is</p><div class="oid">'+esc(o.id||'')+'</div>'
    +'<p style="color:var(--soft)">'+(intl ? 'Shipping to '+esc(countryName(d.country)||d.country)+'. ' : 'We’ll call or message to confirm, then it’s on its way. Pay cash when it arrives. ')
      +((o.discount || o.couponDiscount) ? 'You saved '+money((o.discount||0) + (o.couponDiscount||0), region)+'. ' : '')
      +(d.gift ? 'We’ll pack it as a gift, without prices. ' : '')
      +(d.email ? 'A confirmation is on its way to '+esc(d.email)+'. ' : '')+'Keep your order number to check on it any time.</p>'
    + pay
    +'<div class="actions"><a href="'+trackUrl+'" class="btn btn-primary">Track your order</a><a href="/shop" class="btn btn-ghost">Keep shopping</a></div></div>';
  window.scrollTo(0,0);
}

/* ---- shell ---- */
function render(){
  var root=document.getElementById('root');
  if(!getCart().length){
    document.getElementById('stepsBar').innerHTML='';
    root.innerHTML='<div class="empty">'+cutHTML(visibleProducts()[0] || {})+'<h2>Your bag is empty.</h2><a href="/shop" class="btn btn-primary">Shop all colours</a></div>';
    return;
  }
  root.innerHTML='<div class="split"><div id="stepPanel"></div><div id="sumWrap">'+summaryHtml()+'</div></div>';
  showDetails();
}
render();
/* Settings decide whether international shipping exists and whether there is
   an SMS step, and the live catalogue decides the prices — so on any change,
   refresh the summary and relabel the form without losing what was typed. */
var _lastSms = FUDGIO.sms, _lastIntl = FUDGIO.intlEnabled;
onChange(function(){
  if(DONE) return;
  if(!getCart().length){ if(document.getElementById('stepPanel')) render(); return; }
  var sel = document.getElementById('fCountry');
  if(sel && !DETAILS && (_lastSms !== FUDGIO.sms || _lastIntl !== FUDGIO.intlEnabled)){
    var keep = sel.value || guessCountry();
    sel.innerHTML = countryOptions(keep);
    _lastSms = FUDGIO.sms; _lastIntl = FUDGIO.intlEnabled;
    applyCountry();
    return;
  }
  refreshSummary();
  labelPlace();
  paintBlocker();
});
