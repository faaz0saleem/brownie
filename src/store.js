// Business logic shared by the shop and admin servers.
import { db, save, nextOrderId, id } from './db.js';

export function listProducts({ includeInactive = false } = {}) {
  const d = db();
  return d.products
    .filter((p) => includeInactive || p.active)
    .sort((a, b) => (b.featured === true) - (a.featured === true));
}

export function getProduct(pid, { includeInactive = false } = {}) {
  const d = db();
  const p = d.products.find((x) => x.id === pid);
  if (!p) return null;
  if (!includeInactive && !p.active) return null;
  return p;
}

// Create an order from a cart. Validates stock, decrements stock, records the
// customer as a user (keyed by phone), bumps "sold" counters.
export function createOrder({ items, customer }) {
  const d = db();
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Your cart is empty.' };
  }
  if (!customer || !customer.name || !customer.phone || !customer.address || !customer.city) {
    return { error: 'Please fill in name, phone, address and city.' };
  }

  const lineItems = [];
  let total = 0;

  for (const item of items) {
    const product = d.products.find((p) => p.id === item.productId && p.active);
    if (!product) return { error: `A product in your cart is no longer available.` };
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    if (product.stock < qty) {
      return { error: `Only ${product.stock} left of ${product.name}.` };
    }
    const flavor = item.flavor && product.flavors.includes(item.flavor)
      ? item.flavor
      : product.flavors[0];
    const lineTotal = product.price * qty;
    total += lineTotal;
    lineItems.push({
      productId: product.id,
      name: product.name,
      emoji: product.emoji,
      flavor,
      qty,
      price: product.price,
      lineTotal
    });
  }

  // Commit: decrement stock, bump sold.
  for (const li of lineItems) {
    const product = d.products.find((p) => p.id === li.productId);
    product.stock -= li.qty;
    product.sold = (product.sold || 0) + li.qty;
  }

  const deliveryFee = total >= 2000 ? 0 : 150;
  const grandTotal = total + deliveryFee;

  const order = {
    id: nextOrderId(),
    items: lineItems,
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      address: customer.address.trim(),
      city: customer.city.trim(),
      notes: (customer.notes || '').trim()
    },
    subtotal: total,
    deliveryFee,
    total: grandTotal,
    paymentMethod: 'COD',
    status: 'Pending',
    createdAt: Date.now()
  };
  d.orders.push(order);

  // Upsert user by phone.
  let user = d.users.find((u) => u.phone === order.customer.phone);
  if (!user) {
    user = {
      id: id(),
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address,
      city: order.customer.city,
      firstOrderAt: Date.now(),
      orders: 0,
      totalSpent: 0
    };
    d.users.push(user);
  }
  user.name = order.customer.name;
  user.address = order.customer.address;
  user.city = order.customer.city;
  user.orders += 1;
  user.totalSpent += grandTotal;
  user.lastOrderAt = Date.now();

  save();
  return { order };
}

export function listOrders() {
  const d = db();
  return [...d.orders].sort((a, b) => b.createdAt - a.createdAt);
}

export function updateOrderStatus(orderId, status) {
  const d = db();
  const order = d.orders.find((o) => o.id === orderId);
  if (!order) return { error: 'Order not found.' };
  const allowed = ['Pending', 'Confirmed', 'Out for Delivery', 'Delivered', 'Cancelled'];
  if (!allowed.includes(status)) return { error: 'Invalid status.' };

  // If cancelling a non-cancelled order, restock the items.
  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    for (const li of order.items) {
      const p = d.products.find((x) => x.id === li.productId);
      if (p) {
        p.stock += li.qty;
        p.sold = Math.max(0, (p.sold || 0) - li.qty);
      }
    }
  }
  order.status = status;
  save();
  return { order };
}

export function listUsers() {
  const d = db();
  return [...d.users].sort((a, b) => (b.lastOrderAt || 0) - (a.lastOrderAt || 0));
}

export function updateProduct(pid, patch) {
  const d = db();
  const p = d.products.find((x) => x.id === pid);
  if (!p) return { error: 'Product not found.' };
  const fields = ['name', 'tagline', 'description', 'price', 'stock', 'active', 'featured', 'gradient', 'emoji', 'flavors'];
  for (const f of fields) {
    if (f in patch) {
      if (f === 'price' || f === 'stock') p[f] = Math.max(0, parseInt(patch[f], 10) || 0);
      else if (f === 'active' || f === 'featured') p[f] = !!patch[f];
      else if (f === 'flavors') p[f] = Array.isArray(patch[f]) ? patch[f] : String(patch[f]).split(',').map((s) => s.trim()).filter(Boolean);
      else p[f] = patch[f];
    }
  }
  save();
  return { product: p };
}

export function createProduct(data) {
  const d = db();
  const p = {
    id: id(),
    createdAt: Date.now(),
    name: data.name || 'New Brownie',
    tagline: data.tagline || '',
    description: data.description || '',
    price: Math.max(0, parseInt(data.price, 10) || 0),
    gradient: data.gradient || 'linear-gradient(135deg, #5b3a29 0%, #2b1a12 100%)',
    emoji: data.emoji || '🍫',
    flavors: Array.isArray(data.flavors) ? data.flavors : String(data.flavors || 'Original').split(',').map((s) => s.trim()).filter(Boolean),
    stock: Math.max(0, parseInt(data.stock, 10) || 0),
    sold: 0,
    featured: !!data.featured,
    active: data.active === undefined ? true : !!data.active
  };
  d.products.push(p);
  save();
  return { product: p };
}

// Aggregate analytics for the admin dashboard.
export function analytics() {
  const d = db();
  const orders = d.orders;
  const delivered = orders.filter((o) => o.status === 'Delivered');
  const cancelled = orders.filter((o) => o.status === 'Cancelled');
  const active = orders.filter((o) => o.status !== 'Cancelled');

  const revenue = active.reduce((s, o) => s + o.total, 0);
  const deliveredRevenue = delivered.reduce((s, o) => s + o.total, 0);

  // Units sold per product + revenue per product.
  const perProduct = {};
  for (const o of active) {
    for (const li of o.items) {
      if (!perProduct[li.productId]) {
        perProduct[li.productId] = { name: li.name, emoji: li.emoji, units: 0, revenue: 0 };
      }
      perProduct[li.productId].units += li.qty;
      perProduct[li.productId].revenue += li.lineTotal;
    }
  }
  const topProducts = Object.values(perProduct).sort((a, b) => b.units - a.units);

  // Sales over the last 14 days.
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = day.getTime();
    const end = start + 24 * 3600 * 1000;
    const dayOrders = active.filter((o) => o.createdAt >= start && o.createdAt < end);
    days.push({
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      orders: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + o.total, 0)
    });
  }

  // City breakdown.
  const cities = {};
  for (const o of active) {
    const c = o.customer.city || 'Unknown';
    cities[c] = (cities[c] || 0) + 1;
  }
  const cityBreakdown = Object.entries(cities)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);

  const statusCounts = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

  const lowStock = d.products
    .filter((p) => p.active && p.stock <= 10)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, emoji: p.emoji }))
    .sort((a, b) => a.stock - b.stock);

  const totalUnits = active.reduce((s, o) => s + o.items.reduce((t, li) => t + li.qty, 0), 0);

  return {
    totals: {
      revenue,
      deliveredRevenue,
      orders: orders.length,
      activeOrders: active.length,
      cancelledOrders: cancelled.length,
      deliveredOrders: delivered.length,
      customers: d.users.length,
      unitsSold: totalUnits,
      avgOrderValue: active.length ? Math.round(revenue / active.length) : 0,
      products: d.products.filter((p) => p.active).length,
      outOfStock: d.products.filter((p) => p.active && p.stock === 0).length
    },
    topProducts,
    salesByDay: days,
    cityBreakdown,
    statusCounts,
    lowStock
  };
}
