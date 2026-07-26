// Zero-config JSON-file data store implementing the unified data API.
// Used automatically when no MySQL connection is configured.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

const DATA_DIR = path.join(config.root, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT = { products: [], orders: [], users: [], meta: { orderSeq: 1000 } };

let cache = null;
function load() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
    catch { cache = structuredClone(DEFAULT); }
  } else { cache = structuredClone(DEFAULT); persist(); }
  for (const k of Object.keys(DEFAULT)) if (!(k in cache)) cache[k] = structuredClone(DEFAULT[k]);
  return cache;
}
function persist() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

export function createJsonStore() {
  return {
    driver: 'json',
    async init() { load(); },

    // ---------- products ----------
    async listProducts({ includeInactive = false } = {}) {
      const d = load();
      return d.products
        .filter((p) => includeInactive || p.active)
        .sort((a, b) => (b.featured === true) - (a.featured === true) || a.sort - b.sort);
    },
    async getProduct(idOrSlug, { includeInactive = false } = {}) {
      const d = load();
      const p = d.products.find((x) => x.id === idOrSlug || x.slug === idOrSlug);
      if (!p || (!includeInactive && !p.active)) return null;
      return p;
    },
    async createProduct(data) {
      const d = load();
      const p = { id: uid(), createdAt: Date.now(), sold: 0, sort: d.products.length, ...data };
      d.products.push(p); persist(); return p;
    },
    async updateProduct(id, patch) {
      const d = load();
      const p = d.products.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, patch); persist(); return p;
    },

    // ---------- orders ----------
    async nextOrderId() {
      const d = load(); d.meta.orderSeq += 1; persist();
      return 'FUD-' + d.meta.orderSeq;
    },
    async createOrder(order) {
      const d = load(); d.orders.push(order); persist(); return order;
    },
    async listOrders({ userId } = {}) {
      const d = load();
      let out = [...d.orders];
      if (userId) out = out.filter((o) => o.userId === userId);
      return out.sort((a, b) => b.createdAt - a.createdAt);
    },
    async getOrder(id) { return load().orders.find((o) => o.id === id) || null; },
    async saveOrder(order) {
      const d = load();
      const i = d.orders.findIndex((o) => o.id === order.id);
      if (i >= 0) d.orders[i] = order; persist(); return order;
    },

    // ---------- users ----------
    async createUser(u) {
      const d = load();
      const user = { id: uid(), createdAt: Date.now(), orders: 0, totalSpent: 0, ...u };
      d.users.push(user); persist(); return user;
    },
    async getUserById(id) { return load().users.find((u) => u.id === id) || null; },
    async getUserByEmail(email) {
      if (!email) return null;
      return load().users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
    },
    async getUserByGoogleId(gid) {
      if (!gid) return null;
      return load().users.find((u) => u.googleId === gid) || null;
    },
    async getUserByPhone(phone) {
      if (!phone) return null;
      return load().users.find((u) => u.phone === phone) || null;
    },
    async updateUser(id, patch) {
      const d = load();
      const u = d.users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch); persist(); return u;
    },
    async listUsers() {
      return [...load().users].sort((a, b) => (b.lastOrderAt || b.createdAt || 0) - (a.lastOrderAt || a.createdAt || 0));
    },

    async _all() { return load(); }
  };
}
