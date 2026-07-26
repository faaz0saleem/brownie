// Business logic shared by the shop and admin servers. Driver-agnostic:
// it only calls the unified store API, so it works on MySQL or the JSON store.
import { store } from './data/index.js';
import { config } from './config.js';

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Baking', 'Out for Delivery', 'Delivered', 'Cancelled'];
export { ORDER_STATUSES };

export async function listProducts(opts) { return store.listProducts(opts); }
export async function getProduct(idOrSlug, opts) { return store.getProduct(idOrSlug, opts); }

// Create a COD order. Validates & decrements stock, records status history,
// links to a user account (by id or phone) and updates their lifetime stats.
export async function createOrder({ items, customer, userId }) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'Your cart is empty.' };
  if (!customer || !customer.name || !customer.phone || !customer.address || !customer.city) {
    return { error: 'Please provide your name, phone, address and city.' };
  }

  const lineItems = [];
  let subtotal = 0;
  for (const item of items) {
    const product = await store.getProduct(item.productId);
    if (!product) return { error: 'A product in your cart is no longer available.' };
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    if (product.stock < qty) return { error: `Only ${product.stock} left of ${product.name}.` };

    // Resolve chosen size (variant). Falls back to base price.
    let unitPrice = product.price;
    let sizeLabel = '';
    if (Array.isArray(product.sizes) && product.sizes.length) {
      const size = product.sizes.find((s) => s.label === item.size) || product.sizes[0];
      unitPrice = size.price;
      sizeLabel = size.label;
    }
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    lineItems.push({
      productId: product.id, name: product.name, emoji: product.emoji,
      imageUrl: product.imageUrl || null, size: sizeLabel, qty, price: unitPrice, lineTotal
    });
  }

  // Commit stock changes.
  for (const li of lineItems) {
    const product = await store.getProduct(li.productId);
    await store.updateProduct(product.id, {
      stock: product.stock - li.qty, sold: (product.sold || 0) + li.qty
    });
  }

  const deliveryFee = subtotal >= config.brand.freeDeliveryOver ? 0 : config.brand.deliveryFee;
  const now = Date.now();
  const order = {
    id: await store.nextOrderId(),
    userId: userId || null,
    items: lineItems,
    customer: {
      name: customer.name.trim(), phone: customer.phone.trim(),
      address: customer.address.trim(), city: customer.city.trim(),
      notes: (customer.notes || '').trim(), email: (customer.email || '').trim()
    },
    subtotal, deliveryFee, total: subtotal + deliveryFee,
    paymentMethod: 'COD', status: 'Pending',
    statusHistory: [{ status: 'Pending', at: now }],
    createdAt: now
  };
  await store.createOrder(order);

  // Link to a user account. Prefer the signed-in user; else match by phone;
  // else create a lightweight guest record so admins can see the customer.
  let user = null;
  if (userId) user = await store.getUserById(userId);
  if (!user) user = await store.getUserByPhone(order.customer.phone);
  if (!user) {
    user = await store.createUser({
      name: order.customer.name, phone: order.customer.phone, email: order.customer.email || null,
      city: order.customer.city, address: order.customer.address
    });
  }
  await store.updateUser(user.id, {
    name: order.customer.name, phone: order.customer.phone,
    email: user.email || order.customer.email || null,
    city: order.customer.city, address: order.customer.address,
    orders: (user.orders || 0) + 1, totalSpent: (user.totalSpent || 0) + order.total,
    lastOrderAt: now
  });
  if (!order.userId) { order.userId = user.id; await store.saveOrder(order); }

  return { order };
}

export async function listOrders(opts) { return store.listOrders(opts); }
export async function getOrder(id) { return store.getOrder(id); }

export async function updateOrderStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) return { error: 'Invalid status.' };
  const order = await store.getOrder(orderId);
  if (!order) return { error: 'Order not found.' };

  // Cancelling a live order restocks the items.
  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    for (const li of order.items) {
      const p = await store.getProduct(li.productId, { includeInactive: true });
      if (p) await store.updateProduct(p.id, { stock: p.stock + li.qty, sold: Math.max(0, (p.sold || 0) - li.qty) });
    }
  }
  order.status = status;
  order.statusHistory = [...(order.statusHistory || []), { status, at: Date.now() }];
  await store.saveOrder(order);
  return { order };
}

export async function listUsers() { return store.listUsers(); }
export async function getUser(id) { return store.getUserById(id); }

// Admin product management.
export async function updateProduct(id, patch) {
  const clean = {};
  const map = ['name', 'tagline', 'description', 'gradient', 'emoji', 'imageUrl', 'slug'];
  for (const f of map) if (f in patch) clean[f] = patch[f];
  if ('price' in patch) clean.price = Math.max(0, parseInt(patch.price, 10) || 0);
  if ('stock' in patch) clean.stock = Math.max(0, parseInt(patch.stock, 10) || 0);
  if ('active' in patch) clean.active = !!patch.active;
  if ('featured' in patch) clean.featured = !!patch.featured;
  if ('containsNuts' in patch) clean.containsNuts = !!patch.containsNuts;
  if ('flavors' in patch) clean.flavors = normalizeList(patch.flavors);
  if ('allergens' in patch) clean.allergens = normalizeList(patch.allergens);
  if ('sizes' in patch && Array.isArray(patch.sizes)) clean.sizes = patch.sizes;
  const p = await store.updateProduct(id, clean);
  return p ? { product: p } : { error: 'Product not found.' };
}
export async function createProduct(data) {
  const p = await store.createProduct({
    name: data.name || 'New Brownie',
    slug: (data.slug || data.name || 'brownie').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    tagline: data.tagline || '', description: data.description || '',
    price: Math.max(0, parseInt(data.price, 10) || 0),
    gradient: data.gradient || 'linear-gradient(135deg, #5b3a29, #2b1a12)',
    emoji: data.emoji || '🍫', imageUrl: data.imageUrl || null,
    flavors: normalizeList(data.flavors), allergens: normalizeList(data.allergens),
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    containsNuts: !!data.containsNuts, stock: Math.max(0, parseInt(data.stock, 10) || 0),
    featured: !!data.featured, active: data.active === undefined ? true : !!data.active
  });
  return { product: p };
}
function normalizeList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------- Analytics (computed in JS from raw records) ----------
export async function analytics() {
  const [orders, products, users] = await Promise.all([
    store.listOrders(), store.listProducts({ includeInactive: true }), store.listUsers()
  ]);
  const active = orders.filter((o) => o.status !== 'Cancelled');
  const delivered = orders.filter((o) => o.status === 'Delivered');
  const revenue = active.reduce((s, o) => s + o.total, 0);

  const perProduct = {};
  for (const o of active) for (const li of o.items) {
    if (!perProduct[li.productId]) perProduct[li.productId] = { name: li.name, emoji: li.emoji, units: 0, revenue: 0 };
    perProduct[li.productId].units += li.qty;
    perProduct[li.productId].revenue += li.lineTotal;
  }
  const topProducts = Object.values(perProduct).sort((a, b) => b.units - a.units);

  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = day.getTime(), end = start + 864e5;
    const dayOrders = active.filter((o) => o.createdAt >= start && o.createdAt < end);
    days.push({
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      orders: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + o.total, 0)
    });
  }

  const cities = {};
  for (const o of active) { const c = o.customer.city || 'Unknown'; cities[c] = (cities[c] || 0) + 1; }
  const cityBreakdown = Object.entries(cities).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count);

  const statusCounts = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

  const lowStock = products.filter((p) => p.active && p.stock <= 10)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, emoji: p.emoji }))
    .sort((a, b) => a.stock - b.stock);

  const unitsSold = active.reduce((s, o) => s + o.items.reduce((t, li) => t + li.qty, 0), 0);

  return {
    totals: {
      revenue, orders: orders.length, activeOrders: active.length,
      cancelledOrders: orders.length - active.length, deliveredOrders: delivered.length,
      customers: users.length, unitsSold, avgOrderValue: active.length ? Math.round(revenue / active.length) : 0,
      products: products.filter((p) => p.active).length, outOfStock: products.filter((p) => p.active && p.stock === 0).length,
      pendingOrders: orders.filter((o) => ['Pending', 'Confirmed', 'Baking'].includes(o.status)).length
    },
    topProducts, salesByDay: days, cityBreakdown, statusCounts, lowStock
  };
}
