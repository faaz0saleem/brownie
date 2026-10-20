/* Free, opt-in admin alerts. Polling requires an open, signed-in admin tab. */
(function () {
  'use strict';
  const workerUrl = new URL('order-alerts-sw.js', document.currentScript.src);
  const preference = 'fudgio_admin_order_alerts';

  class OrderAlerts {
    constructor(options) {
      this.options = options;
      this.known = null;
      this.unread = 0;
      this.active = false;
      this.pending = false;
      this.context = null;
      this.registration = null;
      this.title = document.title;
      try { this.enabled = localStorage.getItem(preference) === 'on'; } catch { this.enabled = false; }
      this.button = document.getElementById('enableOrderAlerts');
      this.status = document.getElementById('orderAlertStatus');
      this.banner = document.getElementById('newOrderAlert');
      this.message = document.getElementById('newOrderMessage');
      this.button.addEventListener('click', () => { void this.toggle(); });
      document.getElementById('testOrderSound').addEventListener('click', async () => {
        const played = await this.sound(true);
        options.toast(played ? 'Test chime played' : 'Sound is unavailable. Check your device volume or browser settings.');
      });
      document.getElementById('viewNewOrders').addEventListener('click', () => this.openOrders());
      document.getElementById('dismissOrderAlert').addEventListener('click', () => this.acknowledge());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.active) void this.check();
      });
      // A fresh page needs a user gesture before browsers will play sound.
      document.addEventListener('pointerdown', () => {
        if (this.enabled && this.active) void this.unlockSound();
      });
      if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'FUDGIO_OPEN_ORDERS' && this.active) this.openOrders();
      });
      this.updateStatus();
    }

    start() {
      if (this.active) return;
      this.active = true;
      this.timer = setInterval(() => { void this.check(); }, 20000);
      if (this.enabled && this.canNotify() && Notification.permission === 'granted') void this.worker();
      this.updateStatus();
    }

    stop() {
      this.active = false;
      clearInterval(this.timer);
      this.known = null;
      this.acknowledge();
    }

    async check() {
      if (!this.active || this.pending) return;
      this.pending = true;
      try { await this.options.refresh(); if (this.active) this.updateStatus(); }
      catch { if (this.active) this.status.textContent = 'Order checks paused by a connection error. Retrying automatically.'; }
      finally { this.pending = false; }
    }

    observe(orders) {
      if (!this.active) return [];
      const valid = orders.filter((o) => o && o.id != null);
      const ids = new Set(valid.map((o) => String(o.id)));
      // Existing orders on the first successful load are the baseline, not new alerts.
      if (this.known === null) { this.known = ids; return []; }
      const fresh = valid.filter((o) => !this.known.has(String(o.id)));
      for (const id of ids) this.known.add(id);
      if (!fresh.length) return [];
      this.unread += fresh.length;
      this.banner.hidden = false;
      this.message.textContent = this.unread === 1 ? '1 new order has arrived.' : this.unread + ' new orders have arrived.';
      document.title = '(' + this.unread + ' new) ' + this.title;
      this.options.toast(fresh.length === 1 ? 'New order received' : fresh.length + ' new orders received');
      if (this.enabled) {
        void this.sound();
        void this.notify(fresh);
      }
      return fresh;
    }

    acknowledge() {
      this.unread = 0;
      this.banner.hidden = true;
      document.title = this.title;
    }

    openOrders() {
      this.options.openOrders();
      this.acknowledge();
    }

    canNotify() { return window.isSecureContext && 'Notification' in window; }

    async toggle() {
      if (this.enabled) {
        this.enabled = false;
        try { localStorage.setItem(preference, 'off'); } catch {}
        this.updateStatus();
        return;
      }
      this.enabled = true;
      try { localStorage.setItem(preference, 'on'); } catch {}
      // Request permission directly from this click, never automatically on page load.
      const permission = this.canNotify() && Notification.permission === 'default'
        ? Notification.requestPermission().catch(() => 'denied') : Promise.resolve();
      await this.unlockSound();
      await permission;
      if (this.enabled && this.canNotify() && Notification.permission === 'granted') await this.worker();
      this.updateStatus();
    }

    updateStatus() {
      this.button.textContent = this.enabled ? '🔔 Alerts on — turn off' : '🔔 Enable order alerts';
      this.button.setAttribute('aria-pressed', String(this.enabled));
      if (!this.enabled) this.status.textContent = 'Free on-screen alerts. Enable sound and browser notifications. Keep this admin tab open.';
      else if (this.canNotify() && Notification.permission === 'denied') this.status.textContent = 'Sound on; browser notifications are blocked in browser settings. Keep this admin tab open.';
      else this.status.textContent = 'Alerts on. Keep this admin tab open. Tap Test sound after reopening it; device sound settings still apply.';
    }

    async unlockSound() {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        if (!this.context) this.context = new Audio();
        if (this.context.state === 'suspended') await this.context.resume();
        return this.context.state === 'running';
      } catch { return false; }
    }

    async sound(test = false) {
      if (!test && !this.enabled) return false;
      if (!(await this.unlockSound())) return false;
      try {
        const ctx = this.context;
        [660, 880, 660].forEach((frequency, i) => {
          const tone = ctx.createOscillator(), gain = ctx.createGain();
          const at = ctx.currentTime + i * 0.23;
          tone.type = 'sine'; tone.frequency.value = frequency;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.18, at + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.20);
          tone.connect(gain); gain.connect(ctx.destination);
          tone.start(at); tone.stop(at + 0.21);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        });
        return true;
      } catch { return false; }
    }

    async worker() {
      if (this.registration) return this.registration;
      if (!window.isSecureContext || !navigator.serviceWorker) return null;
      try {
        this.registration = await navigator.serviceWorker.register(workerUrl.href, { updateViaCache: 'none' });
        if (this.registration.active) return this.registration;
        const worker = this.registration.installing || this.registration.waiting;
        if (worker) await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4000);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated' || worker.state === 'redundant') { clearTimeout(timer); resolve(); }
          });
        });
        return this.registration.active ? this.registration : null;
      } catch { return null; }
    }

    async notify(orders) {
      if (!this.canNotify() || Notification.permission !== 'granted') return;
      const title = orders.length === 1 ? '🍫 New Fudgio order' : '🍫 ' + orders.length + ' new Fudgio orders';
      // Lock-screen notices contain no customer names, phone numbers or addresses.
      const body = orders.length === 1 ? 'Order ' + orders[0].id + ' · ' + this.options.money(orders[0].total)
        : this.options.money(orders.reduce((sum, o) => sum + Number(o.total || 0), 0)) + ' total. Open admin to review.';
      const options = { body, tag: 'fudgio-order-' + orders.map((o) => o.id).join('-'),
        icon: new URL('favicon.svg', workerUrl).href, data: { url: location.origin + location.pathname + '#orders' } };
      try {
        const registration = await this.worker();
        if (!this.active || !this.enabled) return;
        if (registration) await registration.showNotification(title, options);
        else {
          const notice = new Notification(title, options);
          notice.onclick = () => { window.focus(); this.openOrders(); notice.close(); };
        }
      } catch { /* Sound, the persistent banner and the title badge remain available. */ }
    }
  }
  window.FudgioOrderAlerts = OrderAlerts;
})();
