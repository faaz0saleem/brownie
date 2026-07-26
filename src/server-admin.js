// Admin dashboard server (port 3000).
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import './seed.js'; // ensure catalog exists
import {
  listProducts,
  listOrders,
  updateOrderStatus,
  listUsers,
  updateProduct,
  createProduct,
  analytics
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// Extremely light auth gate so the dashboard isn't wide open. Configure with
// ADMIN_TOKEN; defaults to "brownie-admin" for local dev.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'brownie-admin';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'admin')));

// Login endpoint validates a token — must sit BEFORE the auth guard.
app.post('/api/login', (req, res) => {
  if ((req.body && req.body.token) === ADMIN_TOKEN) return res.json({ ok: true });
  res.status(401).json({ error: 'Wrong password.' });
});

// Guard the rest of the API (not the static login page or /api/login).
app.use('/api', (req, res, next) => {
  const token = req.get('x-admin-token') || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
});

app.get('/api/analytics', (req, res) => res.json(analytics()));
app.get('/api/orders', (req, res) => res.json(listOrders()));
app.get('/api/users', (req, res) => res.json(listUsers()));
app.get('/api/products', (req, res) => res.json(listProducts({ includeInactive: true })));

app.patch('/api/orders/:id', (req, res) => {
  const result = updateOrderStatus(req.params.id, req.body.status);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.order);
});

app.patch('/api/products/:id', (req, res) => {
  const result = updateProduct(req.params.id, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.product);
});

app.post('/api/products', (req, res) => {
  const result = createProduct(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.product);
});

app.listen(PORT, () => {
  console.log(`📊 Brownie Bliss admin running at http://localhost:${PORT}`);
  console.log(`   Admin password: ${ADMIN_TOKEN}`);
});
