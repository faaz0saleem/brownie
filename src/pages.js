// Server-rendered page content for the storefront. Each function returns the
// inner HTML for <main>; the layout wraps it with header/footer + SEO head.
import { config } from './config.js';

const B = config.brand;
const money = (n) => `${B.currency} ${Number(n).toLocaleString('en-US')}`;

function fromPrice(p) {
  if (Array.isArray(p.sizes) && p.sizes.length) return Math.min(...p.sizes.map((s) => s.price));
  return p.price;
}
function stockTag(stock) {
  if (stock === 0) return `<span class="stock-tag out">Sold out</span>`;
  if (stock <= 10) return `<span class="stock-tag low">Only ${stock} left</span>`;
  return `<span class="stock-tag in">In stock</span>`;
}
function productArt(p, cls = 'card-art') {
  const inner = p.imageUrl
    ? `<img src="${p.imageUrl}" alt="${p.name} brownie" loading="lazy" />`
    : `<span>${p.emoji}</span>`;
  return `<div class="${cls}" style="background:${p.gradient}">${inner}</div>`;
}

export function productCard(p) {
  return `
  <article class="card">
    <a href="/product/${p.slug}" class="card-art" style="background:${p.gradient}" aria-label="${p.name}">
      ${p.featured ? '<span class="fav">★ Signature</span>' : ''}
      ${stockTag(p.stock)}
      ${p.containsNuts ? '<span class="nut-tag">⚠️ Contains nuts</span>' : ''}
      ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name} brownie" loading="lazy" />` : `<span>${p.emoji}</span>`}
    </a>
    <div class="card-body">
      <h3>${p.name}</h3>
      <div class="tagline">${p.tagline || ''}</div>
      <div class="card-foot">
        <div class="price">from ${money(fromPrice(p))} <small></small></div>
        <a href="/product/${p.slug}" class="card-btn">Choose →</a>
      </div>
    </div>
  </article>`;
}

export function homePage(products) {
  return `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <span class="eyebrow">✨ Small-batch · Baked fresh daily</span>
        <h1>Life is short.<br /><span class="grad">Eat the brownie.</span></h1>
        <p class="lead">Rich, gooey, handcrafted brownies made from our secret small-batch recipe and delivered fresh to your door. Pay easily with <strong>Cash on Delivery</strong>.</p>
        <div class="hero-cta">
          <a href="/shop" class="btn btn-primary">🍫 Order now</a>
          <a href="/about" class="btn btn-ghost">Our story</a>
        </div>
        <div class="hero-badges">
          <div><b>3</b><span>Signature flavours</span></div>
          <div><b>100%</b><span>Cash on Delivery</span></div>
          <div><b>4.9★</b><span>Loved by locals</span></div>
        </div>
      </div>
      <div class="hero-art">
        <div class="big">🍫</div>
        <div class="chip tl">🔥 Baked fresh today</div>
        <div class="chip br cod">💵 Cash on Delivery</div>
      </div>
    </div>
  </section>

  <div class="trust"><div class="wrap">
    <span>🧈 Premium ingredients</span>
    <span>🔥 Baked to order</span>
    <span>🚚 Fast local delivery</span>
    <span>💵 Cash on Delivery only</span>
  </div></div>

  <section class="section" id="menu">
    <div class="wrap">
      <div class="section-head">
        <span class="eyebrow">🍫 Our Menu</span>
        <h2>Three flavours. Zero compromise.</h2>
        <p>Each brownie is baked in small batches from our secret recipe. Choose your box size and quantity on every product page.</p>
      </div>
      <div class="grid">${products.map(productCard).join('')}</div>
      <div class="center" style="margin-top:36px"><a href="/shop" class="btn btn-ghost">View full menu →</a></div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">💛 Why Fudgio</span><h2>Baked with obsession</h2></div>
      <div class="features">
        <div class="feature"><div class="ico">🧈</div><h4>Premium ingredients</h4><p>Belgian chocolate, real butter, free-range eggs. Never a shortcut.</p></div>
        <div class="feature"><div class="ico">🔥</div><h4>Baked fresh daily</h4><p>We bake to order in small batches so every bite is soft and gooey.</p></div>
        <div class="feature"><div class="ico">💵</div><h4>Cash on Delivery</h4><p>No cards, no fuss. Pay in cash only when your brownies arrive.</p></div>
        <div class="feature"><div class="ico">🚚</div><h4>Fast local delivery</h4><p>Free delivery on orders over ${money(B.freeDeliveryOver)}. Warm to your doorstep.</p></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">🛍️ How it works</span><h2>From cart to doorstep</h2></div>
      <div class="steps">
        <div class="step"><div class="n">01</div><h4>Pick your brownies</h4><p>Choose a flavour, box size and quantity.</p></div>
        <div class="step"><div class="n">02</div><h4>Checkout with COD</h4><p>Enter your address — no card needed.</p></div>
        <div class="step"><div class="n">03</div><h4>We bake &amp; pack</h4><p>Fresh from the oven, boxed with care.</p></div>
        <div class="step"><div class="n">04</div><h4>Pay on delivery</h4><p>Pay cash when your box arrives. Enjoy!</p></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">⭐ Loved by locals</span><h2>What people are saying</h2></div>
      <div class="quotes">
        <div class="quote"><div class="stars">★★★★★</div><p>"The fudgiest brownie I've ever had. The Salted Caramel is dangerous — I ordered twice in one week!"</p><div class="who"><div class="av">A</div><div><b>Ayesha K.</b><span>Karachi</span></div></div></div>
        <div class="quote"><div class="stars">★★★★★</div><p>"COD made it so easy. Ordered for a birthday and everyone asked where they were from. 10/10."</p><div class="who"><div class="av">B</div><div><b>Bilal A.</b><span>Lahore</span></div></div></div>
        <div class="quote"><div class="stars">★★★★★</div><p>"Nutty Delight is unreal. You can taste the fresh nuts. Delivered warm and gooey."</p><div class="who"><div class="av">S</div><div><b>Sara M.</b><span>Islamabad</span></div></div></div>
      </div>
    </div>
  </section>

  <section class="section"><div class="wrap"><div class="cta-band">
    <h2>Craving a brownie right now?</h2>
    <p>Order in under a minute and pay cash when it arrives. Fresh, fudgy, and unforgettable.</p>
    <a href="/shop" class="btn btn-primary">🍫 Order now</a>
  </div></div></section>`;
}

export function shopPage(products) {
  return `
  <section class="page-hero"><div class="wrap">
    <h1>Our Menu</h1>
    <p>Three signature flavours, baked fresh from our secret small-batch recipe. Cash on Delivery only.</p>
  </div></section>
  <section class="page"><div class="wrap">
    <div class="grid">${products.map(productCard).join('')}</div>
  </div></section>`;
}

export function productDetail(p) {
  const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : [{ label: 'Standard', price: p.price }];
  const minPrice = Math.min(...sizes.map((s) => s.price));
  const stockNote = p.stock === 0
    ? `<div class="stock-note out">😔 Currently sold out</div>`
    : p.stock <= 10
      ? `<div class="stock-note low">🔥 Hurry — only ${p.stock} left in stock</div>`
      : `<div class="stock-note in">✅ In stock &amp; baked fresh to order</div>`;
  const nutWarning = p.containsNuts
    ? `<div class="nut-warning">⚠️ <div><strong>Allergy warning:</strong> This brownie contains <strong>nuts</strong>. If you have a nut allergy, please do not eat it.</div></div>`
    : '';
  const allergens = (p.allergens || []).map((a) => `<span>${a}</span>`).join('');

  return `
  <div class="wrap">
    <a href="/shop" class="back-link">← Back to menu</a>
    <div class="pd">
      ${productArt(p, 'pd-art')}
      <div class="pd-info">
        <h1>${p.name}</h1>
        <div class="tagline">${p.tagline || ''}</div>
        <div class="desc">${p.description || ''}</div>
        <div class="pd-price" id="pdPrice">from ${money(minPrice)}</div>
        ${stockNote}
        ${nutWarning}
        <div class="field-label">Choose your box size</div>
        <div class="choices" id="sizeChoices">
          ${sizes.map((s, i) => `<div class="choice ${i === 0 ? 'active' : ''}" data-price="${s.price}" data-label="${s.label}">${s.label}<small>${money(s.price)}</small></div>`).join('')}
        </div>
        <div class="field-label">Quantity</div>
        <div class="qty-row">
          <div class="qty-stepper">
            <button id="qtyMinus" aria-label="Decrease">−</button>
            <input id="qtyInput" value="1" inputmode="numeric" aria-label="Quantity" />
            <button id="qtyPlus" aria-label="Increase">+</button>
          </div>
          <div class="muted">boxes</div>
        </div>
        <div class="pd-actions">
          <button class="btn btn-primary" id="addBtn" ${p.stock === 0 ? 'disabled' : ''}>🛒 Add to cart · <span id="btnTotal">${money(minPrice)}</span></button>
          <button class="btn btn-ghost" onclick="openCart()">View cart</button>
        </div>
        <div class="allergen-box">
          <h4>🥜 Allergen information</h4>
          <div class="allergen-list">${allergens || '<span>Contact us for details</span>'}</div>
        </div>
        <div class="cod-banner">💵 Cash on Delivery only — pay when it arrives</div>
      </div>
    </div>
  </div>
  <script>window.__PRODUCT__ = ${JSON.stringify({ id: p.id, slug: p.slug, name: p.name, emoji: p.emoji, gradient: p.gradient, imageUrl: p.imageUrl || null, stock: p.stock, sizes })};</script>
  <script src="/js/product.js" defer></script>`;
}

export function aboutPage() {
  return `
  <section class="page-hero"><div class="wrap">
    <span class="eyebrow">📖 Our Story</span>
    <h1>From our oven, with love</h1>
    <p>Fudgio started with one goal: the fudgiest brownie in town.</p>
  </div></section>
  <section class="page"><div class="wrap prose">
    <div class="card-panel">
      <h2>A secret recipe, perfected</h2>
      <p>Every Fudgio brownie is baked by hand in small batches using our special, closely-guarded recipe. We don't cut corners and we don't use preservatives — just premium chocolate, real butter, and a lot of patience. The result is a brownie with a crackly top and an unbelievably gooey centre.</p>
      <h2>Three flavours we're proud of</h2>
      <ul>
        <li><strong>Classic Chocolate</strong> — deep, dark and endlessly fudgy.</li>
        <li><strong>Nutty Delight</strong> — loaded with toasted nuts <em>(contains nuts — not for those with a nut allergy)</em>.</li>
        <li><strong>Salted Caramel</strong> — sweet, salty and swirled with golden caramel.</li>
      </ul>
      <h2>Why Cash on Delivery?</h2>
      <p>We believe ordering dessert should be simple and trustworthy. That's why we offer <strong>Cash on Delivery only</strong> — you pay in cash when your fresh brownies arrive at your door. No cards, no online payments, no worries.</p>
      <h2>Baked fresh, delivered warm</h2>
      <p>We bake to order so your brownies arrive as fresh as possible. Free delivery on orders over ${money(B.freeDeliveryOver)}.</p>
    </div>
    <div class="center" style="margin-top:32px"><a href="/shop" class="btn btn-primary">🍫 Explore the menu</a></div>
  </div></section>`;
}

export function faqPage() {
  const faqs = [
    ['Do you only accept Cash on Delivery?', 'Yes. Fudgio accepts <strong>Cash on Delivery (COD) only</strong>. You pay in cash when your order is delivered to your door — there are no online or card payments.'],
    ['Which areas do you deliver to?', `We deliver locally around ${B.address}. During checkout, enter your address and city and our team will confirm your order.`],
    ['Is delivery free?', `Delivery is free on orders over ${money(B.freeDeliveryOver)}. Below that, a small delivery fee of ${money(B.deliveryFee)} applies.`],
    ['Do your brownies contain nuts?', 'Our <strong>Nutty Delight</strong> flavour contains nuts (walnuts and hazelnuts). If you have a nut allergy, please avoid it. All our brownies are made in a kitchen that also handles nuts, so traces may be present.'],
    ['How fresh are the brownies?', 'We bake to order in small batches, so your brownies are as fresh as possible — usually baked the same day they are delivered.'],
    ['Can I track my order?', 'Yes! Create an account to see all your orders and their status, or use the <a href="/track">Track your order</a> page with your order number and phone.'],
    ['What is your secret recipe?', 'That stays in the kitchen 😉. Our recipe is special and small-batch — it\'s what makes a Fudgio brownie a Fudgio brownie.']
  ];
  return `
  <section class="page-hero"><div class="wrap">
    <span class="eyebrow">❓ FAQ</span>
    <h1>Frequently asked questions</h1>
    <p>Everything you need to know about ordering from Fudgio.</p>
  </div></section>
  <section class="page"><div class="wrap prose">
    ${faqs.map(([q, a]) => `<details class="faq-item"><summary>${q}</summary><div class="faq-a">${a}</div></details>`).join('')}
  </div></section>`;
}

export function contactPage() {
  return `
  <section class="page-hero"><div class="wrap">
    <span class="eyebrow">✉️ Contact</span>
    <h1>Get in touch</h1>
    <p>Questions, bulk orders or feedback? We'd love to hear from you.</p>
  </div></section>
  <section class="page"><div class="wrap">
    <div class="contact-grid">
      <div class="contact-info">
        <div class="ci-row"><div class="ico">📧</div><div><b>Email</b><span><a href="mailto:${B.email}">${B.email}</a></span></div></div>
        <div class="ci-row"><div class="ico">📞</div><div><b>Phone / WhatsApp</b><span><a href="tel:${B.phone.replace(/\s/g, '')}">${B.phone}</a></span></div></div>
        <div class="ci-row"><div class="ico">📍</div><div><b>Location</b><span>${B.address}</span></div></div>
        <div class="ci-row"><div class="ico">📸</div><div><b>Instagram</b><span><a href="${B.instagram}" target="_blank" rel="noopener">@fudgio</a></span></div></div>
        <div class="ci-row"><div class="ico">💵</div><div><b>Payment</b><span>Cash on Delivery only</span></div></div>
      </div>
      <div class="card-panel">
        <h3 style="font-family:var(--display);margin-bottom:6px">Send us a message</h3>
        <p class="muted" style="font-size:.88rem;margin-bottom:18px">We usually reply within a few hours.</p>
        <div class="form-error" id="contactMsg"></div>
        <div class="form-group"><label>Your name</label><input id="cfName" placeholder="Your name" /></div>
        <div class="form-group"><label>Email</label><input id="cfEmail" placeholder="you@email.com" /></div>
        <div class="form-group"><label>Message</label><textarea id="cfBody" rows="4" placeholder="How can we help?"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="submitContact()">Send message</button>
      </div>
    </div>
  </div></section>`;
}

export function trackPage() {
  return `
  <section class="page-hero"><div class="wrap">
    <span class="eyebrow">📦 Track</span>
    <h1>Track your order</h1>
    <p>Enter your order number and the phone number you used to place it.</p>
  </div></section>
  <section class="page"><div class="wrap auth-wrap">
    <div class="auth-card">
      <div class="form-error" id="trackErr"></div>
      <div class="form-group"><label>Order number</label><input id="trackId" placeholder="FUD-1001" /></div>
      <div class="form-group"><label>Phone number</label><input id="trackPhone" placeholder="03xx-xxxxxxx" /></div>
      <button class="btn btn-primary btn-block" onclick="trackOrder()">Track order</button>
    </div>
    <div id="trackResult" style="margin-top:24px"></div>
  </div></section>
  <script src="/js/track.js" defer></script>`;
}

export function accountPage() {
  const googleBtn = config.auth.google.enabled
    ? `<a href="/auth/google" class="google-btn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.7 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.9-9.7 6.9-17.4z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.4 0-11.8-4.2-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/></svg> Continue with Google</a><div class="divider">or</div>`
    : '';
  return `
  <section class="page"><div class="wrap auth-wrap" id="accountRoot">
    <div class="auth-card" id="authCard">
      <div class="center" style="margin-bottom:20px">
        <h1 style="font-family:var(--display);font-size:1.8rem">Welcome to Fudgio</h1>
        <p class="muted" style="font-size:.92rem">Sign in to track orders &amp; save your details</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login" onclick="switchTab('login')">Log in</button>
        <button class="auth-tab" data-tab="register" onclick="switchTab('register')">Sign up</button>
      </div>
      ${googleBtn}
      <div class="form-error" id="authErr"></div>
      <!-- login -->
      <div id="loginForm">
        <div class="form-group"><label>Email</label><input id="liEmail" type="email" placeholder="you@email.com" /></div>
        <div class="form-group"><label>Password</label><input id="liPass" type="password" placeholder="Your password" /></div>
        <button class="btn btn-primary btn-block" onclick="doLogin()">Log in</button>
      </div>
      <!-- register -->
      <div id="registerForm" style="display:none">
        <div class="form-group"><label>Full name</label><input id="rgName" placeholder="Your name" /></div>
        <div class="form-group"><label>Email</label><input id="rgEmail" type="email" placeholder="you@email.com" /></div>
        <div class="form-group"><label>Phone (optional)</label><input id="rgPhone" placeholder="03xx-xxxxxxx" /></div>
        <div class="form-group"><label>Password</label><input id="rgPass" type="password" placeholder="At least 6 characters" /></div>
        <button class="btn btn-primary btn-block" onclick="doRegister()">Create account</button>
      </div>
    </div>
  </div></section>
  <script src="/js/account.js" defer></script>`;
}

export function legalPage(kind) {
  const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  if (kind === 'privacy') {
    return `
    <section class="page-hero"><div class="wrap"><h1>Privacy Policy</h1><p>Last updated ${updated}</p></div></section>
    <section class="page"><div class="wrap prose">
      <p>Fudgio ("we", "us") respects your privacy. This policy explains what we collect and why.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your name, email, and (optionally) phone number when you create an account.</li>
        <li><strong>Order details</strong> — delivery address, city, phone number and order contents, so we can bake and deliver your order.</li>
        <li><strong>Login information</strong> — if you sign in with Google, we receive your name, email and profile picture.</li>
      </ul>
      <h2>How we use it</h2>
      <p>We use your information solely to process and deliver your Cash-on-Delivery orders, provide order tracking, and improve our service. We do <strong>not</strong> sell your data.</p>
      <h2>Payments</h2>
      <p>We accept Cash on Delivery only. We do not collect or store card or bank details.</p>
      <h2>Data security</h2>
      <p>Passwords are stored hashed. We take reasonable measures to protect your data, but no method of transmission is 100% secure.</p>
      <h2>Contact</h2>
      <p>Questions? Email <a href="mailto:${B.email}">${B.email}</a>.</p>
    </div></section>`;
  }
  return `
  <section class="page-hero"><div class="wrap"><h1>Terms of Service</h1><p>Last updated ${updated}</p></div></section>
  <section class="page"><div class="wrap prose">
    <h2>Orders</h2>
    <p>By placing an order you agree to pay the stated total in cash upon delivery. Orders are subject to availability and confirmation.</p>
    <h2>Payment</h2>
    <p>Fudgio accepts <strong>Cash on Delivery only</strong>. Please have the exact amount ready when your order arrives.</p>
    <h2>Cancellations</h2>
    <p>To cancel an order, contact us as soon as possible at <a href="mailto:${B.email}">${B.email}</a> or ${B.phone}. Orders already baking may not be cancellable.</p>
    <h2>Allergens</h2>
    <p>Our Nutty Delight contains nuts. All products are prepared in a kitchen that handles nuts, gluten, dairy, eggs and soy. Order at your own discretion if you have allergies.</p>
    <h2>Delivery</h2>
    <p>Delivery times are estimates. We are not liable for delays outside our control.</p>
    <h2>Contact</h2>
    <p>Email <a href="mailto:${B.email}">${B.email}</a>.</p>
  </div></section>`;
}

export function notFoundPage() {
  return `
  <section class="page-hero" style="padding:100px 0"><div class="wrap">
    <div style="font-size:5rem">🍫</div>
    <h1>404 — Page not found</h1>
    <p>Looks like this page melted. Let's get you back to the good stuff.</p>
    <div class="center" style="margin-top:26px"><a href="/" class="btn btn-primary">Back home</a> <a href="/shop" class="btn btn-ghost">See the menu</a></div>
  </div></section>`;
}
