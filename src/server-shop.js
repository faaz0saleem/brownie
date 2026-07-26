// Fudgio storefront server (fudgio.com). Serves SEO-rendered pages, the
// customer API, and authentication (email/password + Google). No admin here.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initStore } from './data/index.js';
import { seed } from './seed.js';
import { renderPage, organizationJsonLd } from './layout.js';
import * as pages from './pages.js';
import {
  listProducts, getProduct, createOrder, getOrder, listOrders
} from './service.js';
import {
  attachUser, issueSession, clearSession, publicUser,
  registerWithEmail, loginWithEmail,
  googleAuthUrl, googleExchange, upsertGoogleUser, makeState, _sign, _unsign
} from './auth.js';
import { store } from './data/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const B = config.brand;

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser());
app.use(express.static(path.join(config.root, 'public'), { extensions: [] }));

const send = (res, html, status = 200) => res.status(status).type('html').send(html);
const canonical = (p) => `${B.siteUrl}${p}`;

// ---------------- SEO pages ----------------
app.get('/', async (req, res) => {
  const products = await listProducts();
  send(res, renderPage({
    active: 'home', content: pages.homePage(products), canonical: canonical('/'),
    description: `${B.name} — handcrafted, fudgy brownies baked fresh and delivered with Cash on Delivery. Three signature flavours: Chocolate, Nutty Delight & Salted Caramel.`,
    jsonLd: organizationJsonLd()
  }));
});

app.get('/shop', async (req, res) => {
  const products = await listProducts();
  send(res, renderPage({
    active: 'shop', title: 'Menu', content: pages.shopPage(products), canonical: canonical('/shop'),
    description: 'Browse Fudgio\'s handcrafted brownies — Chocolate, Nutty Delight and Salted Caramel. Cash on Delivery only.'
  }));
});

app.get('/product/:slug', async (req, res) => {
  const p = await getProduct(req.params.slug);
  if (!p) return notFound(res);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description,
    image: p.imageUrl ? [p.imageUrl] : undefined, brand: { '@type': 'Brand', name: B.name },
    offers: {
      '@type': 'Offer', priceCurrency: 'PKR',
      price: (Array.isArray(p.sizes) && p.sizes.length ? Math.min(...p.sizes.map((s) => s.price)) : p.price),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonical('/product/' + p.slug)
    }
  };
  send(res, renderPage({
    active: 'shop', title: p.name, content: pages.productDetail(p), canonical: canonical('/product/' + p.slug),
    description: `${p.name} — ${p.tagline}. ${p.description}`.slice(0, 180),
    ogImage: p.imageUrl && p.imageUrl.startsWith('http') ? p.imageUrl : undefined, jsonLd
  }));
});

const staticPage = (route, opts) => app.get(route, (req, res) =>
  send(res, renderPage({ ...opts, canonical: canonical(route) })));

staticPage('/about', { active: 'about', title: 'Our Story', content: pages.aboutPage(),
  description: 'The Fudgio story — handcrafted brownies from a secret small-batch recipe, delivered with Cash on Delivery.' });
staticPage('/faq', { active: 'faq', title: 'FAQ', content: pages.faqPage(),
  description: 'Answers about delivery, Cash on Delivery, allergens and ordering from Fudgio.' });
staticPage('/contact', { active: 'contact', title: 'Contact', content: pages.contactPage(),
  description: 'Contact Fudgio for orders, bulk requests and feedback.' });
staticPage('/track', { title: 'Track your order', content: pages.trackPage(),
  description: 'Track your Fudgio order status.' });
staticPage('/account', { title: 'Your account', content: pages.accountPage(),
  description: 'Sign in or create a Fudgio account to track your orders.' });
staticPage('/privacy', { title: 'Privacy Policy', content: pages.legalPage('privacy') });
staticPage('/terms', { title: 'Terms of Service', content: pages.legalPage('terms') });

// ---------------- Customer API ----------------
app.get('/api/products', async (req, res) => res.json(await listProducts()));
app.get('/api/products/:slug', async (req, res) => {
  const p = await getProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.post('/api/orders', async (req, res) => {
  const { items, customer } = req.body || {};
  const cust = { ...customer };
  if (req.user && !cust.email) cust.email = req.user.email;
  const result = await createOrder({ items, customer: cust, userId: req.user?.id || null });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ order: result.order });
});

app.get('/api/me', (req, res) => res.json({ user: req.user }));

app.get('/api/my/orders', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json(await listOrders({ userId: req.user.id }));
});

// Track by order id + phone (public, no login).
app.post('/api/track', async (req, res) => {
  const { orderId, phone } = req.body || {};
  const order = await getOrder((orderId || '').trim());
  if (!order || order.customer.phone.replace(/\D/g, '') !== (phone || '').replace(/\D/g, '')) {
    return res.status(404).json({ error: 'No order found with that number and phone.' });
  }
  res.json(order);
});

// ---------------- Auth API ----------------
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  const result = await registerWithEmail({ name, email, password, phone });
  if (result.error) return res.status(400).json({ error: result.error });
  issueSession(res, result.user.id);
  res.status(201).json({ user: publicUser(result.user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await loginWithEmail({ email, password });
  if (result.error) return res.status(400).json({ error: result.error });
  issueSession(res, result.user.id);
  res.json({ user: publicUser(result.user) });
});

app.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

app.patch('/api/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const { name, phone, city, address } = req.body || {};
  const patch = {};
  if (name) patch.name = String(name).trim();
  if (phone !== undefined) patch.phone = String(phone).trim();
  if (city !== undefined) patch.city = String(city).trim();
  if (address !== undefined) patch.address = String(address).trim();
  const u = await store.updateUser(req.user.id, patch);
  res.json({ user: publicUser(u) });
});

// ---------------- Google OAuth ----------------
app.get('/auth/google', (req, res) => {
  if (!config.auth.google.enabled) return res.redirect('/account');
  const state = makeState();
  res.cookie('g_state', _sign(state), { httpOnly: true, sameSite: 'lax', maxAge: 600000, path: '/' });
  res.redirect(googleAuthUrl(state));
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const savedState = _unsign(req.cookies?.g_state);
    if (!code || !state || state !== savedState) return res.redirect('/account?error=oauth');
    const profile = await googleExchange(code);
    const user = await upsertGoogleUser(profile);
    issueSession(res, user.id);
    res.clearCookie('g_state', { path: '/' });
    res.redirect('/account');
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    res.redirect('/account?error=oauth');
  }
});

// ---------------- SEO files ----------------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${B.siteUrl}/sitemap.xml\n`);
});
app.get('/sitemap.xml', async (req, res) => {
  const products = await listProducts();
  const urls = ['/', '/shop', '/about', '/faq', '/contact', '/track', '/privacy', '/terms',
    ...products.map((p) => '/product/' + p.slug)];
  const body = urls.map((u) => `  <url><loc>${B.siteUrl}${u}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
});

// ---------------- 404 ----------------
function notFound(res) {
  send(res, renderPage({ title: 'Not found', content: pages.notFoundPage() }), 404);
}
app.use((req, res) => notFound(res));

// ---------------- boot ----------------
export async function startShop() {
  await initStore();
  await seed();
  app.listen(config.ports.shop, () => {
    console.log(`🍫 Fudgio shop running at http://localhost:${config.ports.shop}  (driver: ${store.driver})`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startShop();
