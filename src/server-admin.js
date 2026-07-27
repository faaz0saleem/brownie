// Fudgio admin dashboard server (admin.fudgio.com). Password-protected.
// This is a SEPARATE app from the storefront and is never linked from it.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initStore, store } from './data/index.js';
import { seed } from './seed.js';
import { recaptchaClientConfig, verifyRecaptcha } from './recaptcha.js';
import {
  listProducts, listOrders, updateOrderStatus, listUsers, getUser,
  updateProduct, createProduct, analytics, getOrder, ORDER_STATUSES
} from './service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const ADMIN_TOKEN = config.auth.adminToken;

app.use(express.json({ limit: '8mb' })); // room for base64 product images

app.get('/recaptcha-config.js', (req, res) => {
  res.type('application/javascript').send(`window.FUDGIO_ADMIN=${JSON.stringify({ recaptcha: recaptchaClientConfig() })};`);
});

app.use(express.static(path.join(config.root, 'admin')));

// Login validates the admin password — must be BEFORE the guard.
app.post('/api/login', async (req, res) => {
  const recaptcha = await verifyRecaptcha({ token: req.body?.recaptchaToken, expectedAction: 'ADMIN_LOGIN', req });
  if (!recaptcha.ok) return res.status(recaptcha.status || 403).json({ error: recaptcha.error });
  if ((req.body && req.body.token) === ADMIN_TOKEN) return res.json({ ok: true });
  res.status(401).json({ error: 'Wrong password.' });
});

// Guard the rest of the API.
app.use('/api', (req, res, next) => {
  const token = req.get('x-admin-token') || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized.' });
  next();
});

// Health check (public — no token needed) so you can verify the admin is up.
app.get('/healthz', async (req, res) => {
  try {
    await listOrders();
    res.json({ ok: true, app: 'admin', driver: store.driver, time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, app: 'admin', driver: store.driver, error: e.message });
  }
});

app.get('/api/config', (req, res) => res.json({ statuses: ORDER_STATUSES, currency: config.brand.currency }));
app.get('/api/analytics', async (req, res) => res.json(await analytics()));
app.get('/api/orders', async (req, res) => res.json(await listOrders()));
app.get('/api/orders/:id', async (req, res) => {
  const o = await getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(o);
});
app.get('/api/users', async (req, res) => res.json(await listUsers()));
app.get('/api/users/:id/orders', async (req, res) => res.json(await listOrders({ userId: req.params.id })));
app.get('/api/products', async (req, res) => res.json(await listProducts({ includeInactive: true })));

app.patch('/api/orders/:id', async (req, res) => {
  const result = await updateOrderStatus(req.params.id, req.body.status);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.order);
});

app.patch('/api/products/:id', async (req, res) => {
  const result = await updateProduct(req.params.id, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.product);
});

app.post('/api/products', async (req, res) => {
  const result = await createProduct(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.product);
});

// Set / replace a product's image (base64 data URI sent from the admin UI).
app.put('/api/products/:id/image', async (req, res) => {
  const { imageUrl } = req.body || {};
  if (!imageUrl || typeof imageUrl !== 'string') return res.status(400).json({ error: 'No image provided.' });
  if (imageUrl.length > 6_000_000) return res.status(400).json({ error: 'Image too large (max ~4MB).' });
  const result = await updateProduct(req.params.id, { imageUrl });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.product);
});
app.delete('/api/products/:id/image', async (req, res) => {
  const result = await updateProduct(req.params.id, { imageUrl: null });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.product);
});

export async function startAdmin() {
  try {
    await initStore();
    await seed();
  } catch (e) {
    console.error('\n❌ Fudgio ADMIN failed to start — data store error:');
    console.error('   ' + e.message);
    console.error('   Driver: ' + store.driver + ' | DB host: ' + (config.db.host || '(none — using JSON fallback)'));
    console.error('   See DEPLOY.md → Troubleshooting for Cloud SQL connection fixes.\n');
    process.exit(1);
  }
  app.listen(config.ports.admin, () => {
    console.log(`📊 Fudgio admin running on port ${config.ports.admin}  (driver: ${store.driver})`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startAdmin();
