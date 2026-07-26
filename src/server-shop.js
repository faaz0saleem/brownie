// Customer-facing shop server (port 4000).
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import './seed.js'; // ensure catalog exists
import { listProducts, getProduct, createOrder } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.SHOP_PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/products', (req, res) => {
  res.json(listProducts());
});

app.get('/api/products/:id', (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: 'Brownie not found.' });
  res.json(p);
});

app.post('/api/orders', (req, res) => {
  const { items, customer } = req.body || {};
  const result = createOrder({ items, customer });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ order: result.order });
});

// SPA-ish fallback for product pages served client-side.
app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'product.html'));
});

app.listen(PORT, () => {
  console.log(`🍫 Brownie Bliss shop running at http://localhost:${PORT}`);
});
