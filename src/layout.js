// Server-side page layout for the storefront. Wraps page content with a shared
// head (SEO meta, Open Graph, JSON-LD), header and footer. No admin links here —
// the admin lives on a separate hidden domain.
import { config } from './config.js';

const B = config.brand;

// Inline logo mark — inlined (not an external <use>) for Safari/Firefox support.
const MARK = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><defs>
<linearGradient id="fgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2b978"/><stop offset=".55" stop-color="#d98e4a"/><stop offset="1" stop-color="#ff6f91"/></linearGradient>
<linearGradient id="fgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b3a29"/><stop offset="1" stop-color="#2b1a12"/></linearGradient></defs>
<rect x="1" y="1" width="30" height="30" rx="8" fill="url(#fgG)"/>
<rect x="6.5" y="8.5" width="19" height="15" rx="3.5" fill="url(#fgB)"/>
<path d="M9.5 12.5c2-1 4 .6 6 0s4-1.4 6-.4" stroke="#7a5236" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".8"/>
<path d="M13 11.4h6.4v2.3h-3.9v1.7h3.4v2.2h-3.4v3.6H13z" fill="#ffe9cf"/></svg>`;

function head({ title, description, canonical, ogImage, jsonLd, extraHead = '' }) {
  const fullTitle = title ? `${title} · ${B.name}` : `${B.name} — ${B.tagline}`;
  const desc = (description || B.tagline).replace(/"/g, '&quot;');
  const url = canonical || B.siteUrl;
  const img = ogImage || `${B.siteUrl}/assets/og-image.png`;
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '';
  return `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#1a0f0a" />
  <meta name="robots" content="index,follow" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${B.name}" />
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${img}" />
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <link rel="apple-touch-icon" href="/assets/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
  <script>window.FUDGIO=${JSON.stringify({ currency: B.currency, freeDeliveryOver: B.freeDeliveryOver, deliveryFee: B.deliveryFee, googleEnabled: config.auth.google.enabled })};</script>
  ${ld}
  ${extraHead}`;
}

function header(active = '') {
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header" id="siteHeader">
    <div class="wrap nav">
      <a href="/" class="brand" aria-label="${B.name} home">
        <span class="logo">${MARK}</span>
        <span class="brand-name">${B.name}<small>Fresh · Fudgy · COD</small></span>
      </a>
      <nav class="nav-links" aria-label="Primary">
        ${link('/', 'Home', 'home')}
        ${link('/shop', 'Menu', 'shop')}
        ${link('/about', 'About', 'about')}
        ${link('/faq', 'FAQ', 'faq')}
        ${link('/contact', 'Contact', 'contact')}
      </nav>
      <div class="nav-actions">
        <a href="/account" class="account-btn" id="accountBtn" aria-label="Your account">
          <span class="acc-ico">👤</span><span class="acc-label" id="accLabel">Sign in</span>
        </a>
        <button class="cart-btn" onclick="openCart()" aria-label="Open cart">
          🛒 <span class="cart-count" id="cartCount">0</span>
        </button>
        <button class="menu-toggle" onclick="toggleMobileNav()" aria-label="Menu">☰</button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="Mobile">
      <a href="/">Home</a><a href="/shop">Menu</a><a href="/about">About</a>
      <a href="/faq">FAQ</a><a href="/contact">Contact</a><a href="/account">Your account</a>
    </nav>
  </header>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div class="footer-brand">
        <a href="/" class="brand">
          <span class="logo">${MARK}</span>
          <span class="brand-name">${B.name}</span>
        </a>
        <p>${B.tagline}</p>
        <p class="cod-line">💵 We accept <strong>Cash on Delivery</strong> only.</p>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <a href="/shop">Our Menu</a>
        <a href="/about">Our Story</a>
        <a href="/faq">FAQ</a>
        <a href="/track">Track your order</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/account">Your account</a>
      </div>
      <div class="footer-col">
        <h4>Get in touch</h4>
        <a href="mailto:${B.email}">${B.email}</a>
        <a href="tel:${B.phone.replace(/\s/g, '')}">${B.phone}</a>
        <a href="${B.instagram}" target="_blank" rel="noopener">Instagram</a>
        <p class="muted">${B.address}</p>
      </div>
    </div>
    <div class="wrap footer-bottom">
      <span>© ${year} ${B.name}. All rights reserved.</span>
      <span>Handcrafted with 💛 &amp; a lot of chocolate.</span>
    </div>
  </footer>
  <!-- Cart drawer -->
  <div class="drawer-overlay" id="drawerOverlay" onclick="closeCart()"></div>
  <aside class="drawer" id="drawer" aria-label="Shopping cart" aria-hidden="true">
    <div class="drawer-head"><h3>Your Cart 🛒</h3><button class="drawer-close" onclick="closeCart()" aria-label="Close">×</button></div>
    <div class="drawer-body" id="cartBody"></div>
    <div class="drawer-foot" id="cartFoot"></div>
  </aside>
  <div class="modal-overlay" id="checkoutModal"><div class="modal" id="checkoutInner"></div></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script src="/js/app.js" defer></script>`;
}

export function renderPage({ content, active, scripts = '', ...meta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>${head(meta)}</head>
<body class="${meta.bodyClass || ''}">
  ${header(active)}
  <main id="main">${content}</main>
  ${footer()}
  ${scripts}
</body>
</html>`;
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    name: B.name,
    description: B.tagline,
    url: B.siteUrl,
    email: B.email,
    telephone: B.phone,
    address: { '@type': 'PostalAddress', addressLocality: B.address },
    servesCuisine: 'Desserts',
    paymentAccepted: 'Cash on Delivery',
    image: `${B.siteUrl}/assets/og-image.png`,
    sameAs: [B.instagram]
  };
}
