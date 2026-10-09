/* Contact and bulk-order forms: stored in the admin inbox and emailed to the shop. */
(function(){
  Array.prototype.forEach.call(document.querySelectorAll('form[data-contact]'), function(f){
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = function(n){ var el = f.elements[n]; return el ? String(el.value || '').trim() : ''; };
      var err = f.querySelector('[data-err]');
      err.textContent = '';
      if(!v('name')){ err.textContent = 'Please add your name.'; f.elements.name.focus(); return; }
      if(!validEmail(v('email'))){ err.textContent = 'Please enter a valid email so we can reply.'; f.elements.email.focus(); return; }
      if(!v('message')){ err.textContent = 'Please write a message.'; f.elements.message.focus(); return; }
      var msg = v('message');
      if(v('qty') || v('when')) msg = 'Quantity: '+(v('qty')||'-')+'\nNeeded by: '+(v('when')||'-')+'\n\n'+msg;
      var b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Sending…';
      api('POST', '/api/contact', { name: v('name'), email: v('email'), phone: v('phone'), topic: v('topic'), message: msg, website: v('website') }, function(ok, d){
        if(!ok){ b.disabled = false; b.textContent = 'Send message'; err.textContent = d.error || 'That did not send. Please try again, or email us.'; return; }
        f.innerHTML = '<div class="empty" style="padding:32px 0"><h2>Thanks — got it.</h2><p>We reply within a day, usually much sooner.</p><a class="btn btn-dark" href="/shop">Back to the shop</a></div>';
      });
    });
  });
})();
