// MySQL data store (Google Cloud SQL compatible) implementing the unified API.
// Tables are auto-created on init(). JSON-ish columns hold arrays/objects.
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { config } from '../config.js';

const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const j = (v) => (v == null ? null : JSON.stringify(v));
const pj = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === 'object') return v; // mysql2 may parse JSON columns already
  try { return JSON.parse(v); } catch { return fallback; }
};

function mapProduct(r) {
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description,
    price: r.price, gradient: r.gradient, emoji: r.emoji, imageUrl: r.image_url,
    flavors: pj(r.flavors, []), sizes: pj(r.sizes, []), allergens: pj(r.allergens, []),
    containsNuts: !!r.contains_nuts, stock: r.stock, sold: r.sold,
    featured: !!r.featured, active: !!r.active, sort: r.sort_order, createdAt: Number(r.created_at)
  };
}
function mapOrder(r) {
  return {
    id: r.id, userId: r.user_id, items: pj(r.items, []), customer: pj(r.customer, {}),
    subtotal: r.subtotal, deliveryFee: r.delivery_fee, total: r.total,
    paymentMethod: r.payment_method, status: r.status,
    statusHistory: pj(r.status_history, []), createdAt: Number(r.created_at)
  };
}
function mapUser(r) {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, passwordHash: r.password_hash,
    googleId: r.google_id, avatarUrl: r.avatar_url, city: r.city, address: r.address,
    orders: r.order_count, totalSpent: r.total_spent, createdAt: Number(r.created_at),
    lastOrderAt: r.last_order_at ? Number(r.last_order_at) : null,
    lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null
  };
}

export function createMysqlStore() {
  let pool;
  function db() {
    if (!pool) {
      pool = mysql.createPool({
        host: config.db.host, port: config.db.port, user: config.db.user,
        password: config.db.password, database: config.db.database,
        ssl: config.db.ssl, waitForConnections: true, connectionLimit: 10,
        namedPlaceholders: false, charset: 'utf8mb4'
      });
    }
    return pool;
  }

  return {
    driver: 'mysql',
    async init() {
      const c = db();
      await c.query(`CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(40) PRIMARY KEY, slug VARCHAR(120) UNIQUE, name VARCHAR(160), tagline VARCHAR(255),
        description TEXT, price INT, gradient VARCHAR(255), emoji VARCHAR(16), image_url LONGTEXT,
        flavors JSON, sizes JSON, allergens JSON, contains_nuts TINYINT DEFAULT 0,
        stock INT DEFAULT 0, sold INT DEFAULT 0, featured TINYINT DEFAULT 0, active TINYINT DEFAULT 1,
        sort_order INT DEFAULT 0, created_at BIGINT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await c.query(`CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(40) PRIMARY KEY, name VARCHAR(160), email VARCHAR(191) UNIQUE, phone VARCHAR(40),
        password_hash VARCHAR(255), google_id VARCHAR(64), avatar_url LONGTEXT,
        city VARCHAR(120), address TEXT, order_count INT DEFAULT 0, total_spent INT DEFAULT 0,
        created_at BIGINT, last_order_at BIGINT, last_login_at BIGINT,
        INDEX idx_google (google_id), INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await c.query(`CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40) NULL, items JSON, customer JSON,
        subtotal INT, delivery_fee INT, total INT, payment_method VARCHAR(20) DEFAULT 'COD',
        status VARCHAR(40) DEFAULT 'Pending', status_history JSON, created_at BIGINT,
        INDEX idx_user (user_id), INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await c.query(`CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(40) PRIMARY KEY, value BIGINT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await c.query(`INSERT IGNORE INTO counters (name, value) VALUES ('orderSeq', 1000)`);
    },

    // ---------- products ----------
    async listProducts({ includeInactive = false } = {}) {
      const [rows] = await db().query(
        `SELECT * FROM products ${includeInactive ? '' : 'WHERE active=1'} ORDER BY featured DESC, sort_order ASC`
      );
      return rows.map(mapProduct);
    },
    async getProduct(idOrSlug, { includeInactive = false } = {}) {
      const [rows] = await db().query(
        `SELECT * FROM products WHERE (id=? OR slug=?) ${includeInactive ? '' : 'AND active=1'} LIMIT 1`,
        [idOrSlug, idOrSlug]
      );
      return rows[0] ? mapProduct(rows[0]) : null;
    },
    async createProduct(p) {
      const id = p.id || uid();
      const [[{ n }]] = await db().query(`SELECT COUNT(*) n FROM products`);
      await db().query(
        `INSERT INTO products (id, slug, name, tagline, description, price, gradient, emoji, image_url,
          flavors, sizes, allergens, contains_nuts, stock, sold, featured, active, sort_order, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, p.slug, p.name, p.tagline, p.description, p.price, p.gradient, p.emoji, p.imageUrl || null,
         j(p.flavors || []), j(p.sizes || []), j(p.allergens || []), p.containsNuts ? 1 : 0,
         p.stock || 0, p.sold || 0, p.featured ? 1 : 0, p.active === false ? 0 : 1, p.sort ?? n, Date.now()]
      );
      return this.getProduct(id, { includeInactive: true });
    },
    async updateProduct(id, patch) {
      const cur = await this.getProduct(id, { includeInactive: true });
      if (!cur) return null;
      const m = { ...cur, ...patch };
      await db().query(
        `UPDATE products SET slug=?, name=?, tagline=?, description=?, price=?, gradient=?, emoji=?,
          image_url=?, flavors=?, sizes=?, allergens=?, contains_nuts=?, stock=?, sold=?, featured=?, active=?, sort_order=?
         WHERE id=?`,
        [m.slug, m.name, m.tagline, m.description, m.price, m.gradient, m.emoji, m.imageUrl || null,
         j(m.flavors || []), j(m.sizes || []), j(m.allergens || []), m.containsNuts ? 1 : 0,
         m.stock, m.sold, m.featured ? 1 : 0, m.active ? 1 : 0, m.sort ?? 0, id]
      );
      return this.getProduct(id, { includeInactive: true });
    },

    // ---------- orders ----------
    async nextOrderId() {
      await db().query(`UPDATE counters SET value = value + 1 WHERE name='orderSeq'`);
      const [[{ value }]] = await db().query(`SELECT value FROM counters WHERE name='orderSeq'`);
      return 'FUD-' + value;
    },
    async createOrder(o) {
      await db().query(
        `INSERT INTO orders (id, user_id, items, customer, subtotal, delivery_fee, total, payment_method, status, status_history, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [o.id, o.userId || null, j(o.items), j(o.customer), o.subtotal, o.deliveryFee, o.total,
         o.paymentMethod, o.status, j(o.statusHistory || []), o.createdAt]
      );
      return o;
    },
    async listOrders({ userId } = {}) {
      const [rows] = userId
        ? await db().query(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC`, [userId])
        : await db().query(`SELECT * FROM orders ORDER BY created_at DESC`);
      return rows.map(mapOrder);
    },
    async getOrder(id) {
      const [rows] = await db().query(`SELECT * FROM orders WHERE id=? LIMIT 1`, [id]);
      return rows[0] ? mapOrder(rows[0]) : null;
    },
    async saveOrder(o) {
      await db().query(
        `UPDATE orders SET status=?, status_history=? WHERE id=?`,
        [o.status, j(o.statusHistory || []), o.id]
      );
      return o;
    },

    // ---------- users ----------
    async createUser(u) {
      const id = u.id || uid();
      await db().query(
        `INSERT INTO users (id, name, email, phone, password_hash, google_id, avatar_url, city, address,
          order_count, total_spent, created_at, last_login_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, u.name, u.email || null, u.phone || null, u.passwordHash || null, u.googleId || null,
         u.avatarUrl || null, u.city || null, u.address || null, u.orders || 0, u.totalSpent || 0,
         Date.now(), Date.now()]
      );
      return this.getUserById(id);
    },
    async getUserById(id) {
      const [rows] = await db().query(`SELECT * FROM users WHERE id=? LIMIT 1`, [id]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async getUserByEmail(email) {
      if (!email) return null;
      const [rows] = await db().query(`SELECT * FROM users WHERE email=? LIMIT 1`, [email.toLowerCase()]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async getUserByGoogleId(gid) {
      if (!gid) return null;
      const [rows] = await db().query(`SELECT * FROM users WHERE google_id=? LIMIT 1`, [gid]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async getUserByPhone(phone) {
      if (!phone) return null;
      const [rows] = await db().query(`SELECT * FROM users WHERE phone=? LIMIT 1`, [phone]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async updateUser(id, patch) {
      const cur = await this.getUserById(id);
      if (!cur) return null;
      const m = { ...cur, ...patch };
      await db().query(
        `UPDATE users SET name=?, email=?, phone=?, password_hash=?, google_id=?, avatar_url=?, city=?, address=?,
          order_count=?, total_spent=?, last_order_at=?, last_login_at=? WHERE id=?`,
        [m.name, m.email || null, m.phone || null, m.passwordHash || null, m.googleId || null, m.avatarUrl || null,
         m.city || null, m.address || null, m.orders || 0, m.totalSpent || 0, m.lastOrderAt || null, m.lastLoginAt || null, id]
      );
      return this.getUserById(id);
    },
    async listUsers() {
      const [rows] = await db().query(`SELECT * FROM users ORDER BY COALESCE(last_order_at, created_at) DESC`);
      return rows.map(mapUser);
    }
  };
}
